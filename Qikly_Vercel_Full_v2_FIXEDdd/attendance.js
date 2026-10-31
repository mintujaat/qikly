(() => {
  'use strict';
  const DEVICE_KEY = 'qikly_attendance_device_v1';
  const CACHE_KEY = 'qikly_attendance_cache_v1';
  const $ = (selector, root = document) => root.querySelector(selector);
  let config = { price: 0, marqueeText: '', termsText: '', formTitle: 'Request Form', formDescription: '', formFields: [], paymentReady: false };
  let deviceToken = '';
  let submitting = false;

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
  function setBusy(busy, text) {
    const button = $('#payButton');
    button.disabled = busy || !config.paymentReady || config.price < 1 || !config.formFields.length;
    $('#payButtonText').textContent = text || (busy ? 'Processing…' : 'Continue to secure payment');
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
    if (field.type === 'textarea') {
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
    return `<div class="field dynamic-field" data-rendered-field="${id}">${label}${control}${field.helpText ? `<small>${esc(field.helpText)}</small>` : ''}</div>`;
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
    if (config.price < 1) {
      $('#payButtonText').textContent = 'Payment fee not configured';
      setBusy(false);
      setMessage('The administrator has not configured the payment fee yet.');
    } else if (!config.paymentReady) {
      $('#payButtonText').textContent = 'Online payment unavailable';
      setBusy(false);
      setMessage('Razorpay is not configured on the server. Please contact the administrator.');
    } else if (!(config.formFields || []).length) {
      $('#payButtonText').textContent = 'Form not published';
      setBusy(false);
      setMessage('The administrator has not published the form fields yet.');
    } else {
      $('#payButtonText').textContent = 'Continue to secure payment';
      setBusy(false);
      setMessage('');
    }
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
    return String(value);
  }
  function requestFields(request) {
    const fields = Array.isArray(request.formFields) ? request.formFields : [];
    const data = request.formData && typeof request.formData === 'object' ? request.formData : {};
    if (fields.length) return fields.map(field => ({ label: field.label || field.id, value: displayValue(data[field.id]) }));
    const legacy = [
      ['College account ID', request.accountId], ['Department / course', request.department],
      ['Class time', request.classTime], ['Teacher name', request.teacherName], ['Your 4-digit code', request.userSecretCode],
    ].filter(([, value]) => value !== undefined && value !== null && value !== '');
    return legacy.map(([label, value]) => ({ label, value: displayValue(value) }));
  }
  function renderRequests(requests) {
    const root = $('#requestsList');
    if (!requests.length) {
      root.innerHTML = '<div class="empty-state"><span class="empty-symbol">⌁</span><strong>No paid submissions yet</strong><p>After a successful payment, your submitted form will appear here.</p></div>';
      return;
    }
    root.innerHTML = requests.map(request => {
      const details = requestFields(request).map(item => `<div class="detail-item"><small>${esc(item.label)}</small><strong>${esc(item.value)}</strong></div>`).join('');
      return `<article class="request-card">
        <div class="request-card-top"><strong class="request-number">${esc(request.requestNumber || request.id)}</strong><span class="status-pill ${statusClass(request.requestStatus)}">${esc(statusLabel(request.requestStatus))}</span></div>
        <div class="request-details">${details}<div class="detail-item"><small>Payment</small><strong>₹${Number(request.amount || 0).toLocaleString('en-IN')} · Paid</strong></div></div>
        <div class="reply-box"><small>Admin reply · ${esc(dateLabel(request.repliedAt || request.updatedAt))}</small><p class="${request.adminReply ? '' : 'reply-empty'}">${esc(request.adminReply || 'No admin reply yet. Your update will appear here.')}</p></div>
        <div class="request-date">Submitted ${esc(dateLabel(request.createdAt))}</div>
      </article>`;
    }).join('');
  }
  async function refreshRequests(showMessage = false) {
    try {
      const data = await api('/api/attendance/requests');
      const requests = Array.isArray(data.requests) ? data.requests : [];
      localStorage.setItem(CACHE_KEY, JSON.stringify(requests));
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
  }
  function collectFormData() {
    const values = {};
    for (const field of config.formFields) {
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
  async function submitRequest(event) {
    event.preventDefault();
    if (submitting) return;
    setMessage('');
    let formData;
    try { formData = collectFormData(); }
    catch (error) { return setMessage(error.message); }
    if (!$('#agreeTerms').checked) return setMessage('Please agree to the confirmation text before continuing.');
    if (config.price < 1 || !config.paymentReady) return setMessage('Online payment is not available yet.');
    if (!window.Razorpay) return setMessage('Razorpay checkout did not load. Refresh the page and try again.');

    submitting = true;
    setBusy(true, 'Creating secure payment…');
    try {
      const created = await api('/api/attendance/order/create', {
        method: 'POST', body: JSON.stringify({ formData, acceptedTerms: true, deviceMeta: deviceMeta() }),
      });
      const order = created.razorpayOrder;
      const checkout = new window.Razorpay({
        key: created.keyId,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'Qikly',
        description: `${config.formTitle || 'Form'} · ${created.request.requestNumber}`,
        order_id: order.id,
        theme: { color: '#0e9a91' },
        handler: async response => {
          setBusy(true, 'Verifying payment…');
          setMessage('Payment received. Verifying the transaction securely…', true);
          try {
            await api('/api/attendance/order/verify', { method: 'POST', body: JSON.stringify(response) });
            $('#attendanceForm').reset();
            setMessage(`Payment successful. Reference ${created.request.requestNumber} has been added below.`, true);
            await refreshRequests();
            $('#myRequests').scrollIntoView({ behavior: 'smooth', block: 'start' });
          } catch (error) {
            setMessage(`${error.message} Keep this payment reference: ${created.request.requestNumber}`);
            await refreshRequests();
          } finally {
            submitting = false;
            setBusy(false);
          }
        },
        modal: { ondismiss: () => { submitting = false; setBusy(false); setMessage('Payment window closed. No paid submission was added. You can try again.'); } },
      });
      checkout.on('payment.failed', response => {
        submitting = false;
        setBusy(false);
        setMessage(response.error?.description || 'Payment did not complete. Please try again.');
      });
      checkout.open();
    } catch (error) {
      submitting = false;
      setBusy(false);
      setMessage(error.message);
    }
  }
  async function boot() {
    try {
      deviceToken = getDeviceToken();
      loadCachedRequests();
      await Promise.all([loadConfig(), refreshRequests()]);
    } catch (error) {
      $('#payButton').disabled = true;
      $('#payButtonText').textContent = 'Unable to load form';
      setMessage(error.message);
    }
  }
  $('#attendanceForm').addEventListener('submit', submitRequest);
  $('#refreshRequests').addEventListener('click', () => refreshRequests(true));
  $('#anotherRequest').addEventListener('click', () => {
    $('#formTitle').scrollIntoView({ behavior: 'smooth', block: 'center' });
    const first = $('#dynamicFields input, #dynamicFields textarea, #dynamicFields select');
    first?.focus({ preventScroll: true });
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && deviceToken) refreshRequests(); });
  boot();
})();
