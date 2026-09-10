/* =====================================================================
   Nassim's Plumbing -- Book / Schedule Service
   ---------------------------------------------------------------------
   Static site, so there is no server to receive a form post. The request
   is composed into a message and handed to the visitor's own SMS or mail
   client, which works with zero backend and zero third-party dependency.

   If you later stand up an endpoint, set it once before this script loads:

     <script>window.NP = { bookEndpoint: "/api/book" };</script>

   and the form will POST JSON there instead, falling back to SMS if the
   request fails. Nothing else has to change.
   ===================================================================== */
(function(){
'use strict';

var CFG = window.NP = window.NP || {};
var PHONE_TEL  = CFG.tel   || '+13106179503';
var PHONE_TEXT = CFG.phone || '(310) 617-9503';
var ENDPOINT   = CFG.bookEndpoint || null;

var SERVICES = [
  'Emergency plumbing', 'Drain cleaning', 'Hydro jetting',
  'Sewer line repair or replacement', 'Water leak detection', 'Slab leak repair',
  'Repiping', 'Water heater', 'Tankless water heater', 'Boiler repair or install',
  'Gas line repair', 'Backflow prevention', 'Toilet repair or installation',
  'Shower installation', 'Garbage disposal', 'Bathroom or kitchen remodel',
  'Water filtration', 'Water softener', 'Commercial plumbing',
  'Service agreement', 'Something else / not sure'
];

var CITIES = [
  'Torrance', 'Inglewood', 'Gardena', 'El Segundo', 'Lawndale', 'Hawthorne',
  'Manhattan Beach', 'Redondo Beach', 'Hermosa Beach', 'Westchester',
  'Playa del Rey', 'Carson', 'Lomita', 'Harbor City', 'Palos Verdes',
  'Marina del Rey', 'Elsewhere in the South Bay'
];

var URGENCY = [
  'Emergency - today if possible',
  'This week',
  'Next week or later',
  'Just getting a quote'
];

/* ##### SECTION: BOOKING / MARKUP ##### */
function opts(list, selected){
  return list.map(function(v){
    var sel = (selected && v.toLowerCase() === String(selected).toLowerCase()) ? ' selected' : '';
    return '<option value="' + esc(v) + '"' + sel + '>' + esc(v) + '</option>';
  }).join('');
}
function esc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
                  .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

var modal = document.createElement('div');
modal.className = 'modal';
modal.id = 'bookModal';
modal.setAttribute('role', 'dialog');
modal.setAttribute('aria-modal', 'true');
modal.setAttribute('aria-labelledby', 'bookTitle');
modal.hidden = false;
modal.innerHTML =
  '<div class="modal-card" role="document">' +
    '<div id="bookBody">' +
      '<div class="modal-head">' +
        '<h2 id="bookTitle">Book a visit</h2>' +
        '<button class="modal-close" type="button" aria-label="Close">&#10005;</button>' +
      '</div>' +
      '<p class="sub">Tell us what is going on and where. We will confirm a window by text or call &mdash; usually within the hour during working time.</p>' +
      '<form id="bookForm" novalidate>' +
        '<div class="field-row">' +
          '<div class="field"><label for="bkName">Your name</label>' +
            '<input id="bkName" name="name" type="text" autocomplete="name" required></div>' +
          '<div class="field"><label for="bkPhone">Phone</label>' +
            '<input id="bkPhone" name="phone" type="tel" autocomplete="tel" inputmode="tel" required></div>' +
        '</div>' +
        '<div class="field"><label for="bkService">What do you need?</label>' +
          '<select id="bkService" name="service">' + opts(SERVICES) + '</select></div>' +
        '<div class="field-row">' +
          '<div class="field"><label for="bkCity">City</label>' +
            '<select id="bkCity" name="city">' + opts(CITIES) + '</select></div>' +
          '<div class="field"><label for="bkWhen">How soon?</label>' +
            '<select id="bkWhen" name="urgency">' + opts(URGENCY) + '</select></div>' +
        '</div>' +
        '<div class="field"><label for="bkAddr">Street address <span style="text-transform:none;letter-spacing:0;font-weight:400">(optional)</span></label>' +
          '<input id="bkAddr" name="address" type="text" autocomplete="street-address"></div>' +
        '<div class="field"><label for="bkNotes">What is it doing?</label>' +
          '<textarea id="bkNotes" name="notes" placeholder="However it comes out is fine. Noises, smells, where the water is, when it started."></textarea></div>' +
        /* Honeypot: hidden from people, irresistible to bots. */
        '<div aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden">' +
          '<label for="bkCompany">Company</label>' +
          '<input id="bkCompany" name="company" type="text" tabindex="-1" autocomplete="off">' +
        '</div>' +
        '<div class="modal-actions">' +
          '<button class="btn btn-solid" type="submit">Send request</button>' +
          '<a class="btn btn-ghost" href="tel:' + PHONE_TEL + '">Call ' + PHONE_TEXT + '</a>' +
        '</div>' +
        '<p class="modal-note">This opens your messaging app with the details filled in &mdash; nothing is sent until you press send there. If it is an emergency, calling is faster.</p>' +
      '</form>' +
    '</div>' +
  '</div>';
document.body.appendChild(modal);

var card    = modal.querySelector('.modal-card');
var body    = modal.querySelector('#bookBody');
var form    = modal.querySelector('#bookForm');
var lastFocus = null;

/* ##### SECTION: BOOKING / OPEN + CLOSE ##### */
function open(prefill){
  lastFocus = document.activeElement;
  if(prefill && prefill.service){
    var sel = modal.querySelector('#bkService');
    if(sel){
      for(var i = 0; i < sel.options.length; i++){
        if(sel.options[i].value.toLowerCase().indexOf(String(prefill.service).toLowerCase()) === 0){
          sel.selectedIndex = i; break;
        }
      }
    }
  }
  if(prefill){
    setVal('#bkName',  prefill.name);
    setVal('#bkPhone', prefill.phone);
    setVal('#bkNotes', prefill.notes);
    if(prefill.city) setSelect('#bkCity', prefill.city);
    if(prefill.urgency) setSelect('#bkWhen', prefill.urgency);
  }
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(function(){
    var first = modal.querySelector('#bkName');
    if(first && !first.value) first.focus();
    else { var f = modal.querySelector('button, input, select'); if(f) f.focus(); }
  }, 220);
}
function setVal(sel, v){ if(!v) return; var el = modal.querySelector(sel); if(el) el.value = v; }
function setSelect(sel, v){
  var el = modal.querySelector(sel); if(!el) return;
  for(var i = 0; i < el.options.length; i++){
    if(el.options[i].value.toLowerCase() === String(v).toLowerCase()){ el.selectedIndex = i; return; }
  }
}
function close(){
  modal.classList.remove('open');
  document.body.style.overflow = '';
  if(lastFocus && lastFocus.focus) lastFocus.focus();
}

modal.addEventListener('click', function(e){
  if(e.target === modal || e.target.closest('.modal-close')) close();
});
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && modal.classList.contains('open')) close();
  if(e.key === 'Tab' && modal.classList.contains('open')) trap(e);
});

/* keep keyboard focus inside the dialog while it is open */
function trap(e){
  var f = card.querySelectorAll('a[href], button:not([disabled]), input, select, textarea');
  if(!f.length) return;
  var first = f[0], last = f[f.length - 1];
  if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
  else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
}

/* ##### SECTION: BOOKING / VALIDATE + SUBMIT ##### */
function fieldOf(input){ return input.closest('.field'); }

function markError(input, message){
  var f = fieldOf(input);
  if(!f) return;
  f.classList.add('invalid');
  var e = f.querySelector('.err');
  if(!e){ e = document.createElement('span'); e.className = 'err'; f.appendChild(e); }
  e.textContent = message;
}
function clearError(input){
  var f = fieldOf(input);
  if(!f) return;
  f.classList.remove('invalid');
  var e = f.querySelector('.err');
  if(e) e.remove();
}

function validate(data, els){
  var ok = true;
  if(!data.name || data.name.trim().length < 2){
    markError(els.name, 'We need a name to put on the job.'); ok = false;
  } else clearError(els.name);

  var digits = (data.phone || '').replace(/\D/g, '');
  if(digits.length < 10){
    markError(els.phone, 'A 10-digit phone number, so we can confirm the window.'); ok = false;
  } else clearError(els.phone);

  return ok;
}

function compose(d){
  var lines = [
    'Service request from the website',
    '',
    'Name: ' + d.name,
    'Phone: ' + d.phone,
    'Service: ' + d.service,
    'City: ' + d.city,
    'When: ' + d.urgency
  ];
  if(d.address) lines.push('Address: ' + d.address);
  if(d.notes)   lines.push('', 'Details: ' + d.notes);
  if(d.page)    lines.push('', 'Came from: ' + d.page);
  return lines.join('\n');
}

/* iOS wants sms:number&body=, everything else wants sms:number?body= */
function smsHref(number, message){
  var sep = /iPhone|iPad|iPod|Macintosh/i.test(navigator.userAgent) ? '&' : '?';
  return 'sms:' + number + sep + 'body=' + encodeURIComponent(message);
}

function showDone(title, message){
  body.innerHTML =
    '<div class="modal-done">' +
      '<div class="tick"><svg viewBox="0 0 24 24"><path d="M4 12.5l5.5 5.5L20 7"/></svg></div>' +
      '<h2>' + title + '</h2>' +
      '<p class="sub" style="margin-bottom:26px">' + message + '</p>' +
      '<div class="modal-actions" style="justify-content:center">' +
        '<a class="btn btn-solid" href="tel:' + PHONE_TEL + '">Call ' + PHONE_TEXT + '</a>' +
        '<button class="btn btn-ghost" type="button" data-close>Close</button>' +
      '</div>' +
    '</div>';
  var c = body.querySelector('[data-close]');
  if(c) c.addEventListener('click', close);
}

/* ##### SECTION: BOOKING / NEVER LOSE A LEAD #####
   The request is kept locally until the server confirms it. If the tab
   dies mid-submit, or the API was down, the next page load retries it
   quietly in the background. A job is worth more than a clean cache. */
var PENDING_KEY = 'np_pending_lead';

function stash(data){
  try { localStorage.setItem(PENDING_KEY, JSON.stringify({ data: data, at: Date.now() })); } catch(e){}
}
function unstash(){
  try { localStorage.removeItem(PENDING_KEY); } catch(e){}
}
function retryPending(){
  if(!ENDPOINT) return;
  var raw;
  try { raw = localStorage.getItem(PENDING_KEY); } catch(e){ return; }
  if(!raw) return;
  var saved;
  try { saved = JSON.parse(raw); } catch(e){ unstash(); return; }
  /* Anything older than a day is stale -- they will have called by now. */
  if(!saved || !saved.data || Date.now() - saved.at > 864e5){ unstash(); return; }

  post(saved.data).then(function(r){
    if(r.ok || r.invalid) unstash();
  }).catch(function(){});
}

/* One place that talks to the API, so the timeout and the idempotency
   key behave the same on first try and on retry. */
function post(data){
  var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timer = ctrl ? setTimeout(function(){ ctrl.abort(); }, 9000) : null;

  return fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Idempotency-Key': data.idempotencyKey
    },
    body: JSON.stringify(data),
    signal: ctrl ? ctrl.signal : undefined
  }).then(function(r){
    if(timer) clearTimeout(timer);
    return r.json().catch(function(){ return {}; }).then(function(j){
      return { ok: r.ok && j.ok !== false, invalid: r.status === 400, status: r.status, body: j };
    });
  }).catch(function(err){
    if(timer) clearTimeout(timer);
    throw err;
  });
}

function uid(){
  try { return crypto.randomUUID(); }
  catch(e){ return 'k' + Date.now() + Math.random().toString(36).slice(2); }
}

var openedAt = Date.now();

form.addEventListener('submit', function(e){
  e.preventDefault();
  var els = {
    name:  form.querySelector('#bkName'),
    phone: form.querySelector('#bkPhone')
  };
  var data = {
    name:    form.name.value.trim(),
    phone:   form.phone.value.trim(),
    service: form.service.value,
    city:    form.city.value,
    urgency: form.urgency.value,
    address: form.address.value.trim(),
    notes:   form.notes.value.trim(),
    page:    document.title,
    referrer: document.referrer || '',
    source:  'form',
    company: form.company ? form.company.value : '',   /* honeypot */
    elapsedMs: Date.now() - openedAt,
    idempotencyKey: uid()
  };
  if(!validate(data, els)) return;

  var message = compose(data);
  var btn = form.querySelector('button[type=submit]');

  /* The path that cannot fail: the customer's own messaging app. */
  function smsFallback(){
    stash(data);
    window.location.href = smsHref(PHONE_TEL, message);
    showDone('Nearly there',
      'Your messaging app should be open with the details filled in. Press send there and we will pick it up.');
  }

  if(!ENDPOINT){ smsFallback(); return; }

  if(btn){ btn.disabled = true; btn.textContent = 'Sending...'; }
  stash(data);

  post(data).then(function(r){
    if(r.ok){
      unstash();
      showDone('Request received',
        'We have your details. Someone will confirm a window with you shortly &mdash; usually by text.');
      return;
    }
    if(r.invalid){
      /* Server disagreed with the input. Show it rather than silently
         dumping them into SMS with bad data. */
      unstash();
      if(btn){ btn.disabled = false; btn.textContent = 'Send request'; }
      var errs = (r.body && r.body.errors) || {};
      if(errs.name)  markError(els.name, errs.name);
      if(errs.phone) markError(els.phone, errs.phone);
      return;
    }
    smsFallback();
  }).catch(smsFallback);
});

retryPending();

/* clear the error as soon as the visitor starts fixing it */
form.addEventListener('input', function(e){
  if(e.target.matches('#bkName, #bkPhone')) clearError(e.target);
});

/* ##### SECTION: BOOKING / TRIGGERS ##### */
/* Any element with [data-book] opens the modal. An optional value prefills
   the service, e.g. <button data-book="Water heater">Book now</button> */
document.addEventListener('click', function(e){
  var t = e.target.closest('[data-book]');
  if(!t) return;
  e.preventDefault();
  var svc = t.getAttribute('data-book');
  open(svc ? { service: svc } : null);
});

/* exposed so the chat assistant can hand off into the same form */
window.NP.openBooking = open;
window.NP.closeBooking = close;

})();
