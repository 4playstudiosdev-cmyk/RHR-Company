const jwt = require('jsonwebtoken');
const { supabaseAdmin } = require('../config/supabase');
const { error } = require('../utils/response');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return error(res, 'No token provided', 401);
    }

    const token = authHeader.split(' ')[1];

    if (!token || token === 'null' || token === 'undefined') {
      return error(res, 'Invalid token format', 401);
    }

    // Verify JWT signature and expiry
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        return error(res, 'Token expired. Please login again.', 401);
      }
      return error(res, 'Invalid token', 401);
    }

    // Salesmen live in their own table now — pick the right one based on
    // the role the token was issued with.
    const isSalesman = decoded.role === 'salesman';
    const { data: user, error: dbError } = await supabaseAdmin
      .from(isSalesman ? 'salesmen' : 'users')
      .select(isSalesman
        ? 'id, company_id, full_name, phone, is_approved, is_active'
        : 'id, company_id, role, full_name, phone, is_approved, is_active')
      .eq('id', decoded.userId)
      .single();

    if (dbError || !user) {
      return error(res, 'User not found', 401);
    }

    // salesmen has no `role` column — the table itself is the discriminator
    if (isSalesman) user.role = 'salesman';

    if (!user.is_active) {
      return error(res, 'Account is deactivated', 401);
    }

    if (!user.is_approved && (user.role === 'customer' || user.role === 'salesman')) {
      return error(res, 'Account pending admin approval', 403);
    }

    // Attach user to request — available in all controllers
    req.user = user;
    next();

  } catch (err) {
    console.error('Auth middleware error:', err.message);
    return error(res, 'Authentication failed', 401);
  }
};

module.exports = { authenticate };
