(() => {
  'use strict';
  const DEVICE_KEY = 'qikly_attendance_device_v1';
  const CACHE_KEY = 'qikly_attendance_cache_v1';
  const $ = (selector) => document.querySelector(selector);
  let config = { price: 0, marqueeText: '', termsText: '', razorpayKeyId: '', paymentReady: false };
  let deviceToken = '';
  let submitting = false;
  let collegeMap = null;
  let collegeMarker = null;
  let selectedLocation = null;
  const DEFAULT_MAP_CENTER = [28.8955, 76.6066];

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
  function validCoordinates(lat, lng) {
    return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }
  function selectedLocationLabel() {
    if (!selectedLocation) return;
    selectedLocation.label = $('#locationLabel').value.trim().slice(0, 160);
  }
  function paintLocationSelection(lat, lng, source = 'map_pin', accuracyMeters = null) {
    lat = Number(lat);
    lng = Number(lng);
    if (!validCoordinates(lat, lng)) return;
    selectedLocation = { latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)), source, accuracyMeters: Number.isFinite(accuracyMeters) && accuracyMeters > 0 ? Math.round(accuracyMeters) : null, label: $('#locationLabel').value.trim().slice(0, 160) };
    $('#locationLatitude').value = selectedLocation.latitude.toFixed(6);
    $('#locationLongitude').value = selectedLocation.longitude.toFixed(6);
    $('#selectedLocationText').textContent = `Pin selected · ${selectedLocation.latitude.toFixed(6)}, ${selectedLocation.longitude.toFixed(6)}`;
    $('#selectedLocationHelp').textContent = source === 'device_gps' ? `Device location selected${selectedLocation.accuracyMeters ? ` · accuracy around ${selectedLocation.accuracyMeters} m` : ''}. Drag the pin to adjust it.` : 'Location saved on the map. Drag the pin if you need to adjust it.';
    $('#clearCollegeLocation').disabled = false;
    if (collegeMarker) {
      collegeMarker.setLatLng([selectedLocation.latitude, selectedLocation.longitude]);
    } else if (collegeMap) {
      collegeMarker = window.L.marker([selectedLocation.latitude, selectedLocation.longitude], { draggable: true }).addTo(collegeMap);
      collegeMarker.on('dragend', () => {
        const point = collegeMarker.getLatLng();
        paintLocationSelection(point.lat, point.lng, 'map_pin');
      });
    }
  }
  function clearSelectedLocation() {
    selectedLocation = null;
    $('#locationLatitude').value = '';
    $('#locationLongitude').value = '';
    $('#locationLabel').value = '';
    $('#selectedLocationText').textContent = 'No location selected';
    $('#selectedLocationHelp').textContent = 'Zoom in, then tap the exact college location on the map. You can drag the pin to adjust it.';
    $('#clearCollegeLocation').disabled = true;
    if (collegeMarker && collegeMap) collegeMap.removeLayer(collegeMarker);
    collegeMarker = null;
  }
  function initCollegeMap() {
    const mapElement = $('#collegeLocationMap');
    if (!window.L || !mapElement) {
      mapElement.innerHTML = '<div class="map-load-error">Map could not load. Check your internet connection and refresh the page.</div>';
      $('#useCurrentLocation').disabled = true;
      return;
    }
    collegeMap = window.L.map(mapElement, { scrollWheelZoom: false }).setView(DEFAULT_MAP_CENTER, 11);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'
    }).addTo(collegeMap);
    collegeMap.on('click', (event) => paintLocationSelection(event.latlng.lat, event.latlng.lng, 'map_pin'));
    window.setTimeout(() => collegeMap && collegeMap.invalidateSize(), 120);
  }
  function locateCurrentPosition() {
    const button = $('#useCurrentLocation');
    if (!navigator.geolocation) {
      $('#selectedLocationHelp').textContent = 'This browser does not support device location. Select the pin manually on the map.';
      return;
    }
    button.disabled = true;
    button.textContent = 'Locating…';
    $('#selectedLocationHelp').textContent = 'Waiting for your device location permission…';
    navigator.geolocation.getCurrentPosition((position) => {
      const { latitude, longitude, accuracy } = position.coords;
      paintLocationSelection(latitude, longitude, 'device_gps', accuracy);
      if (collegeMap) collegeMap.setView([latitude, longitude], 18);
      button.disabled = false;
      button.textContent = '◎ Use my current location';
    }, (error) => {
      const messages = {
        1: 'Location permission was denied. You can still select the college pin manually on the map.',
        2: 'Your current location is unavailable. Select the college pin manually on the map.',
        3: 'Location request timed out. Try again or select the pin manually.'
      };
      $('#selectedLocationHelp').textContent = messages[error.code] || 'Could not get your location. Select the pin manually on the map.';
      button.disabled = false;
      button.textContent = '◎ Use my current location';
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
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
          <div class="detail-item"><small>Department / course</small><strong>${escapeHtml(request.departmentDisplay || request.department || request.departmentName || request.courseName || 'Not recorded')}</strong></div>
          <div class="detail-item"><small>Class time</small><strong>${escapeHtml(request.classTime)}</strong></div>
          <div class="detail-item"><small>Teacher</small><strong>${escapeHtml(request.teacherName)}</strong></div>
          <div class="detail-item"><small>Your 4-digit code</small><strong class="user-secret-code-value">${escapeHtml(request.userSecretCode || request.secretCode || request.fourDigitCode || 'Not recorded')}</strong></div>
          ${request.collegeLocation && validCoordinates(Number(request.collegeLocation.latitude), Number(request.collegeLocation.longitude)) ? `<div class="detail-item"><small>Selected college location</small><strong>${escapeHtml(request.collegeLocation.label || 'Map pin selected')}</strong><a class="request-map-link" href="${escapeHtml(request.collegeLocation.mapUrl || `https://www.google.com/maps?q=${Number(request.collegeLocation.latitude)},${Number(request.collegeLocation.longitude)}`)}" target="_blank" rel="noopener">View map ↗</a></div>` : ''}
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
    selectedLocationLabel();
    if (!accountId || !department || !classTime || !teacherName) return setMessage('Complete all attendance details first.');
    if (department === 'Other / Not listed' && !departmentOther) return setMessage('Enter your course name.');
    if (!/^\d{4}$/.test(userSecretCode)) return setMessage('Enter exactly 4 digits for your secret code.');
    if (!selectedLocation || !validCoordinates(selectedLocation.latitude, selectedLocation.longitude)) return setMessage('Select your college location on the map before continuing.');
    if (!$('#agreeTerms').checked) return setMessage('Please agree to the terms before continuing.');
    if (config.price < 1 || !config.paymentReady) return setMessage('Online payment is not available yet.');
    if (!window.Razorpay) return setMessage('Razorpay checkout did not load. Refresh the page and try again.');
    submitting = true;
    setBusy(true, 'Creating secure payment…');
    try {
      const created = await api('/api/attendance/order/create', {
        method: 'POST',
        body: JSON.stringify({ accountId, userSecretCode, secretCode: userSecretCode, department, departmentChoice: department, departmentOther, departmentLabel: department === 'Other / Not listed' ? `Other: ${departmentOther}` : department, classTime, teacherName, collegeLocation: selectedLocation, acceptedTerms: true, deviceMeta: deviceMeta() }),
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
            clearSelectedLocation();
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
  initCollegeMap();
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
  $('#useCurrentLocation').addEventListener('click', locateCurrentPosition);
  $('#clearCollegeLocation').addEventListener('click', clearSelectedLocation);
  $('#locationLabel').addEventListener('input', selectedLocationLabel);
  $('#refreshRequests').addEventListener('click', () => refreshRequests(true));
  $('#anotherRequest').addEventListener('click', () => {
    $('#accountId').focus({ preventScroll: true });
    window.scrollTo({ top: $('.request-panel').getBoundingClientRect().top + window.scrollY - 18, behavior: 'smooth' });
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && deviceToken) refreshRequests(); });
  boot();
})();
