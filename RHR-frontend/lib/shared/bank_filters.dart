// The "Direct Transfer" bank account is only for vendor transfers (a customer
// paying a vendor directly). Every other bank picker — bank transfer, cheque,
// deposits — must not offer it.
bool isDirectTransferAccount(Map a) =>
    (a['account_name']?.toString().toLowerCase() ?? '').contains('direct transfer') ||
    (a['bank_name']?.toString().toLowerCase() ?? '').contains('direct transfer');

List<Map<String, dynamic>> withoutDirectTransfer(List<Map<String, dynamic>> accounts) =>
    accounts.where((a) => !isDirectTransferAccount(a)).toList();
