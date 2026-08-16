const XLSX = require('xlsx');

// Generic array-of-objects -> .xlsx Buffer converter
function buildExcelBuffer(sheetName, rows) {
  const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
  const workbook  = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { buildExcelBuffer };
