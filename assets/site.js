/* =====================================================================
   Nassim's Plumbing -- shared site behaviour (no framework, no build).
   Loaded by every page. The 3D hero lives inline in index.html only.
   ===================================================================== */
(function(){
'use strict';

/* ##### SECTION: JS / NAV ##### */
var nav = document.getElementById('nav');
var burger = document.getElementById('burger');
var navLinks = document.getElementById('navLinks');

if(burger && nav){
  burger.addEventListener('click', function(){
    var open = nav.classList.toggle('open');
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}
if(navLinks && nav){
  navLinks.addEventListener('click', function(e){
    if(e.target.tagName === 'A'){
      nav.classList.remove('open');
      if(burger) burger.setAttribute('aria-expanded', 'false');
    }
  });
}
function onScroll(){ if(nav) nav.classList.toggle('stuck', (window.scrollY || 0) > 40); }
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* ##### SECTION: JS / YEAR ##### */
Array.prototype.forEach.call(document.querySelectorAll('[data-year]'), function(el){
  el.textContent = new Date().getFullYear();
});

/* ##### SECTION: JS / REVEAL ON ENTER ##### */
if('IntersectionObserver' in window){
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      if(en.isIntersecting){ en.target.classList.add('in'); io.unobserve(en.target); }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  Array.prototype.forEach.call(document.querySelectorAll('[data-rev]'), function(el, i){
    el.style.transitionDelay = (i % 4) * 70 + 'ms';
    io.observe(el);
  });
} else {
  Array.prototype.forEach.call(document.querySelectorAll('[data-rev]'), function(el){ el.classList.add('in'); });
}

/* ##### SECTION: JS / COUNT-UP STATS ##### */
function runCount(el){
  var end = parseFloat(el.getAttribute('data-count'));
  var suffix = el.getAttribute('data-suffix') || '';
  if(el.getAttribute('data-raw')){ el.textContent = String(end); return; }
  var t0 = performance.now(), dur = 1400;
  (function step(now){
    var k = Math.min(1, (now - t0) / dur);
    k = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(end * k) + suffix;
    if(k < 1) requestAnimationFrame(step);
  })(t0);
}
if('IntersectionObserver' in window){
  var io2 = new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      if(en.isIntersecting){ runCount(en.target); io2.unobserve(en.target); }
    });
  }, { threshold: 0.6 });
  Array.prototype.forEach.call(document.querySelectorAll('[data-count]'), function(el){ io2.observe(el); });
}

/* =====================================================================
   ##### SECTION: JS / SERVICE-AREA MAP (drawn, not embedded) #####
   Schematic South Bay: coastline on the left, street grid inland, shop
   marker near Hawthorne with service-radius rings. Abstract on purpose --
   it sets the geography, it is not a navigation aid.
   ===================================================================== */
function drawMap(cv, pin){
  var ctx = cv.getContext('2d');
  if(!ctx) return;

  var rect = cv.getBoundingClientRect();
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var w = Math.max(1, rect.width), h = Math.max(1, rect.height);
  cv.width = w * dpr; cv.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = '#0a1a33';
  ctx.fillRect(0, 0, w, h);

  /* ocean wedge, bottom-left (the Pacific side) */
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w * 0.20, 0);
  ctx.bezierCurveTo(w * 0.30, h * 0.30, w * 0.16, h * 0.55, w * 0.34, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  var oc = ctx.createLinearGradient(0, 0, w * 0.4, h);
  oc.addColorStop(0, 'rgba(20,70,96,.85)');
  oc.addColorStop(1, 'rgba(12,44,66,.55)');
  ctx.fillStyle = oc; ctx.fill();

  /* street grid, skewed so it reads as a real block layout */
  ctx.strokeStyle = 'rgba(140,175,225,.13)';
  ctx.lineWidth = 1;
  for(var x = w * 0.24; x < w * 1.06; x += w * 0.082){
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - w * 0.05, h); ctx.stroke();
  }
  for(var y = h * 0.06; y < h * 1.06; y += h * 0.094){
    ctx.beginPath(); ctx.moveTo(w * 0.18, y); ctx.lineTo(w, y - h * 0.05); ctx.stroke();
  }

  /* two arterials */
  ctx.strokeStyle = 'rgba(63,224,208,.26)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(w * 0.22, h * 0.78); ctx.lineTo(w, h * 0.30); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w * 0.46, 0); ctx.lineTo(w * 0.34, h); ctx.stroke();

  /* coastline highlight */
  ctx.strokeStyle = 'rgba(63,224,208,.48)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(w * 0.20, 0);
  ctx.bezierCurveTo(w * 0.30, h * 0.30, w * 0.16, h * 0.55, w * 0.34, h);
  ctx.stroke();

  /* service-radius rings around the shop */
  var px = w * 0.58, py = h * 0.52;
  for(var r = 1; r <= 3; r++){
    ctx.beginPath();
    ctx.arc(px, py, (Math.min(w, h) * 0.11) * r, 0, 6.2832);
    ctx.strokeStyle = 'rgba(63,224,208,' + (0.20 / r).toFixed(3) + ')';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  var halo = ctx.createRadialGradient(px, py, 0, px, py, Math.min(w, h) * 0.34);
  halo.addColorStop(0, 'rgba(63,224,208,.16)');
  halo.addColorStop(1, 'rgba(63,224,208,0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(px, py, Math.min(w, h) * 0.34, 0, 6.2832); ctx.fill();

  if(pin){ pin.style.left = px + 'px'; pin.style.top = (py - 4) + 'px'; }
}

function refreshMaps(){
  Array.prototype.forEach.call(document.querySelectorAll('[data-map]'), function(cv){
    var pin = cv.parentNode.querySelector('.map-pin');
    drawMap(cv, pin);
  });
}
refreshMaps();
window.addEventListener('resize', refreshMaps, { passive: true });

})();
