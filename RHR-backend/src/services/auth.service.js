const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabaseAdmin } = require('../config/supabase');
const { withRetry } = require('../utils/withRetry');
const { pgrestGet, pgrestPost, pgrestPatch } = require('../utils/directQuery');

// Matches the frontend's own SESSION_MAX_AGE_MS (App.js) — a session is
// considered abandoned (not actively locking the account) past this age.
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

// Same company IDs the desktop's CityFilter dropdown uses.
const KARACHI_COMPANY_ID = '1e5962c6-33a7-460b-913e-9e08db46973a';
const BRANCH_CITY_NAMES = {
  '09a1fda3-7ac0-406a-8f42-75d973dc3b7e': 'Hyderabad',
  '00f79d89-0d36-4704-8865-fc7bbd662267': 'Sukkur',
};

function generateToken(user) {
  return jwt.sign(
    { userId: user.id, role: user.role, companyId: user.company_id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );
}

function normalizePhone(phone) {
  // Strip non-digits: 03001234567 → 03001234567, +923001234567 → 923001234567
  let digits = phone.replace(/\D/g, '');
  // Pakistani local format starts with 0 → replace with country code 92
  if (digits.startsWith('0')) digits = '92' + digits.slice(1);
  return '+' + digits; // → +923001234567
}

// Supabase Auth users are created before the profile row (users/salesmen).
// If that profile insert ever fails — bad companyId, a dropped connection,
// the table not existing yet during a migration window — the Auth user is
// left behind with no matching profile row. Since Auth enforces unique
// phones, every retry then fails with "already registered" even though
// there's no visible account anywhere. This finds that orphan so
// registration can resume on it instead of dying forever.
async function findAuthUserByPhone(bare) {
  let page = 1;
  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const match = data.users.find(u => u.phone === bare);
    if (match) return match;
    if (data.users.length < 200) return null;
    page++;
  }
}

async function getOrCreateAuthUser({ canonical, bare, fullName, role }) {
  const orphan = await findAuthUserByPhone(bare);
  if (orphan) return orphan.id;

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    phone: canonical,
    phone_confirm: true,
    user_metadata: { full_name: fullName, role }
  });
  if (authError) throw new Error(authError.message);
  return authData.user.id;
}

async function registerCustomer({ phone, fullName, companyId, shopName, shopAddress }) {
  const canonical = normalizePhone(phone);
  const bare      = canonical.replace('+', '');

  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('id, is_approved')
    .or(`phone.eq.${canonical},phone.eq.${bare}`)
    .maybeSingle();

  if (existing) {
    if (existing.is_approved) throw new Error('Phone number already registered and approved');
    throw new Error('Account already exists. Pending admin approval.');
  }

  // Supabase Auth requires E.164 format (+923001234567)
  const authUserId = await getOrCreateAuthUser({ canonical, bare, fullName, role: 'customer' });

  const { data: newUser, error: userError } = await supabaseAdmin
    .from('users')
    .insert({
      id:           authUserId,
      company_id:   companyId,
      role:         'customer',
      full_name:    fullName,
      phone:        canonical,   // always store in +92XXXXXXXXXX format
      shop_name:    shopName    || null,
      shop_address: shopAddress || null,
      is_approved:  false
    })
    .select()
    .single();

  if (userError) throw new Error(userError.message);

  return newUser;
}

async function loginWithCredentials({ email, password, latitude, longitude, force }) {
  // Salesmen log in via phone + OTP now (see findSalesmanByPhone /
  // registerSalesman) — only admin/delivery roles still use email+password.
  // Same supabase-js-on-Railway issue documented in utils/directQuery.js
  // (proved via a raw-https diagnostic that supabase-js's own HTTP client
  // silently drops the body on some Railway requests) — this lookup was
  // still going through supabase-js and failing "no match" almost every
  // time even with a 20x700ms retry budget, so routed through the same
  // raw-https bypass already fixed for raw_materials/production_bom.
  const user = await pgrestGet('users', {
    select: '*',
    email: `eq.${email}`,
    role: 'in.(super_admin,branch_admin,delivery)',
  }).then((data) => {
    if (!data || data.length === 0) throw new Error('users lookup: no match');
    return data[0];
  }).catch((e) => { console.error('[login] users lookup failed:', e.message); return null; });

  if (!user) throw new Error('Invalid email or password');
  if (!user.is_active) throw new Error('Account has been deactivated');

  const signInOk = await withRetry(async () => {
    const { error: signInError } = await supabaseAdmin.auth.signInWithPassword({ email, password });
    if (signInError) throw new Error(`signIn: ${signInError.status || ''} ${signInError.code || ''} ${signInError.message}`);
    return true;
  }, 20, 700).catch((e) => { console.error('[login] signInWithPassword failed:', e.message); return false; });

  if (!signInOk) throw new Error('Invalid email or password');

  // Single-session lock — the same admin account (super_admin or
  // branch_admin) can't be active on two desktops at once. A lock
  // self-expires after SESSION_MAX_AGE_MS so a browser closed without
  // explicitly logging out never locks the account out forever; POST
  // /auth/logout also clears it immediately on an explicit logout.
  //
  // `force` lets the account holder self-recover from their own stale
  // lock (e.g. the browser that set it was closed without logging out)
  // without needing a *different* super_admin to clear it for them —
  // credentials are already verified correct by this point, so knowing
  // the password is the proof this really is the account owner. Only
  // reachable from a second, explicit login attempt (see Login.js) after
  // the plain attempt above already surfaced the lock — never silent.
  if (user.active_session_token && user.active_session_started_at && !force) {
    const lockAgeMs = Date.now() - new Date(user.active_session_started_at).getTime();
    if (lockAgeMs < SESSION_MAX_AGE_MS) {
      const lastLoc = await pgrestGet('admin_locations', {
        select: 'latitude,longitude,recorded_at',
        user_id: `eq.${user.id}`,
        order: 'recorded_at.desc',
        limit: '1',
      }).catch(() => []);
      const loc = lastLoc?.[0];
      const locText = loc
        ? ` Last known location: ${Number(loc.latitude).toFixed(4)}, ${Number(loc.longitude).toFixed(4)} (${new Date(loc.recorded_at).toLocaleString()}).`
        : '';

      // Logged as a notification to super_admin, same pattern as the
      // login/location-skip notifications elsewhere in this function —
      // this is the audit trail for a blocked duplicate-login attempt.
      try {
        await pgrestPost('notifications', {
          company_id:     KARACHI_COMPANY_ID,
          recipient_role: 'super_admin',
          title:          `Blocked duplicate login — ${user.full_name}`,
          body:           `Someone tried to log into ${user.full_name}'s account (${user.email}) while it was already active on another device.${locText}`,
          type:           'admin_login',
        });
      } catch (e) {
        console.error('[login] duplicate-login notification insert failed:', e.message);
      }

      throw new Error(
        `This account is already logged in on another device (since ${new Date(user.active_session_started_at).toLocaleString()}).` +
        ` Contact ${user.full_name} at ${user.phone || 'their registered number'} to log out there first.${locText}`
      );
    }
  }

  // Branch admins (Hyderabad/Sukkur) share their location on login when
  // the browser grants it, so Karachi's super_admin can see where they
  // logged in from — best-effort only. This used to hard-block login
  // entirely when location wasn't available (denied permission, no GPS
  // signal, traveling on a network that blocks it, etc.), which locked
  // legitimate admins out of their own account; logging in should never
  // depend on whether geolocation happens to succeed.
  const hasLocation = latitude != null && longitude != null && !Number.isNaN(Number(latitude)) && !Number.isNaN(Number(longitude));
  if (hasLocation) {
    // Best-effort — a failed location ping should never block an
    // otherwise-valid login. Routed through the raw-https bypass (see
    // utils/directQuery.js) — the identical supabaseAdmin insert was
    // confirmed to fail on Railway with an RLS error while the exact
    // same insert succeeds instantly when run locally.
    try {
      await pgrestPost('admin_locations', {
        company_id:  user.company_id,
        user_id:     user.id,
        latitude:    Number(latitude),
        longitude:   Number(longitude),
        status:      'active',
        recorded_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error('[login] admin_locations insert failed:', e.message);
    }
  }

  // Alert Karachi's super_admin whenever a branch admin (Hyderabad/Sukkur)
  // logs in, so they can see who logged in and from where without having
  // to keep the GPS page open. Notifications are scoped to company_id —
  // super_admin's own company_id is Karachi's, so that's what this must be
  // filed under for GET /notifications (which filters by the requesting
  // user's own company_id) to surface it to them. Best-effort, same as
  // the location ping above — never blocks a valid login.
  if (user.role === 'branch_admin' && hasLocation) {
    try {
      await pgrestPost('notifications', {
        company_id:     KARACHI_COMPANY_ID,
        recipient_role: 'super_admin',
        title:          `${BRANCH_CITY_NAMES[user.company_id] || 'Branch'} Admin Login`,
        body:           `${user.full_name} logged in from ${Number(latitude).toFixed(4)}, ${Number(longitude).toFixed(4)}`,
        type:           'admin_login',
      });
    } catch (e) {
      console.error('[login] admin_login notification insert failed:', e.message);
    }
  }

  // A forced login that actually overrode a live lock invalidates
  // whatever session was active elsewhere (its token gets overwritten
  // below) — logged the same way a blocked attempt is, so this is never
  // silent even though it was allowed through.
  if (force && user.active_session_token && user.active_session_started_at) {
    const lockAgeMs = Date.now() - new Date(user.active_session_started_at).getTime();
    if (lockAgeMs < SESSION_MAX_AGE_MS) {
      try {
        await pgrestPost('notifications', {
          company_id:     KARACHI_COMPANY_ID,
          recipient_role: 'super_admin',
          title:          `Forced login override — ${user.full_name}`,
          body:           `${user.full_name} logged in with "force" while their account was already active elsewhere (since ${new Date(user.active_session_started_at).toLocaleString()}) — that other session is now logged out.`,
          type:           'admin_login',
        });
      } catch (e) {
        console.error('[login] forced-override notification insert failed:', e.message);
      }
    }
  }

  const token = generateToken(user);

  // Claim the session lock — best-effort like the location/notification
  // writes above; if this insert fails, the worst case is the lock
  // doesn't take for this login, not that the login itself fails.
  try {
    await pgrestPatch('users', { id: `eq.${user.id}` }, {
      active_session_token: token,
      active_session_started_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[login] session lock write failed:', e.message);
  }

  return {
    token,
    user: {
      id:          user.id,
      fullName:    user.full_name,
      role:        user.role,
      companyId:   user.company_id,
      phone:       user.phone,
      // Present regardless of whether the phase10 migration (adding the
      // permissions column) has been run yet — select('*') above just
      // omits the key entirely if the column doesn't exist, so this
      // never throws either way.
      permissions: user.permissions || {}
    }
  };
}

async function registerSalesman({ phone, fullName, companyId, position }) {
  const canonical = normalizePhone(phone);
  const bare      = canonical.replace('+', '');

  const { data: existing } = await supabaseAdmin
    .from('salesmen')
    .select('id, is_approved')
    .or(`phone.eq.${canonical},phone.eq.${bare}`)
    .maybeSingle();

  if (existing) {
    if (existing.is_approved) throw new Error('Phone number already registered and approved');
    throw new Error('Account already exists. Pending admin approval.');
  }

  const authUserId = await getOrCreateAuthUser({ canonical, bare, fullName, role: 'salesman' });

  const { data: newSalesman, error: salesmanError } = await supabaseAdmin
    .from('salesmen')
    .insert({
      id:          authUserId,
      company_id:  companyId,
      full_name:   fullName,
      phone:       canonical,
      position:    position || null,
      is_approved: false
    })
    .select()
    .single();

  if (salesmanError) throw new Error(salesmanError.message);

  return newSalesman;
}

async function registerDriver({ phone, fullName, companyId, carNumber }) {
  const canonical = normalizePhone(phone);
  const bare      = canonical.replace('+', '');

  const { data: existing } = await supabaseAdmin
    .from('drivers')
    .select('id, is_approved')
    .or(`phone.eq.${canonical},phone.eq.${bare}`)
    .maybeSingle();

  if (existing) {
    if (existing.is_approved) throw new Error('Phone number already registered and approved');
    throw new Error('Account already exists. Pending admin approval.');
  }

  const authUserId = await getOrCreateAuthUser({ canonical, bare, fullName, role: 'driver' });

  const { data: newDriver, error: driverError } = await supabaseAdmin
    .from('drivers')
    .insert({
      id:          authUserId,
      company_id:  companyId,
      full_name:   fullName,
      phone:       canonical,
      car_number:  carNumber || null,
      is_approved: false
    })
    .select()
    .single();

  if (driverError) throw new Error(driverError.message);

  return newDriver;
}

const VALID_RATE_TIERS = ['manual', 'discount', 'premium'];

async function approveCustomer(customerId, adminUser, rateTier) {
  const update = { is_approved: true };
  if (rateTier) {
    if (!VALID_RATE_TIERS.includes(rateTier)) throw new Error('Invalid rate_tier');
    update.rate_tier = rateTier;
  }

  let query = supabaseAdmin
    .from('users')
    .update(update)
    .eq('id', customerId)
    .eq('role', 'customer');
  // super_admin can approve a pending customer in any branch (the
  // Customers page already lists all 3 branches' pending signups for
  // them via CityFilter); branch_admin stays locked to their own.
  if (adminUser.role !== 'super_admin') query = query.eq('company_id', adminUser.company_id);

  const { data, error } = await query.select().single();

  if (error) throw new Error('Customer not found or access denied');
  return data;
}

// These phone lookups sit directly on the OTP login path — a transient
// Railway↔Supabase blip here silently reads as "no such account", which
// sends an existing, approved user down the registration branch instead
// (surfacing as a confusing "fullName is required" error). Same class of
// flakiness withRetry already papers over in loginWithCredentials above.
async function findCustomerByPhone(phone) {
  const canonical = normalizePhone(phone);          // +923001234567
  const bare      = canonical.replace('+', '');    // 923001234567

  // Match either storage format — whatever was used at registration time
  const user = await withRetry(async () => {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .or(`phone.eq.${canonical},phone.eq.${bare}`)
      .eq('role', 'customer')
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }).catch((err) => {
    console.error('findCustomerByPhone error:', err.message);
    return null;
  });

  return user || null;
}

async function findSalesmanByPhone(phone) {
  const canonical = normalizePhone(phone);
  const bare      = canonical.replace('+', '');

  const salesman = await withRetry(async () => {
    const { data, error } = await supabaseAdmin
      .from('salesmen')
      .select('*')
      .or(`phone.eq.${canonical},phone.eq.${bare}`)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }).catch((err) => {
    console.error('findSalesmanByPhone error:', err.message);
    return null;
  });

  if (!salesman) return null;
  // salesmen has no `role` column (the table itself is the discriminator) —
  // callers (sendOTPHandler/verifyOTPHandler/generateToken) expect one.
  return { ...salesman, role: 'salesman' };
}

async function approveSalesman(salesmanId, adminUser) {
  const { data, error } = await supabaseAdmin
    .from('salesmen')
    .update({ is_approved: true })
    .eq('id', salesmanId)
    .eq('company_id', adminUser.company_id)
    .select()
    .single();

  if (error) throw new Error('Salesman not found or access denied');
  return data;
}

async function findDriverByPhone(phone) {
  const canonical = normalizePhone(phone);
  const bare      = canonical.replace('+', '');

  const driver = await withRetry(async () => {
    const { data, error } = await supabaseAdmin
      .from('drivers')
      .select('*')
      .or(`phone.eq.${canonical},phone.eq.${bare}`)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }).catch((err) => {
    console.error('findDriverByPhone error:', err.message);
    return null;
  });

  if (!driver) return null;
  // drivers has no `role` column — the table itself is the discriminator
  return { ...driver, role: 'driver' };
}

async function approveDriver(driverId, adminUser) {
  const { data, error } = await supabaseAdmin
    .from('drivers')
    .update({ is_approved: true })
    .eq('id', driverId)
    .eq('company_id', adminUser.company_id)
    .select()
    .single();

  if (error) throw new Error('Driver not found or access denied');
  return data;
}

// Releases the single-session lock loginWithCredentials sets — called on
// an explicit logout so the account can be logged into elsewhere right
// away instead of waiting out the full SESSION_MAX_AGE_MS.
async function releaseSessionLock(userId) {
  try {
    await pgrestPatch('users', { id: `eq.${userId}` }, {
      active_session_token: null,
      active_session_started_at: null,
    });
  } catch (e) {
    console.error('[logout] session lock release failed:', e.message);
  }
}

module.exports = {
  registerCustomer, registerSalesman, registerDriver,
  loginWithCredentials, releaseSessionLock,
  approveCustomer, approveSalesman, approveDriver,
  generateToken,
  findCustomerByPhone, findSalesmanByPhone, findDriverByPhone
};
