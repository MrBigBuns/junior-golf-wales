// Tournament planner: the plan panel, the map and the phone tabs.
// The list and calendar are rendered on the server; this adds what needs a
// browser. The plan lives in the page link (?plan=1,2,3) and, as a
// convenience, in this browser's local storage. Nothing is sent anywhere.
(function () {
  var data = window.PLANNER || { events: [], plan: [], origin: null, query: {} };
  var byId = {};
  data.events.forEach(function (e) { byId[e.id] = e; });
  var STORE_PLAN = 'wjg-planner-plan';
  var STORE_FORM = 'wjg-planner-form';

  function read(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } }
  function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private window: fine */ } }

  // Second visit with no choices in the link: bring back the player's details
  if (!location.search) {
    var saved = read(STORE_FORM);
    if (saved && (saved.age || saved.hcp || saved.pc)) {
      var parts = [];
      ['age', 'hcp', 'pc'].forEach(function (k) { if (saved[k]) parts.push(k + '=' + encodeURIComponent(saved[k])); });
      location.replace('/planner?' + parts.join('&'));
      return;
    }
  }
  if (data.query && (data.query.age != null || data.query.hcp != null || data.query.pc)) {
    write(STORE_FORM, { age: data.query.age == null ? '' : data.query.age, hcp: data.query.hcp == null ? '' : data.query.hcp, pc: data.query.pc || '' });
  }

  // ----- plan -----
  var plan = data.plan.slice();
  if (!location.search.match(/[?&]plan=/)) {
    var stored = read(STORE_PLAN);
    if (stored && stored.length) {
      stored.forEach(function (id) { if (byId[id] && plan.indexOf(id) < 0) plan.push(id); });
    }
  }

  var listEl = document.getElementById('plan-list');
  var notesEl = document.getElementById('plan-notes');
  var countEl = document.getElementById('plan-count');
  var icsEl = document.getElementById('plan-ics');
  var barEl = document.getElementById('planner-bar');
  var barText = document.getElementById('planner-bar-text');

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function shortDate(iso) {
    return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  }
  function shortClub(name) { return name.replace(/ (Golf|Country) (Club|& .*)$/i, ''); }
  function miles(a, b) {
    var R = 3958.8, rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function notesFor(items) {
    var out = [];
    for (var i = 1; i < items.length; i++) {
      var a = items[i - 1], b = items[i];
      var gap = Math.round((Date.parse(b.date) - Date.parse(a.date)) / 86400000);
      if (gap === 0) {
        out.push('Clash: ' + shortClub(a.clubName) + ' and ' + shortClub(b.clubName) + ' are on the same day.');
      } else if (gap === 1 && a.lat != null && b.lat != null) {
        var d = Math.round(miles(a, b));
        if (d <= 40) out.push(shortClub(a.clubName) + ' and ' + shortClub(b.clubName) + ' are on back-to-back days and about ' + d + ' miles apart, so one stay covers both.');
        else if (d >= 60) out.push(shortClub(a.clubName) + ' and ' + shortClub(b.clubName) + ' are on back-to-back days but about ' + d + ' miles apart. Allow for a long drive.');
      }
    }
    return out;
  }

  function renderPlan() {
    var items = plan.map(function (id) { return byId[id]; }).filter(Boolean)
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    listEl.textContent = '';
    notesEl.textContent = '';

    if (!items.length) {
      listEl.appendChild(el('p', 'pp-empty', 'Choose events with Add to plan and they will appear here, with the fees and any clashes.'));
    }
    items.forEach(function (e) {
      var row = el('div', 'pp-row');
      row.appendChild(el('div', 'pp-num', e.num ? String(e.num) : '•'));
      var body = el('div', 'pp-body');
      body.appendChild(el('div', 'pp-date', shortDate(e.date)));
      var link = el('a', 'pp-club', e.clubName);
      link.href = '/events/' + e.slug;
      body.appendChild(link);
      var note = [];
      if (e.dist != null) note.push('About ' + e.dist + ' miles');
      note.push(e.entry);
      body.appendChild(el('div', 'pp-note', note.join(' · ')));
      row.appendChild(body);
      var rm = el('button', 'pp-remove', 'Remove');
      rm.type = 'button';
      rm.setAttribute('aria-label', 'Remove ' + e.clubName + ' from your plan');
      rm.addEventListener('click', function () { toggle(e.id); });
      row.appendChild(rm);
      listEl.appendChild(row);
    });

    var notes = notesFor(items);
    if (items.length) {
      var withFee = items.filter(function (e) { return e.fee; });
      var without = items.filter(function (e) { return !e.fee; });
      var fee = 'Entry fees: ' + (withFee.length
        ? withFee.map(function (e) { return shortClub(e.clubName) + ' ' + e.fee; }).join('; ') + '.' : 'none listed yet.');
      if (without.length && withFee.length) fee += ' Not listed yet: ' + without.map(function (e) { return shortClub(e.clubName); }).join(', ') + '. Check each entry page.';
      else if (!withFee.length) fee += ' Check each entry page.';
      notes.push(fee);
    }
    notes.forEach(function (t, i) {
      var p = el('p', i === notes.length - 1 && items.length ? 'pp-fee' : 'pp-tip', t);
      notesEl.appendChild(p);
    });

    countEl.textContent = items.length + ' event' + (items.length === 1 ? '' : 's') + ' · kept in this link and this browser';
    var ids = items.map(function (e) { return e.id; });
    if (icsEl) {
      icsEl.hidden = !ids.length;
      icsEl.href = '/planner/plan.ics?ids=' + ids.join(',');
    }
    if (barEl) {
      barEl.hidden = !ids.length;
      barText.textContent = 'Your plan: ' + ids.length + ' event' + (ids.length === 1 ? '' : 's');
    }

    // buttons in the list
    Array.prototype.forEach.call(document.querySelectorAll('.plan-btn'), function (b) {
      var id = Number(b.getAttribute('data-id'));
      var on = plan.indexOf(id) >= 0;
      b.classList.toggle('in-plan', on);
      b.textContent = on ? 'In your plan' : 'Add to plan';
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    // numbers in the list, and the pins on the map, turn green when planned
    Array.prototype.forEach.call(document.querySelectorAll('.pl-row'), function (r) {
      var n = r.querySelector('.pl-num');
      var b = r.querySelector('.plan-btn');
      if (n && b) n.classList.toggle('in-plan', plan.indexOf(Number(b.getAttribute('data-id'))) >= 0);
    });
    updatePins();

    // link and storage
    var url = new URL(location.href);
    if (plan.length) url.searchParams.set('plan', plan.join(','));
    else url.searchParams.delete('plan');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
    write(STORE_PLAN, plan);
    // month links keep the plan
    Array.prototype.forEach.call(document.querySelectorAll('.pc-nav'), function (a) {
      var u = new URL(a.href, location.href);
      if (plan.length) u.searchParams.set('plan', plan.join(',')); else u.searchParams.delete('plan');
      a.href = u.pathname + u.search;
    });
  }

  function toggle(id) {
    var i = plan.indexOf(id);
    if (i >= 0) plan.splice(i, 1); else plan.push(id);
    renderPlan();
  }

  Array.prototype.forEach.call(document.querySelectorAll('.plan-btn'), function (b) {
    b.addEventListener('click', function (ev) {
      ev.preventDefault();
      toggle(Number(b.getAttribute('data-id')));
    });
  });

  var share = document.getElementById('plan-share');
  if (share) {
    share.addEventListener('click', function () {
      var text = location.href;
      var done = function () { share.textContent = 'Link copied'; setTimeout(function () { share.textContent = 'Copy share link'; }, 2000); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { window.prompt('Copy this link', text); });
      } else {
        window.prompt('Copy this link', text);
      }
    });
  }

  // ----- map -----
  var map = null;
  var pins = {};
  // Events at the same club share a spot, so their pins are spread a little
  // sideways (in screen pixels, so it holds at every zoom level)
  var shift = {};
  function spreadPins() {
    var groups = {};
    data.events.forEach(function (e) {
      if (e.lat == null || !e.num) return;
      var k = e.lat.toFixed(4) + ',' + e.lng.toFixed(4);
      (groups[k] = groups[k] || []).push(e);
    });
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      g.forEach(function (e, i) { shift[e.id] = (i - (g.length - 1) / 2) * 30; });
    });
  }
  function pinIcon(e) {
    var on = plan.indexOf(e.id) >= 0;
    var n = String(e.num);
    var svg = '<svg viewBox="0 0 34 46" width="34" height="46" aria-hidden="true">'
      + '<path class="pin-body" d="M17 44 C17 44 2 28 2 17 A15 15 0 1 1 32 17 C32 28 17 44 17 44 Z"/>'
      + '<circle class="pin-hole" cx="17" cy="17" r="10.5"/>'
      + '<text x="17" y="21.5" text-anchor="middle" class="pin-num">' + n + '</text>'
      + (on ? '<circle class="pin-tick-bg" cx="29" cy="6" r="6.5"/><path class="pin-tick" d="M25.8 6.2 L28.2 8.6 L32.2 3.8"/>' : '')
      + '</svg>';
    return L.divIcon({
      className: 'planner-pin' + (on ? ' in-plan' : ''),
      html: svg,
      iconSize: [34, 46], iconAnchor: [17 - (shift[e.id] || 0), 45], popupAnchor: [shift[e.id] || 0, -42]
    });
  }
  function popupFor(e) {
    var pop = document.createElement('div');
    var s = document.createElement('strong'); s.textContent = e.title; pop.appendChild(s);
    pop.appendChild(document.createElement('br'));
    pop.appendChild(document.createTextNode(e.clubName + ' \u00b7 ' + shortDate(e.date)));
    pop.appendChild(document.createElement('br'));
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pop-plan' + (plan.indexOf(e.id) >= 0 ? ' in-plan' : '');
    btn.textContent = plan.indexOf(e.id) >= 0 ? 'In your plan - remove' : 'Add to plan';
    btn.addEventListener('click', function () {
      toggle(e.id);
      var now = plan.indexOf(e.id) >= 0;
      btn.className = 'pop-plan' + (now ? ' in-plan' : '');
      btn.textContent = now ? 'In your plan - remove' : 'Add to plan';
    });
    pop.appendChild(btn);
    var a = document.createElement('a'); a.href = '#e' + e.id; a.textContent = 'See in the list'; a.className = 'pop-list';
    pop.appendChild(a);
    return pop;
  }
  function updatePins() {
    Object.keys(pins).forEach(function (id) { pins[id].marker.setIcon(pinIcon(pins[id].e)); });
  }
  function buildMap() {
    var box = document.getElementById('planner-map');
    if (!box || !window.L) return;
    map = L.map(box, { scrollWheelZoom: false }).setView([52.3, -3.7], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18
    }).addTo(map);
    var bounds = [];
    spreadPins();
    data.events.forEach(function (e) {
      if (e.lat == null || !e.num) return;
      var m = L.marker([e.lat, e.lng], { icon: pinIcon(e), title: e.clubName, riseOnHover: true }).addTo(map);
      pins[e.id] = { marker: m, e: e };
      m.bindPopup(function () { return popupFor(e); });
      bounds.push([e.lat, e.lng]);
    });
    if (data.origin) {
      var home = L.divIcon({ className: 'planner-home', html: '<span></span>', iconSize: [24, 24], iconAnchor: [12, 12] });
      L.marker([data.origin.lat, data.origin.lng], { icon: home, title: 'You are here', zIndexOffset: 1000 }).addTo(map).bindTooltip('You are here', { permanent: true, direction: 'top', offset: [0, -14], className: 'planner-you-label' });
      bounds.push([data.origin.lat, data.origin.lng]);
    }
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 10 });
    else if (bounds.length === 1) map.setView(bounds[0], 10);
  }
  buildMap();

  // ----- phone tabs and the filter drawer -----
  var layout = document.querySelector('.planner-layout');
  var tabs = document.querySelectorAll('.planner-tabs [data-tab]');
  Array.prototype.forEach.call(tabs, function (t) {
    t.addEventListener('click', function () {
      layout.setAttribute('data-active', t.getAttribute('data-tab'));
      Array.prototype.forEach.call(tabs, function (o) { o.setAttribute('aria-selected', o === t ? 'true' : 'false'); });
      if (t.getAttribute('data-tab') === 'map' && map) setTimeout(function () { map.invalidateSize(); }, 50);
    });
  });
  var edit = document.querySelector('.planner-edit');
  var form = document.getElementById('planner-form');
  if (edit && form) {
    edit.addEventListener('click', function () {
      var open = form.classList.toggle('open');
      edit.setAttribute('aria-expanded', open ? 'true' : 'false');
      edit.textContent = open ? 'Close' : 'Edit';
    });
  }

  renderPlan();
})();
