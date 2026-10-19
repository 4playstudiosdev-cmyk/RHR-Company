// Which parts of the mobile apps each customer / salesman / driver account may
// use. The super admin switches them per account (desktop → Mobile Access).
// A feature with no stored value takes its default below — so nothing changes
// for existing accounts until someone turns something off, except the one
// feature that is OFF by default: a driver's "sales_access".
//
// Stored per account in a JSONB `permissions` column (users / salesmen /
// drivers — see sql/phase69_mobile_features.sql), e.g. {"new_order": false}.

const FEATURES = {
  customer: [
    { key: 'place_order',  label: 'Place orders',                      help: 'Order Now, cart and checkout' },
    { key: 'add_payment',  label: 'Add payment',                       help: 'Submit a payment from the app' },
    { key: 'ledger',       label: 'Account ledger & statement',        help: 'Ledger and Download Statement' },
    { key: 'my_salesman',  label: 'My Salesman',                       help: 'See / contact the assigned salesman' },
  ],
  salesman: [
    { key: 'products',         label: 'Products',                      help: 'Browse the product catalogue' },
    { key: 'new_order',        label: 'New order',                     help: 'Place an order for a customer' },
    { key: 'add_customer',     label: 'Add customer',                  help: 'Register a new customer' },
    { key: 'my_customers',     label: 'My customers',                  help: 'Customer list' },
    { key: 'orders_history',   label: 'Delivered / cancelled orders',  help: '' },
    { key: 'outstanding',      label: 'Outstanding balances',          help: '' },
    { key: 'record_payment',   label: 'Record payment',                help: 'Record a customer payment' },
    { key: 'visits',           label: 'Customer visits',               help: 'Record a visit and see visit history' },
    { key: 'cash_collection',  label: 'Cash collection',               help: '' },
    { key: 'performance',      label: 'My performance',                help: '' },
    { key: 'attendance',       label: 'Attendance',                    help: '' },
    { key: 'payslip',          label: 'My payslip',                    help: '' },
  ],
  driver: [
    { key: 'cash_collection',   label: 'Cash collection',              help: '' },
    { key: 'salesmen_directory', label: 'All salesmen',                help: 'Salesmen names and phone numbers' },
    { key: 'sales_access',      label: 'Sales access',                 help: 'Salesman powers: add customers, see all customers, place orders for any customer', defaultOff: true },
  ],
};

// Default value of every feature for a role: on, except those marked defaultOff.
function defaultsFor(role) {
  const out = {};
  (FEATURES[role] || []).forEach((f) => { out[f.key] = !f.defaultOff; });
  return out;
}

// Stored overrides win over defaults; unknown keys in storage are ignored.
function resolveFeatures(role, stored) {
  const features = defaultsFor(role);
  const overrides = stored && typeof stored === 'object' ? stored : {};
  Object.keys(features).forEach((k) => {
    if (typeof overrides[k] === 'boolean') features[k] = overrides[k];
  });
  return features;
}

const TABLE_BY_ROLE = { customer: 'users', salesman: 'salesmen', driver: 'drivers' };

module.exports = { FEATURES, defaultsFor, resolveFeatures, TABLE_BY_ROLE };
