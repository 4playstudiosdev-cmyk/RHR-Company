// The "Direct Transfer" bank account is meant for vendor transfers / vendor
// payments (a customer paying a vendor directly).
export const isDirectTransferAccount = (b) =>
  `${b?.account_name || ''} ${b?.bank_name || ''}`.toLowerCase().includes('direct transfer');

// Set to true to hide Direct Transfer from the non-vendor bank pickers again
// (cheque deposit, bank transfer recoveries, cash closing, expenses, salesmen).
// On: Direct Transfer is only for vendor transfers (cheque / bank transfer ones go there automatically).
const HIDE_DIRECT_TRANSFER = true;

export const withoutDirectTransfer = (accounts) =>
  HIDE_DIRECT_TRANSFER ? (accounts || []).filter((b) => !isDirectTransferAccount(b)) : (accounts || []);
