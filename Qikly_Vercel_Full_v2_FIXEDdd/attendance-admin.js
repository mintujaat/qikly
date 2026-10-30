(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  let loading = false;
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
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
  function money(value) {
    return `₹${Number(value || 0).toLocaleString('en-IN')}`;
  }
  function dateLabel(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  }
  function showAdmin() {
    $('#loginView').classList.add('hidden');
    $('#adminApp').classList.remove('hidden');
  }
  function statusOptions(current) {
    return [
      ['paid', 'Paid · Awaiting reply'],
      ['in_progress', 'In progress'],
      ['completed', 'Completed'],
      ['rejected', 'Closed / rejected'],
    ].map(([value, label]) => `<option value="${value}" ${current === value ? 'selected' : ''}>${label}</option>`).join('');
  }
  function renderRequests(requests) {
    const root = $('#adminRequests');
    $('#queueCount').textContent = `${requests.length} PAID`;
    if (!requests.length) {
      root.innerHTML = '<div class="empty-state"><span class="empty-symbol">⌁</span><strong>No paid requests</strong><p>Successfully paid requests will appear here.</p></div>';
      return;
    }
    root.innerHTML = requests.map((request) => {
      const meta = request.deviceMeta || {};
      return `<article class="admin-request-card" data-id="${esc(request.id)}">
        <div class="admin-request-head"><div><h3>${esc(request.requestNumber || request.id)}</h3><p>Submitted ${esc(dateLabel(request.createdAt))} · Payment verified</p></div><span class="status-pill ${request.requestStatus === 'completed' ? '' : request.requestStatus === 'rejected' ? 'red' : 'blue'}">${esc(request.requestStatus || 'paid').replaceAll('_', ' ')}</span></div>
        <div class="admin-meta-grid">
          <div class="meta-cell"><small>College account ID</small><strong>${esc(request.accountId)}</strong></div>
          <div class="meta-cell"><small>Class time</small><strong>${esc(request.classTime)}</strong></div>
          <div class="meta-cell"><small>Teacher name</small><strong>${esc(request.teacherName)}</strong></div>
          <div class="meta-cell"><small>Amount paid</small><strong>${money(request.amount)}</strong></div>
          <div class="meta-cell"><small>Razorpay payment ID</small><strong>${esc(request.razorpayPaymentId || '—')}</strong></div>
          <div class="meta-cell"><small>Request document ID</small><strong>${esc(request.id)}</strong></div>
          <div class="meta-cell"><small>Paid at</small><strong>${esc(dateLabel(request.paidAt))}</strong></div>
          <div class="meta-cell"><small>Last reply</small><strong>${esc(dateLabel(request.repliedAt))}</strong></div>
        </div>
        <div class="device-meta"><strong>Browser / device details:</strong> ${esc(meta.platform || 'Platform unavailable')} · ${esc(meta.language || 'Language unavailable')} · ${esc(meta.timezone || 'Timezone unavailable')} · Screen ${esc(meta.screen || 'unavailable')}<br><strong>Browser user agent:</strong> ${esc(meta.userAgent || 'Unavailable')}</div>
        <div class="reply-editor">
          <label class="field"><span>REPLY TO USER</span><textarea class="reply-text" maxlength="2000" placeholder="Write an update for this user…">${esc(request.adminReply || '')}</textarea></label>
          <label class="field"><span>REQUEST STATUS</span><select class="reply-status">${statusOptions(request.requestStatus || 'paid')}</select></label>
          <button class="primary-btn save-reply" type="button"><span>Send reply</span><span class="btn-arrow">→</span></button>
        </div>
      </article>`;
    }).join('');
  }
  async function loadData() {
    if (loading) return;
    loading = true;
    $('#adminRefresh').disabled = true;
    try {
      const data = await api('/api/admin/attendance/data', { cache: 'no-store' });
      const stats = data.stats || {};
      $('#statPaid').textContent = Number(stats.paidRequests || 0).toLocaleString('en-IN');
      $('#statRevenue').textContent = money(stats.totalPaid);
      $('#statPending').textContent = Number(stats.awaitingReply || 0).toLocaleString('en-IN');
      $('#statCompleted').textContent = Number(stats.completed || 0).toLocaleString('en-IN');
      $('#settingPrice').value = Number(data.settings?.price || 0);
      $('#settingMarquee').value = data.settings?.marqueeText || '';
      renderRequests(Array.isArray(data.requests) ? data.requests : []);
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
      if (data.authenticated) {
        showAdmin();
        await loadData();
      }
    } catch {
      // Keep the login panel visible when the admin session cannot be checked.
    }
  }
  $('#loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('#loginButton').disabled = true;
    message('#loginMessage', 'Signing in…');
    try {
      await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: $('#adminPassword').value }) });
      $('#adminPassword').value = '';
      message('#loginMessage', '');
      showAdmin();
      await loadData();
    } catch (error) {
      message('#loginMessage', error.message);
    } finally {
      $('#loginButton').disabled = false;
    }
  });
  $('#logoutButton').addEventListener('click', async () => {
    try { await api('/api/admin/logout', { method: 'POST', body: '{}' }); }
    finally {
      $('#adminApp').classList.add('hidden');
      $('#loginView').classList.remove('hidden');
      $('#adminPassword').value = '';
    }
  });
  $('#settingsForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const price = Number($('#settingPrice').value);
    if (!Number.isInteger(price) || price < 1 || price > 100000) return message('#settingsMessage', 'Enter a fee between ₹1 and ₹1,00,000.');
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    message('#settingsMessage', 'Saving…');
    try {
      await api('/api/admin/attendance/settings', { method: 'POST', body: JSON.stringify({ price, marqueeText: $('#settingMarquee').value.trim() }) });
      message('#settingsMessage', 'Settings saved. The user page will show the new fee and announcement.', true);
      toast('Attendance settings saved');
    } catch (error) {
      message('#settingsMessage', error.message);
    } finally { button.disabled = false; }
  });
  $('#adminRequests').addEventListener('click', async (event) => {
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
    } catch (error) {
      toast(error.message);
    } finally { button.disabled = false; }
  });
  $('#adminRefresh').addEventListener('click', loadData);
  checkSession();
})();
