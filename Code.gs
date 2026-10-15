
// ===== Config.gs =====

const SPREADSHEET_ID = '1o8YUjuV-50yQgUHPejQOnVu0bqnwdUMDQ5rRCNm4_ic';

const SHEETS = Object.freeze({
  CLASSES: 'CLASSES',
  STUDENTS: 'STUDENTS',
  USERS: 'USERS',
  ATTENDANCE: 'ATTENDANCE'
});

const SHEET_HEADERS = Object.freeze({
  CLASSES: ['class_id','class_name','teacher_telegram_id','active'],
  STUDENTS: ['student_id','full_name','class_id','active'],
  USERS: ['telegram_id','full_name','role','class_id','active'],
  ATTENDANCE: ['date','class_id','student_id','status','updated_by','updated_at']
});

const ROLES = Object.freeze({
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  TEACHER: 'TEACHER',
  UNASSIGNED: 'UNASSIGNED'
});
const ATTENDANCE_STATUS = Object.freeze({ KELDI: 'KELDI', SABABLI: 'SABABLI', SABABSIZ: 'SABABSIZ' });
const ATTENDANCE_CYCLE = Object.freeze(['KELDI','SABABLI','SABABSIZ']);
const PROPERTY_KEYS = Object.freeze({
  BOT_TOKEN: 'TELEGRAM_BOT_TOKEN',
  SUPER_ADMIN_ID: 'SUPER_ADMIN_ID',
  WEB_APP_URL: 'WEB_APP_URL'
});


// ===== Sheets.gs =====

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
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


// ===== State.gs =====

function pendingKey_(telegramId) {
  return 'pending:' + String(telegramId);
}

function setPendingAction_(telegramId, action) {
  CacheService.getScriptCache().put(pendingKey_(telegramId), JSON.stringify(action), 600);
}

function getPendingAction_(telegramId) {
  const raw = CacheService.getScriptCache().get(pendingKey_(telegramId));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_error) { return null; }
}

function clearPendingAction_(telegramId) {
  CacheService.getScriptCache().remove(pendingKey_(telegramId));
}


// ===== Auth.gs =====

function getSuperAdminId_() {
  const value = PropertiesService.getScriptProperties().getProperty(PROPERTY_KEYS.SUPER_ADMIN_ID);
  return value ? String(value) : null;
}

function resolveActor_(telegramId) {
  const id = String(telegramId);
  const superId = getSuperAdminId_();
  if (superId && id === superId) {
    return { telegramId: id, role: ROLES.SUPER_ADMIN, classId: null, active: true };
  }
  const user = getRowsAsObjects_(SHEETS.USERS).find(row =>
    String(row.telegram_id) === id && (row.active === true || String(row.active).toLowerCase() === 'true')
  );
  if (!user) {
    return { telegramId: id, role: ROLES.UNASSIGNED, classId: null, active: false };
  }
  if (user.role !== ROLES.ADMIN && user.role !== ROLES.TEACHER) {
    return { telegramId: id, role: ROLES.UNASSIGNED, classId: null, active: false };
  }
  return {
    telegramId: id,
    role: user.role,
    classId: user.role === ROLES.TEACHER && user.class_id !== '' ? Number(user.class_id) : null,
    active: true
  };
}

function canManageClasses_(actor) {
  return Boolean(actor && (actor.role === ROLES.SUPER_ADMIN || actor.role === ROLES.ADMIN));
}

function canManageStudents_(actor) {
  return Boolean(actor && (actor.role === ROLES.SUPER_ADMIN || actor.role === ROLES.ADMIN));
}

function canManageStudentsInClass_(actor, classId) {
  if (!actor) return false;
  if (actor.role === ROLES.SUPER_ADMIN || actor.role === ROLES.ADMIN) return true;
  return actor.role === ROLES.TEACHER && Number(actor.classId) === Number(classId);
}

function canManageUsers_(actor) {
  return Boolean(actor && actor.role === ROLES.SUPER_ADMIN);
}

function canAccessClass_(actor, classId) {
  if (!actor) return false;
  if (actor.role === ROLES.SUPER_ADMIN || actor.role === ROLES.ADMIN) return true;
  return actor.role === ROLES.TEACHER && Number(actor.classId) === Number(classId);
}


// ===== Classes.gs =====

function normalizeName_(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (!name) throw new Error('Nom bo‘sh bo‘lishi mumkin emas.');
  return name;
}

function listActiveClasses_() {
  return listActiveRows_(SHEETS.CLASSES).sort((a,b) => String(a.class_name).localeCompare(String(b.class_name)));
}

function listAvailableClasses_() {
  return listActiveClasses_().filter(row => !String(row.teacher_telegram_id || '').trim());
}

function addClass_(actor, className) {
  if (!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.');
  const name = normalizeName_(className);
  const duplicate = listActiveClasses_().some(row => String(row.class_name).toLowerCase() === name.toLowerCase());
  if (duplicate) throw new Error('Bunday sinf allaqachon mavjud.');
  const classId = nextNumericId_(SHEETS.CLASSES, 'class_id');
  appendObjectRow_(SHEETS.CLASSES, { class_id:classId, class_name:name, teacher_telegram_id:'', active:true });
  return { classId, className:name };
}

function renameClass_(actor, classId, className) {
  if (!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.');
  const row = findRowByValue_(SHEETS.CLASSES, 'class_id', classId);
  if (!row || !(row.active === true || String(row.active).toLowerCase() === 'true')) throw new Error('Sinf topilmadi.');
  const name = normalizeName_(className);
  const duplicate = listActiveClasses_().some(item => Number(item.class_id) !== Number(classId) && String(item.class_name).toLowerCase() === name.toLowerCase());
  if (duplicate) throw new Error('Bunday sinf allaqachon mavjud.');
  updateObjectRow_(SHEETS.CLASSES, row._row, { class_name:name });
  return { classId:Number(classId), className:name };
}

function deactivateClass_(actor, classId) {
  if (!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.');
  const row = findRowByValue_(SHEETS.CLASSES, 'class_id', classId);
  if (!row || !(row.active === true || String(row.active).toLowerCase() === 'true')) throw new Error('Sinf topilmadi.');
  const teacherId = String(row.teacher_telegram_id || '').trim();
  if (teacherId) {
    const teacher = findRowByValue_(SHEETS.USERS, 'telegram_id', teacherId);
    if (teacher && teacher.role === ROLES.TEACHER && Number(teacher.class_id) === Number(classId)) {
      updateObjectRow_(SHEETS.USERS, teacher._row, { active:false, class_id:'' });
    }
    updateObjectRow_(SHEETS.CLASSES, row._row, { teacher_telegram_id:'' });
  }
  setRowActive_(SHEETS.CLASSES, 'class_id', classId, false);
  return true;
}


// ===== Students.gs =====

function listActiveStudentsByClass_(classId) {
  return listActiveRows_(SHEETS.STUDENTS)
    .filter(row => Number(row.class_id) === Number(classId))
    .sort((a,b) => String(a.full_name).localeCompare(String(b.full_name)));
}

function addStudent_(actor, classId, fullName) {
  if (!canManageStudentsInClass_(actor, classId)) throw new Error('Ruxsat yo‘q.');
  const classRow = findRowByValue_(SHEETS.CLASSES, 'class_id', classId);
  if (!classRow || !(classRow.active === true || String(classRow.active).toLowerCase() === 'true')) throw new Error('Sinf topilmadi.');
  const name = normalizeName_(fullName);
  const studentId = nextNumericId_(SHEETS.STUDENTS, 'student_id');
  appendObjectRow_(SHEETS.STUDENTS, { student_id:studentId, full_name:name, class_id:Number(classId), active:true });
  return { studentId, fullName:name, classId:Number(classId) };
}

function deactivateStudent_(actor, studentId) {
  const row = findRowByValue_(SHEETS.STUDENTS, 'student_id', studentId);
  if (!row || !(row.active === true || String(row.active).toLowerCase() === 'true')) throw new Error('Öquvçi topilmadi.');
  if (!canManageStudentsInClass_(actor, row.class_id)) throw new Error('Ruxsat yo‘q.');
  setRowActive_(SHEETS.STUDENTS, 'student_id', studentId, false);
  return true;
}


// ===== Users.gs =====

function assertEditableUserId_(telegramId) {
  const id = String(telegramId || '').trim();
  if (!/^\d+$/.test(id)) throw new Error('Telegram ID noto‘g‘ri.');
  if (id === String(getSuperAdminId_())) throw new Error('SUPER ADMIN oddiy foydalanuvçi sifatida o‘zgartirilmaydi.');
  return id;
}

function upsertUser_(telegramId, fullName, role, classId, active) {
  const row = findRowByValue_(SHEETS.USERS, 'telegram_id', telegramId);
  const data = {
    full_name: normalizeName_(fullName),
    role: role,
    class_id: classId === null || classId === undefined ? '' : Number(classId),
    active: Boolean(active)
  };
  if (row) {
    updateObjectRow_(SHEETS.USERS, row._row, data);
  } else {
    appendObjectRow_(SHEETS.USERS, {
      telegram_id: String(telegramId),
      full_name: data.full_name,
      role: data.role,
      class_id: data.class_id,
      active: data.active
    });
  }
  return findRowByValue_(SHEETS.USERS, 'telegram_id', telegramId);
}

function claimClass_(telegramId, fullName, classId) {
  const id = assertEditableUserId_(telegramId);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const existing = findRowByValue_(SHEETS.USERS, 'telegram_id', id);
    if (existing && (existing.active === true || String(existing.active).toLowerCase() === 'true')) {
      if (existing.role === ROLES.ADMIN) throw new Error('Admin sinf rahbari sifatida sinf tanlay olmaydi.');
      if (existing.role === ROLES.TEACHER && existing.class_id !== '') {
        if (Number(existing.class_id) === Number(classId)) {
          const sameClass = findRowByValue_(SHEETS.CLASSES, 'class_id', classId);
          return { classId:Number(classId), className:sameClass ? String(sameClass.class_name) : '', telegramId:id };
        }
        throw new Error('Siz allaqachon boshqa sinfni olgansiz.');
      }
    }

    const classRow = findRowByValue_(SHEETS.CLASSES, 'class_id', classId);
    if (!classRow || !(classRow.active === true || String(classRow.active).toLowerCase() === 'true')) throw new Error('Sinf topilmadi.');
    if (String(classRow.teacher_telegram_id || '').trim()) throw new Error('Bu sinf band.');

    upsertUser_(id, fullName, ROLES.TEACHER, classId, true);
    updateObjectRow_(SHEETS.CLASSES, classRow._row, { teacher_telegram_id:id });
    return { classId:Number(classId), className:String(classRow.class_name), telegramId:id };
  } finally {
    lock.releaseLock();
  }
}

function releaseOwnClass_(actor) {
  if (!actor || actor.role !== ROLES.TEACHER || actor.classId === null || actor.classId === undefined) throw new Error('Sinf rahbari topilmadi.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const classRow = findRowByValue_(SHEETS.CLASSES, 'class_id', actor.classId);
    if (!classRow) throw new Error('Sinf topilmadi.');
    if (String(classRow.teacher_telegram_id || '') !== String(actor.telegramId)) throw new Error('Bu sinf sizga tegishli emas.');
    updateObjectRow_(SHEETS.CLASSES, classRow._row, { teacher_telegram_id:'' });
    const userRow = findRowByValue_(SHEETS.USERS, 'telegram_id', actor.telegramId);
    if (userRow) updateObjectRow_(SHEETS.USERS, userRow._row, { active:false, class_id:'' });
    return { classId:Number(actor.classId), className:String(classRow.class_name) };
  } finally {
    lock.releaseLock();
  }
}

function addAdmin_(actor, telegramId, fullName) {
  if (!canManageUsers_(actor)) throw new Error('Ruxsat yo‘q.');
  const id = assertEditableUserId_(telegramId);
  const existing = findRowByValue_(SHEETS.USERS, 'telegram_id', id);
  if (existing && existing.role === ROLES.TEACHER && existing.class_id !== '') {
    const previousClass = findRowByValue_(SHEETS.CLASSES, 'class_id', existing.class_id);
    if (previousClass && String(previousClass.teacher_telegram_id || '') === id) {
      updateObjectRow_(SHEETS.CLASSES, previousClass._row, { teacher_telegram_id:'' });
    }
  }
  upsertUser_(id, fullName, ROLES.ADMIN, null, true);
  return { telegramId:id, fullName:normalizeName_(fullName) };
}

function removeAdmin_(actor, telegramId) {
  if (!canManageUsers_(actor)) throw new Error('Ruxsat yo‘q.');
  const id = assertEditableUserId_(telegramId);
  const row = findRowByValue_(SHEETS.USERS, 'telegram_id', id);
  if (!row || row.role !== ROLES.ADMIN || !(row.active === true || String(row.active).toLowerCase() === 'true')) throw new Error('Admin topilmadi.');
  updateObjectRow_(SHEETS.USERS, row._row, { active:false, class_id:'' });
  return true;
}


// ===== Attendance.gs =====

function normalizeDateKey_(date) {
  if (typeof date === 'string') return date.slice(0, 10);
  return Utilities.formatDate(date || new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function loadAttendance_(classId, date) {
  const dateKey = normalizeDateKey_(date);
  const students = listActiveRows_(SHEETS.STUDENTS)
    .filter(row => Number(row.class_id) === Number(classId))
    .sort((a,b) => String(a.full_name).localeCompare(String(b.full_name)));
  const saved = getRowsAsObjects_(SHEETS.ATTENDANCE).filter(row =>
    String(row.date) === dateKey && Number(row.class_id) === Number(classId)
  );
  const byStudent = {};
  saved.forEach(row => byStudent[String(row.student_id)] = row.status);
  return students.map(student => ({
    studentId: Number(student.student_id),
    fullName: String(student.full_name),
    status: ATTENDANCE_CYCLE.indexOf(byStudent[String(student.student_id)]) >= 0
      ? byStudent[String(student.student_id)]
      : ATTENDANCE_STATUS.KELDI
  }));
}

function cycleAttendanceStatus_(status) {
  const index = ATTENDANCE_CYCLE.indexOf(status);
  return ATTENDANCE_CYCLE[(index < 0 ? 0 : index + 1) % ATTENDANCE_CYCLE.length];
}

function saveAttendance_(actor, classId, date, entries) {
  if (!canAccessClass_(actor, classId)) throw new Error('Ruxsat yo‘q.');
  const classRow = findRowByValue_(SHEETS.CLASSES, 'class_id', classId);
  if (!classRow || !(classRow.active === true || String(classRow.active).toLowerCase() === 'true')) throw new Error('Sinf topilmadi.');
  const dateKey = normalizeDateKey_(date);
  const activeStudents = listActiveRows_(SHEETS.STUDENTS).filter(row => Number(row.class_id) === Number(classId));
  const allowed = new Set(activeStudents.map(row => String(row.student_id)));
  const input = new Map((entries || []).map(entry => [String(entry.studentId), entry.status]));
  const sheet = getSheet_(SHEETS.ATTENDANCE);
  const existing = getRowsAsObjects_(SHEETS.ATTENDANCE);
  const now = new Date().toISOString();
  const savedEntries = [];

  activeStudents.forEach(student => {
    const sid = String(student.student_id);
    if (!allowed.has(sid)) return;
    const status = input.has(sid) ? input.get(sid) : ATTENDANCE_STATUS.KELDI;
    if (ATTENDANCE_CYCLE.indexOf(status) < 0) throw new Error('Davomat holati noto‘g‘ri.');
    const match = existing.find(row => String(row.date) === dateKey && Number(row.class_id) === Number(classId) && String(row.student_id) === sid);
    if (match) {
      updateObjectRow_(SHEETS.ATTENDANCE, match._row, { status, updated_by: String(actor.telegramId), updated_at: now });
    } else {
      sheet.appendRow([dateKey, Number(classId), Number(student.student_id), status, String(actor.telegramId), now]);
    }
    savedEntries.push({ studentId:Number(student.student_id), fullName:String(student.full_name), status });
  });
  return savedEntries;
}

function attendanceSummary_(entries) {
  const result = { KELDI:0, SABABLI:0, SABABSIZ:0 };
  (entries || []).forEach(entry => { if (Object.prototype.hasOwnProperty.call(result, entry.status)) result[entry.status] += 1; });
  return result;
}

function attendanceDraftKey_(telegramId, classId, date) {
  return 'attdraft:' + String(telegramId) + ':' + String(classId) + ':' + normalizeDateKey_(date);
}

function getAttendanceDraft_(actor, classId, date) {
  const key = attendanceDraftKey_(actor.telegramId, classId, date);
  const raw = CacheService.getScriptCache().get(key);
  if (raw) {
    try { return JSON.parse(raw); } catch (_error) {}
  }
  const entries = loadAttendance_(classId, date);
  CacheService.getScriptCache().put(key, JSON.stringify(entries), 1800);
  return entries;
}

function setAttendanceDraft_(actor, classId, date, entries) {
  CacheService.getScriptCache().put(attendanceDraftKey_(actor.telegramId, classId, date), JSON.stringify(entries), 1800);
}

function clearAttendanceDraft_(actor, classId, date) {
  CacheService.getScriptCache().remove(attendanceDraftKey_(actor.telegramId, classId, date));
}

function cycleAttendanceDraft_(actor, classId, studentId, date) {
  if (!canAccessClass_(actor, classId)) throw new Error('Ruxsat yo‘q.');
  const entries = getAttendanceDraft_(actor, classId, date);
  const entry = entries.find(item => Number(item.studentId) === Number(studentId));
  if (!entry) throw new Error('Öquvçi topilmadi.');
  entry.status = cycleAttendanceStatus_(entry.status);
  setAttendanceDraft_(actor, classId, date, entries);
  return entries;
}

function buildAttendanceView_(actor, classId, date) {
  if (!canAccessClass_(actor, classId)) throw new Error('Ruxsat yo‘q.');
  const classRow = findRowByValue_(SHEETS.CLASSES, 'class_id', classId);
  if (!classRow || !(classRow.active === true || String(classRow.active).toLowerCase() === 'true')) throw new Error('Sinf topilmadi.');
  const dateKey = normalizeDateKey_(date);
  const entries = getAttendanceDraft_(actor, classId, dateKey);
  const rows = entries.map(entry => [{
    text: entry.fullName + ' — ' + statusLabel_(entry.status),
    callback_data: 'att:cycle:' + classId + ':' + entry.studentId + ':' + dateKey
  }]);
  rows.push([{ text:'Saqlash', callback_data:'att:save:' + classId + ':' + dateKey }]);
  return {
    text: String(classRow.class_name) + ' — ' + dateKey + '\n\nKeldi / Sababli / Sababsiz',
    replyMarkup: buildInlineKeyboard_(rows),
    entries: entries
  };
}


// ===== Telegram.gs =====

function getTelegramToken_() {
  const token = PropertiesService.getScriptProperties().getProperty(PROPERTY_KEYS.BOT_TOKEN);
  if (!token) throw new Error('Telegram bot tokeni sozlanmagan.');
  return token;
}

function telegramCall_(method, payload) {
  const token = getTelegramToken_();
  const response = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload || {}),
    muteHttpExceptions: true
  });
  const text = response.getContentText();
  let parsed;
  try { parsed = JSON.parse(text); } catch (_error) { throw new Error('Telegram javobi noto‘g‘ri.'); }
  if (!parsed.ok) throw new Error('Telegram so‘rovi bajarilmadi.');
  return parsed.result || parsed;
}

function sendMessage_(chatId, text, replyMarkup) {
  const payload = { chat_id: chatId, text: text };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return telegramCall_('sendMessage', payload);
}

function editMessage_(chatId, messageId, text, replyMarkup) {
  const payload = { chat_id: chatId, message_id: messageId, text: text };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return telegramCall_('editMessageText', payload);
}

function answerCallback_(callbackQueryId, text) {
  const payload = { callback_query_id: callbackQueryId };
  if (text) payload.text = text;
  return telegramCall_('answerCallbackQuery', payload);
}


// ===== Ui.gs =====

function buildMainMenu_(actor) {
  let keyboard = [];
  if (actor.role === ROLES.SUPER_ADMIN) {
    keyboard = [['Davomat','Sinflar'],['Öquvçilar','Adminlar']];
  } else if (actor.role === ROLES.ADMIN) {
    keyboard = [['Davomat','Sinflar'],['Öquvçilar']];
  } else if (actor.role === ROLES.TEACHER) {
    keyboard = [['Bugungi davomat','Öquvçilar'],['Oldingi davomatlar','Sozlamalar']];
  } else if (actor.role === ROLES.UNASSIGNED) {
    keyboard = [['Sinf tanlash']];
  }
  return { keyboard: keyboard, resize_keyboard: true, is_persistent: true };
}

function buildInlineKeyboard_(rows) {
  return { inline_keyboard: rows };
}

function statusLabel_(status) {
  if (status === ATTENDANCE_STATUS.SABABLI) return 'Sababli';
  if (status === ATTENDANCE_STATUS.SABABSIZ) return 'Sababsiz';
  return 'Keldi';
}


// ===== Setup.gs =====

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

function getWebAppUrl_() {
  const url = PropertiesService.getScriptProperties().getProperty(PROPERTY_KEYS.WEB_APP_URL);
  if (!url) throw new Error('WEB_APP_URL Script Properties ichida sozlanmagan.');
  if (!/\/exec(?:[?#].*)?$/.test(url)) throw new Error('WEB_APP_URL /exec bilan tugashi kerak.');
  return url;
}

function setTelegramWebhook_() {
  return telegramCall_('setWebhook', { url: getWebAppUrl_() });
}

function setupDavomatOne() {
  return ensureSchema_();
}

function installTelegramWebhook() {
  return setTelegramWebhook_();
}

function diagnoseDavomatOne() {
  const result = {};
  const ss = getSpreadsheet_();
  result.spreadsheet_id = ss.getId();
  result.spreadsheet_name = ss.getName();
  result.sheets = Object.keys(SHEET_HEADERS).map(name => ({ name: name, exists: Boolean(ss.getSheetByName(name)) }));
  result.super_admin_id_set = Boolean(PropertiesService.getScriptProperties().getProperty(PROPERTY_KEYS.SUPER_ADMIN_ID));
  result.web_app_url = getWebAppUrl_();
  result.webhook = telegramCall_('getWebhookInfo', {});
  console.log(JSON.stringify(result, null, 2));
  return result;
}


// ===== Code.gs =====

function todayKey_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function safeOutput_() {
  return ContentService.createTextOutput(JSON.stringify({ ok:true })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const update = JSON.parse(raw);
    routeUpdate_(update);
  } catch (error) {
    console.error('DavomatOne webhook error:', error && error.message ? error.message : error);
  }
  return safeOutput_();
}

function routeUpdate_(update) {
  if (!update || typeof update !== 'object') return;
  if (update.message && update.message.from && update.message.chat) {
    const actor = resolveActor_(update.message.from.id);
    const text = String(update.message.text || '').trim();
    if (text.charAt(0) === '/') handleCommand_(update.message, actor);
    else handleText_(update.message, actor);
    return;
  }
  if (update.callback_query && update.callback_query.from) {
    const actor = resolveActor_(update.callback_query.from.id);
    handleCallback_(update.callback_query, actor);
  }
}

function telegramDisplayName_(from) {
  const first = String(from && from.first_name || '').trim();
  const last = String(from && from.last_name || '').trim();
  return (first + ' ' + last).trim() || ('Telegram ' + String(from && from.id || ''));
}

function showAvailableClasses_(chatId) {
  const classes = listAvailableClasses_();
  if (!classes.length) {
    sendMessage_(chatId, 'Hozir bo‘sh sinf yo‘q.');
    return;
  }
  const rows = classes.map(row => [{
    text:String(row.class_name),
    callback_data:'claim:class:' + row.class_id
  }]);
  sendMessage_(chatId, 'Bo‘sh sinfni tanlang.', buildInlineKeyboard_(rows));
}

function handleCommand_(message, actor) {
  const command = String(message.text || '').split(/\s+/)[0].toLowerCase();
  if (command === '/start') {
    clearPendingAction_(actor.telegramId);
    if (actor.role === ROLES.UNASSIGNED) {
      sendMessage_(message.chat.id, 'DavomatOne tayyor.', buildMainMenu_(actor));
      showAvailableClasses_(message.chat.id);
      return;
    }
    sendMessage_(message.chat.id, 'DavomatOne tayyor.', buildMainMenu_(actor));
    return;
  }
  if (actor.role === ROLES.UNASSIGNED) {
    showAvailableClasses_(message.chat.id);
    return;
  }
  sendMessage_(message.chat.id, 'Menyudan tanlang.', buildMainMenu_(actor));
}

function classChoiceKeyboard_(prefix, includeHistory) {
  const rows = listActiveClasses_().map(row => {
    const classId = Number(row.class_id);
    if (includeHistory) {
      return [
        { text:String(row.class_name), callback_data:prefix + ':' + classId },
        { text:'Oldingi', callback_data:'hist:class:' + classId }
      ];
    }
    return [{ text:String(row.class_name), callback_data:prefix + ':' + classId }];
  });
  return buildInlineKeyboard_(rows);
}

function showAttendanceForClass_(chatId, messageId, actor, classId, date, edit) {
  const view = buildAttendanceView_(actor, classId, date || todayKey_());
  if (edit && messageId) editMessage_(chatId, messageId, view.text, view.replyMarkup);
  else sendMessage_(chatId, view.text, view.replyMarkup);
}

function showClasses_(chatId) {
  const rows = listActiveClasses_().map(row => [{ text:String(row.class_name), callback_data:'cls:open:' + row.class_id }]);
  rows.push([{ text:'Sinf qo‘şish', callback_data:'cls:add' }]);
  sendMessage_(chatId, 'Sinflar', buildInlineKeyboard_(rows));
}

function showStudentsClassChoice_(chatId) {
  sendMessage_(chatId, 'Sinfni tanlang.', classChoiceKeyboard_('stu:class', false));
}

function showStudentsForClass_(chatId, actor, classId) {
  if (!canManageStudentsInClass_(actor, classId)) throw new Error('Ruxsat yo‘q.');
  const classRow = findRowByValue_(SHEETS.CLASSES, 'class_id', classId);
  if (!classRow || !(classRow.active === true || String(classRow.active).toLowerCase() === 'true')) throw new Error('Sinf topilmadi.');
  const rows = listActiveStudentsByClass_(classId).map(st => [{text:String(st.full_name),callback_data:'stu:remove:'+st.student_id}]);
  rows.push([{text:'Öquvçi qo‘şish',callback_data:'stu:add:'+classId}]);
  sendMessage_(chatId, String(classRow.class_name) + ' öquvçilari', buildInlineKeyboard_(rows));
}

function showAdmins_(chatId) {
  const admins = listActiveRows_(SHEETS.USERS).filter(row => row.role === ROLES.ADMIN);
  const rows = admins.map(row => [{ text:String(row.full_name), callback_data:'admin:remove:' + row.telegram_id }]);
  rows.push([{ text:'Admin qo‘şish', callback_data:'admin:add' }]);
  sendMessage_(chatId, 'Adminlar', buildInlineKeyboard_(rows));
}

function showTeacherSettings_(chatId, actor) {
  if (!actor || actor.role !== ROLES.TEACHER) throw new Error('Ruxsat yo‘q.');
  const classRow = findRowByValue_(SHEETS.CLASSES, 'class_id', actor.classId);
  if (!classRow) throw new Error('Sinf topilmadi.');
  sendMessage_(chatId, 'Sozlamalar\nSinf: ' + String(classRow.class_name), buildInlineKeyboard_([
    [{text:'Sinfdan voz keçish', callback_data:'settings:release'}]
  ]));
}

function showHistory_(chatId, actor, classId) {
  if (!canAccessClass_(actor, classId)) throw new Error('Ruxsat yo‘q.');
  const dates = [];
  getRowsAsObjects_(SHEETS.ATTENDANCE)
    .filter(row => Number(row.class_id) === Number(classId))
    .forEach(row => { const d = String(row.date); if (dates.indexOf(d) < 0) dates.push(d); });
  dates.sort().reverse();
  if (!dates.length) {
    sendMessage_(chatId, 'Oldingi davomat yo‘q.');
    return;
  }
  const rows = dates.slice(0, 30).map(date => [{ text:date, callback_data:'hist:open:' + classId + ':' + date }]);
  sendMessage_(chatId, 'Sanani tanlang.', buildInlineKeyboard_(rows));
}

function handleText_(message, actor) {
  const chatId = message.chat.id;
  const text = String(message.text || '').trim();

  if (actor.role === ROLES.UNASSIGNED) {
    showAvailableClasses_(chatId);
    return;
  }

  const pending = getPendingAction_(actor.telegramId);
  if (pending) {
    try {
      if (pending.type === 'ADD_CLASS') addClass_(actor, text);
      else if (pending.type === 'RENAME_CLASS') renameClass_(actor, pending.classId, text);
      else if (pending.type === 'ADD_STUDENT') addStudent_(actor, pending.classId, text);
      else if (pending.type === 'ADD_ADMIN') {
        const parsed = parseTelegramPerson_(text);
        addAdmin_(actor, parsed.telegramId, parsed.fullName);
      } else throw new Error('Amal topilmadi.');
      clearPendingAction_(actor.telegramId);
      sendMessage_(chatId, 'Saqlandi.', buildMainMenu_(actor));
    } catch (error) {
      sendMessage_(chatId, error && error.message ? error.message : 'Saqlab bo‘lmadi.');
    }
    return;
  }

  if (text === 'Davomat') {
    if (actor.role === ROLES.TEACHER) showAttendanceForClass_(chatId, null, actor, actor.classId, todayKey_(), false);
    else sendMessage_(chatId, 'Sinfni tanlang.', classChoiceKeyboard_('att:class', true));
    return;
  }
  if (text === 'Bugungi davomat') {
    showAttendanceForClass_(chatId, null, actor, actor.classId, todayKey_(), false);
    return;
  }
  if (text === 'Oldingi davomatlar') {
    showHistory_(chatId, actor, actor.classId);
    return;
  }
  if (text === 'Sinflar') {
    if (!canManageClasses_(actor)) return sendMessage_(chatId,'Ruxsat yo‘q.');
    showClasses_(chatId);
    return;
  }
  if (text === 'Öquvçilar') {
    if (actor.role === ROLES.TEACHER) showStudentsForClass_(chatId, actor, actor.classId);
    else if (canManageStudents_(actor)) showStudentsClassChoice_(chatId);
    else sendMessage_(chatId,'Ruxsat yo‘q.');
    return;
  }
  if (text === 'Sozlamalar') {
    showTeacherSettings_(chatId, actor);
    return;
  }
  if (text === 'Adminlar') {
    if (!canManageUsers_(actor)) return sendMessage_(chatId,'Ruxsat yo‘q.');
    showAdmins_(chatId);
    return;
  }
  sendMessage_(chatId, 'Menyudan tanlang.', buildMainMenu_(actor));
}

function parseTelegramPerson_(text) {
  const parts = String(text || '').split('|');
  if (parts.length < 2) throw new Error('Format: TelegramID | Ism Familiya');
  const telegramId = parts.shift().trim();
  const fullName = parts.join('|').trim();
  if (!/^\d+$/.test(telegramId) || !fullName) throw new Error('Format: TelegramID | Ism Familiya');
  return { telegramId, fullName };
}

function handleCallback_(callbackQuery, actor) {
  const data = String(callbackQuery.data || '');
  const chatId = callbackQuery.message && callbackQuery.message.chat ? callbackQuery.message.chat.id : actor.telegramId;
  const messageId = callbackQuery.message ? callbackQuery.message.message_id : null;
  try {
    const p = data.split(':');
    if (p[0] === 'claim' && p[1] === 'class') {
      if (actor.role !== ROLES.UNASSIGNED) throw new Error('Sizda allaqachon rol mavjud.');
      const claimed = claimClass_(actor.telegramId, telegramDisplayName_(callbackQuery.from), Number(p[2]));
      if (messageId) editMessage_(chatId, messageId, claimed.className + ' sinf qabul qilindi.');
      const freshActor = resolveActor_(actor.telegramId);
      sendMessage_(chatId, 'Siz ' + claimed.className + ' sinf rahbarisiz.', buildMainMenu_(freshActor));
    } else if (p[0] === 'att' && p[1] === 'class') {
      const classId = Number(p[2]);
      if (!canAccessClass_(actor, classId)) throw new Error('Ruxsat yo‘q.');
      showAttendanceForClass_(chatId, messageId, actor, classId, p[3] || todayKey_(), Boolean(messageId));
    } else if (p[0] === 'att' && p[1] === 'cycle') {
      const classId = Number(p[2]), studentId = Number(p[3]), date = p[4];
      if (!canAccessClass_(actor, classId)) throw new Error('Ruxsat yo‘q.');
      cycleAttendanceDraft_(actor, classId, studentId, date);
      showAttendanceForClass_(chatId, messageId, actor, classId, date, true);
    } else if (p[0] === 'att' && p[1] === 'save') {
      const classId = Number(p[2]), date = p[3];
      if (!canAccessClass_(actor, classId)) throw new Error('Ruxsat yo‘q.');
      const entries = getAttendanceDraft_(actor, classId, date);
      const saved = saveAttendance_(actor, classId, date, entries);
      clearAttendanceDraft_(actor, classId, date);
      const s = attendanceSummary_(saved);
      const classRow = findRowByValue_(SHEETS.CLASSES,'class_id',classId);
      const text = String(classRow.class_name) + ' — ' + date + '\n\nKeldi: ' + s.KELDI + '\nSababli: ' + s.SABABLI + '\nSababsiz: ' + s.SABABSIZ;
      editMessage_(chatId, messageId, text, buildInlineKeyboard_([[{text:'Tahrirlash',callback_data:'att:class:'+classId+':'+date}]]));
    } else if (p[0] === 'hist' && p[1] === 'class') {
      showHistory_(chatId, actor, Number(p[2]));
    } else if (p[0] === 'hist' && p[1] === 'open') {
      const classId = Number(p[2]);
      if (!canAccessClass_(actor,classId)) throw new Error('Ruxsat yo‘q.');
      showAttendanceForClass_(chatId, messageId, actor, classId, p[3], Boolean(messageId));
    } else if (data === 'cls:add') {
      if (!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.');
      setPendingAction_(actor.telegramId,{type:'ADD_CLASS'});
      sendMessage_(chatId,'Sinf nomini yuboring.');
    } else if (p[0] === 'cls' && p[1] === 'open') {
      if (!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.');
      const classId = Number(p[2]);
      const row = findRowByValue_(SHEETS.CLASSES,'class_id',classId);
      if (!row || !(row.active === true || String(row.active).toLowerCase()==='true')) throw new Error('Sinf topilmadi.');
      sendMessage_(chatId,String(row.class_name),buildInlineKeyboard_([
        [{text:'Nomini özgartirish',callback_data:'cls:rename:'+classId}],
        [{text:'Sinfni öçirish',callback_data:'cls:remove:'+classId}]
      ]));
    } else if (p[0] === 'cls' && p[1] === 'rename') {
      if (!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.');
      setPendingAction_(actor.telegramId,{type:'RENAME_CLASS',classId:Number(p[2])});
      sendMessage_(chatId,'Yangi sinf nomini yuboring.');
    } else if (p[0] === 'cls' && p[1] === 'remove') {
      deactivateClass_(actor,Number(p[2]));
      sendMessage_(chatId,'Sinf öçirildi.');
    } else if (p[0] === 'stu' && p[1] === 'class') {
      showStudentsForClass_(chatId, actor, Number(p[2]));
    } else if (p[0] === 'stu' && p[1] === 'add') {
      const classId = Number(p[2]);
      if (!canManageStudentsInClass_(actor, classId)) throw new Error('Ruxsat yo‘q.');
      setPendingAction_(actor.telegramId,{type:'ADD_STUDENT',classId:classId});
      sendMessage_(chatId,'Öquvçi ism-familiyasini yuboring.');
    } else if (p[0] === 'stu' && p[1] === 'remove') {
      deactivateStudent_(actor,Number(p[2]));
      sendMessage_(chatId,'Öquvçi çiqarildi.');
    } else if (data === 'settings:release') {
      const released = releaseOwnClass_(actor);
      if (messageId) editMessage_(chatId, messageId, released.className + ' sinfdan voz keçildi.');
      const freshActor = resolveActor_(actor.telegramId);
      sendMessage_(chatId, 'Sinf bo‘shatildi. Yangi sinf tanlashingiz mumkin.', buildMainMenu_(freshActor));
      showAvailableClasses_(chatId);
    } else if (data === 'admin:add') {
      if (!canManageUsers_(actor)) throw new Error('Ruxsat yo‘q.');
      setPendingAction_(actor.telegramId,{type:'ADD_ADMIN'});
      sendMessage_(chatId,'Format: TelegramID | Ism Familiya');
    } else if (p[0] === 'admin' && p[1] === 'remove') {
      removeAdmin_(actor,p[2]);
      sendMessage_(chatId,'Admin olib taşlandi.');
    } else {
      throw new Error('Amal topilmadi.');
    }
    try { answerCallback_(callbackQuery.id); } catch (_answerError) {}
  } catch (error) {
    try { answerCallback_(callbackQuery.id, error && error.message ? error.message : 'Xatolik.'); }
    catch (_answerError) { console.error('Callback answer error'); }
  }
}

