function ensureSchema_() {
  const ss = getSpreadsheet_();
  Object.keys(SHEET_HEADERS).forEach(name => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    const expected = SHEET_HEADERS[name];
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
      return;
    }
    const current = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), expected.length)).getValues()[0].slice(0, expected.length);
    const matches = expected.every((header, i) => current[i] === header);
    if (!matches) throw new Error(name + ' sarlavhalari noto‘g‘ri.');
  });
  return true;
}

function setTelegramWebhook_() {
  const url = ScriptApp.getService().getUrl();
  if (!url) throw new Error('Web App URL topilmadi.');
  return telegramCall_('setWebhook', { url: url });
}
