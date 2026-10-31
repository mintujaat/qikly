(() => {
  'use strict';
  const DEVICE_KEY = 'qikly_attendance_device_v1';
  const CACHE_KEY = 'qikly_attendance_cache_v1';
  const $ = (selector, root = document) => root.querySelector(selector);
  let config = { price: 0, marqueeText: '', termsText: '', formTitle: 'Request Form', formDescription: '', formFields: [], paymentReady: false };
  let deviceToken = '';
  let submitting = false;
  let currentUser = null;
  let currentAuthMode = 'login';
  let firebaseAuth = null;
  let googleSignInBusy = false;
  let walletBalance = 0;
  let referralSummary = { successfulTransactions: 0, totalEarned: 0, rewardAmount: 3 };
  const locationMaps = new Map();
  const locationValues = Object.create(null);

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  }
  function getDeviceToken() {
    const saved = localStorage.getItem(DEVICE_KEY) || '';
    if (/^[A-Za-z0-9_-]{32,100}$/.test(saved)) return saved;
    if (!window.crypto?.getRandomValues) throw new Error('Secure browser storage is unavailable. Open this page using HTTPS and try again.');
    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
    const token = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    localStorage.setItem(DEVICE_KEY, token);
    return token;
  }
  function deviceMeta() {
    return {
      userAgent: navigator.userAgent || '',
      platform: navigator.userAgentData?.platform || navigator.platform || '',
      language: navigator.language || '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
    };
  }
  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Qikly-Device': deviceToken, ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
  }
  function setMessage(text, success = false) {
    const el = $('#formMessage');
    el.textContent = text || '';
    el.classList.toggle('success-message', success);
  }
  function setAccountMessage(text, success = false) {
    const el = $('#accountMessage');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('success-message', success);
  }
  function setBusy(busy, text) {
    const button = $('#payButton');
    const useWallet = $('#useWallet')?.checked === true;
    const walletApplied = useWallet ? Math.min(Number(config.price || 0), walletBalance) : 0;
    const due = Math.max(0, Number(config.price || 0) - walletApplied);
    const allowed = !!currentUser && config.price > 0 && config.formFields.length > 0 && (due === 0 || config.paymentReady);
    button.disabled = busy || !allowed;
    $('#payButtonText').textContent = text || (busy ? 'Processing…' : (due === 0 ? 'Pay with wallet balance' : 'Continue to secure payment'));
  }
  function updatePaymentSummary() {
    const fee = Math.max(0, Number(config.price || 0));
    const useWallet = $('#useWallet')?.checked === true;
    const applied = useWallet ? Math.min(fee, walletBalance) : 0;
    const due = Math.max(0, fee - applied);
    $('#payAmount').textContent = `₹${due.toLocaleString('en-IN')}`;
    $('#paymentBreakdown').textContent = `Form fee ₹${fee.toLocaleString('en-IN')} − Wallet ₹${applied.toLocaleString('en-IN')}`;
    $('#walletAvailableText').textContent = `Available: ₹${walletBalance.toLocaleString('en-IN')}`;
    $('#walletUseRow').classList.toggle('hidden', !currentUser || walletBalance <= 0);
    $('#walletUseHint').textContent = applied > 0 ? `₹${applied.toLocaleString('en-IN')} will be used from your wallet.` : 'Use referral rewards to reduce this payment.';
    setBusy(submitting);
  }
  function renderAccount() {
    const signedIn = !!currentUser;
    $('#signedOutView').classList.toggle('hidden', signedIn);
    $('#signedInView').classList.toggle('hidden', !signedIn);
    $('#heroGrid').classList.toggle('hidden', !signedIn);
    $('#myRequests').classList.toggle('hidden', !signedIn);
    $('#headerAccount').textContent = signedIn ? currentUser.name || currentUser.email : 'Sign in required';
    if (signedIn) {
      $('#accountName').textContent = currentUser.name || 'User';
      $('#accountEmail').textContent = currentUser.email || '';
      $('#accountReferralCode').textContent = currentUser.referralCode || 'Loading…';
      $('#accountBalance').textContent = `₹${walletBalance.toLocaleString('en-IN')}`;
      $('#referralCount').textContent = Number(referralSummary.successfulTransactions || 0).toLocaleString('en-IN');
      $('#referralTotalEarned').textContent = `₹${Number(referralSummary.totalEarned || 0).toLocaleString('en-IN')}`;
      $('#referralEarnSummary').textContent = `Earn ₹${Number(referralSummary.rewardAmount || 3).toLocaleString('en-IN')} for each successful paid form using your code.`;
    }
    updatePaymentSummary();
    if (signedIn) window.setTimeout(() => {
      locationMaps.forEach(info => info.map.invalidateSize());
    }, 140);
  }
  async function refreshAccountState(showErrors = false) {
    try {
      const data = await api('/api/auth/me', { cache: 'no-store' });
      currentUser = data.authenticated ? data.user : null;
      walletBalance = data.authenticated ? Number(data.balance || 0) : 0;
      referralSummary = { successfulTransactions: 0, totalEarned: 0, rewardAmount: Number(config.referralReward || 3) };
      if (currentUser) {
        try {
          const info = await api('/api/user/referrals', { cache: 'no-store' });
          referralSummary = {
            successfulTransactions: Number(info.successfulTransactions || 0),
            totalEarned: Number(info.totalEarned || 0),
            rewardAmount: Number(info.rewardAmount ?? config.referralReward ?? 3),
          };
        } catch { /* Account access still works if the referral summary is temporarily unavailable. */ }
      }
      renderAccount();
      if (!currentUser) renderRequests([]);
      return currentUser;
    } catch (error) {
      currentUser = null;
      walletBalance = 0;
      renderAccount();
      if (showErrors) setAccountMessage(error.message);
      return null;
    }
  }
  function setAuthMode(mode) {
    const selected = mode === 'signup' ? 'signup' : 'login';
    currentAuthMode = selected;
    $('#accountLoginForm').classList.toggle('hidden', selected !== 'login');
    $('#accountSignupForm').classList.toggle('hidden', selected !== 'signup');
    document.querySelectorAll('[data-auth-mode]').forEach(tab => {
      const active = tab.dataset.authMode === selected;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    $('#authHeading').textContent = selected === 'signup' ? 'Create your Qikly account' : 'Sign in to continue';
    setAccountMessage('');
  }
  async function refreshAccountAfterPayment() {
    await refreshAccountState();
    updatePaymentSummary();
  }
  function typeInput(field) {
    const id = esc(field.id);
    const name = `data-field-id="${id}"`;
    const required = field.required ? 'required' : '';
    const placeholder = esc(field.placeholder || '');
    const min = field.min !== undefined && field.min !== null && field.min !== '' ? `min="${esc(field.min)}"` : '';
    const max = field.max !== undefined && field.max !== null && field.max !== '' ? `max="${esc(field.max)}"` : '';
    const label = `<span>${esc(field.label)}${field.required ? ' <b>*</b>' : ''}</span>`;
    let control = '';
    if (field.type === 'location') {
      control = `<div class="location-picker" data-location-picker="${id}">
        <div class="location-map" data-location-map="${id}" id="location-map-${id}" role="application" aria-label="Select a location on the map"></div>
        <div class="location-actions">
          <button class="location-action primary-location-action" type="button" data-location-action="current" data-field-id="${id}">◎ Use my current location</button>
          <button class="location-action" type="button" data-location-action="clear" data-field-id="${id}">Clear pin</button>
        </div>
        <p class="location-status" data-location-status="${id}" aria-live="polite">Tap the map or move the pin to select a location.</p>
        <label class="location-label"><span>Building / block / landmark <small>(optional)</small></span><input type="text" data-location-label="${id}" maxlength="120" placeholder="e.g. Main gate, Block B, Library"></label>
      </div>`;
    } else if (field.type === 'textarea') {
      control = `<textarea ${name} ${required} maxlength="2000" placeholder="${placeholder}" rows="4"></textarea>`;
    } else if (field.type === 'select') {
      control = `<select ${name} ${required}><option value="">Choose ${esc(field.label.toLowerCase())}</option>${(field.options || []).map(option => `<option value="${esc(option)}">${esc(option)}</option>`).join('')}</select>`;
    } else if (field.type === 'radio') {
      control = `<div class="choice-list">${(field.options || []).map((option, index) => `<label class="choice-option"><input type="radio" name="${id}" value="${esc(option)}" ${required && index === 0 ? 'data-required-group="true"' : ''}><span>${esc(option)}</span></label>`).join('')}</div>`;
    } else if (field.type === 'checkbox') {
      control = `<label class="single-checkbox"><input type="checkbox" ${name} ${required}><span>${placeholder || 'Yes'}</span></label>`;
    } else {
      const type = field.type === 'tel' ? 'tel' : field.type;
      const inputMode = field.type === 'number' ? 'decimal' : field.type === 'tel' ? 'tel' : undefined;
      control = `<input ${name} type="${esc(type)}" ${required} ${min} ${max} ${field.type === 'number' ? 'step="any"' : ''} ${inputMode ? `inputmode="${inputMode}"` : ''} maxlength="${field.type === 'number' ? 32 : 200}" placeholder="${placeholder}" ${field.type === 'url' ? 'autocapitalize="off"' : ''}>`;
    }
    return `<div class="field dynamic-field ${field.type === 'location' ? 'location-dynamic-field' : ''}" data-rendered-field="${id}">${label}${control}${field.helpText ? `<small>${esc(field.helpText)}</small>` : ''}</div>`;
  }

  function setLocationValue(fieldId, latlng, source = 'map') {
    const mapInfo = locationMaps.get(fieldId);
    if (!mapInfo || !latlng) return;
    const lat = Number(Number(latlng.lat).toFixed(6));
    const lng = Number(Number(latlng.lng).toFixed(6));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
    if (!mapInfo.marker) {
      mapInfo.marker = window.L.marker([lat, lng], { draggable: true }).addTo(mapInfo.map);
      mapInfo.marker.on('dragend', () => setLocationValue(fieldId, mapInfo.marker.getLatLng(), 'map'));
    } else {
      mapInfo.marker.setLatLng([lat, lng]);
    }
    locationValues[fieldId] = { lat, lng, source: source === 'gps' ? 'gps' : 'map' };
    const status = $(`[data-location-status="${CSS.escape(fieldId)}"]`, $('#dynamicFields'));
    if (status) status.textContent = `Selected: ${lat.toFixed(6)}, ${lng.toFixed(6)} · ${source === 'gps' ? 'device location' : 'map pin'}`;
  }

  function initLocationFields() {
    const nodes = $('#dynamicFields').querySelectorAll('[data-location-map]');
    nodes.forEach(node => {
      const fieldId = node.dataset.locationMap;
      if (locationMaps.has(fieldId)) {
        window.setTimeout(() => locationMaps.get(fieldId)?.map.invalidateSize(), 50);
        return;
      }
      if (!window.L) {
        const status = $(`[data-location-status="${CSS.escape(fieldId)}"]`, $('#dynamicFields'));
        if (status) status.textContent = 'Map could not load. Check your internet connection and refresh.';
        return;
      }
      const map = window.L.map(node, { scrollWheelZoom: false }).setView([22.5, 78.9], 4);
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      }).addTo(map);
      map.on('click', event => setLocationValue(fieldId, event.latlng, 'map'));
      locationMaps.set(fieldId, { map, marker: null });
      window.setTimeout(() => map.invalidateSize(), 80);
    });
  }

  function resetLocationSelections() {
    Object.keys(locationValues).forEach(key => delete locationValues[key]);
    locationMaps.forEach(info => {
      if (info.marker) {
        info.map.removeLayer(info.marker);
        info.marker = null;
      }
    });
    $('#dynamicFields').querySelectorAll('[data-location-status]').forEach(status => {
      status.textContent = 'Tap the map or move the pin to select a location.';
    });
  }

  function renderForm() {
    $('#formTitle').textContent = config.formTitle || 'Request Form';
    $('#formDescription').textContent = config.formDescription || 'Complete the fields below and submit your request.';
    $('#marqueeText').textContent = config.marqueeText || 'Qikly • Secure request portal • Online payment • Admin support';
    $('#marqueeCopy').textContent = $('#marqueeText').textContent;
    $('#termsText').textContent = config.termsText || 'I confirm that the information provided is accurate.';
    $('#payAmount').textContent = config.price > 0 ? `₹${Number(config.price).toLocaleString('en-IN')}` : 'Not set';
    const root = $('#dynamicFields');
    root.innerHTML = (config.formFields || []).length ? config.formFields.map(typeInput).join('') : '<div class="empty-form-message">The administrator has not published any fields yet.</div>';
    initLocationFields();
    if (config.price < 1) {
      setBusy(false, 'Payment fee not configured');
      setMessage('The administrator has not configured the payment fee yet.');
    } else if (!(config.formFields || []).length) {
      setBusy(false, 'Form not published');
      setMessage('The administrator has not published the form fields yet.');
    } else if (!config.paymentReady && walletBalance < config.price) {
      setBusy(false, 'Online payment unavailable');
      setMessage('Razorpay is unavailable. Add enough wallet balance or contact the administrator.');
    } else {
      setBusy(false);
      setMessage('');
    }
    updatePaymentSummary();
  }
  function statusLabel(status) {
    const map = { paid: 'Paid · Awaiting reply', in_progress: 'In progress', completed: 'Completed', rejected: 'Closed' };
    return map[status] || 'Paid';
  }
  function statusClass(status) {
    if (status === 'completed') return '';
    if (status === 'rejected') return 'red';
    if (status === 'in_progress') return 'blue';
    return '';
  }
  function dateLabel(value) {
    if (!value) return 'Just now';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  }
  function displayValue(value) {
    if (value === true) return 'Yes';
    if (value === false || value === null || value === undefined || value === '') return '—';
    if (value && typeof value === 'object' && Number.isFinite(Number(value.lat)) && Number.isFinite(Number(value.lng))) {
      return `${Number(value.lat).toFixed(6)}, ${Number(value.lng).toFixed(6)}`;
    }
    return String(value);
  }
  function renderHistoryValue(value) {
    if (value && typeof value === 'object' && Number.isFinite(Number(value.lat)) && Number.isFinite(Number(value.lng))) {
      const lat = Number(value.lat), lng = Number(value.lng);
      const href = `https://www.google.com/maps?q=${lat},${lng}`;
      return `<strong>${lat.toFixed(6)}, ${lng.toFixed(6)}</strong><a class="history-location-link" href="${href}" target="_blank" rel="noopener noreferrer">View selected location ↗</a>${value.label ? `<small>${esc(value.label)}</small>` : ''}`;
    }
    return `<strong>${esc(displayValue(value))}</strong>`;
  }
  function requestFields(request) {
    const fields = Array.isArray(request.formFields) ? request.formFields : [];
    const data = request.formData && typeof request.formData === 'object' ? request.formData : {};
    if (fields.length) return fields.map(field => ({ label: field.label || field.id, value: data[field.id] }));
    const legacy = [
      ['College account ID', request.accountId], ['Department / course', request.department],
      ['Class time', request.classTime], ['Teacher name', request.teacherName], ['Your 4-digit code', request.userSecretCode],
    ].filter(([, value]) => value !== undefined && value !== null && value !== '');
    return legacy.map(([label, value]) => ({ label, value }));
  }
  function renderRequests(requests) {
    const root = $('#requestsList');
    if (!requests.length) {
      root.innerHTML = '<div class="empty-state"><span class="empty-symbol">⌁</span><strong>No paid submissions yet</strong><p>After a successful payment, your submitted form will appear here.</p></div>';
      return;
    }
    root.innerHTML = requests.map(request => {
      const details = requestFields(request).map(item => `<div class="detail-item ${item.value && typeof item.value === 'object' && Number.isFinite(Number(item.value.lat)) ? 'detail-location-item' : ''}"><small>${esc(item.label)}</small>${renderHistoryValue(item.value)}</div>`).join('');
      return `<article class="request-card">
        <div class="request-card-top"><strong class="request-number">${esc(request.requestNumber || request.id)}</strong><span class="status-pill ${statusClass(request.requestStatus)}">${esc(statusLabel(request.requestStatus))}</span></div>
        <div class="request-details">${details}<div class="detail-item"><small>Payment</small><strong>₹${Number(request.amount || 0).toLocaleString('en-IN')} · Paid</strong>${Number(request.walletApplied || 0) > 0 ? `<small>Wallet used: ₹${Number(request.walletApplied).toLocaleString('en-IN')}</small>` : ''}</div>${request.referralCode ? `<div class="detail-item"><small>Referral code used</small><strong>${esc(request.referralCode)}</strong></div>` : ''}</div>
        <div class="reply-box"><small>Admin reply · ${esc(dateLabel(request.repliedAt || request.updatedAt))}</small><p class="${request.adminReply ? '' : 'reply-empty'}">${esc(request.adminReply || 'No admin reply yet. Your update will appear here.')}</p></div>
        <div class="request-date">Submitted ${esc(dateLabel(request.createdAt))}</div>
      </article>`;
    }).join('');
  }
  async function refreshRequests(showMessage = false) {
    if (!currentUser) { renderRequests([]); return; }
    try {
      const data = await api('/api/attendance/requests');
      const requests = Array.isArray(data.requests) ? data.requests : [];
      if (Number.isFinite(Number(data.walletBalance))) walletBalance = Number(data.walletBalance);
      localStorage.setItem(CACHE_KEY, JSON.stringify(requests));
      renderAccount();
      renderRequests(requests);
      if (showMessage) setMessage('Your submission list is up to date.', true);
    } catch (error) {
      if (showMessage) setMessage(error.message);
    }
  }
  function loadCachedRequests() {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
      renderRequests(Array.isArray(cached) ? cached : []);
    } catch { renderRequests([]); }
  }
  async function loadConfig() {
    const response = await fetch('/api/attendance/config', { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Unable to load the form.');
    config = { ...config, ...data };
    renderForm();
    try {
      await setupFirebaseGoogleSignIn();
    } catch (error) {
      const area = $('#googleAuthArea');
      if (area) area.classList.add('hidden');
      setAccountMessage(error.message || 'Firebase Google sign-in is not configured.');
    }
  }
  async function setupFirebaseGoogleSignIn() {
    const area = $('#googleAuthArea');
    const button = $('#googleSignInButton');
    const firebaseConfig = config.firebaseConfig;
    if (!area || !button || !firebaseConfig || !firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId || !firebaseConfig.appId) {
      if (area) area.classList.add('hidden');
      return;
    }
    if (!window.firebase?.initializeApp || !window.firebase?.auth) {
      throw new Error('Firebase Authentication SDK could not be loaded. Refresh the page and try again.');
    }
    if (!window.firebase.apps.length) window.firebase.initializeApp(firebaseConfig);
    firebaseAuth = window.firebase.auth();
    area.classList.remove('hidden');
    button.addEventListener('click', handleFirebaseGoogleSignIn);
    const result = await firebaseAuth.getRedirectResult();
    if (result && result.user) {
      const savedReferralCode = sessionStorage.getItem('qikly_firebase_google_signup_referral') || '';
      sessionStorage.removeItem('qikly_firebase_google_signup_referral');
      await finishFirebaseGoogleSignIn(result.user, savedReferralCode);
    }
  }
  function firebaseAuthError(error) {
    const code = String(error?.code || '');
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'Google sign-in was cancelled. Please try again.';
    if (code === 'auth/popup-blocked') return 'Your browser blocked the sign-in popup. Allow popups for this website and try again.';
    if (code === 'auth/unauthorized-domain') return 'This website domain is not authorized in Firebase Authentication settings.';
    if (code === 'auth/operation-not-allowed') return 'Google sign-in is not enabled in Firebase Authentication.';
    if (code === 'auth/network-request-failed') return 'Network error. Check your internet connection and try again.';
    return error?.message || 'Firebase Google sign-in failed. Please try again.';
  }
  async function handleFirebaseGoogleSignIn() {
    if (!firebaseAuth || googleSignInBusy) return;
    googleSignInBusy = true;
    const button = $('#googleSignInButton');
    button.disabled = true;
    setAccountMessage('Connecting to Firebase Authentication…', true);
    try {
      const provider = new window.firebase.auth.GoogleAuthProvider();
      provider.addScope('profile');
      provider.addScope('email');
      provider.setCustomParameters({ prompt: 'select_account' });
      const useRedirect = window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 650;
      if (useRedirect) {
        const referralCode = currentAuthMode === 'signup' ? $('#signupReferralCode').value.trim().toUpperCase() : '';
        if (referralCode) sessionStorage.setItem('qikly_firebase_google_signup_referral', referralCode);
        else sessionStorage.removeItem('qikly_firebase_google_signup_referral');
        await firebaseAuth.signInWithRedirect(provider);
        return;
      }
      const result = await firebaseAuth.signInWithPopup(provider);
      await finishFirebaseGoogleSignIn(result.user);
    } catch (error) {
      setAccountMessage(firebaseAuthError(error));
    } finally {
      googleSignInBusy = false;
      if (button) button.disabled = false;
    }
  }
  async function finishFirebaseGoogleSignIn(firebaseUser, referralOverride = null) {
    if (!firebaseUser) throw new Error('Firebase did not return a signed-in user.');
    setAccountMessage('Verifying your Firebase account…', true);
    try {
      const idToken = await firebaseUser.getIdToken(true);
      const referralCode = referralOverride !== null ? String(referralOverride || '').trim().toUpperCase() : (currentAuthMode === 'signup' ? $('#signupReferralCode').value.trim().toUpperCase() : '');
      await api('/api/auth/google', { method: 'POST', body: JSON.stringify({ idToken, referralCode }) });
      await refreshAccountState();
      $('#signedInMessage').textContent = 'Signed in with Google successfully.';
      await refreshRequests();
      $('#heroGrid').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      setAccountMessage(error.message || 'Google sign-in failed. Please try again.');
    }
  }
  function collectFormData() {
    const values = {};
    for (const field of config.formFields) {
      if (field.type === 'location') {
        const selected = locationValues[field.id];
        const labelInput = $(`[data-location-label="${CSS.escape(field.id)}"]`, $('#dynamicFields'));
        if (!selected) {
          if (field.required) throw new Error(`Select a location for ${field.label}.`);
          values[field.id] = '';
        } else {
          values[field.id] = { ...selected, label: String(labelInput?.value || '').trim().slice(0, 120) };
        }
        continue;
      }
      if (field.type === 'radio') {
        const selected = $(`input[type="radio"][name="${CSS.escape(field.id)}"]:checked`, $('#dynamicFields'));
        values[field.id] = selected ? selected.value : '';
        if (field.required && !selected) throw new Error(`Select ${field.label}.`);
        continue;
      }
      const control = $(`[data-field-id="${CSS.escape(field.id)}"]`, $('#dynamicFields'));
      if (!control) continue;
      if (field.type === 'checkbox') {
        values[field.id] = control.checked;
        if (field.required && !control.checked) throw new Error(`Confirm ${field.label}.`);
      } else {
        const value = String(control.value || '').trim();
        if (field.required && !value) throw new Error(`Enter ${field.label}.`);
        if (field.type === 'number' && value !== '' && !Number.isFinite(Number(value))) throw new Error(`${field.label} must be a valid number.`);
        if (field.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error(`Enter a valid ${field.label.toLowerCase()}.`);
        values[field.id] = field.type === 'number' && value !== '' ? Number(value) : value;
      }
    }
    return values;
  }
  async function cancelPendingRequest(requestId) {
    if (!requestId || !currentUser) return;
    try {
      const result = await api('/api/attendance/order/cancel', { method: 'POST', body: JSON.stringify({ requestId }) });
      if (Number.isFinite(Number(result.walletBalance))) walletBalance = Number(result.walletBalance);
      renderAccount();
    } catch { /* Expiry cleanup also releases abandoned reservations on the next account refresh. */ }
  }
  async function submitRequest(event) {
    event.preventDefault();
    if (submitting) return;
    if (!currentUser) return setMessage('Please sign in or create an account before submitting the form.');
    setMessage('');
    let formData;
    try { formData = collectFormData(); }
    catch (error) { return setMessage(error.message); }
    if (!$('#agreeTerms').checked) return setMessage('Please agree to the confirmation text before continuing.');
    const useWallet = $('#useWallet').checked;
    const walletApplied = useWallet ? Math.min(Number(config.price || 0), walletBalance) : 0;
    const gatewayDue = Math.max(0, Number(config.price || 0) - walletApplied);
    if (gatewayDue > 0 && !config.paymentReady) return setMessage('Razorpay is unavailable and your wallet does not cover the full fee.');
    if (gatewayDue > 0 && !window.Razorpay) return setMessage('Razorpay checkout did not load. Refresh the page and try again.');

    submitting = true;
    setBusy(true, 'Creating secure payment…');
    let createdRequestId = '';
    try {
      const created = await api('/api/attendance/order/create', {
        method: 'POST',
        body: JSON.stringify({
          formData,
          acceptedTerms: true,
          deviceMeta: deviceMeta(),
          referralCode: String($('#requestReferralCode').value || '').trim().toUpperCase(),
          useWallet
        }),
      });
      createdRequestId = created.request?.id || '';
      if (created.walletOnly) {
        $('#attendanceForm').reset();
        resetLocationSelections();
        if (Number.isFinite(Number(created.walletBalance))) walletBalance = Number(created.walletBalance);
        setMessage(`Payment completed using your wallet. Reference ${created.request.requestNumber} has been added below.`, true);
        await refreshAccountAfterPayment();
        await refreshRequests();
        $('#myRequests').scrollIntoView({ behavior: 'smooth', block: 'start' });
        submitting = false;
        setBusy(false);
        return;
      }
      const order = created.razorpayOrder;
      let verificationStarted = false;
      let verificationSucceeded = false;
      const checkout = new window.Razorpay({
        key: created.keyId,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'Qikly',
        description: `${config.formTitle || 'Form'} · ${created.request.requestNumber}`,
        order_id: order.id,
        theme: { color: '#0e9a91' },
        handler: async response => {
          verificationStarted = true;
          setBusy(true, 'Verifying payment…');
          setMessage('Payment received. Verifying the transaction securely…', true);
          try {
            const verified = await api('/api/attendance/order/verify', { method: 'POST', body: JSON.stringify(response) });
            verificationSucceeded = true;
            $('#attendanceForm').reset();
            resetLocationSelections();
            if (Number.isFinite(Number(verified.walletBalance))) walletBalance = Number(verified.walletBalance);
            setMessage(`Payment successful. Reference ${created.request.requestNumber} has been added below.`, true);
            await refreshAccountAfterPayment();
            await refreshRequests();
            $('#myRequests').scrollIntoView({ behavior: 'smooth', block: 'start' });
          } catch (error) {
            setMessage(`${error.message} Keep this payment reference: ${created.request.requestNumber}`);
            await refreshAccountAfterPayment();
            await refreshRequests();
          } finally {
            submitting = false;
            setBusy(false);
          }
        },
        modal: { ondismiss: async () => {
          if (verificationStarted) {
            submitting = false;
            setBusy(false);
            return;
          }
          await cancelPendingRequest(createdRequestId);
          submitting = false;
          setBusy(false);
          setMessage('Payment window closed. Any reserved wallet amount has been returned. You can try again.');
        } },
      });
      checkout.on('payment.failed', async response => {
        await cancelPendingRequest(createdRequestId);
        submitting = false;
        setBusy(false);
        setMessage(response.error?.description || 'Payment did not complete. Any reserved wallet amount has been returned.');
      });
      checkout.open();
    } catch (error) {
      if (createdRequestId) await cancelPendingRequest(createdRequestId);
      submitting = false;
      setBusy(false);
      setMessage(error.message);
    }
  }
  async function boot() {
    try {
      deviceToken = getDeviceToken();
      const inviteCode = new URLSearchParams(window.location.search).get('ref') || '';
      if (inviteCode) {
        $('#requestReferralCode').value = inviteCode.toUpperCase().slice(0, 40);
        $('#signupReferralCode').value = inviteCode.toUpperCase().slice(0, 40);
      }
      await loadConfig();
      await refreshAccountState();
      if (currentUser) await refreshRequests();
      else renderRequests([]);
      setAuthMode('login');
    } catch (error) {
      $('#payButton').disabled = true;
      $('#payButtonText').textContent = 'Unable to load form';
      setMessage(error.message);
    }
  }
  document.querySelectorAll('[data-auth-mode]').forEach(tab => tab.addEventListener('click', () => setAuthMode(tab.dataset.authMode)));
  $('#accountLoginForm').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('#accountLoginButton');
    button.disabled = true;
    setAccountMessage('Signing in…');
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({
        email: $('#loginEmail').value.trim(),
        password: $('#loginPassword').value
      }) });
      $('#loginPassword').value = '';
      await refreshAccountState();
      $('#signedInMessage').textContent = 'Signed in successfully.';
      await refreshRequests();
      $('#heroGrid').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) { setAccountMessage(error.message); }
    finally { button.disabled = false; }
  });
  $('#accountSignupForm').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('#accountSignupButton');
    button.disabled = true;
    setAccountMessage('Creating your account…');
    try {
      await api('/api/auth/signup', { method: 'POST', body: JSON.stringify({
        name: $('#signupName').value.trim(),
        email: $('#signupEmail').value.trim(),
        password: $('#signupPassword').value,
        referralCode: $('#signupReferralCode').value.trim().toUpperCase()
      }) });
      $('#signupPassword').value = '';
      await refreshAccountState();
      $('#signedInMessage').textContent = 'Account created successfully.';
      await refreshRequests();
      $('#heroGrid').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) { setAccountMessage(error.message); }
    finally { button.disabled = false; }
  });
  $('#accountLogout').addEventListener('click', async () => {
    try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); }
    catch {}
    if (firebaseAuth) await firebaseAuth.signOut().catch(() => {});
    currentUser = null;
    walletBalance = 0;
    referralSummary = { successfulTransactions: 0, totalEarned: 0, rewardAmount: Number(config.referralReward || 3) };
    localStorage.removeItem(CACHE_KEY);
    $('#loginPassword').value = '';
    $('#signupPassword').value = '';
    renderRequests([]);
    renderAccount();
    setAuthMode('login');
    setAccountMessage('You have been signed out.', true);
  });
  $('#copyReferralCode').addEventListener('click', async () => {
    const code = String(currentUser?.referralCode || '');
    if (!code) return;
    const link = `${window.location.origin}/?ref=${encodeURIComponent(code)}`;
    try {
      await navigator.clipboard.writeText(link);
      $('#signedInMessage').textContent = 'Referral link copied.';
    } catch {
      $('#signedInMessage').textContent = `Your referral code: ${code}`;
    }
  });
  $('#useWallet').addEventListener('change', updatePaymentSummary);

  $('#dynamicFields').addEventListener('click', event => {
    const button = event.target.closest('[data-location-action]');
    if (!button) return;
    const fieldId = button.dataset.fieldId;
    const mapInfo = locationMaps.get(fieldId);
    if (!mapInfo) return;
    if (button.dataset.locationAction === 'clear') {
      delete locationValues[fieldId];
      if (mapInfo.marker) { mapInfo.map.removeLayer(mapInfo.marker); mapInfo.marker = null; }
      const status = $(`[data-location-status="${CSS.escape(fieldId)}"]`, $('#dynamicFields'));
      if (status) status.textContent = 'No location selected. Tap the map or move the pin.';
      return;
    }
    if (button.dataset.locationAction === 'current') {
      if (!navigator.geolocation) {
        const status = $(`[data-location-status="${CSS.escape(fieldId)}"]`, $('#dynamicFields'));
        if (status) status.textContent = 'This browser does not support device location.';
        return;
      }
      button.disabled = true;
      const status = $(`[data-location-status="${CSS.escape(fieldId)}"]`, $('#dynamicFields'));
      if (status) status.textContent = 'Getting your current location…';
      navigator.geolocation.getCurrentPosition(position => {
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        setLocationValue(fieldId, point, 'gps');
        mapInfo.map.setView([point.lat, point.lng], 17);
        button.disabled = false;
      }, error => {
        if (status) status.textContent = error.code === 1 ? 'Location permission was denied. You can still select a pin on the map.' : 'Could not get your location. You can still select a pin on the map.';
        button.disabled = false;
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
    }
  });
  $('#attendanceForm').addEventListener('submit', submitRequest);
  $('#refreshRequests').addEventListener('click', () => refreshRequests(true));
  $('#anotherRequest').addEventListener('click', () => {
    $('#formTitle').scrollIntoView({ behavior: 'smooth', block: 'center' });
    const first = $('#dynamicFields input, #dynamicFields textarea, #dynamicFields select');
    first?.focus({ preventScroll: true });
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && deviceToken && currentUser) { refreshAccountAfterPayment(); refreshRequests(); } });
  boot();
})();
