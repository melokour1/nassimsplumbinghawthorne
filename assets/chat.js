/* =====================================================================
   Nassim's Plumbing -- chat assistant
   ---------------------------------------------------------------------
   Two modes, decided at runtime:

   1. CLAUDE MODE -- when window.NP.chatEndpoint points at your own
      serverless function (see api/chat.js). The widget POSTs the
      transcript there; the function calls Claude and returns the reply.
      The API key lives on the server and never reaches the browser.

   2. OFFLINE MODE -- the default. A small deterministic triage assistant
      runs entirely in the page, so the widget still works on a plain
      static host with no backend and no API key.

   Either way a person is always one tap away: the "Talk to a person"
   button in the header is never hidden, and any hint that the visitor
   wants a human hands off immediately.
   ===================================================================== */
(function(){
'use strict';

var CFG = window.NP = window.NP || {};
var ENDPOINT   = CFG.chatEndpoint || null;
var ESCALATE   = CFG.escalateEndpoint || null;
var LEAD_URL   = CFG.bookEndpoint || null;
var MESSAGES   = CFG.messagesEndpoint || null;
var PHONE_TEL  = CFG.tel   || '+13106179503';
var PHONE_TEXT = CFG.phone || '(310) 617-9503';
var MARK       = CFG.markSrc || 'assets/mark.png';

var MAX_TURNS = 24;   /* transcript sent to the server, in messages */

/* Ties every turn, escalation and lead from this visit to one row
   server-side, so a person opening it sees the whole thread. */
var convoId = (function(){
  try { return crypto.randomUUID(); }
  catch(e){ return 'c' + Date.now() + Math.random().toString(36).slice(2); }
})();

/* Anything the visitor volunteers as they talk, reused so they are never
   asked for the same detail twice. */
var captured = { name: '', phone: '' };
var awaitingPhone = false;

/* ##### SECTION: CHAT / MARKUP ##### */
var launcher = document.createElement('button');
launcher.className = 'chat-launch';
launcher.type = 'button';
launcher.setAttribute('aria-label', 'Open chat');
launcher.setAttribute('aria-expanded', 'false');
launcher.innerHTML =
  '<span class="ping"></span>' +
  '<svg class="bub" viewBox="0 0 24 24"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-2.8-.4L3 21l1.6-4.6A8.3 8.3 0 0 1 3 11.5 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z"/></svg>' +
  '<svg class="x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';

var panel = document.createElement('div');
panel.className = 'chat-panel';
panel.setAttribute('role', 'dialog');
panel.setAttribute('aria-label', 'Chat with Nassim’s Plumbing');
panel.innerHTML =
  '<div class="chat-head">' +
    '<span class="avatar"><img src="' + MARK + '" alt=""></span>' +
    '<span class="meta"><b>Nassim’s Plumbing</b><span>AI assistant</span></span>' +
    '<button class="human" type="button" id="npHuman">Talk to a person</button>' +
  '</div>' +
  '<div class="chat-log" id="npLog" role="log" aria-live="polite"></div>' +
  '<div class="chat-chips" id="npChips"></div>' +
  '<form class="chat-form" id="npForm">' +
    '<input id="npInput" type="text" autocomplete="off" placeholder="Describe what it is doing…" aria-label="Message">' +
    '<button type="submit" aria-label="Send" id="npSend">' +
      '<svg viewBox="0 0 24 24"><path d="M4 12h15M13 6l6 6-6 6"/></svg>' +
    '</button>' +
  '</form>' +
  '<p class="chat-foot">Automated assistant &mdash; it can get things wrong, and it never quotes prices. For anything urgent, call ' + PHONE_TEXT + '.</p>';

document.body.appendChild(launcher);
document.body.appendChild(panel);

var log   = panel.querySelector('#npLog');
var chips = panel.querySelector('#npChips');
var form  = panel.querySelector('#npForm');
var input = panel.querySelector('#npInput');
var send  = panel.querySelector('#npSend');

var history = [];      /* {role, content} pairs sent to the model */
var busy    = false;
var started = false;
var handedOff = false;

/* ##### SECTION: CHAT / RENDERING ##### */
function scroll(){ log.scrollTop = log.scrollHeight; }

function bubble(text, who){
  var d = document.createElement('div');
  d.className = 'msg ' + who;
  d.textContent = text;
  log.appendChild(d);
  scroll();
  return d;
}

function system(text){
  var d = document.createElement('div');
  d.className = 'msg sys';
  d.textContent = text;
  log.appendChild(d);
  scroll();
  return d;   /* callers remove transient notices like "connecting…" */
}

function typing(on){
  var t = log.querySelector('.typing');
  if(on){
    if(t) return;
    var d = document.createElement('div');
    d.className = 'typing';
    d.innerHTML = '<i></i><i></i><i></i>';
    log.appendChild(d);
    scroll();
  } else if(t){ t.remove(); }
}

var ICON = {
  phone: '<svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/></svg>',
  sms:   '<svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-8 8H7l-4 3 1-5a8 8 0 1 1 17-6Z"/></svg>',
  cal:   '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>'
};

/* A row of tappable actions inside the transcript. */
function cards(list){
  var wrap = document.createElement('div');
  wrap.className = 'chat-cards';
  list.forEach(function(c){
    var el;
    if(c.href){
      el = document.createElement('a');
      el.href = c.href;
      el.className = 'chat-card';
    } else {
      el = document.createElement('button');
      el.type = 'button';
      el.className = 'chat-card';
      el.addEventListener('click', c.onClick);
    }
    el.innerHTML = (ICON[c.icon] || '') + '<span>' + c.label + '</span>';
    wrap.appendChild(el);
  });
  log.appendChild(wrap);
  scroll();
}

function setChips(list){
  chips.innerHTML = '';
  (list || []).forEach(function(text){
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.addEventListener('click', function(){ chips.innerHTML = ''; submit(text); });
    chips.appendChild(b);
  });
}

/* ##### SECTION: CHAT / HUMAN HANDOFF ##### */
/* Always available, never gated. A trades customer who wants a person
   should never have to argue with a bot to get one.
   When an escalate endpoint is configured this actually pings the owner's
   phone; without one it still gives them every way to reach a person. */
function handoff(reason, opts){
  opts = opts || {};
  handedOff = true;
  setChips([]);
  if(reason) bubble(reason, 'bot');
  else bubble('Of course — let me get a person onto this.', 'bot');

  /* Already alerted server-side by /api/chat, so do not ping twice. */
  if(opts.alerted){
    afterAlert(true, opts.needsPhone !== false);
    return;
  }

  if(ESCALATE){
    var note = system('Passing this to someone now…');
    postEscalation(reason).then(function(r){
      if(note) note.remove();
      /* Someone is on and a live thread opened -- talk in this window
         rather than sending them off to find a phone. */
      if(r && r.live && r.token && MESSAGES){ startLive(r.token, r.message); return; }
      afterAlert(r && r.alerted, r ? r.needsPhone : true, r && r.message);
    }).catch(function(){
      if(note) note.remove();
      afterAlert(false, true);
    });
  } else {
    afterAlert(false, true);
  }
}

function postEscalation(reasonText){
  var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timer = ctrl ? setTimeout(function(){ ctrl.abort(); }, 9000) : null;
  return fetch(ESCALATE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversationId: convoId,
      transcript: history.slice(-30),
      reason: 'asked_for_human',
      summary: reasonText || lastUserSaid(),
      name: captured.name || '',
      phone: captured.phone || '',
      page: location.pathname
    }),
    signal: ctrl ? ctrl.signal : undefined
  }).then(function(r){
    if(timer) clearTimeout(timer);
    return r.json().catch(function(){ return {}; });
  }).catch(function(e){
    if(timer) clearTimeout(timer);
    throw e;
  });
}

/* ##### SECTION: CHAT / LIVE SESSION #####
   A real person is reachable in this window. Used when someone is on a
   computer with no phone to hand -- which is exactly when a "we'll call
   you" is useless. */
var live = { on: false, token: null, lastId: 0, timer: null, connected: false, stalledShown: false };

function startLive(token, message){
  live.on = true;
  live.token = token;
  live.lastId = 0;
  live.connected = false;

  bubble(message || 'Connecting you to someone now — hang on a moment.', 'bot');
  setHeadState('Connecting…');
  input.placeholder = 'Type your message…';
  pollLive();
  live.timer = setInterval(pollLive, 3000);
}

function stopLive(){
  live.on = false;
  live.stalledShown = false;
  if(live.timer){ clearInterval(live.timer); live.timer = null; }
  setHeadState('AI assistant');
  input.placeholder = 'Describe what it is doing…';
}

function setHeadState(text){
  var s = panel.querySelector('.chat-head .meta span');
  if(s) s.textContent = text;
}

function pollLive(){
  if(!live.on) return;
  /* Back off entirely while the tab is hidden -- no point polling for a
     window nobody is looking at. */
  if(document.hidden) return;

  fetch(MESSAGES + '?c=' + encodeURIComponent(convoId) +
        '&t=' + encodeURIComponent(live.token) +
        '&after=' + live.lastId)
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(j){
      if(!j || !j.ok) return;

      (j.messages || []).forEach(function(m){
        live.lastId = Math.max(live.lastId, m.id);
        if(m.role === 'operator'){
          if(!live.connected){
            live.connected = true;
            system((m.operator || 'Someone') + ' has joined');
            setHeadState((m.operator || 'A person') + ' — live');
          }
          bubble(m.body, 'bot');
        } else if(m.role === 'system'){
          system(m.body);
        }
      });

      if(j.status === 'live' && !live.connected){
        live.connected = true;
        setHeadState((j.operator || 'A person') + ' — live');
      }

      /* Nobody has answered yet. Offer a callback, but keep listening --
         a plumber under a sink does not reply inside a minute, and a
         reply at four minutes should still land in an open window. */
      if(j.stalled && !live.connected && !live.stalledShown){
        live.stalledShown = true;
        bubble('Nobody has picked up yet. Leave a number and someone will call you back — or call now and skip the wait. I will keep this open in case they reply.', 'bot');
        askForCallback();
        setHeadState('Still trying…');
        /* Ease off the polling; nothing is likely in the next few seconds. */
        if(live.timer){ clearInterval(live.timer); live.timer = setInterval(pollLive, 8000); }
      }

      /* Someone arrived after the callback offer -- clear the fallback
         prompt so they are not answering two things at once. */
      if(live.connected && live.stalledShown){
        live.stalledShown = false;
        awaitingPhone = false;
        input.placeholder = 'Type your message…';
        if(live.timer){ clearInterval(live.timer); live.timer = setInterval(pollLive, 3000); }
      }

      /* Genuinely over: the operator closed it, or nobody came at all. */
      if(j.gaveUp || j.status === 'closed'){
        stopLive();
        if(!live.connected){
          bubble('Still nobody free, sorry. Calling is the quickest way from here.', 'bot');
          cards([
            { icon: 'phone', label: 'Call ' + PHONE_TEXT, href: 'tel:' + PHONE_TEL },
            { icon: 'cal',   label: 'Book a visit', onClick: function(){ openBooking(); } }
          ]);
        } else {
          system('Chat ended');
          cards([
            { icon: 'phone', label: 'Call ' + PHONE_TEXT, href: 'tel:' + PHONE_TEL },
            { icon: 'cal',   label: 'Book a visit', onClick: function(){ openBooking(); } }
          ]);
        }
      }
    })
    .catch(function(){ /* a dropped poll is not worth telling anyone about */ });
}

function sendLive(text){
  bubble(text, 'me');
  fetch(MESSAGES, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId: convoId, token: live.token, body: text })
  }).then(function(r){ return r.json().catch(function(){ return {}; }); })
    .then(function(j){
      if(!j.ok) throw new Error('send failed');
    })
    .catch(function(){
      system('That did not send. Call ' + PHONE_TEXT + ' and someone will pick up.');
    });
}

/* What the visitor sees once we know whether a person was actually
   reached. Never claim a callback nobody was told about. */
function afterAlert(alerted, needsPhone, message){
  if(alerted){
    bubble(message || (captured.phone
      ? 'Done — someone has your number and what we talked about. Expect a call shortly.'
      : 'Someone has been alerted. Leave a number and they will call you back, or call now and skip the wait.'), 'bot');
  } else {
    bubble('Calling is quickest; texting works too and we will come back to you.', 'bot');
  }

  var list = [
    { icon: 'phone', label: 'Call ' + PHONE_TEXT, href: 'tel:' + PHONE_TEL },
    { icon: 'sms',   label: 'Text us the details', href: smsWithTranscript() }
  ];
  if(alerted && needsPhone !== false && !captured.phone){
    list.unshift({ icon: 'cal', label: 'Leave my number for a callback', onClick: askForCallback });
  } else {
    list.push({ icon: 'cal', label: 'Book a visit instead', onClick: function(){ openBooking(); } });
  }
  cards(list);
}

/* An escalation with no callback number is the commonest way these go
   nowhere, so ask for one right in the thread. */
function askForCallback(){
  bubble('What is the best number to call you back on?', 'bot');
  awaitingPhone = true;
  input.placeholder = 'Your phone number…';
  input.focus();
}

function lastUserSaid(){
  for(var i = history.length - 1; i >= 0; i--){
    if(history[i].role === 'user') return history[i].content;
  }
  return '';
}

/* Hands the conversation so far to the visitor's SMS app, so the person
   picking up does not start from nothing. */
function smsWithTranscript(){
  var lines = ['Hi, I was on your website.'];
  var said = history.filter(function(m){ return m.role === 'user'; })
                    .map(function(m){ return m.content; });
  if(said.length) lines.push('', 'What I told the assistant:', said.join(' / '));
  var msg = lines.join('\n');
  var sep = /iPhone|iPad|iPod|Macintosh/i.test(navigator.userAgent) ? '&' : '?';
  return 'sms:' + PHONE_TEL + sep + 'body=' + encodeURIComponent(msg);
}

function openBooking(prefill){
  if(typeof window.NP.openBooking === 'function'){
    close();
    window.NP.openBooking(prefill || null);
  } else {
    window.location.href = 'tel:' + PHONE_TEL;
  }
}

/* Words that mean "stop talking to the robot". Checked before the model
   sees the message, so the handoff is instant and never negotiated. */
var HUMAN_RE = /\b(human|real person|someone real|talk to (a|someone)|speak (to|with)|agent|representative|operator|manager|call me|customer service|stop bot)\b/i;
var URGENT_RE = /\b(emergency|flooding|flooded|burst|gushing|no water|sewage|sewer backup|gas smell|smell gas|leaking everywhere|water everywhere)\b/i;

/* ##### SECTION: CHAT / OFFLINE ASSISTANT ##### */
/* Runs when no chatEndpoint is configured. Deterministic and narrow on
   purpose: it routes, it does not improvise. It never quotes a price. */
var RULES = [
  { re: /\b(drain|clog|clogged|slow drain|backed up|backup|snake|cable)\b/i,
    say: 'Sounds like a drain. One slow fixture is usually local; several at once usually means the main line. Which is it for you — one drain, or more than one?',
    link: ['Drain cleaning', 'services/drain-cleaning.html'] },
  { re: /\b(water heater|hot water|no hot water|tank|tankless|pilot)\b/i,
    say: 'Water heater then. Is it no hot water at all, not enough, or are you seeing water around the base of the tank?',
    link: ['Water heaters', 'services/water-heaters.html'] },
  { re: /\b(leak|leaking|drip|dripping|stain|damp|wet spot|water bill)\b/i,
    say: 'Leaks are worth finding properly before anything gets opened up. Do you know roughly where it is showing — ceiling, wall, floor, or just a high bill?',
    link: ['Leak detection', 'services/water-leak-detection.html'] },
  { re: /\b(slab|foundation|warm spot|under the floor)\b/i,
    say: 'A warm spot or the sound of running water with everything off often points to a slab leak. Those are common in South Bay houses of a certain age.',
    link: ['Slab leak repair', 'services/slab-leak-repair.html'] },
  { re: /\b(toilet|running toilet|flush|rocking)\b/i,
    say: 'Toilet trouble. Is it running constantly, flushing weakly, rocking when you sit, or damp at the base?',
    link: ['Toilet repair', 'services/toilet-repair.html'] },
  { re: /\b(sewer|main line|lateral|camera|roots)\b/i,
    say: 'If it is past the cleanout we camera the line first and show you the footage before anyone digs. Are several fixtures backing up at once?',
    link: ['Sewer line repair', 'services/sewer-line-repair.html'] },
  { re: /\b(repipe|galvanized|pressure|low pressure|rusty water|pinhole)\b/i,
    say: 'Dropping pressure and rusty first-draw water usually means the supply piping itself. Is the house on original galvanized?',
    link: ['Repiping', 'services/repiping.html'] },
  { re: /\b(gas|gas line|range|dryer hookup)\b/i,
    say: 'If you can smell gas right now, leave the building and call the gas utility from outside first, then call us. Otherwise — is this a repair or a new appliance run?',
    link: ['Gas line repair', 'services/gas-line-repair.html'] },
  { re: /\b(shower|tub|faucet|valve|remodel|kitchen|bathroom)\b/i,
    say: 'Fixture or remodel work. Is this a repair to something existing, or a new installation?',
    link: ['Bathroom & kitchen', 'services/bathroom-kitchen-remodeling.html'] },
  { re: /\b(price|cost|quote|estimate|how much|charge|fee)\b/i,
    say: 'I am not able to quote prices — that comes from whoever looks at the job, and you get one flat number in writing before any work starts. There is no trip charge for a quote in the service area. Want me to set up a visit?' },
  { re: /\b(area|serve|cover|located|where are you|do you come)\b/i,
    say: 'We cover the South Bay — Torrance, Inglewood, Gardena, El Segundo, Lawndale, Hawthorne, the beach cities, Carson, Lomita and around there. We come to you. Which city are you in?' },
  { re: /\b(hours|open|when|weekend|today|tonight)\b/i,
    say: 'Scheduled work is by appointment, and the emergency line takes calls anytime. What is the situation — can it wait for a slot, or is it urgent?' },
  { re: /\b(licen[cs]e|insured|bonded|legit)\b/i,
    say: 'Licensed with the California State License Board, number 1155035, and insured. Happy to confirm anything else you need for a permit or an HOA.' }
];

function offlineReply(text){
  for(var i = 0; i < RULES.length; i++){
    if(RULES[i].re.test(text)) return RULES[i];
  }
  return {
    say: 'I can help narrow it down. Tell me what it is doing — the noise, the smell, where the water is showing, when it started — or tap "Talk to a person" and someone will take it from here.'
  };
}

/* ##### SECTION: CHAT / CLAUDE BACKEND ##### */
function askClaude(text){
  var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timer = ctrl ? setTimeout(function(){ ctrl.abort(); }, 28000) : null;

  return fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: history.slice(-MAX_TURNS),
      page: { title: document.title, url: location.pathname },
      conversationId: convoId
    }),
    signal: ctrl ? ctrl.signal : undefined
  }).then(function(r){
    if(timer) clearTimeout(timer);
    if(!r.ok) throw new Error('chat endpoint ' + r.status);
    return r.json();
  }).catch(function(e){
    if(timer) clearTimeout(timer);
    throw e;
  });
}

/* ##### SECTION: CHAT / CONVERSATION ##### */
/* ##### SECTION: CHAT / PHONE CAPTURE ##### */
var PHONE_RE = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;

function grabPhone(text){
  var m = text.match(PHONE_RE);
  return m ? m[0] : '';
}

/* Turns a number given in the thread into a real, stored lead so the
   callback survives the tab being closed. */
function sendCallbackRequest(phone){
  captured.phone = phone;
  if(!LEAD_URL){
    bubble('Thanks — call or text ' + PHONE_TEXT + ' and quote that number so we can match it up.', 'bot');
    return;
  }
  var note = system('Sending that over…');
  fetch(LEAD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: captured.name || 'Website chat',
      phone: phone,
      service: 'From the chat assistant',
      notes: lastUserSaid().slice(0, 500),
      urgency: '',
      source: 'chat_escalation',
      conversationId: convoId,
      page: document.title
    })
  }).then(function(r){ return r.json().catch(function(){ return {}; }); })
    .then(function(j){
      if(note) note.remove();
      if(j && j.ok) bubble('Got it. Someone will call you on that number.', 'bot');
      else throw new Error('not ok');
    })
    .catch(function(){
      if(note) note.remove();
      bubble('I could not log that from here. Call or text ' + PHONE_TEXT + ' and someone will pick up.', 'bot');
      cards([{ icon: 'phone', label: 'Call ' + PHONE_TEXT, href: 'tel:' + PHONE_TEL }]);
    });
}

function submit(text){
  if(busy || !text.trim()) return;
  text = text.trim();
  input.value = '';
  setChips([]);

  /* A person is on the other end -- the model is out of the loop now. */
  if(live.on){
    sendLive(text);
    return;
  }

  bubble(text, 'me');

  /* We asked for a callback number and this is the answer. */
  if(awaitingPhone){
    var p = grabPhone(text);
    awaitingPhone = false;
    input.placeholder = 'Describe what it is doing…';
    if(p){ sendCallbackRequest(p); return; }
    bubble('That did not look like a phone number. Call ' + PHONE_TEXT + ' directly and someone will pick up.', 'bot');
    cards([{ icon: 'phone', label: 'Call ' + PHONE_TEXT, href: 'tel:' + PHONE_TEL }]);
    return;
  }

  if(!captured.phone){
    var found = grabPhone(text);
    if(found) captured.phone = found;
  }

  history.push({ role: 'user', content: text });
  busy = true;
  send.disabled = true;

  /* the visitor asked for a person -- do not route that through a model */
  if(HUMAN_RE.test(text)){
    typing(true);
    setTimeout(function(){
      typing(false);
      handoff();
      done();
    }, 350);
    return;
  }

  /* something is actively going wrong -- lead with the phone, then help */
  var urgent = URGENT_RE.test(text);

  typing(true);

  if(ENDPOINT){
    askClaude(text).then(function(data){
      typing(false);
      if(data.reply){
        bubble(data.reply, 'bot');
        history.push({ role: 'assistant', content: data.reply });
      }
      if(data.conversationId) convoId = data.conversationId;
      /* The server already alerted a person when it handled the model's
         connect_to_human tool -- pass that through so we do not ping twice. */
      if(data.handoff)  handoff(data.handoffMessage || null, { alerted: data.alerted });
      if(data.book)     offerBooking(data.book);
      if(data.chips)    setChips(data.chips);
      if(urgent && !data.handoff) urgentCard();
      done();
    }).catch(function(err){
      /* backend down or misconfigured -- fall through rather than fail */
      typing(false);
      var r = offlineReply(text);
      bubble(r.say, 'bot');
      history.push({ role: 'assistant', content: r.say });
      if(urgent) urgentCard();
      offerLink(r);
      done();
    });
  } else {
    setTimeout(function(){
      typing(false);
      var r = offlineReply(text);
      bubble(r.say, 'bot');
      history.push({ role: 'assistant', content: r.say });
      if(urgent) urgentCard();
      offerLink(r);
      done();
    }, 480 + Math.random() * 320);
  }
}

function done(){
  busy = false;
  send.disabled = false;
  input.focus();
}

function urgentCard(){
  cards([
    { icon: 'phone', label: 'Call now — ' + PHONE_TEXT, href: 'tel:' + PHONE_TEL }
  ]);
}

function offerLink(rule){
  var list = [];
  if(rule.link){
    list.push({
      icon: 'cal',
      label: 'Read about ' + rule.link[0].toLowerCase(),
      href: base() + rule.link[1]
    });
  }
  list.push({ icon: 'cal', label: 'Book a visit', onClick: function(){ openBooking(rule.link ? { service: rule.link[0] } : null); } });
  cards(list);
}

function offerBooking(pre){
  cards([
    { icon: 'cal', label: 'Book a visit', onClick: function(){ openBooking(typeof pre === 'object' ? pre : null); } },
    { icon: 'phone', label: 'Call ' + PHONE_TEXT, href: 'tel:' + PHONE_TEL }
  ]);
}

/* service pages live one directory down */
function base(){
  return location.pathname.indexOf('/services/') !== -1 ? '../' : '';
}

/* ##### SECTION: CHAT / OPEN + CLOSE ##### */
function greet(){
  if(started) return;
  started = true;
  bubble('Hi — I can help work out what is going on and get you booked in. What is the plumbing doing?', 'bot');
  setChips(['Drain is slow', 'No hot water', 'I think I have a leak', 'Book a visit']);
}

function open(){
  panel.classList.add('open');
  launcher.classList.add('open', 'seen');
  launcher.setAttribute('aria-expanded', 'true');
  launcher.setAttribute('aria-label', 'Close chat');
  greet();
  setTimeout(function(){ input.focus(); }, 260);
}
function close(){
  panel.classList.remove('open');
  launcher.classList.remove('open');
  launcher.setAttribute('aria-expanded', 'false');
  launcher.setAttribute('aria-label', 'Open chat');
}
function toggle(){ panel.classList.contains('open') ? close() : open(); }

launcher.addEventListener('click', toggle);
panel.querySelector('#npHuman').addEventListener('click', function(){ greet(); handoff(); });
form.addEventListener('submit', function(e){ e.preventDefault(); submit(input.value); });
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && panel.classList.contains('open')) close();
});

/* [data-chat] anywhere on the page opens the assistant */
document.addEventListener('click', function(e){
  var t = e.target.closest('[data-chat]');
  if(!t) return;
  e.preventDefault();
  open();
});

/* drop the unread dot once the visitor has been on the page a while */
setTimeout(function(){ launcher.classList.remove('seen'); }, 100);

window.NP.openChat = open;

})();
