/* RHR & Company — Dev Test UI — app.js */
/* All JS must be in this external file (Helmet CSP blocks inline scripts) */

var API_BASE = localStorage.getItem('rhr_api_base') || 'http://localhost:3000';
var token    = localStorage.getItem('rhr_token')    || null;
var userData = JSON.parse(localStorage.getItem('rhr_user') || 'null');

/* ═══ CAPTURED IDs (shared across test screens) ═══ */
var capturedIds = { product: null, customer: null, order: null, payment: null };

/* ═══ HELPERS ═══ */
function authHeaders() {
  var h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = 'Bearer ' + token;
  return h;
}

function ts() { return new Date().toTimeString().slice(0,8); }

function log(type, msg) {
  var body  = document.getElementById('logBody');
  var entry = document.createElement('div');
  entry.className = 'log-entry ' + type;
  entry.innerHTML = '<div class="log-time">' + ts() + '</div><div class="log-text">' + escHtml(msg) + '</div>';
  body.insertBefore(entry, body.firstChild);
  while (body.children.length > 60) body.removeChild(body.lastChild);
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function showResult(elId, data, ok) {
  var el = document.getElementById(elId);
  if (!el) return;
  el.className = 'result-box show';
  el.style.borderColor = ok ? 'var(--green)' : 'var(--red)';
  el.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

function setBtn(id, loading, orig) {
  var el = document.getElementById(id);
  if (!el) return;
  el.disabled = loading;
  if (loading) { el.dataset.orig = el.innerHTML; el.innerHTML = '<span class="spinner"></span> Working...'; }
  else          { el.innerHTML = el.dataset.orig || el.innerHTML; }
}

function showAlert(id, type, msg) {
  var el = document.getElementById(id);
  if (!el) return;
  el.className = 'alert ' + type + ' show';
  el.innerHTML = msg;
}

function hideAlert(id) {
  var el = document.getElementById(id);
  if (el) el.className = 'alert';
}

function copyToClipboard(txt) {
  var el = document.createElement('textarea');
  el.value = txt; el.style.position = 'fixed'; el.style.opacity = '0';
  document.body.appendChild(el); el.select(); document.execCommand('copy');
  document.body.removeChild(el);
}

/* ═══ CAPTURED ID MANAGEMENT ═══ */
function captureId(type, id) {
  if (!id) return;
  capturedIds[type] = id;
  var chip = document.getElementById('chip-' + type);
  var val  = document.getElementById('chip-' + type + '-val');
  if (chip && val) {
    val.textContent = id.slice(0,8) + '...';
    chip.style.display = 'inline-flex';
    chip.title = id;
    chip.onclick = function() { copyToClipboard(id); log('info', 'Copied ' + type + ' ID: ' + id); };
    var bar = document.getElementById('idBar');
    if (bar) bar.style.display = 'flex';
  }
}

/* ═══ API CALL ═══ */
function apiFetch(method, path, body, btnId) {
  var url = API_BASE + path;
  log('req', method + ' ' + url + (body ? '\n' + JSON.stringify(body) : ''));
  if (btnId) setBtn(btnId, true);
  var opts = { method: method, headers: authHeaders() };
  if (body) opts.body = JSON.stringify(body);
  return fetch(url, opts).then(function(r) {
    return r.json().then(function(d) {
      var ok = r.ok;
      log(ok ? 'res-ok' : 'res-err', r.status + ' ' + (ok ? 'OK' : 'ERR') + '\n' + JSON.stringify(d, null, 2));
      if (btnId) setBtn(btnId, false);
      return { ok: ok, status: r.status, data: d };
    });
  }).catch(function(e) {
    log('res-err', 'Network error: ' + e.message);
    if (btnId) setBtn(btnId, false);
    return { ok: false, data: { message: e.message } };
  });
}

/* ═══ NAVIGATION ═══ */
document.querySelectorAll('.nav-btn[data-screen]').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var target = this.dataset.screen;
    document.querySelectorAll('.nav-btn').forEach(function(b) { b.classList.remove('active'); });
    document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
    this.classList.add('active');
    var sc = document.getElementById('screen-' + target);
    if (sc) sc.classList.add('active');
    if (target === 'home')        refreshHome();
    if (target === 'pending')     loadPending();
    if (target === 'config')      refreshConfigState();
    if (target === 'test-orders') loadOrderProductOptions();
  });
});

document.querySelectorAll('[data-goto]').forEach(function(el) {
  el.addEventListener('click', function() {
    var btn = document.getElementById('nav-' + this.dataset.goto);
    if (btn) btn.click();
  });
});

/* ═══ STATUS POLLING ═══ */
function checkServer() {
  fetch(API_BASE + '/health').then(function(r) { return r.json(); }).then(function() {
    document.getElementById('serverDot').className = 'dot green';
    document.getElementById('serverTxt').textContent = 'Server OK';
  }).catch(function() {
    document.getElementById('serverDot').className = 'dot red';
    document.getElementById('serverTxt').textContent = 'Server Down';
  });
}

function checkWA() {
  fetch(API_BASE + '/api/v1/auth/whatsapp-status').then(function(r) { return r.json(); }).then(function(d) {
    var status = d.data || d;
    if (status.isReady || status.status === 'connected') {
      document.getElementById('waDot').className = 'dot green';
      document.getElementById('waTxt').textContent = 'WhatsApp OK';
      var m = document.getElementById('qrModal');
      if (m) m.remove();
    } else if (status.hasQR || status.status === 'qr_ready') {
      document.getElementById('waDot').className = 'dot spin';
      document.getElementById('waTxt').textContent = 'Scan QR';
      showQRModal();
    } else {
      document.getElementById('waDot').className = 'dot red';
      document.getElementById('waTxt').textContent = 'WA Disconnected';
    }
  }).catch(function() {});
}

function showQRModal() {
  if (document.getElementById('qrModal')) return;
  fetch(API_BASE + '/api/v1/auth/whatsapp-qr').then(function(r) { return r.json(); }).then(function(d) {
    var qr = d.data && d.data.qr;
    if (!qr) return;
    var modal = document.createElement('div');
    modal.id = 'qrModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:999';
    modal.innerHTML = '<div style="background:#161B22;border:1px solid #30363D;border-radius:12px;padding:28px;text-align:center">' +
      '<div style="font-size:12px;color:#8B949E;margin-bottom:14px;font-family:monospace">SCAN WITH WHATSAPP</div>' +
      '<img src="' + qr + '" style="width:240px;height:240px;display:block;border-radius:8px"/>' +
      '<div style="margin-top:12px"><button onclick="document.getElementById(\'qrModal\').remove()" style="padding:7px 14px;background:none;border:1px solid #30363D;color:#8B949E;border-radius:6px;cursor:pointer;font-size:12px">Close</button></div>' +
      '</div>';
    document.body.appendChild(modal);
  }).catch(function() {});
}

function updateTokenStatus() {
  var el = document.getElementById('tokenStatus');
  if (token && userData) {
    el.style.display = 'flex';
    document.getElementById('tokenRole').textContent = userData.role || 'logged in';
  } else {
    el.style.display = 'none';
  }
}

checkServer(); checkWA(); updateTokenStatus();
setInterval(checkServer, 15000);
setInterval(checkWA, 8000);

/* ═══ LOGIN ═══ */
document.getElementById('loginBtn').addEventListener('click', function() {
  var email    = document.getElementById('loginEmail').value.trim();
  var password = document.getElementById('loginPassword').value.trim();
  if (!email || !password) return showAlert('loginAlert', 'a-error', 'Email and password required');
  hideAlert('loginAlert');
  apiFetch('POST', '/api/v1/auth/login', { email: email, password: password }, 'loginBtn').then(function(r) {
    if (!r.ok) return showAlert('loginAlert', 'a-error', r.data.message || 'Login failed');
    token    = r.data.data.token;
    userData = r.data.data.user;
    localStorage.setItem('rhr_token', token);
    localStorage.setItem('rhr_user',  JSON.stringify(userData));
    updateTokenStatus();
    showAlert('loginAlert', 'a-success', 'Logged in as <strong>' + escHtml(userData.email) + '</strong> [' + userData.role + ']');
    document.getElementById('nav-home').click();
  });
});

/* ═══ HOME ═══ */
function refreshHome() {
  var warn = document.getElementById('homeWarn');
  var info = document.getElementById('homeInfo');
  if (!token || !userData) { warn.style.display='block'; info.style.display='none'; return; }
  warn.style.display='none'; info.style.display='block';
  var avatar = userData.role === 'super_admin' ? '🔑' : userData.role === 'branch_admin' ? '🏢' : userData.role === 'salesman' ? '💼' : '👤';
  document.getElementById('homeAvatar').textContent  = avatar;
  document.getElementById('homeName').textContent    = userData.full_name || userData.email;
  document.getElementById('homeMeta').textContent    = userData.email + ' · ' + (userData.phone || '');
  document.getElementById('homeRole').textContent    = userData.role;
  document.getElementById('homeCompany').textContent = userData.company_id ? userData.company_id.slice(0,8)+'…' : 'no company';
  document.getElementById('homeToken').textContent   = token;
}

document.getElementById('goLoginLink').addEventListener('click', function(e) {
  e.preventDefault(); document.getElementById('nav-login').click();
});

document.getElementById('copyTokenBtn').addEventListener('click', function() {
  if (token) { copyToClipboard(token); log('info', 'JWT token copied to clipboard'); }
});

document.getElementById('logoutBtn').addEventListener('click', function() {
  token = null; userData = null;
  localStorage.removeItem('rhr_token'); localStorage.removeItem('rhr_user');
  updateTokenStatus(); refreshHome();
  document.getElementById('nav-login').click();
  log('info', 'Logged out');
});

/* ═══ REGISTER (OTP flow — verify-otp is the ONLY registration call the
   backend exposes; there is no separate /auth/register endpoint. The
   controller requires phone + otp + companyId on every verify-otp call,
   and fullName additionally when the phone has no existing account:
   src/controllers/auth.controller.js → verifyOTPHandler) ═══ */
var regPhone = ''; var regCompanyId = ''; var regIsNewUser = true;

// Backend's own normalizePhone() (auth.service.js) already tolerates
// +92/92/0-prefixed input, but we normalize client-side too so the number
// shown to the user and the number sent to the API always match, and so
// Step 1 and Step 2 never accidentally send two different strings.
function normalizePhonePK(raw) {
  var digits = String(raw || '').replace(/\D/g, '');
  if (digits.indexOf('92') === 0 && digits.length === 12) digits = '0' + digits.slice(2);
  if (digits.length === 10 && digits.indexOf('0') !== 0) digits = '0' + digits;
  return digits;
}

function loadCompaniesDropdown() {
  apiFetch('GET', '/api/v1/companies').then(function(r) {
    if (!r.ok || !r.data.data) return;
    var sel = document.getElementById('regCompany');
    r.data.data.forEach(function(c) {
      var opt = document.createElement('option');
      opt.value = c.id; opt.textContent = c.name + ' (' + c.city + ')';
      sel.appendChild(opt);
    });
  });
}
loadCompaniesDropdown();

function setRegStep(n) {
  [1,2,3].forEach(function(i) {
    var s = document.getElementById('stp' + i);
    s.className = i < n ? 'step done' : i === n ? 'step active' : 'step';
  });
  ['regS1','regS2','regSDone'].forEach(function(id, idx) {
    document.getElementById(id).style.display = (idx + 1 === n) ? 'block' : 'none';
  });
}

// Verify button stays disabled until a plausible 6-digit OTP is entered
document.getElementById('regOtp').addEventListener('input', function() {
  var valid = /^\d{6}$/.test(this.value.trim());
  document.getElementById('verifyOtpBtn').disabled = !valid;
});

document.getElementById('sendOtpBtn').addEventListener('click', function() {
  var rawPhone  = document.getElementById('regPhone').value.trim();
  regCompanyId  = document.getElementById('regCompany').value;
  regPhone      = normalizePhonePK(rawPhone);
  if (!regPhone) return showAlert('regAlert', 'a-error', 'Enter your WhatsApp number');
  if (!regCompanyId) return showAlert('regAlert', 'a-error', 'Select a branch');
  hideAlert('regAlert');
  apiFetch('POST', '/api/v1/auth/send-otp', { phone: regPhone }, 'sendOtpBtn').then(function(r) {
    if (!r.ok) return showAlert('regAlert', 'a-error', r.data.message || 'Failed to send OTP');
    var data = r.data.data || {};
    regIsNewUser = data.isNewUser !== false;
    if (data.isPending) {
      // Existing but not-yet-approved account — backend does NOT send an
      // OTP in this case, so there is nothing to verify yet.
      return showAlert('regAlert', 'a-warn', data.message || 'Account already registered and pending admin approval.');
    }
    document.getElementById('otpSentTo').textContent = regPhone;
    document.getElementById('regNameWrap').style.display = regIsNewUser ? 'block' : 'none';
    document.getElementById('regOtp').value = '';
    document.getElementById('verifyOtpBtn').disabled = true;
    setRegStep(2);
  });
});

document.getElementById('resendOtpBtn').addEventListener('click', function() {
  document.getElementById('sendOtpBtn').click();
});

document.getElementById('verifyOtpBtn').addEventListener('click', function() {
  var otp  = document.getElementById('regOtp').value.trim();
  var name = document.getElementById('regName').value.trim();
  if (!/^\d{6}$/.test(otp)) return showAlert('regAlert', 'a-error', 'Enter the 6-digit OTP from WhatsApp');
  if (regIsNewUser && !name) return showAlert('regAlert', 'a-error', 'Full name is required for a new account');
  hideAlert('regAlert');
  var body = { phone: regPhone, otp: otp, companyId: regCompanyId };
  if (name) body.fullName = name;
  apiFetch('POST', '/api/v1/auth/verify-otp', body, 'verifyOtpBtn').then(function(r) {
    if (!r.ok) return showAlert('regAlert', 'a-error', r.data.message || 'Invalid OTP');
    var data = r.data.data || {};
    if (data.token) {
      // Existing, already-approved customer — verify-otp doubles as login
      token = data.token; userData = data.user;
      localStorage.setItem('rhr_token', token);
      localStorage.setItem('rhr_user',  JSON.stringify(userData));
      updateTokenStatus();
      document.getElementById('doneIcon').textContent  = '🔓';
      document.getElementById('doneTitle').textContent = 'Login Successful';
      document.getElementById('doneSub').innerHTML     = 'Welcome back, <strong>' + escHtml(userData.fullName || '') + '</strong>';
    } else {
      document.getElementById('doneIcon').textContent  = '✅';
      document.getElementById('doneTitle').textContent = 'Registration Successful';
      document.getElementById('doneSub').innerHTML      = 'Account is <span class="badge b-orange">PENDING APPROVAL</span>';
    }
    setRegStep(3);
  });
});

document.getElementById('registerAnotherBtn').addEventListener('click', function() {
  regPhone = ''; regCompanyId = ''; regIsNewUser = true;
  document.getElementById('regPhone').value    = '';
  document.getElementById('regCompany').value  = '';
  document.getElementById('regOtp').value      = '';
  document.getElementById('regName').value     = '';
  document.getElementById('verifyOtpBtn').disabled = true;
  hideAlert('regAlert');
  setRegStep(1);
});

/* ═══ PENDING APPROVALS ═══ */
function loadPending() {
  var warn = document.getElementById('pendingWarn');
  var sec  = document.getElementById('pendingSection');
  if (!token) { warn.style.display='block'; sec.style.display='none'; return; }
  warn.style.display='none'; sec.style.display='block';
  apiFetch('GET', '/api/v1/customers/pending').then(function(r) {
    var list = document.getElementById('pendingList');
    list.innerHTML = '';
    var items = r.data && r.data.data;
    if (!items || items.length === 0) {
      list.innerHTML = '<div style="color:var(--text3);font-size:12px;text-align:center;padding:20px">No pending approvals</div>';
      return;
    }
    items.forEach(function(c) {
      var div = document.createElement('div');
      div.className = 'p-item';
      div.innerHTML = '<div><div class="p-name">' + escHtml(c.full_name || '—') + '</div><div class="p-phone">' + escHtml(c.phone || '') + '</div></div>' +
        '<button class="btn btn-success" data-id="' + c.id + '">Approve</button>';
      div.querySelector('button').addEventListener('click', function() {
        var id = this.dataset.id;
        apiFetch('PATCH', '/api/v1/auth/approve-customer/' + id, { approved: true }).then(function(r) {
          if (r.ok) { log('info', 'Approved customer ' + id); loadPending(); }
        });
      });
      list.appendChild(div);
    });
  });
}
document.getElementById('refreshPendingBtn').addEventListener('click', loadPending);

/* ═══════════════════════════════════════════════════
   TEST SCREENS
═══════════════════════════════════════════════════ */

/* ── TEST 1: COMPANIES ── */
document.getElementById('getCompaniesBtn').addEventListener('click', function() {
  apiFetch('GET', '/api/v1/companies', null, 'getCompaniesBtn').then(function(r) {
    showResult('companiesResult', r.data, r.ok);
  });
});

/* ── TEST 2 & 3: PRODUCTS ── */
document.getElementById('createProductBtn').addEventListener('click', function() {
  var body = {
    name:           document.getElementById('prodName').value.trim(),
    price:          parseFloat(document.getElementById('prodPrice').value),
    stock_quantity: parseInt(document.getElementById('prodStock').value) || 0,
    unit:           document.getElementById('prodUnit').value.trim() || undefined,
    description:    document.getElementById('prodDesc').value.trim() || undefined,
    sku:            document.getElementById('prodSku').value.trim()  || undefined
  };
  if (!body.name || isNaN(body.price)) return log('res-err', 'name and price are required');
  apiFetch('POST', '/api/v1/products', body, 'createProductBtn').then(function(r) {
    showResult('createProductResult', r.data, r.ok);
    if (r.ok && r.data.data && r.data.data.id) {
      captureId('product', r.data.data.id);
      document.getElementById('stockProductId').value = r.data.data.id;
      log('info', 'Product ID captured → paste into Orders items: [{"product_id":"' + r.data.data.id + '","quantity":2}]');
    }
  });
});

document.getElementById('getProductsBtn').addEventListener('click', function() {
  var search = document.getElementById('prodSearch').value.trim();
  var page   = document.getElementById('prodPage').value || 1;
  var limit  = document.getElementById('prodLimit').value || 20;
  var qs = '?page=' + page + '&limit=' + limit + (search ? '&search=' + encodeURIComponent(search) : '');
  apiFetch('GET', '/api/v1/products' + qs, null, 'getProductsBtn').then(function(r) {
    showResult('getProductsResult', r.data, r.ok);
    // NOTE: GET /products returns { products, total, page, limit } — not a
    // bare array — unlike orders/payments/customers list endpoints.
    var list = r.ok && r.data.data && r.data.data.products;
    if (list && list[0]) captureId('product', list[0].id);
  });
});

document.getElementById('updateStockBtn').addEventListener('click', function() {
  var prodId = document.getElementById('stockProductId').value.trim();
  var qty    = parseInt(document.getElementById('stockQty').value);
  if (!prodId || isNaN(qty)) return log('res-err', 'product ID and quantity required');
  apiFetch('PATCH', '/api/v1/products/' + prodId + '/stock', { quantity: qty }, 'updateStockBtn').then(function(r) {
    showResult('updateStockResult', r.data, r.ok);
  });
});

/* ── CUSTOMERS ── */
document.getElementById('getCustomersBtn').addEventListener('click', function() {
  apiFetch('GET', '/api/v1/customers', null, 'getCustomersBtn').then(function(r) {
    showResult('customersResult', r.data, r.ok);
    if (r.ok && r.data.data && r.data.data[0]) {
      var cid = r.data.data[0].id;
      captureId('customer', cid);
      document.getElementById('customerIdInput').value  = cid;
      document.getElementById('orderCustomerId').value  = cid;
      document.getElementById('payCustomerId').value    = cid;
      document.getElementById('ledgerCustomerId').value = cid;
    }
  });
});

document.getElementById('getCustomerByIdBtn').addEventListener('click', function() {
  var id = document.getElementById('customerIdInput').value.trim();
  if (!id) return log('res-err', 'Enter a customer UUID');
  apiFetch('GET', '/api/v1/customers/' + id, null, 'getCustomerByIdBtn').then(function(r) {
    showResult('customerByIdResult', r.data, r.ok);
  });
});

/* ── TEST 4 & 5: ORDERS ── */

// Product picker for order items — replaces manually-typed items JSON
// (users used to type free-text product names/IDs, which routinely
// mismatched real product UUIDs). Built array is [{product_id, quantity}].
var orderItemsBuilder = []; // [{product_id, name, price, quantity}]

function loadOrderProductOptions() {
  apiFetch('GET', '/api/v1/products?limit=100').then(function(r) {
    var sel = document.getElementById('orderProductSelect');
    sel.innerHTML = '<option value="">— Select product —</option>';
    var list = (r.ok && r.data.data && r.data.data.products) || [];
    list.forEach(function(p) {
      var opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name + ' — PKR ' + p.price + ' (stock ' + p.stock_quantity + ')';
      opt.dataset.name  = p.name;
      opt.dataset.price = p.price;
      sel.appendChild(opt);
    });
    if (!list.length) log('info', 'No products found — create one in the Products tab first.');
  });
}

function findOrderItemIndex(productId) {
  for (var i = 0; i < orderItemsBuilder.length; i++) {
    if (orderItemsBuilder[i].product_id === productId) return i;
  }
  return -1;
}

function renderOrderItems() {
  var wrap = document.getElementById('orderItemsList');
  var hint = document.getElementById('orderItemsHint');
  wrap.innerHTML = '';
  if (!orderItemsBuilder.length) { hint.textContent = 'No items added yet'; return; }
  hint.textContent = orderItemsBuilder.length + ' item(s) added';
  orderItemsBuilder.forEach(function(it, idx) {
    var row = document.createElement('div');
    row.className = 'p-item';
    row.innerHTML = '<div><div class="p-name">' + escHtml(it.name) + ' × ' + it.quantity + '</div>' +
      '<div class="p-phone">PKR ' + (it.price * it.quantity).toLocaleString() + '</div></div>' +
      '<button class="btn btn-danger" type="button">Remove</button>';
    row.querySelector('button').addEventListener('click', function() {
      orderItemsBuilder.splice(idx, 1);
      renderOrderItems();
    });
    wrap.appendChild(row);
  });
}

document.getElementById('reloadProductsBtn').addEventListener('click', loadOrderProductOptions);

document.getElementById('orderAddItemBtn').addEventListener('click', function() {
  var sel = document.getElementById('orderProductSelect');
  var opt = sel.options[sel.selectedIndex];
  var qty = parseInt(document.getElementById('orderItemQty').value, 10);
  if (!sel.value) return log('res-err', 'Select a product first');
  if (!qty || qty < 1) return log('res-err', 'Quantity must be at least 1');
  var idx = findOrderItemIndex(sel.value);
  if (idx >= 0) orderItemsBuilder[idx].quantity += qty;
  else orderItemsBuilder.push({
    product_id: sel.value,
    name:       opt.dataset.name,
    price:      parseFloat(opt.dataset.price),
    quantity:   qty
  });
  renderOrderItems();
  document.getElementById('orderItemQty').value = 1;
});

document.getElementById('createOrderBtn').addEventListener('click', function() {
  if (!orderItemsBuilder.length) return log('res-err', 'Add at least one item before placing the order');
  var body = {
    items: orderItemsBuilder.map(function(it) { return { product_id: it.product_id, quantity: it.quantity }; })
  };
  var custId  = document.getElementById('orderCustomerId').value.trim();
  var notes   = document.getElementById('orderNotes').value.trim();
  var address = document.getElementById('orderAddress').value.trim();
  if (custId)  body.customer_id      = custId;
  if (notes)   body.notes            = notes;
  if (address) body.delivery_address = address;
  apiFetch('POST', '/api/v1/orders', body, 'createOrderBtn').then(function(r) {
    showResult('createOrderResult', r.data, r.ok);
    if (r.ok && r.data.data && r.data.data.id) {
      captureId('order', r.data.data.id);
      document.getElementById('orderIdInput').value = r.data.data.id;
      document.getElementById('payOrderId').value   = r.data.data.id;
      orderItemsBuilder = [];
      renderOrderItems();
    }
  });
});

document.getElementById('getOrdersBtn').addEventListener('click', function() {
  apiFetch('GET', '/api/v1/orders', null, 'getOrdersBtn').then(function(r) {
    showResult('getOrdersResult', r.data, r.ok);
    if (r.ok && r.data.data && r.data.data[0]) captureId('order', r.data.data[0].id);
  });
});

document.getElementById('updateOrderStatusBtn').addEventListener('click', function() {
  var id     = document.getElementById('orderIdInput').value.trim();
  var status = document.getElementById('orderStatus').value;
  if (!id) return log('res-err', 'Enter an order UUID');
  apiFetch('PATCH', '/api/v1/orders/' + id + '/status', { status: status }, 'updateOrderStatusBtn').then(function(r) {
    showResult('updateOrderStatusResult', r.data, r.ok);
    if (r.ok && status === 'confirmed') {
      log('info', 'Status = confirmed → ledger DEBIT + invoice generating in background...');
      var card = document.getElementById('invoiceCard');
      card.style.display = 'block';
      document.getElementById('invoiceOrderId').value = id;
      document.getElementById('invoiceAlert').textContent = 'Invoice generating in background — click Download in 2-3 seconds.';
    }
  });
});

/* ── INVOICE ── */
document.getElementById('generateInvoiceBtn').addEventListener('click', function() {
  var id = document.getElementById('invoiceOrderId').value.trim();
  if (!id) return log('res-err', 'No order ID set');
  apiFetch('POST', '/api/v1/invoices/generate/' + id, null, 'generateInvoiceBtn').then(function(r) {
    showResult('invoiceResult', r.data, r.ok);
    if (r.ok) {
      document.getElementById('invoiceAlert').textContent = 'Invoice ready — click Download to open PDF.';
      log('info', 'Invoice path: ' + (r.data.data && r.data.data.filePath));
    }
  });
});

document.getElementById('downloadInvoiceBtn').addEventListener('click', function() {
  var id = document.getElementById('invoiceOrderId').value.trim();
  if (!id) return log('res-err', 'No order ID set');
  apiFetch('GET', '/api/v1/invoices/download/' + id, null, 'downloadInvoiceBtn').then(function(r) {
    showResult('invoiceResult', r.data, r.ok);
    if (r.ok && r.data.data && r.data.data.downloadUrl) {
      window.open(r.data.data.downloadUrl, '_blank');
      log('info', 'PDF opened in new tab. URL expires in 1 hour.');
    } else if (r.ok) {
      log('res-err', 'No download URL in response — try Generate first.');
    }
  });
});

/* ── TEST 6 & 7: PAYMENTS ── */
document.getElementById('createPaymentBtn').addEventListener('click', function() {
  var custId   = document.getElementById('payCustomerId').value.trim();
  var amount   = parseFloat(document.getElementById('payAmount').value);
  var method   = document.getElementById('payMethod').value;
  var photoUrl = document.getElementById('payPhotoUrl').value.trim();
  var orderId  = document.getElementById('payOrderId').value.trim();
  if (!custId || isNaN(amount) || !photoUrl) return log('res-err', 'customer_id, amount and photo_url are required');
  var body = { customer_id: custId, amount: amount, method: method, photo_url: photoUrl };
  if (orderId) body.order_id = orderId;
  apiFetch('POST', '/api/v1/payments', body, 'createPaymentBtn').then(function(r) {
    showResult('createPaymentResult', r.data, r.ok);
    if (r.ok && r.data.data && r.data.data.id) {
      captureId('payment', r.data.data.id);
      document.getElementById('reviewPaymentId').value = r.data.data.id;
    }
  });
});

document.getElementById('getPaymentsBtn').addEventListener('click', function() {
  apiFetch('GET', '/api/v1/payments', null, 'getPaymentsBtn').then(function(r) {
    showResult('getPaymentsResult', r.data, r.ok);
    if (r.ok && r.data.data && r.data.data[0]) captureId('payment', r.data.data[0].id);
  });
});

document.getElementById('reviewPaymentBtn').addEventListener('click', function() {
  var id     = document.getElementById('reviewPaymentId').value.trim();
  var status = document.getElementById('reviewStatus').value;
  var note   = document.getElementById('reviewNote').value.trim();
  if (!id) return log('res-err', 'Enter a payment UUID');
  apiFetch('PATCH', '/api/v1/payments/' + id + '/review', { status: status, admin_note: note }, 'reviewPaymentBtn').then(function(r) {
    showResult('reviewPaymentResult', r.data, r.ok);
    if (r.ok && status === 'approved') log('info', 'Payment approved → DB trigger will create a CREDIT ledger entry automatically.');
  });
});

/* ── TEST 8: LEDGER ── */
document.getElementById('getLedgerBtn').addEventListener('click', function() {
  var id   = document.getElementById('ledgerCustomerId').value.trim();
  var from = document.getElementById('ledgerFrom').value;
  var to   = document.getElementById('ledgerTo').value;
  if (!id) return log('res-err', 'Enter a customer UUID');
  var qs = '';
  if (from) qs += '?from_date=' + from;
  if (to)   qs += (qs ? '&' : '?') + 'to_date=' + to;
  apiFetch('GET', '/api/v1/ledger/' + id + qs, null, 'getLedgerBtn').then(function(r) {
    showResult('ledgerResult', r.data, r.ok);
    if (r.ok && r.data.data) {
      log('info', 'Balance: ' + r.data.data.currentBalance + ' PKR | Entries: ' + (r.data.data.entries || []).length);
    }
  });
});

/* ── STORAGE ── */
document.getElementById('uploadFileBtn').addEventListener('click', function() {
  var fileInput = document.getElementById('storageFile');
  var bucket    = document.getElementById('storageBucket').value;
  if (!fileInput.files || !fileInput.files[0]) return log('res-err', 'Pick a file first');
  var file = fileInput.files[0];
  var reader = new FileReader();
  reader.onload = function(e) {
    var b64      = e.target.result.split(',')[1];
    var mimeType = file.type || 'application/octet-stream';
    apiFetch('POST', '/api/v1/storage/upload', {
      bucket: bucket, fileName: file.name, fileBase64: b64, mimeType: mimeType
    }, 'uploadFileBtn').then(function(r) {
      showResult('storageResult', r.data, r.ok);
      if (r.ok && r.data.data && r.data.data.url) {
        log('info', 'File URL: ' + r.data.data.url);
        log('info', 'File path: ' + r.data.data.path);
      }
    });
  };
  reader.readAsDataURL(file);
});

/* ═══ CONFIG ═══ */
function refreshConfigState() {
  document.getElementById('stToken').textContent = token ? 'Yes (' + (userData && userData.role || '?') + ')' : 'No';
  document.getElementById('stUser').textContent  = userData ? userData.email : 'No';
  document.getElementById('stComp').textContent  = document.getElementById('regCompany').options.length > 1 ? 'Loaded' : 'No';
  document.getElementById('apiBaseInput').value  = API_BASE;
}

document.getElementById('saveConfigBtn').addEventListener('click', function() {
  API_BASE = document.getElementById('apiBaseInput').value.trim().replace(/\/$/, '');
  localStorage.setItem('rhr_api_base', API_BASE);
  log('info', 'API base set to: ' + API_BASE);
  checkServer();
});

document.getElementById('testConnBtn').addEventListener('click', function() {
  fetch(API_BASE + '/health').then(function(r) { return r.json(); }).then(function(d) {
    showAlert('connResult', 'a-success', 'Connected! ' + JSON.stringify(d));
  }).catch(function(e) {
    showAlert('connResult', 'a-error', 'Cannot reach: ' + e.message);
  });
});

document.getElementById('clearStateBtn').addEventListener('click', function() {
  if (!confirm('Clear all local storage? You will be logged out.')) return;
  localStorage.clear(); location.reload();
});

document.getElementById('clearLogBtn').addEventListener('click', function() {
  document.getElementById('logBody').innerHTML =
    '<div class="log-entry info"><div class="log-time">' + ts() + '</div><div class="log-text">Log cleared.</div></div>';
});
