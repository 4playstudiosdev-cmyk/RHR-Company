// The "Direct Transfer" bank account is only for vendor transfers / vendor
// payments (a customer paying a vendor directly). Every other bank picker —
// bank transfer recoveries, cheques, cash closing, expenses — must not offer it.
export const isDirectTransferAccount = (b) =>
  `${b?.account_name || ''} ${b?.bank_name || ''}`.toLowerCase().includes('direct transfer');

export const withoutDirectTransfer = (accounts) => (accounts || []).filter((b) => !isDirectTransferAccount(b));
