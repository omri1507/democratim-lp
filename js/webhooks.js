/* Democratim — registration flow, n8n webhook layer.
   Kept separate from the flow controller so the endpoints and the two beta
   stubs are easy to find and swap once the n8n side is finished.

   Status as tested 2026-09-10:
     otp       — reachable, but replies "Workflow was started" and never a
                 verify result → verifyOtp() is STUBBED (accepts any 6 digits,
                 still posts the code so the server/a human can check later).
     status    — WORKS. returns an array of fuzzy voter matches.
     clusters  — WORKS via the ...ef6aa url (the ...ef6 one is a dead stub).
                 reply is double-wrapped: the real payload is a JSON *string*
                 inside .data, inside an HTTP envelope → unwrapClusters().
                 does NOT yet return manager / whatsapp fields.
     submit    — reachable, fire-and-forget, no success/failure body. */

(function (global) {
  'use strict';

  var EP = {
    otp:      'https://n8n.democil.com/webhook/a74dbf18-1be8-4342-abe9-26e6a350f1f9',
    status:   'https://n8n.democil.com/webhook/002e72d1-e5ec-455c-8991-388bf983b6f2',
    clusters: 'https://n8n.democil.com/webhook/825850e6-fe6b-42e2-b1fb-72a26ed15ef6aa',
    submit:   'https://n8n.democil.com/webhook/17cfa695-8410-487d-9cbb-35215bf3fc6e'
  };

  var TIMEOUT = 20000;

  function post(url, body) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, TIMEOUT);
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    }).then(function (r) {
      clearTimeout(t);
      return r.text().then(function (txt) {
        var json = null;
        try { json = txt ? JSON.parse(txt) : null; } catch (e) { /* leave null */ }
        return { ok: r.ok, status: r.status, json: json, text: txt };
      });
    }).catch(function (err) {
      clearTimeout(t);
      return { ok: false, status: 0, json: null, text: '', error: String(err) };
    });
  }

  /* ---- OTP ------------------------------------------------------------- */

  function sendOtp(phone) {
    // We can't learn anything from the reply; a 200 is all we get.
    return post(EP.otp, { action: 'send', phone: phone }).then(function (res) {
      return { ok: res.ok };
    });
  }

  // STUB. The endpoint can't tell us whether the code is right, so we accept
  // any 6-digit code and still forward it for later reconciliation.
  function verifyOtp(phone, code) {
    var valid = /^\d{6}$/.test(String(code || ''));
    return post(EP.otp, { action: 'verify', phone: phone, code: code }).then(function () {
      return { ok: valid, stubbed: true };
    });
  }

  /* ---- volunteer / party-member status ------------------------------- */

  function checkStatus(phone) {
    return post(EP.status, { phone: phone }).then(function (res) {
      var rows = (res.json && Array.isArray(res.json.data)) ? res.json.data : [];
      if (!res.ok && !rows.length) {
        return { ok: false, isMember: false, person: null };
      }
      // pick the strongest match: MEMBER first, then highest finalScore
      var best = rows.slice().sort(function (a, b) {
        var am = a.membershipStatus === 'MEMBER' ? 1 : 0;
        var bm = b.membershipStatus === 'MEMBER' ? 1 : 0;
        if (am !== bm) return bm - am;
        return (b.finalScore || 0) - (a.finalScore || 0);
      })[0] || null;

      return {
        ok: true,
        isMember: !!best && best.membershipStatus === 'MEMBER',
        person: best ? {
          firstName: best.firstName || '',
          lastName: best.lastName || '',
          city: best.city || '',
          street: best.streetAddress || '',
          houseNumber: best.houseNumber || ''
        } : null
      };
    });
  }

  /* ---- nearby clusters --------------------------------------------------- */

  // The reply is currently  { data: "<json string>", headers, statusCode }.
  // Once n8n unwraps it it'll be  { success, data: [ ... ] }  directly.
  // Handle both, plus a bare array, so this keeps working through their fix.
  function unwrapClusters(json) {
    var obj = json;
    if (obj && typeof obj.data === 'string') {
      try { obj = JSON.parse(obj.data); } catch (e) { /* keep obj */ }
    }
    if (Array.isArray(obj)) return obj;
    if (obj && Array.isArray(obj.data)) return obj.data;
    return [];
  }

  function getClusters(payload) {
    // payload: { phone, city, street, house_number, shifts }
    return post(EP.clusters, payload).then(function (res) {
      var list = unwrapClusters(res.json).map(function (c) {
        return {
          id: c.eshkolId,
          name: c.eshkolName || '',
          address: c.eshkolAddress || '',
          cityName: c.cityName || '',
          distanceKm: typeof c.distanceKm === 'number' ? c.distanceKm : null,
          rank: c.nationalRank,
          capacityPerShift: c.capacityPerShift,
          // beta: the manager / whatsapp fields aren't here yet
          hasManager: c.hasManager === true,
          manager: c.manager || null,
          whatsappUrl: c.whatsappUrl || null,
          raw: c
        };
      });
      list.sort(function (a, b) {
        return (a.distanceKm == null ? 1e9 : a.distanceKm) -
               (b.distanceKm == null ? 1e9 : b.distanceKm);
      });
      return { ok: res.ok, clusters: list.slice(0, 4) };
    });
  }

  /* ---- final submission ----------------------------------------------- */

  // outcome: not_member | assigned | no_manager_wants_to_manage |
  //          no_manager_declines | place_me_anywhere
  function submit(outcome, data) {
    var body = Object.assign({ outcome: outcome, submittedAt: new Date().toISOString() }, data);
    return post(EP.submit, body).then(function (res) {
      return { ok: res.ok };
    });
  }

  global.Webhooks = {
    endpoints: EP,
    sendOtp: sendOtp,
    verifyOtp: verifyOtp,
    checkStatus: checkStatus,
    getClusters: getClusters,
    submit: submit
  };
})(window);
