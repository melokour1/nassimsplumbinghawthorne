-- =====================================================================
-- Nassim's Plumbing -- lead storage
--
-- Run once in the Supabase SQL editor (or via the CLI). Safe to re-run.
--
-- Access model: row level security is ON and there are NO policies, so
-- the anon and authenticated roles can read nothing. Only the API, which
-- uses the service_role key server-side, can touch these tables. That
-- key must never appear in browser code.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ##### SECTION: SCHEMA / LEADS #####
create table if not exists public.leads (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz,

  name             text not null,
  phone            text not null,              -- E.164, e.g. +13105551234
  service          text,
  city             text,
  address          text,
  urgency          text,
  notes            text,

  source           text not null default 'form',   -- form | chat | chat_escalation
  page             text,
  referrer         text,
  status           text not null default 'new',    -- new | contacted | scheduled | done | lost

  ip_hash          text,                       -- truncated hash, not the address
  idempotency_key  text unique,                -- stops double submits creating twins
  conversation_id  uuid
);

create index if not exists leads_created_idx on public.leads (created_at desc);
create index if not exists leads_status_idx  on public.leads (status, created_at desc);
create index if not exists leads_phone_idx   on public.leads (phone);

-- ##### SECTION: SCHEMA / CONVERSATIONS #####
-- One row per chat session, upserted as it grows, so an escalation hands
-- a person the whole conversation rather than a one-line summary.
create table if not exists public.conversations (
  id                 uuid primary key,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz,

  transcript         jsonb not null default '[]'::jsonb,
  page               text,
  summary            text,
  escalated_at       timestamptz,
  escalation_reason  text
);

create index if not exists conversations_created_idx   on public.conversations (created_at desc);
create index if not exists conversations_escalated_idx on public.conversations (escalated_at desc)
  where escalated_at is not null;

-- ##### SECTION: SCHEMA / EVENTS #####
-- Append-only trail. Mostly answers "was the owner actually told about
-- this lead, and when".
create table if not exists public.events (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  kind       text not null,
  payload    jsonb
);

create index if not exists events_created_idx on public.events (created_at desc);
create index if not exists events_kind_idx    on public.events (kind, created_at desc);

-- ##### SECTION: SCHEMA / LOCKDOWN #####
alter table public.leads         enable row level security;
alter table public.conversations enable row level security;
alter table public.events        enable row level security;

-- No policies are created on purpose. With RLS enabled and no policy,
-- anon/authenticated get nothing; service_role bypasses RLS entirely.
-- If you later add a Supabase-auth admin UI, add read policies here
-- rather than loosening the service key.

-- ##### SECTION: SCHEMA / CONVENIENCE #####
-- What management usually wants to look at.
create or replace view public.leads_open as
  select id, created_at, name, phone, service, city, urgency, notes, source, status
  from public.leads
  where status in ('new', 'contacted')
  order by
    case when urgency ilike 'emergency%' then 0 else 1 end,
    created_at desc;

-- ##### SECTION: SCHEMA / VIEW HARDENING #####
-- A view is SECURITY DEFINER by default, meaning it runs as its creator and
-- therefore bypasses the RLS above -- which would hand customer names and
-- phone numbers to the anon role through PostgREST. security_invoker makes
-- the view respect the caller's own permissions instead.
alter view public.leads_open set (security_invoker = on);

-- Belt and braces: the API roles have no business touching these at all.
revoke all on public.leads_open    from anon, authenticated;
revoke all on public.leads         from anon, authenticated;
revoke all on public.conversations from anon, authenticated;
revoke all on public.events        from anon, authenticated;

-- =====================================================================
-- ##### SECTION: SCHEMA / LIVE HANDOFF #####
-- A message store in the middle, with the operator channel pluggable.
-- Telegram and the web console both read and write these rows, so the
-- customer sees one thread whichever the operator is using.
-- =====================================================================

alter table public.conversations
  add column if not exists live_status      text        not null default 'bot',
  add column if not exists awaiting_since   timestamptz,
  add column if not exists last_operator_at timestamptz,
  add column if not exists last_customer_at timestamptz,
  add column if not exists operator_name    text,
  add column if not exists city             text;

alter table public.conversations drop constraint if exists conversations_live_status_check;
alter table public.conversations add constraint conversations_live_status_check
  check (live_status in ('bot','waiting','live','closed'));

create index if not exists conversations_live_idx
  on public.conversations (live_status, awaiting_since desc)
  where live_status in ('waiting','live');

create table if not exists public.messages (
  id              bigserial primary key,
  conversation_id uuid not null,
  role            text not null check (role in ('customer','operator','system')),
  body            text not null,
  operator_name   text,
  created_at      timestamptz not null default now()
);
create index if not exists messages_convo_idx on public.messages (conversation_id, id);

-- Maps a Telegram message back to its conversation, so the operator can
-- hit reply on any forwarded message and land in the right thread.
create table if not exists public.telegram_links (
  message_id      bigint primary key,
  conversation_id uuid not null,
  created_at      timestamptz not null default now()
);
create index if not exists telegram_links_convo_idx on public.telegram_links (conversation_id);

-- Who is on, so the widget never offers live chat into an empty room.
create table if not exists public.operators (
  id         text primary key,
  name       text,
  available  boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.messages       enable row level security;
alter table public.telegram_links enable row level security;
alter table public.operators      enable row level security;

revoke all on public.messages       from anon, authenticated;
revoke all on public.telegram_links from anon, authenticated;
revoke all on public.operators      from anon, authenticated;
