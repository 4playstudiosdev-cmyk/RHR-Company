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
 
    // Verify JWT signature and expiry
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
 
    // Fetch fresh user data from database
    const { data: user, error: dbError } = await supabaseAdmin
      .from('users')
      .select('id, company_id, role, full_name, phone, is_approved, is_active')
      .eq('id', decoded.userId)
      .single();
 
    if (dbError || !user) {
      return error(res, 'User not found', 401);
    }
 
    if (!user.is_active) {
      return error(res, 'Account is deactivated', 401);
    }
 
    if (!user.is_approved && user.role === 'customer') {
      return error(res, 'Account pending admin approval', 403);
    }
 
    // Attach user to request — available in all controllers
    req.user = user;
    next();
 
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return error(res, 'Token expired. Please login again.', 401);
    }
    return error(res, 'Invalid token', 401);
  }
};
 
module.exports = { authenticate };