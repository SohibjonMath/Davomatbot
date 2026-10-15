function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet_(name) {
  const sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error('Sahifa topilmadi: ' + name);
  return sheet;
}

function getHeaders_(sheetName) {
  const sheet = getSheet_(sheetName);
  if (sheet.getLastRow() < 1) return [];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

function getRowsAsObjects_(sheetName) {
  const sheet = getSheet_(sheetName);
  const headers = getHeaders_(sheetName);
  if (!headers.length || sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  return values.map((row, index) => {
    const obj = { _row: index + 2 };
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function findRowByValue_(sheetName, columnName, value) {
  const headers = getHeaders_(sheetName);
  const columnIndex = headers.indexOf(columnName);
  if (columnIndex < 0) throw new Error('Ustun topilmadi: ' + columnName);
  const rows = getRowsAsObjects_(sheetName);
  return rows.find(row => String(row[columnName]) === String(value)) || null;
}

function nextNumericId_(sheetName, idColumn) {
  const rows = getRowsAsObjects_(sheetName);
  const max = rows.reduce((m, row) => Math.max(m, Number(row[idColumn]) || 0), 0);
  return max + 1;
}

function setRowActive_(sheetName, idColumn, id, active) {
  const row = findRowByValue_(sheetName, idColumn, id);
  if (!row) return false;
  const headers = getHeaders_(sheetName);
  const activeCol = headers.indexOf('active') + 1;
  if (activeCol < 1) throw new Error('active ustuni topilmadi.');
  getSheet_(sheetName).getRange(row._row, activeCol).setValue(Boolean(active));
  return true;
}

function appendObjectRow_(sheetName, obj) {
  const headers = getHeaders_(sheetName);
  const row = headers.map(h => Object.prototype.hasOwnProperty.call(obj, h) ? obj[h] : '');
  getSheet_(sheetName).appendRow(row);
  return obj;
}

function updateObjectRow_(sheetName, rowNumber, updates) {
  const headers = getHeaders_(sheetName);
  const sheet = getSheet_(sheetName);
  Object.keys(updates).forEach(key => {
    const idx = headers.indexOf(key);
    if (idx >= 0) sheet.getRange(rowNumber, idx + 1).setValue(updates[key]);
  });
}

function listActiveRows_(sheetName) {
  return getRowsAsObjects_(sheetName).filter(row => row.active === true || String(row.active).toLowerCase() === 'true');
}
