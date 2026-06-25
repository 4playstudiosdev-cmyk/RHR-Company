const { generateInvoice } = require('../services/invoice.service');
const { supabaseAdmin }   = require('../config/supabase');
const { success, error }  = require('../utils/response');

// POST /api/v1/invoices/generate/:orderId
// Manually regenerate invoice — admin only
const generateInvoiceHandler = async (req, res) => {
  try {
    const { orderId } = req.params;

    // Verify order belongs to admin's company
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, company_id, status')
      .eq('id', orderId)
      .eq('company_id', req.user.company_id)
      .single();

    if (!order) return error(res, 'Order not found', 404);

    const filePath = await generateInvoice(orderId);

    if (!filePath) return error(res, 'Invoice generation failed', 500);

    return success(res, {
      filePath,
      orderNumber: order.order_number
    }, 'Invoice generated successfully');

  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/invoices/download/:orderId
// Returns signed URL for downloading the invoice PDF
const downloadInvoiceHandler = async (req, res) => {
  try {
    const { orderId } = req.params;

    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, invoice_url, order_number, customer_id, company_id')
      .eq('id', orderId)
      .single();

    if (!order) return error(res, 'Order not found', 404);

    // Security: customer can only download their own invoice
    if (req.user.role === 'customer' && order.customer_id !== req.user.id)
      return error(res, 'Access denied', 403);

    if (!order.invoice_url)
      return error(res, 'Invoice not generated yet for this order', 404);

    // Generate signed URL valid for 1 hour
    const { data: urlData, error: signErr } = await supabaseAdmin.storage
      .from('invoices')
      .createSignedUrl(order.invoice_url, 3600);

    if (signErr) throw new Error(signErr.message);

    return success(res, {
      downloadUrl: urlData.signedUrl,
      orderNumber: order.order_number,
      expiresIn:   '1 hour'
    }, 'Invoice download URL ready');

  } catch (err) { return error(res, err.message); }
};

module.exports = { generateInvoiceHandler, downloadInvoiceHandler };
