// ── STATE ──────────────────────────────────────────────────────────────────
var API_BASE    = localStorage.getItem('rhr_api') || 'http://localhost:3000';
var token       = localStorage.getItem('rhr_token') || null;
var currentUser = null;
var otpPhone    = '';
var companies   = [];

try { currentUser = JSON.parse(localStorage.getItem('rhr_user')); }   catch(e) {}
try { companies   = JSON.parse(localStorage.getItem('rhr_companies')) || []; } catch(e) {}

// ── BOOT ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('apiBaseInput').value = API_BASE;

  // Nav buttons
  document.querySelectorAll('.nav-btn[data-screen]').forEach(function(btn) {
    btn.addEventListener('click', function() { go(btn.dataset.screen); });
  });
  document.querySelectorAll('[data-goto]').forEach(function(btn) {
    btn.addEventListener('click', function() { go(btn.dataset.goto); });
  });

  // Login
  document.getElementById('loginBtn').addEventListener('click', doLogin);
  document.getElementById('loginPassword').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') doLogin();
  });

  // Register flow
  document.getElementById('sendOtpBtn').addEventListener('click', doSendOTP);
  document.getElementById('verifyOtpBtn').addEventListener('click', doVerifyStep);
  document.getElementById('resendOtpBtn').addEventListener('click', doSendOTP);
  document.getElementById('registerBtn').addEventListener('click', doRegister);
  document.getElementById('registerAnotherBtn').addEventListener('click', resetRegister);
  document.getElementById('regPhone').addEventListener('keydown', function(e) { if (e.key === 'Enter') doSendOTP(); });
  document.getElementById('regOtp').addEventListener('keydown', function(e)   { if (e.key === 'Enter') doVerifyStep(); });

  // Home
  document.getElementById('goLoginLink').addEventListener('click', function(e) { e.preventDefault(); go('login'); });
  document.getElementById('logoutBtn').addEventListener('click', doLogout);
  document.getElementById('copyTokenBtn').addEventListener('click', copyToken);

  // Pending
  document.getElementById('refreshPendingBtn').addEventListener('click', loadPending);

  // Config
  document.getElementById('saveConfigBtn').addEventListener('click', saveConfig);
  document.getElementById('testConnBtn').addEventListener('click', testConn);
  document.getElementById('clearStateBtn').addEventListener('click', clearAll);
  document.getElementById('clearLogBtn').addEventListener('click', clearLog);

  // Status checks
  checkServer();
  checkWA();
  setInterval(checkServer, 15000);
  setInterval(checkWA, 8000);

  // Load companies (public endpoint)
  loadCompanies();
  refreshState();

  if (currentUser && token) renderHome();
});

// ── NAVIGATION ─────────────────────────────────────────────────────────────
function go(name) {
  document.querySelectorAll('.screen').forEach(function(s)  { s.classList.remove('active'); });
  document.querySelectorAll('.nav-btn').forEach(function(b) { b.classList.remove('active'); });
  var screen = document.getElementById('screen-' + name);
  var navBtn = document.getElementById('nav-' + name);
  if (screen) screen.classList.add('active');
  if (navBtn) navBtn.classList.add('active');
  if (name === 'home')    renderHome();
  if (name === 'pending') renderPending();
  refreshState();
}

// ── LOGGING ────────────────────────────────────────────────────────────────
function addLog(type, title, detail) {
  var body  = document.getElementById('logBody');
  var entry = document.createElement('div');
  entry.className = 'log-entry ' + type;
  var t = new Date().toLocaleTimeString();
  entry.innerHTML = '<div class="log-time">' + t + '</div><div class="log-text">' +
    esc(title) + (detail ? '\n' + esc(detail) : '') + '</div>';
  body.insertBefore(entry, body.firstChild);
}

function clearLog() { document.getElementById('logBody').innerHTML = ''; }

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── API HELPER ─────────────────────────────────────────────────────────────
function api(method, path, body, useToken) {
  var url     = API_BASE + path;
  var headers = { 'Content-Type': 'application/json' };
  if (useToken !== false && token) headers['Authorization'] = 'Bearer ' + token;

  addLog('req', method + ' ' + path, body ? JSON.stringify(body, null, 2) : '');

  return fetch(url, {
    method:  method,
    headers: headers,
    body:    body ? JSON.stringify(body) : undefined
  })
  .then(function(res) {
    return res.json().then(function(data) {
      if (data.success) {
        addLog('res-ok',  res.status + ' OK',    JSON.stringify(data, null, 2));
      } else {
        addLog('res-err', res.status + ' ERROR', JSON.stringify(data, null, 2));
      }
      return { ok: res.ok, status: res.status, data: data };
    });
  })
  .catch(function(e) {
    addLog('res-err', 'NETWORK ERROR', e.message);
    return { ok: false, data: { success: false, message: e.message } };
  });
}

// ── SERVER STATUS ──────────────────────────────────────────────────────────
function checkServer() {
  var dot = document.getElementById('serverDot');
  var txt = document.getElementById('serverTxt');
  fetch(API_BASE + '/health')
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.success) {
        dot.className    = 'dot green';
        txt.textContent  = 'Server online';
      } else {
        dot.className    = 'dot red';
        txt.textContent  = 'Server error';
      }
    })
    .catch(function() {
      dot.className   = 'dot red';
      txt.textContent = 'Server offline';
    });
}

// ── WHATSAPP STATUS + QR ──────────────────────────────────────────────────
function checkWA() {
  var dot = document.getElementById('waDot');
  var txt = document.getElementById('waTxt');
  fetch(API_BASE + '/api/v1/auth/whatsapp-status')
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.data && d.data.isReady) {
        dot.className   = 'dot green';
        txt.textContent = 'WhatsApp ready';
        hideQRModal();
      } else if (d.data && d.data.hasQR) {
        dot.className   = 'dot spin';
        txt.textContent = 'Scan QR to connect';
        loadQRModal();
      } else {
        dot.className   = 'dot red';
        txt.textContent = 'WhatsApp connecting...';
      }
    })
    .catch(function() {
      dot.className   = 'dot red';
      txt.textContent = 'WhatsApp offline';
    });
}

function loadQRModal() {
  // Don't reload if already showing
  if (document.getElementById('waQRModal')) return;
  fetch(API_BASE + '/api/v1/auth/whatsapp-qr')
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (!d.data || !d.data.qr) return;
      // Create modal overlay
      var modal = document.createElement('div');
      modal.id = 'waQRModal';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:999;display:flex;align-items:center;justify-content:center';
      modal.innerHTML =
        '<div style="background:#161B22;border:1px solid #30363D;border-radius:12px;padding:32px;text-align:center;max-width:360px">' +
        '<div style="font-size:13px;font-weight:700;color:#E3953A;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">WhatsApp Setup</div>' +
        '<div style="font-size:13px;color:#8B949E;margin-bottom:20px">Open WhatsApp on your phone → Menu → Linked Devices → Link a Device</div>' +
        '<img src="' + d.data.qr + '" style="width:260px;height:260px;border-radius:8px;background:#fff;padding:8px"/>' +
        '<div style="font-size:11px;color:#484F58;margin-top:14px;font-family:monospace">QR expires in ~60 seconds. Refreshes automatically.</div>' +
        '</div>';
      document.body.appendChild(modal);
    });
}

function hideQRModal() {
  var modal = document.getElementById('waQRModal');
  if (modal) modal.remove();
}

// ── COMPANIES ──────────────────────────────────────────────────────────────
function loadCompanies() {
  fetch(API_BASE + '/api/v1/companies')
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.data && d.data.length) {
        companies = d.data;
        localStorage.setItem('rhr_companies', JSON.stringify(companies));
        fillCompanySelect();
      } else if (companies.length) {
        fillCompanySelect();
      }
    })
    .catch(function() {
      if (companies.length) fillCompanySelect();
    });
}

function fillCompanySelect() {
  var sel = document.getElementById('regCompany');
  sel.innerHTML = '<option value="">— Select Branch —</option>';
  companies.forEach(function(c) {
    var o = document.createElement('option');
    o.value = c.id;
    o.textContent = c.name + (c.city ? ' (' + c.city + ')' : '');
    sel.appendChild(o);
  });
}

// ── LOGIN ──────────────────────────────────────────────────────────────────
function doLogin() {
  var email    = document.getElementById('loginEmail').value.trim();
  var password = document.getElementById('loginPassword').value;
  var alertEl  = document.getElementById('loginAlert');
  var btn      = document.getElementById('loginBtn');

  if (!email || !password) { showAlert(alertEl, 'error', 'Email and password are required'); return; }

  btn.innerHTML = '<span class="spinner"></span> Logging in...';
  btn.disabled  = true;

  api('POST', '/api/v1/auth/login', { email: email, password: password }, false)
    .then(function(r) {
      btn.innerHTML = 'Login';
      btn.disabled  = false;

      if (r.ok && r.data.success) {
        token       = r.data.data.token;
        currentUser = r.data.data.user;
        localStorage.setItem('rhr_token', token);
        localStorage.setItem('rhr_user', JSON.stringify(currentUser));
        showAlert(alertEl, 'success', '✅ Login successful!');
        setTimeout(function() { go('home'); loadCompanies(); }, 900);
      } else {
        showAlert(alertEl, 'error', '❌ ' + (r.data.message || 'Login failed'));
      }
    });
}

// ── SEND OTP ───────────────────────────────────────────────────────────────
function doSendOTP() {
  var phone   = document.getElementById('regPhone').value.trim();
  var alertEl = document.getElementById('regAlert');
  var btn     = document.getElementById('sendOtpBtn');

  if (!phone) { showAlert(alertEl, 'error', 'Enter a phone number'); return; }

  btn.innerHTML = '<span class="spinner"></span> Sending...';
  btn.disabled  = true;

  api('POST', '/api/v1/auth/send-otp', { phone: phone }, false)
    .then(function(r) {
      btn.innerHTML = 'Send OTP via WhatsApp';
      btn.disabled  = false;

      if (r.ok && r.data.success) {
        otpPhone = phone;
        document.getElementById('otpSentTo').textContent = phone;
        showAlert(alertEl, 'success', '✅ OTP sent to WhatsApp!');
        setStep(2);
        document.getElementById('regS1').style.display = 'none';
        document.getElementById('regS2').style.display = 'block';
        setTimeout(function() { document.getElementById('regOtp').focus(); }, 100);
      } else {
        showAlert(alertEl, 'error', '❌ ' + (r.data.message || 'Failed to send OTP'));
      }
    });
}

// ── VERIFY OTP → STEP 3 ────────────────────────────────────────────────────
function doVerifyStep() {
  var otp     = document.getElementById('regOtp').value.trim();
  var alertEl = document.getElementById('regAlert');
  if (!otp || otp.length < 4) { showAlert(alertEl, 'error', 'Enter the OTP from WhatsApp'); return; }
  clearAlert(alertEl);
  setStep(3);
  document.getElementById('regS2').style.display = 'none';
  document.getElementById('regS3').style.display = 'block';
  setTimeout(function() { document.getElementById('regName').focus(); }, 100);
}

// ── REGISTER ───────────────────────────────────────────────────────────────
function doRegister() {
  var otp       = document.getElementById('regOtp').value.trim();
  var fullName  = document.getElementById('regName').value.trim();
  var companyId = document.getElementById('regCompany').value;
  var alertEl   = document.getElementById('regAlert');
  var btn       = document.getElementById('registerBtn');

  if (!fullName)  { showAlert(alertEl, 'error', 'Enter your full name'); return; }
  if (!companyId) { showAlert(alertEl, 'error', 'Select a branch'); return; }
  if (!otp)       { showAlert(alertEl, 'error', 'OTP is missing — go back'); return; }

  btn.innerHTML = '<span class="spinner"></span> Creating account...';
  btn.disabled  = true;

  api('POST', '/api/v1/auth/verify-otp', {
    phone: otpPhone, otp: otp, fullName: fullName, companyId: companyId
  }, false)
    .then(function(r) {
      btn.innerHTML = 'Complete Registration';
      btn.disabled  = false;

      if (r.ok && r.data.success) {
        setStep(4);
        document.getElementById('regS3').style.display    = 'none';
        document.getElementById('regSDone').style.display = 'block';
        clearAlert(alertEl);
      } else {
        showAlert(alertEl, 'error', '❌ ' + (r.data.message || 'Registration failed'));
      }
    });
}

function resetRegister() {
  ['regS1','regS2','regS3','regSDone'].forEach(function(id) {
    document.getElementById(id).style.display = 'none';
  });
  document.getElementById('regS1').style.display = 'block';
  document.getElementById('regPhone').value   = '';
  document.getElementById('regOtp').value     = '';
  document.getElementById('regName').value    = '';
  document.getElementById('regCompany').value = '';
  clearAlert(document.getElementById('regAlert'));
  setStep(1);
  otpPhone = '';
}

// ── HOME ───────────────────────────────────────────────────────────────────
function renderHome() {
  if (!currentUser || !token) {
    document.getElementById('homeWarn').style.display = 'block';
    document.getElementById('homeInfo').style.display  = 'none';
    return;
  }
  document.getElementById('homeWarn').style.display = 'none';
  document.getElementById('homeInfo').style.display  = 'block';

  var emoji = { super_admin:'👑', branch_admin:'🏢', salesman:'🤝', customer:'👤', delivery:'🚚' };
  var cid   = (currentUser.companyId || currentUser.company_id || '—').toString();

  document.getElementById('homeAvatar').textContent  = emoji[currentUser.role] || '👤';
  document.getElementById('homeName').textContent    = currentUser.fullName || currentUser.full_name || '—';
  document.getElementById('homeMeta').textContent    = currentUser.phone || currentUser.email || '—';
  document.getElementById('homeRole').textContent    = currentUser.role || '—';
  document.getElementById('homeCompany').textContent = cid.length > 8 ? cid.substring(0, 8) + '...' : cid;
  document.getElementById('homeToken').textContent   = token ? token.substring(0, 120) + '...' : '—';
}

function doLogout() {
  token = null; currentUser = null;
  localStorage.removeItem('rhr_token');
  localStorage.removeItem('rhr_user');
  addLog('info', 'Logged out', 'Token and user cleared');
  renderHome();
  go('login');
}

function copyToken() {
  if (!token) return;
  navigator.clipboard.writeText(token).then(function() {
    addLog('info', 'Token copied', 'Paste into Postman Authorization header');
  });
}

// ── PENDING APPROVALS ──────────────────────────────────────────────────────
function renderPending() {
  if (!token || !currentUser) {
    document.getElementById('pendingWarn').style.display    = 'block';
    document.getElementById('pendingSection').style.display = 'none';
    return;
  }
  document.getElementById('pendingWarn').style.display    = 'none';
  document.getElementById('pendingSection').style.display = 'block';
  loadPending();
}

function loadPending() {
  var list = document.getElementById('pendingList');
  list.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text3);font-family:monospace;font-size:12px">Loading...</div>';

  api('GET', '/api/v1/customers/pending')
    .then(function(r) {
      if (r.ok && r.data.success && r.data.data) {
        var customers = r.data.data;
        if (!customers.length) {
          list.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text3);font-family:monospace;font-size:12px">No pending customers 🎉</div>';
          return;
        }
        list.innerHTML = '';
        customers.forEach(function(c) {
          var item = document.createElement('div');
          item.className = 'p-item';
          item.id = 'pi-' + c.id;
          item.innerHTML =
            '<div>' +
            '<div class="p-name">' + esc(c.full_name || '—') + '</div>' +
            '<div class="p-phone">' + esc(c.phone || '—') + ' &middot; ID: ' + esc(c.id.substring(0, 12)) + '...</div>' +
            '</div>' +
            '<button class="btn btn-success" data-id="' + c.id + '">✓ Approve</button>';
          list.appendChild(item);
          item.querySelector('button').addEventListener('click', function(e) {
            approveCustomer(c.id, e.currentTarget);
          });
        });
      } else {
        list.innerHTML = '<div class="alert a-error show">❌ ' + esc((r.data && r.data.message) || 'Failed to load') + '</div>';
      }
    });
}

function approveCustomer(id, btn) {
  btn.innerHTML = '<span class="spinner"></span>';
  btn.disabled  = true;

  api('PATCH', '/api/v1/auth/approve-customer/' + id)
    .then(function(r) {
      if (r.ok && r.data.success) {
        var item = document.getElementById('pi-' + id);
        if (item) {
          item.style.transition = 'opacity .3s';
          item.style.opacity    = '0';
          setTimeout(function() { item.remove(); }, 300);
        }
        addLog('res-ok', 'Customer approved', id);
      } else {
        btn.innerHTML = '✓ Approve';
        btn.disabled  = false;
      }
    });
}

// ── CONFIG ─────────────────────────────────────────────────────────────────
function saveConfig() {
  API_BASE = document.getElementById('apiBaseInput').value.trim().replace(/\/$/, '');
  localStorage.setItem('rhr_api', API_BASE);
  testConn();
}

function testConn() {
  var el = document.getElementById('connResult');
  showAlert(el, 'info', 'Testing...');
  fetch(API_BASE + '/health')
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.success) {
        showAlert(el, 'success', '✅ Connected! Server running at ' + API_BASE);
        document.getElementById('serverDot').className = 'dot green';
        document.getElementById('serverTxt').textContent = 'Server online';
      } else {
        showAlert(el, 'error', '❌ Server responded with error');
      }
    })
    .catch(function(e) {
      showAlert(el, 'error', '❌ Cannot connect: ' + e.message + '. Is npm run dev running?');
    });
}

function clearAll() {
  localStorage.clear();
  token = null; currentUser = null; companies = [];
  addLog('info', 'State cleared', 'All localStorage removed');
  refreshState();
}

// ── HELPERS ────────────────────────────────────────────────────────────────
function showAlert(el, type, msg) {
  el.className   = 'alert a-' + type + ' show';
  el.textContent = msg;
}
function clearAlert(el) { el.className = 'alert'; el.textContent = ''; }

function setStep(n) {
  for (var i = 1; i <= 4; i++) {
    var el = document.getElementById('stp' + i);
    if (!el) continue;
    el.className = 'step' + (i < n ? ' done' : i === n ? ' active' : '');
  }
}

function refreshState() {
  var st = document.getElementById('stToken');
  var su = document.getElementById('stUser');
  var sc = document.getElementById('stComp');
  if (st) st.textContent = token ? 'Yes ✓' : 'No';
  if (su) su.textContent = currentUser ? 'Yes ✓ (' + (currentUser.role || '') + ')' : 'No';
  if (sc) sc.textContent = companies.length ? 'Yes (' + companies.length + ')' : 'No';
}
