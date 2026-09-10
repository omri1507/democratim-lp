/* Democratim — registration flow controller (beta).

   Flow (from the campaign's own diagram):
     details -> otp -> [status check] ->
        not a member            -> done(not_member)
        member -> address -> clusters ->
            "place me anywhere"  -> done(place_me_anywhere)
            pick a cluster ->
                cluster has a manager  -> done(assigned)      [no beta data hits this yet]
                no manager -> manage ->
                    wants to manage    -> done(no_manager_wants_to_manage)
                    declines           -> done(no_manager_declines)

   Two beta stubs live in js/webhooks.js: OTP verification is not enforced, and
   the manager / WhatsApp branch is inert until webhook 4 returns those fields. */

(function () {
  'use strict';

  var form = document.getElementById('flow');
  var steps = {};
  form.querySelectorAll('.step').forEach(function (el) { steps[el.dataset.step] = el; });

  var progress = document.querySelector('.progress');
  var progressLabel = document.querySelector('.progress__label');
  var progressFill = document.querySelector('.progress__fill');
  var errorBox = form.querySelector('.flow-error');
  var veil = document.querySelector('.loading');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // step -> position on the 5-dot progress rail (non-member ends early, that's fine)
  var RAIL = { details: 1, otp: 2, address: 3, clusters: 4, manage: 5, done: 5 };

  var S = {
    firstName: '', lastName: '', phone: '', email: '',
    city: '', cityStreetId: 0,
    otp: '',
    isMember: false,
    street: '', houseNumber: '', shifts: [],
    clusters: [], chosen: null,
    outcome: ''
  };

  /* ------------------------------------------------ helpers */

  function show(name) {
    Object.keys(steps).forEach(function (k) { steps[k].hidden = (k !== name); });
    hideError();
    var pos = RAIL[name] || 1;
    progress.hidden = (name === 'done');
    progressLabel.textContent = 'שלב ' + pos + ' מתוך 5';
    progressFill.style.setProperty('--p', (pos / 5 * 100) + '%');
    var h = steps[name].querySelector('h1');
    if (h) { try { h.focus(); } catch (e) {} }
    if (!reduce) window.scrollTo({ top: 0, behavior: 'smooth' });
    else window.scrollTo(0, 0);
  }

  function busy(on) { veil.hidden = !on; }

  function showError(msg) {
    errorBox.textContent = msg || 'משהו השתבש. נסו שוב עוד רגע.';
    errorBox.hidden = false;
    errorBox.scrollIntoView({ block: 'nearest' });
  }
  function hideError() { errorBox.hidden = true; }

  function markInvalid(input, bad) {
    if (bad) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  function cleanPhone(v) { return String(v || '').replace(/[^\d]/g, ''); }
  function validPhone(v) { return /^05\d{8}$/.test(cleanPhone(v)); }
  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim()); }

  function echo(key, value) {
    form.querySelectorAll('[data-echo="' + key + '"]').forEach(function (el) {
      el.textContent = value;
    });
  }

  /* ------------------------------------------------ combobox */

  function Combo(root, opts) {
    var input = root.querySelector('input');
    var list = root.querySelector('.combo__list');
    var items = [];        // current source array of strings
    var view = [];         // filtered
    var active = -1;
    var onPick = opts.onPick || function () {};

    function setItems(arr) { items = arr || []; }

    function render() {
      var q = input.value.trim();
      view = !q ? items.slice(0, 40)
                : items.filter(function (s) { return s.indexOf(q) !== -1; }).slice(0, 40);
      if (!view.length) {
        list.innerHTML = '<li class="combo__none">אין תוצאות מתאימות</li>';
      } else {
        list.innerHTML = view.map(function (s, i) {
          var html = q ? s.split(q).join('<mark>' + q + '</mark>') : s;
          return '<li class="combo__opt" role="option" id="opt-' + root.dataset.combo + '-' + i +
                 '" aria-selected="' + (i === active) + '">' + html + '</li>';
        }).join('');
      }
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }
    function close() {
      list.hidden = true; active = -1;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    }
    function choose(val) {
      input.value = val;
      close();
      markInvalid(input, false);
      onPick(val);
    }
    function move(d) {
      if (list.hidden) { render(); return; }
      active = Math.max(0, Math.min(view.length - 1, active + d));
      list.querySelectorAll('.combo__opt').forEach(function (li, i) {
        li.setAttribute('aria-selected', i === active);
        if (i === active) {
          li.scrollIntoView({ block: 'nearest' });
          input.setAttribute('aria-activedescendant', li.id);
        }
      });
    }

    input.addEventListener('input', function () { active = -1; render(); });
    input.addEventListener('focus', function () { if (input.value.trim() === '' || items.length) render(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter' && !list.hidden && active >= 0) { e.preventDefault(); choose(view[active]); }
      else if (e.key === 'Escape') { close(); }
    });
    list.addEventListener('mousedown', function (e) {
      var li = e.target.closest('.combo__opt');
      if (li) { e.preventDefault(); choose(li.textContent); }
    });
    document.addEventListener('click', function (e) { if (!root.contains(e.target)) close(); });

    return { setItems: setItems, input: input, close: close };
  }

  /* ------------------------------------------------ data */

  var cityIndex = [];   // [ [name, streetFileId], ... ]
  var cityById = {};    // name -> streetFileId
  var streetCache = {};

  function loadCities() {
    return fetch('assets/data/cities.json').then(function (r) { return r.json(); }).then(function (rows) {
      cityIndex = rows;
      rows.forEach(function (r) { cityById[r[0]] = r[1]; });
      cityCombo.setItems(rows.map(function (r) { return r[0]; }));
    });
  }
  function loadStreets(id) {
    if (id === 0) return Promise.resolve(null);
    if (streetCache[id]) return Promise.resolve(streetCache[id]);
    return fetch('assets/data/streets/' + id + '.json')
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (arr) { streetCache[id] = arr; return arr; });
  }

  var cityCombo = Combo(form.querySelector('[data-combo="city"]'), {
    onPick: function (val) {
      S.city = val;
      S.cityStreetId = cityById[val] || 0;
      applyStreetMode();
    }
  });
  var streetCombo = Combo(form.querySelector('[data-combo="street"]'), {
    onPick: function (val) { S.street = val; }
  });
  var streetInput = form.querySelector('#street-input');
  var streetHint = form.querySelector('[data-street-hint]');

  function applyStreetMode() {
    if (S.cityStreetId === 0) {
      streetCombo.setItems([]);
      streetCombo.close();
      streetInput.setAttribute('role', 'textbox');
      streetInput.removeAttribute('aria-expanded');
      streetHint.textContent = 'ביישוב זה אין רשימת רחובות — אפשר לכתוב חופשי';
    } else {
      streetInput.setAttribute('role', 'combobox');
      streetInput.setAttribute('aria-expanded', 'false');
      streetHint.textContent = 'מתוך רחובות היישוב שבחרת';
      loadStreets(S.cityStreetId).then(function (arr) {
        streetCombo.setItems(arr || []);
      });
    }
  }

  /* ------------------------------------------------ step: details */

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var current = Object.keys(steps).find(function (k) { return !steps[k].hidden; });
    if (current === 'details') submitDetails();
    else if (current === 'otp') submitOtp();
    else if (current === 'address') submitAddress();
  });

  function submitDetails() {
    var f = form.elements;
    S.firstName = f.firstName.value.trim();
    S.lastName = f.lastName.value.trim();
    S.phone = cleanPhone(f.phone.value);
    S.email = f.email.value.trim();

    var bad = null;
    markInvalid(f.firstName, !S.firstName); if (!S.firstName) bad = bad || f.firstName;
    markInvalid(f.lastName, !S.lastName); if (!S.lastName) bad = bad || f.lastName;
    markInvalid(f.phone, !validPhone(S.phone)); if (!validPhone(S.phone)) bad = bad || f.phone;
    markInvalid(f.email, !validEmail(S.email)); if (!validEmail(S.email)) bad = bad || f.email;
    markInvalid(f.city, !S.city); if (!S.city) bad = bad || f.city;

    if (bad) { showError('בדקו את השדות המסומנים.'); bad.focus(); return; }

    busy(true);
    Webhooks.sendOtp(S.phone).then(function (res) {
      busy(false);
      if (!res.ok) { showError('שליחת ה־SMS נכשלה. נסו שוב.'); return; }
      echo('phone', formatPhone(S.phone));
      form.elements.otp.value = '';
      show('otp');
    });
  }

  function formatPhone(p) {
    return p.length === 10 ? p.slice(0, 3) + '-' + p.slice(3) : p;
  }

  /* ------------------------------------------------ step: otp */

  form.querySelector('[data-act="resend"]').addEventListener('click', function () {
    busy(true);
    Webhooks.sendOtp(S.phone).then(function () {
      busy(false);
      flash('הקוד נשלח שוב.');
    });
  });
  form.querySelector('[data-act="back-details"]').addEventListener('click', function () {
    show('details');
    form.elements.phone.focus();
  });

  function flash(msg) {
    var n = form.querySelector('[data-act="resend"]').closest('.row');
    var s = document.createElement('span');
    s.className = 'field__hint';
    s.textContent = msg;
    n.appendChild(s);
    setTimeout(function () { s.remove(); }, 3000);
  }

  function submitOtp() {
    S.otp = form.elements.otp.value.trim();
    if (!/^\d{6}$/.test(S.otp)) {
      markInvalid(form.elements.otp, true);
      showError('הקוד הוא 6 ספרות.');
      return;
    }
    markInvalid(form.elements.otp, false);
    busy(true);

    Webhooks.verifyOtp(S.phone, S.otp).then(function (v) {
      if (!v.ok) { busy(false); showError('קוד לא תקין.'); return; }
      return Webhooks.checkStatus(S.phone).then(function (st) {
        busy(false);
        if (!st.ok) { showError('בדיקת הסטטוס נכשלה. נסו שוב.'); return; }
        S.isMember = st.isMember;

        if (!S.isMember) {
          finish('not_member');
          return;
        }
        // prefill address from the record where we can
        if (st.person) {
          if (st.person.street) { form.elements.street.value = st.person.street; S.street = st.person.street; }
          if (st.person.houseNumber) { form.elements.houseNumber.value = st.person.houseNumber; S.houseNumber = st.person.houseNumber; }
        }
        show('address');
      });
    });
  }

  /* ------------------------------------------------ step: address */

  function submitAddress() {
    var f = form.elements;
    S.street = f.street.value.trim();
    S.houseNumber = f.houseNumber.value.trim();
    S.shifts = Array.prototype.filter.call(f.shifts, function (c) { return c.checked; })
      .map(function (c) { return c.value; });

    var bad = null;
    markInvalid(f.street, !S.street); if (!S.street) bad = bad || f.street;
    markInvalid(f.houseNumber, !S.houseNumber); if (!S.houseNumber) bad = bad || f.houseNumber;
    if (bad) { showError('בדקו את השדות המסומנים.'); bad.focus(); return; }
    if (!S.shifts.length) { showError('בחרו לפחות משמרת אחת.'); return; }

    busy(true);
    Webhooks.getClusters({
      phone: S.phone,
      city: S.city,
      street: S.street,
      house_number: S.houseNumber,
      shifts: S.shifts
    }).then(function (res) {
      busy(false);
      S.clusters = res.clusters || [];
      renderClusters();
      show('clusters');
    });
  }

  /* ------------------------------------------------ step: clusters */

  var clustersList = steps.clusters.querySelector('.clusters');
  var clustersEmpty = steps.clusters.querySelector('.clusters__empty');

  function renderClusters() {
    clustersList.innerHTML = '';
    clustersEmpty.hidden = S.clusters.length > 0;

    S.clusters.forEach(function (c, i) {
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cluster';
      var dist = c.distanceKm != null ? c.distanceKm.toFixed(1) + ' ק״מ' : '';
      btn.innerHTML =
        '<span class="cluster__name">' + escapeHtml(c.name) + '</span>' +
        '<span class="cluster__meta">' + escapeHtml(c.address) +
          (c.cityName && c.cityName !== S.city ? ' · ' + escapeHtml(c.cityName) : '') + '</span>' +
        (dist ? '<span class="cluster__dist">' + dist + '</span>' : '');
      btn.addEventListener('click', function () { chooseCluster(i); });
      li.appendChild(btn);
      clustersList.appendChild(li);
    });
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  form.querySelector('[data-act="anywhere"]').addEventListener('click', function () {
    S.chosen = null;
    finish('place_me_anywhere');
  });

  function chooseCluster(i) {
    S.chosen = S.clusters[i];
    if (S.chosen.hasManager) {
      // not reached with current webhook-4 data; kept for when it returns the fields
      finish('assigned');
      return;
    }
    echo('clusterName', S.chosen.name + (S.chosen.address ? ' · ' + S.chosen.address : ''));
    show('manage');
  }

  /* ------------------------------------------------ step: manage */

  form.querySelector('[data-act="manage-yes"]').addEventListener('click', function () {
    finish('no_manager_wants_to_manage');
  });
  form.querySelector('[data-act="manage-no"]').addEventListener('click', function () {
    finish('no_manager_declines');
  });

  /* ------------------------------------------------ finish */

  var DONE_MSG = {
    not_member: 'הפרטים שלך התקבלו. נהיה איתך בקשר.',
    place_me_anywhere: 'נשבץ אותך היכן שיהיה צורך ונעדכן אותך בהמשך.',
    assigned: 'נרשמת בהצלחה.',
    no_manager_wants_to_manage: 'מוביל/ת האזור ייצור/תיצור איתך קשר בקרוב כדי להתחיל.',
    no_manager_declines: 'הרישום נקלט. נהיה איתך בקשר בקרוב עם הפרטים.'
  };

  function finish(outcome) {
    S.outcome = outcome;
    busy(true);

    var payload = {
      person: {
        firstName: S.firstName, lastName: S.lastName,
        phone: S.phone, email: S.email,
        city: S.city, street: S.street, houseNumber: S.houseNumber
      },
      isMember: S.isMember,
      shifts: S.shifts,
      otpCollected: S.otp || null,       // beta: forwarded, not verified server-side
      eshkolId: S.chosen ? S.chosen.id : null,
      eshkolName: S.chosen ? S.chosen.name : null
    };

    Webhooks.submit(outcome, payload).then(function (res) {
      busy(false);
      if (!res.ok) {
        showError('שליחת הרישום נכשלה. אפשר לנסות שוב.');
        return;
      }
      renderDone(outcome);
      show('done');
    });
  }

  function renderDone(outcome) {
    steps.done.querySelector('[data-done-msg]').textContent = DONE_MSG[outcome] || 'הרישום נקלט.';
    var extra = steps.done.querySelector('[data-done-extra]');
    extra.hidden = true; extra.innerHTML = '';

    if (outcome === 'assigned' && S.chosen) {
      extra.hidden = false;
      extra.className = 'done-extra';
      var bits = ['<div><b>אשכול:</b> ' + escapeHtml(S.chosen.name) + '</div>'];
      if (S.shifts.length) bits.push('<div><b>משמרת:</b> ' + S.shifts.map(shiftLabel).join(', ') + '</div>');
      if (S.chosen.manager && S.chosen.manager.name)
        bits.push('<div><b>מנהל/ת האשכול:</b> ' + escapeHtml(S.chosen.manager.name) + '</div>');
      if (S.chosen.whatsappUrl)
        bits.push('<div><a href="' + escapeHtml(S.chosen.whatsappUrl) + '" target="_blank" rel="noopener">הצטרפות לקבוצת הוואטסאפ של האשכול</a></div>');
      extra.innerHTML = bits.join('');
    }
  }

  function shiftLabel(v) {
    return { morning: 'בוקר', noon: 'צהריים', evening: 'ערב', any: 'מתי שצריך' }[v] || v;
  }

  /* ------------------------------------------------ boot */

  loadCities().catch(function () {
    showError('טעינת רשימת היישובים נכשלה. רעננו את הדף.');
  });
  show('details');
})();
