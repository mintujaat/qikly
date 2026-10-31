(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const FIELD_TYPES = [
    ['text', 'Short text'], ['textarea', 'Long text'], ['number', 'Number'], ['email', 'Email'],
    ['tel', 'Phone number'], ['date', 'Date'], ['time', 'Time'], ['datetime-local', 'Date & time'],
    ['select', 'Dropdown'], ['radio', 'Single choice'], ['checkbox', 'Checkbox'], ['url', 'Website URL'],
    ['location', 'Map location'],
  ];
  let loading = false;
  let builderFields = [];

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  }
  async function api(path, options = {}) {
    const response = await fetch(path, { ...options, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
  }
  function message(id, text, success = false) {
    const el = $(id);
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('success-message', success);
  }
  function toast(text) {
    const el = $('#adminToast');
    el.textContent = text;
    el.classList.add('show');
    window.setTimeout(() => el.classList.remove('show'), 2600);
  }
  function money(value) { return `₹${Number(value || 0).toLocaleString('en-IN')}`; }
  function dateLabel(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  }
  function showAdmin() {
    $('#loginView').classList.add('hidden');
    $('#adminApp').classList.remove('hidden');
  }
  function setActivePanel(name) {
    const selected = ['requests', 'settings', 'referrals'].includes(name) ? name : 'requests';
    $$('[data-admin-panel]').forEach(panel => panel.classList.toggle('hidden', panel.dataset.adminPanel !== selected));
    $$('[data-admin-tab]').forEach(tab => {
      const active = tab.dataset.adminTab === selected;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
  }
  function makeFieldId() {
    const raw = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    return `f_${raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 54)}`;
  }
  function newField(type = 'text') {
    return { id: makeFieldId(), label: '', type, placeholder: '', helpText: '', required: false, options: [], min: '', max: '' };
  }
  function showOptionEditor(type) { return type === 'select' || type === 'radio'; }
  function showNumberLimits(type) { return type === 'number'; }
  function renderBuilder() {
    const root = $('#builderFields');
    if (!builderFields.length) {
      root.innerHTML = '<div class="builder-empty"><span>＋</span><strong>No fields added</strong><p>Click “Add field” to create the first input box.</p></div>';
      return;
    }
    root.innerHTML = builderFields.map((field, index) => {
      const options = FIELD_TYPES.map(([value, label]) => `<option value="${value}" ${field.type === value ? 'selected' : ''}>${label}</option>`).join('');
      return `<article class="builder-field-card" data-id="${esc(field.id)}">
        <div class="builder-field-top"><div class="builder-field-index"><span class="drag-symbol">⠿</span><span>FIELD ${String(index + 1).padStart(2, '0')}</span></div><div class="builder-field-actions"><button type="button" class="icon-action move-up" aria-label="Move field up" title="Move up" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" class="icon-action move-down" aria-label="Move field down" title="Move down" ${index === builderFields.length - 1 ? 'disabled' : ''}>↓</button><button type="button" class="icon-action delete-field" aria-label="Delete field" title="Delete field">×</button></div></div>
        <div class="builder-field-grid">
          <label class="field"><span>Field label <b>*</b></span><input data-prop="label" type="text" maxlength="100" value="${esc(field.label)}" placeholder="e.g. Full name"></label>
          <label class="field"><span>Input type</span><select data-prop="type">${options}</select></label>
          <label class="field"><span>Placeholder</span><input data-prop="placeholder" type="text" maxlength="120" value="${esc(field.placeholder)}" placeholder="Hint shown inside the box"></label>
          <label class="field"><span>Help text (optional)</span><input data-prop="helpText" type="text" maxlength="180" value="${esc(field.helpText)}" placeholder="Small note below the field"></label>
          ${field.type === 'location' ? '<div class="field full-field location-builder-note"><span>Map field</span><small>Users can tap the map, move the pin or use their device location. Coordinates and the optional landmark are saved with the request.</small></div>' : ''}
          <div class="field field-options ${showOptionEditor(field.type) ? '' : 'hidden'}"><span>Choices <b>*</b></span><textarea data-prop="options" rows="3" maxlength="1600" placeholder="Write one option per line">${esc((field.options || []).join('\n'))}</textarea><small>One choice per line. Used for dropdown and single-choice fields.</small></div>
          <div class="field limits-field ${showNumberLimits(field.type) ? '' : 'hidden'}"><span>Minimum value</span><input data-prop="min" type="number" step="any" value="${esc(field.min)}" placeholder="Optional"></div>
          <div class="field limits-field ${showNumberLimits(field.type) ? '' : 'hidden'}"><span>Maximum value</span><input data-prop="max" type="number" step="any" value="${esc(field.max)}" placeholder="Optional"></div>
          <label class="required-toggle"><input data-prop="required" type="checkbox" ${field.required ? 'checked' : ''}><span><strong>Required field</strong><small>User must complete this field before payment.</small></span></label>
        </div>
      </article>`;
    }).join('');
  }
  function readRequestFields(request) {
    const fields = Array.isArray(request.formFields) ? request.formFields : [];
    const data = request.formData && typeof request.formData === 'object' ? request.formData : {};
    if (fields.length) return fields.map(field => ({ label: field.label || field.id, value: data[field.id] }));
    const legacy = [
      ['College account ID', request.accountId], ['4-digit request code', request.userSecretCode || request.secretCode],
      ['Department / course', request.department], ['Class time', request.classTime], ['Teacher name', request.teacherName],
    ].filter(([, value]) => value !== undefined && value !== null && value !== '');
    return legacy.map(([label, value]) => ({ label, value }));
  }
  function displayValue(value) {
    if (value === true) return 'Yes';
    if (value === false || value === null || value === undefined || value === '') return '—';
    if (Array.isArray(value)) return value.join(', ');
    if (value && typeof value === 'object' && Number.isFinite(Number(value.lat)) && Number.isFinite(Number(value.lng))) {
      return `${Number(value.lat).toFixed(6)}, ${Number(value.lng).toFixed(6)}`;
    }
    return String(value);
  }
  function renderAdminValue(value) {
    if (value && typeof value === 'object' && Number.isFinite(Number(value.lat)) && Number.isFinite(Number(value.lng))) {
      const lat = Number(value.lat), lng = Number(value.lng);
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return `<strong>Invalid location data</strong>`;
      const delta = 0.004;
      const bbox = `${lng-delta}%2C${lat-delta}%2C${lng+delta}%2C${lat+delta}`;
      const embed = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
      const maps = `https://www.google.com/maps?q=${lat},${lng}`;
      return `<div class="admin-location-value">
        <iframe title="User selected map location" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${embed}"></iframe>
        <div><strong>${lat.toFixed(6)}, ${lng.toFixed(6)}</strong>${value.label ? `<small>${esc(value.label)}</small>` : ''}<a href="${maps}" target="_blank" rel="noopener noreferrer">Open in Google Maps ↗</a><small>Selection: ${value.source === 'gps' ? 'Device location' : 'Map pin'}</small></div>
      </div>`;
    }
    return `<strong>${esc(displayValue(value))}</strong>`;
  }
  function statusOptions(current) {
    return [['paid', 'Paid · Awaiting reply'], ['in_progress', 'In progress'], ['completed', 'Completed'], ['rejected', 'Closed / rejected']]
      .map(([value, label]) => `<option value="${value}" ${current === value ? 'selected' : ''}>${label}</option>`).join('');
  }
  function renderRequests(requests) {
    const root = $('#adminRequests');
    $('#queueCount').textContent = `${requests.length} PAID`;
    if (!requests.length) {
      root.innerHTML = '<div class="empty-state"><span class="empty-symbol">⌁</span><strong>No paid submissions</strong><p>Successfully paid forms will appear here.</p></div>';
      return;
    }
    root.innerHTML = requests.map(request => {
      const meta = request.deviceMeta || {};
      const details = readRequestFields(request).map(item => `<div class="meta-cell ${item.value && typeof item.value === 'object' && Number.isFinite(Number(item.value.lat)) ? 'meta-location-cell' : ''}"><small>${esc(item.label)}</small>${renderAdminValue(item.value)}</div>`).join('');
      return `<article class="admin-request-card" data-id="${esc(request.id)}">
        <div class="admin-request-head"><div><h3>${esc(request.requestNumber || request.id)}</h3><p>${esc(request.formTitle || 'Form submission')} · Submitted ${esc(dateLabel(request.createdAt))} · Payment verified</p></div><span class="status-pill ${request.requestStatus === 'completed' ? '' : request.requestStatus === 'rejected' ? 'red' : 'blue'}">${esc(request.requestStatus || 'paid').replaceAll('_', ' ')}</span></div>
        <div class="submission-details"><div class="submission-details-title">USER SUBMITTED DATA</div><div class="admin-meta-grid">${details || '<div class="meta-cell"><strong>No form fields recorded.</strong></div>'}</div></div>
        <div class="payment-meta-grid">
          <div class="meta-cell"><small>Amount paid</small><strong>${money(request.amount)}</strong>${Number(request.walletApplied || 0) > 0 ? `<small>Wallet used: ${money(request.walletApplied)} · Online: ${money(request.gatewayAmount)}</small>` : ''}</div>
          <div class="meta-cell"><small>Qikly account</small><strong>${esc(request.userName || '—')}</strong><small>${esc(request.userEmail || request.userId || 'Legacy browser request')}</small></div>
          <div class="meta-cell"><small>Referral code used</small><strong>${esc(request.referralCode || 'Not used')}</strong><small>${request.referrerUid ? `Referrer: ${esc(request.referrerName || request.referrerUid)}` : 'No referrer attached'}</small></div>
          <div class="meta-cell"><small>Referral reward</small><strong>${request.referrerUid ? money(request.referralRewardAmount || 0) : '—'}</strong></div>
          <div class="meta-cell"><small>Payment method</small><strong>${esc(request.paymentMethod || 'Razorpay')}</strong></div>
          <div class="meta-cell"><small>Razorpay payment ID</small><strong>${esc(request.razorpayPaymentId || 'Wallet payment / —')}</strong></div>
          <div class="meta-cell"><small>Request document ID</small><strong>${esc(request.id)}</strong></div>
          <div class="meta-cell"><small>Paid at</small><strong>${esc(dateLabel(request.paidAt))}</strong></div>
          <div class="meta-cell"><small>Last reply</small><strong>${esc(dateLabel(request.repliedAt))}</strong></div>
        </div>
        <details class="device-details"><summary>Browser / device information</summary><div><strong>Device:</strong> ${esc(meta.platform || 'Unavailable')} · ${esc(meta.language || 'Unavailable')} · ${esc(meta.timezone || 'Unavailable')} · Screen ${esc(meta.screen || 'Unavailable')}<br><strong>Browser:</strong> ${esc(meta.userAgent || 'Unavailable')}</div></details>
        <div class="reply-editor">
          <label class="field"><span>REPLY TO USER</span><textarea class="reply-text" maxlength="2000" placeholder="Write an update for this user…">${esc(request.adminReply || '')}</textarea></label>
          <label class="field"><span>REQUEST STATUS</span><select class="reply-status">${statusOptions(request.requestStatus || 'paid')}</select></label>
          <button class="primary-btn save-reply" type="button"><span>Send reply</span><span class="btn-arrow">→</span></button>
        </div>
      </article>`;
    }).join('');
  }
  function renderReferralData(data = {}) {
    const stats = data.stats || {};
    $('#refStatAccounts').textContent = Number(stats.totalAccounts || 0).toLocaleString('en-IN');
    $('#refStatWallets').textContent = money(stats.totalWalletBalance || 0);
    $('#refStatPaid').textContent = money(stats.totalReferralPaid || 0);
    $('#refStatCount').textContent = Number(stats.successfulReferralPayments || 0).toLocaleString('en-IN');

    const accounts = Array.isArray(data.accounts) ? data.accounts : [];
    const accountsRoot = $('#referralAccountsTable');
    if (!accounts.length) {
      accountsRoot.innerHTML = '<div class="empty-state"><strong>No registered accounts yet.</strong><p>User accounts will appear here after signup.</p></div>';
    } else {
      accountsRoot.innerHTML = `<table class="admin-data-table"><thead><tr><th>Profile</th><th>Email address</th><th>Sign-in method</th><th>Referral code</th><th>Wallet balances</th><th>Referral earned</th><th>Paid referrals</th><th>Signup date & time</th><th>Last login date & time</th><th>Status</th></tr></thead><tbody>${accounts.map(user => {
        const initials = String(user.name || user.email || 'U').trim().slice(0, 1).toUpperCase();
        const photo = /^https:\/\//i.test(String(user.profileImage || '')) ? `<img class="account-avatar-image" src="${esc(user.profileImage)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '';
        const methods = Array.isArray(user.authProviders) ? user.authProviders : [];
        const methodLabel = methods.includes('google') && methods.includes('password') ? 'Email + Google' : (methods.includes('google') ? 'Google' : 'Email/password');
        return `<tr>
          <td><div class="admin-account-identity"><span class="admin-account-avatar">${esc(initials)}${photo}</span><span><strong>${esc(user.name || '—')}</strong><small class="table-id">${esc(user.id)}</small></span></div></td>
          <td><strong>${esc(user.email || '—')}</strong>${user.emailVerified ? '<small class="verified-email">Verified email</small>' : '<small>Email not verified</small>'}</td>
          <td><strong>${esc(methodLabel)}</strong><small>Last used: ${esc(user.lastLoginMethod === 'google' ? 'Google' : 'Email/password')}</small></td>
          <td><span class="referral-code-chip">${esc(user.referralCode || 'Not generated')}</span>${user.referredBy ? `<small>Referred by: ${esc(user.referredByName || user.referredBy)}</small><small>${esc(user.referredByEmail || '')}</small>` : ''}</td>
          <td><strong>Available: ${money(user.balance)}</strong><small>Referral bonus: ${money(user.bonusBalance)}</small><small>Deposits: ${money(user.depositBalance)} · Earnings: ${money(user.earningsBalance)}</small><small>Reserved: ${money(user.reservedBalance)}</small></td>
          <td><strong>${money(user.referralEarned)}</strong></td>
          <td>${Number(user.successfulReferralPayments || 0).toLocaleString('en-IN')}</td>
          <td><small>${esc(dateLabel(user.createdAt))}</small></td>
          <td><small>${esc(dateLabel(user.lastLoginAt))}</small></td>
          <td><span class="status-pill ${user.active ? '' : 'red'}">${user.active ? 'Active' : 'Disabled'}</span></td>
        </tr>`;
      }).join('')}</tbody></table>`;
    }

    const rewards = Array.isArray(data.rewards) ? data.rewards : [];
    const rewardsRoot = $('#referralRewardsTable');
    if (!rewards.length) {
      rewardsRoot.innerHTML = '<div class="empty-state"><strong>No referral rewards yet.</strong><p>When a referred form payment is verified, the ₹ reward will be recorded here.</p></div>';
    } else {
      rewardsRoot.innerHTML = `<table class="admin-data-table"><thead><tr><th>Referrer</th><th>Referred user</th><th>Referral code</th><th>Request</th><th>Reward</th><th>Credited at</th></tr></thead><tbody>${rewards.map(row => `
        <tr>
          <td><strong>${esc(row.referrerName || '—')}</strong><small>${esc(row.referrerEmail || row.referrerUid || '')}</small></td>
          <td><strong>${esc(row.referredName || '—')}</strong><small>${esc(row.referredEmail || row.referredUid || '')}</small></td>
          <td><span class="referral-code-chip">${esc(row.referralCode || '—')}</span></td>
          <td><strong>${esc(row.requestNumber || '—')}</strong><small class="table-id">${esc(row.requestId || '')}</small></td>
          <td><strong class="reward-amount">+${money(row.amount)}</strong></td>
          <td>${esc(dateLabel(row.createdAt))}</td>
        </tr>`).join('')}</tbody></table>`;
    }

    const transactions = Array.isArray(data.transactions) ? data.transactions : [];
    const transactionsRoot = $('#referralTransactionsTable');
    if (!transactions.length) {
      transactionsRoot.innerHTML = '<div class="empty-state"><strong>No account transactions yet.</strong><p>Wallet activity will appear here when users deposit, earn referral rewards or pay using their balance.</p></div>';
    } else {
      transactionsRoot.innerHTML = `<table class="admin-data-table"><thead><tr><th>User</th><th>Transaction</th><th>Amount</th><th>Status</th><th>Source</th><th>Reference</th><th>Date</th></tr></thead><tbody>${transactions.map(row => `
        <tr>
          <td><strong>${esc(row.userName || '—')}</strong><small>${esc(row.userEmail || row.uid)}</small></td>
          <td><strong>${esc(row.title || row.type || 'Account transaction')}</strong><small>${esc(row.description || row.type || '')}</small></td>
          <td><strong class="${Number(row.amount) > 0 ? 'reward-amount' : ''}">${Number(row.amount) > 0 ? '+' : ''}${money(row.amount)}</strong></td>
          <td><span class="status-pill ${row.status === 'completed' ? '' : row.status === 'rejected' ? 'red' : 'blue'}">${esc(row.status || '—')}</span></td>
          <td>${esc(row.source || row.type || '—')}</td>
          <td><strong>${esc(row.requestNumber || row.referenceId || row.id)}</strong><small class="table-id">${esc(row.requestId || row.id)}</small></td>
          <td>${esc(dateLabel(row.createdAt))}</td>
        </tr>`).join('')}</tbody></table>`;
    }
  }

  async function loadData() {
    if (loading) return;
    loading = true;
    $('#adminRefresh').disabled = true;
    try {
      const [data, referralData] = await Promise.all([
        api('/api/admin/attendance/data', { cache: 'no-store' }),
        api('/api/admin/attendance/referrals', { cache: 'no-store' })
      ]);
      const stats = data.stats || {};
      $('#statPaid').textContent = Number(stats.paidRequests || 0).toLocaleString('en-IN');
      $('#statRevenue').textContent = money(stats.totalPaid);
      $('#statPending').textContent = Number(stats.awaitingReply || 0).toLocaleString('en-IN');
      $('#statCompleted').textContent = Number(stats.completed || 0).toLocaleString('en-IN');
      $('#settingPrice').value = Number(data.settings?.price || 0);
      $('#settingReferralReward').value = Number(data.settings?.referralReward ?? 3);
      $('#settingFormTitle').value = data.settings?.formTitle || 'Request Form';
      $('#settingFormDescription').value = data.settings?.formDescription || '';
      $('#settingMarquee').value = data.settings?.marqueeText || '';
      $('#settingTerms').value = data.settings?.termsText || '';
      builderFields = Array.isArray(data.settings?.formFields) ? data.settings.formFields.map(field => ({ ...field, options: Array.isArray(field.options) ? field.options : [] })) : [];
      renderBuilder();
      const requests = Array.isArray(data.requests) ? data.requests : [];
      $('#navRequestCount').textContent = String(requests.length);
      renderRequests(requests);
      renderReferralData(referralData);
    } catch (error) {
      toast(error.message);
      if (error.message.toLowerCase().includes('admin login')) {
        $('#adminApp').classList.add('hidden');
        $('#loginView').classList.remove('hidden');
      }
    } finally {
      loading = false;
      $('#adminRefresh').disabled = false;
    }
  }
  async function checkSession() {
    try {
      const data = await api('/api/admin/me', { cache: 'no-store' });
      if (data.authenticated) { showAdmin(); await loadData(); }
    } catch { /* Keep the login panel visible if the session cannot be checked. */ }
  }

  $('#adminNav').addEventListener('click', event => {
    const tab = event.target.closest('[data-admin-tab]');
    if (!tab) return;
    setActivePanel(tab.dataset.adminTab);
  });

  $('#loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    $('#loginButton').disabled = true;
    message('#loginMessage', 'Signing in…');
    try {
      await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: $('#adminPassword').value }) });
      $('#adminPassword').value = '';
      message('#loginMessage', '');
      showAdmin();
      await loadData();
    } catch (error) { message('#loginMessage', error.message); }
    finally { $('#loginButton').disabled = false; }
  });
  $('#logoutButton').addEventListener('click', async () => {
    try { await api('/api/admin/logout', { method: 'POST', body: '{}' }); }
    finally {
      $('#adminApp').classList.add('hidden');
      $('#loginView').classList.remove('hidden');
      $('#adminPassword').value = '';
    }
  });

  $('#addFieldBtn').addEventListener('click', () => {
    if (builderFields.length >= 40) return toast('Maximum 40 fields allowed in one form.');
    builderFields.push(newField('text'));
    renderBuilder();
    const cards = $$('.builder-field-card');
    const last = cards[cards.length - 1];
    last?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('input[data-prop="label"]', last)?.focus({ preventScroll: true });
  });
  function $$(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }
  $('#builderFields').addEventListener('input', event => {
    const control = event.target.closest('[data-prop]');
    if (!control) return;
    const card = control.closest('.builder-field-card');
    const field = builderFields.find(item => item.id === card?.dataset.id);
    if (!field) return;
    const prop = control.dataset.prop;
    if (prop === 'required') field.required = control.checked;
    else if (prop === 'options') field.options = control.value.split('\n').map(x => x.trim()).filter(Boolean);
    else field[prop] = control.value;
  });
  $('#builderFields').addEventListener('change', event => {
    const control = event.target.closest('[data-prop="type"]');
    if (!control) return;
    const card = control.closest('.builder-field-card');
    const field = builderFields.find(item => item.id === card?.dataset.id);
    if (!field) return;
    field.type = control.value;
    renderBuilder();
  });
  $('#builderFields').addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    const card = button.closest('.builder-field-card');
    const index = builderFields.findIndex(item => item.id === card?.dataset.id);
    if (index < 0) return;
    if (button.classList.contains('delete-field')) builderFields.splice(index, 1);
    else if (button.classList.contains('move-up') && index > 0) [builderFields[index - 1], builderFields[index]] = [builderFields[index], builderFields[index - 1]];
    else if (button.classList.contains('move-down') && index < builderFields.length - 1) [builderFields[index + 1], builderFields[index]] = [builderFields[index], builderFields[index + 1]];
    renderBuilder();
  });

  $('#settingsForm').addEventListener('submit', async event => {
    event.preventDefault();
    const price = Number($('#settingPrice').value);
    const formTitle = $('#settingFormTitle').value.trim();
    if (!formTitle) return message('#settingsMessage', 'Enter a form title.');
    if (!Number.isInteger(price) || price < 1 || price > 100000) return message('#settingsMessage', 'Enter a fee between ₹1 and ₹1,00,000.');
    const referralReward = Number($('#settingReferralReward').value);
    if (!Number.isInteger(referralReward) || referralReward < 0 || referralReward > 1000) return message('#settingsMessage', 'Referral reward must be between ₹0 and ₹1,000.');
    if (!builderFields.length) return message('#settingsMessage', 'Add at least one field to the form.');
    for (const field of builderFields) {
      if (!String(field.label || '').trim()) return message('#settingsMessage', 'Every field needs a label.');
      if (['select', 'radio'].includes(field.type) && !(field.options || []).length) return message('#settingsMessage', `Add choices for “${field.label}”.`);
      if (field.min !== '' && field.max !== '' && Number(field.min) > Number(field.max)) return message('#settingsMessage', `Minimum value cannot be greater than maximum for “${field.label}”.`);
    }
    const button = $('#saveSettingsBtn');
    button.disabled = true;
    message('#settingsMessage', 'Saving form settings…');
    try {
      await api('/api/admin/attendance/settings', {
        method: 'POST',
        body: JSON.stringify({
          price,
          referralReward: Number($('#settingReferralReward').value || 0),
          formTitle,
          formDescription: $('#settingFormDescription').value.trim(),
          marqueeText: $('#settingMarquee').value.trim(),
          termsText: $('#settingTerms').value.trim(),
          formFields: builderFields,
        }),
      });
      message('#settingsMessage', 'Saved. The public form now uses these fields and settings.', true);
      toast('Form settings saved');
      await loadData();
    } catch (error) { message('#settingsMessage', error.message); }
    finally { button.disabled = false; }
  });
  $('#adminRequests').addEventListener('click', async event => {
    const button = event.target.closest('.save-reply');
    if (!button) return;
    const card = button.closest('.admin-request-card');
    const id = card?.dataset.id;
    const reply = $('.reply-text', card)?.value.trim() || '';
    const status = $('.reply-status', card)?.value || 'paid';
    if (!id) return;
    button.disabled = true;
    try {
      await api('/api/admin/attendance/reply', { method: 'POST', body: JSON.stringify({ id, reply, status }) });
      toast('Reply sent to the user');
      await loadData();
    } catch (error) { toast(error.message); }
    finally { button.disabled = false; }
  });
  $('#adminRefresh').addEventListener('click', loadData);
  setActivePanel('requests');
  checkSession();
})();
