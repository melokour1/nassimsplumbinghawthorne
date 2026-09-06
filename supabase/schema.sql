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
