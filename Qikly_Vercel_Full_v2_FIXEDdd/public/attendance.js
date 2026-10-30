(() => {
  'use strict';
  const DEVICE_KEY = 'qikly_attendance_device_v1';
  const CACHE_KEY = 'qikly_attendance_cache_v1';
  const $ = (selector) => document.querySelector(selector);
  let config = { price: 0, marqueeText: '', termsText: '', razorpayKeyId: '', paymentReady: false };
  let deviceToken = '';
  let submitting = false;

  function escapeHtml(value) {
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
      headers: {
        'Content-Type': 'application/json',
        'X-Qikly-Device': deviceToken,
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
  }
  function setMessage(message, success = false) {
    const el = $('#formMessage');
    el.textContent = message || '';
    el.classList.toggle('success-message', success);
  }
  function setBusy(busy, text) {
    const button = $('#payButton');
    button.disabled = busy || !config.paymentReady || config.price < 1;
    $('#payButtonText').textContent = text || (busy ? 'Processing…' : 'Continue to secure payment');
  }
  function renderConfig() {
    $('#marqueeText').textContent = config.marqueeText || 'Qikly Attendance • Submit your request • Secure online payment • Track admin replies here';
    $('#marqueeCopy').textContent = $('#marqueeText').textContent;
    $('#termsText').textContent = config.termsText || '';
    $('#payAmount').textContent = config.price > 0 ? `₹${Number(config.price).toLocaleString('en-IN')}` : 'Not set';
    if (config.price < 1) {
      $('#payButtonText').textContent = 'Payment fee not configured';
      setBusy(false);
      setMessage('The administrator has not configured the attendance fee yet.');
    } else if (!config.paymentReady) {
      $('#payButtonText').textContent = 'Online payment unavailable';
      setBusy(false);
      setMessage('Razorpay is not configured on the server. Please contact the administrator.');
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
  function renderRequests(requests) {
    const root = $('#requestsList');
    if (!requests.length) {
      root.innerHTML = '<div class="empty-state"><span class="empty-symbol">⌁</span><strong>No paid requests yet</strong><p>After a successful payment, your request and its latest reply will appear here.</p></div>';
      return;
    }
    root.innerHTML = requests.map((request) => `
      <article class="request-card">
        <div class="request-card-top"><strong class="request-number">${escapeHtml(request.requestNumber || request.id)}</strong><span class="status-pill ${statusClass(request.requestStatus)}">${escapeHtml(statusLabel(request.requestStatus))}</span></div>
        <div class="request-details">
          <div class="detail-item"><small>College account ID</small><strong>${escapeHtml(request.accountId)}</strong></div>
          <div class="detail-item"><small>Department / course</small><strong>${escapeHtml(request.department || '—')}</strong></div>
          <div class="detail-item"><small>Class time</small><strong>${escapeHtml(request.classTime)}</strong></div>
          <div class="detail-item"><small>Teacher</small><strong>${escapeHtml(request.teacherName)}</strong></div>
          <div class="detail-item"><small>Your 4-digit code</small><strong class="user-secret-code-value">${escapeHtml(request.userSecretCode || '—')}</strong></div>
          <div class="detail-item"><small>Payment</small><strong>₹${Number(request.amount || 0).toLocaleString('en-IN')} · Paid</strong></div>
        </div>
        <div class="reply-box"><small>Admin reply · ${escapeHtml(dateLabel(request.repliedAt || request.updatedAt))}</small><p class="${request.adminReply ? '' : 'reply-empty'}">${escapeHtml(request.adminReply || 'No admin reply yet. Your update will appear here.')}</p></div>
        <div class="request-date" style="margin-top:10px;color:#a0a9b6;font-size:8px">Submitted ${escapeHtml(dateLabel(request.createdAt))}</div>
      </article>`).join('');
  }
  async function refreshRequests(showMessage = false) {
    try {
      const data = await api('/api/attendance/requests');
      const requests = Array.isArray(data.requests) ? data.requests : [];
      localStorage.setItem(CACHE_KEY, JSON.stringify(requests));
      renderRequests(requests);
      if (showMessage) setMessage('Your request list is up to date.', true);
    } catch (error) {
      if (showMessage) setMessage(error.message);
    }
  }
  function loadCachedRequests() {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
      renderRequests(Array.isArray(cached) ? cached : []);
    } catch {
      renderRequests([]);
    }
  }
  async function loadConfig() {
    try {
      const response = await fetch('/api/attendance/config', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to load payment details.');
      config = { ...config, ...data };
      renderConfig();
    } catch (error) {
      $('#payAmount').textContent = 'Unavailable';
      $('#payButtonText').textContent = 'Unable to load payment';
      $('#payButton').disabled = true;
      setMessage(error.message);
    }
  }
  async function submitRequest(event) {
    event.preventDefault();
    if (submitting) return;
    setMessage('');
    const accountId = $('#accountId').value.trim();
    const userSecretCode = $('#userSecretCode').value.trim();
    const department = $('#department').value;
    const departmentOther = $('#otherDepartment').value.trim();
    const classTime = $('#classTime').value;
    const teacherName = $('#teacherName').value.trim();
    if (!accountId || !department || !classTime || !teacherName) return setMessage('Complete all attendance details first.');
    if (department === 'Other / Not listed' && !departmentOther) return setMessage('Enter your course name.');
    if (!/^\d{4}$/.test(userSecretCode)) return setMessage('Enter exactly 4 digits for your secret code.');
    if (!$('#agreeTerms').checked) return setMessage('Please agree to the terms before continuing.');
    if (config.price < 1 || !config.paymentReady) return setMessage('Online payment is not available yet.');
    if (!window.Razorpay) return setMessage('Razorpay checkout did not load. Refresh the page and try again.');
    submitting = true;
    setBusy(true, 'Creating secure payment…');
    try {
      const created = await api('/api/attendance/order/create', {
        method: 'POST',
        body: JSON.stringify({ accountId, userSecretCode, department, departmentOther, classTime, teacherName, acceptedTerms: true, deviceMeta: deviceMeta() }),
      });
      const order = created.razorpayOrder;
      const checkout = new window.Razorpay({
        key: created.keyId,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'Qikly Attendance',
        description: `Attendance request ${created.request.requestNumber}`,
        order_id: order.id,
        theme: { color: '#0e9a91' },
        handler: async (response) => {
          setBusy(true, 'Verifying payment…');
          setMessage('Payment received. Verifying the transaction securely…', true);
          try {
            await api('/api/attendance/order/verify', { method: 'POST', body: JSON.stringify(response) });
            $('#attendanceForm').reset();
            setMessage(`Payment successful. Request ${created.request.requestNumber} has been added below.`, true);
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
        modal: {
          ondismiss: () => {
            submitting = false;
            setBusy(false);
            setMessage('Payment window closed. No paid request was added. You can try again.');
          },
        },
      });
      checkout.on('payment.failed', (response) => {
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
      setMessage(error.message);
    }
  }
  $('#attendanceForm').addEventListener('submit', submitRequest);
  $('#userSecretCode').addEventListener('input', (event) => {
    event.currentTarget.value = event.currentTarget.value.replace(/\D/g, '').slice(0, 4);
  });
  $('#department').addEventListener('change', (event) => {
    const isOther = event.currentTarget.value === 'Other / Not listed';
    $('#otherDepartmentWrap').classList.toggle('hidden', !isOther);
    $('#otherDepartment').required = isOther;
    if (!isOther) $('#otherDepartment').value = '';
  });
  $('#refreshRequests').addEventListener('click', () => refreshRequests(true));
  $('#anotherRequest').addEventListener('click', () => {
    $('#accountId').focus({ preventScroll: true });
    window.scrollTo({ top: $('.request-panel').getBoundingClientRect().top + window.scrollY - 18, behavior: 'smooth' });
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && deviceToken) refreshRequests(); });
  boot();
})();
