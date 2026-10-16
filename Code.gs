
// ===== Config.gs =====

const SPREADSHEET_ID = '1o8YUjuV-50yQgUHPejQOnVu0bqnwdUMDQ5rRCNm4_ic';

const SHEETS = Object.freeze({
  CLASSES: 'CLASSES',
  STUDENTS: 'STUDENTS',
  USERS: 'USERS',
  ATTENDANCE: 'ATTENDANCE',
  SETTINGS: 'SETTINGS',
  ACADEMIC_YEARS: 'ACADEMIC_YEARS',
  CLASS_HISTORY: 'CLASS_HISTORY',
  CALENDAR: 'CALENDAR'
});

const SHEET_HEADERS = Object.freeze({
  CLASSES: ['class_id','class_name','teacher_telegram_id','active','start_year_id','archived_year_id','archived_at'],
  STUDENTS: ['student_id','full_name','class_id','active','graduated_year_id','graduated_at'],
  USERS: ['telegram_id','full_name','role','class_id','active'],
  ATTENDANCE: ['date','class_id','student_id','status','updated_by','updated_at','academic_year_id'],
  SETTINGS: ['telegram_id','notifications_enabled','notification_time','last_notification_date'],
  ACADEMIC_YEARS: ['year_id','title','start_date','end_date','promotion_date','status','promoted_at','activated_at'],
  CLASS_HISTORY: ['class_id','academic_year_id','class_name','grade','section','teacher_telegram_id','active_from','active_to','status'],
  CALENDAR: ['event_id','start_date','end_date','type','title','active','created_by','created_at']
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


function mergeHeaders_(currentHeaders, expectedHeaders) {
  const merged = (currentHeaders || []).slice();
  (expectedHeaders || []).forEach(header => {
    if (merged.indexOf(header) < 0) merged.push(header);
  });
  return merged;
}

function ensureSheetSchema_(sheetName, expectedHeaders) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  const expected = (expectedHeaders || []).slice();
  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    if (expected.length) sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
    return expected;
  }
  const current = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(v => String(v || '').trim());
  const merged = mergeHeaders_(current, expected);
  if (merged.length > current.length) {
    sheet.getRange(1, current.length + 1, 1, merged.length - current.length).setValues([merged.slice(current.length)]);
  }
  return merged;
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
    classId: user.role === ROLES.TEACHER && user.class_id !== '' ? classIdKey_(user.class_id) : null,
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
  return actor.role === ROLES.TEACHER && sameClassId_(actor.classId, classId);
}

function canManageUsers_(actor) {
  return Boolean(actor && actor.role === ROLES.SUPER_ADMIN);
}

function canAccessClass_(actor, classId) {
  if (!actor) return false;
  if (actor.role === ROLES.SUPER_ADMIN || actor.role === ROLES.ADMIN) return true;
  return actor.role === ROLES.TEACHER && sameClassId_(actor.classId, classId);
}


// ===== Classes.gs =====

function normalizeName_(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (!name) throw new Error('Nom bo‘sh bo‘lishi mumkin emas.');
  return name;
}

function classIdKey_(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function sameClassId_(a, b) {
  return classIdKey_(a) === classIdKey_(b);
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
  const duplicate = listActiveClasses_().some(item => !sameClassId_(item.class_id, classId) && String(item.class_name).toLowerCase() === name.toLowerCase());
  if (duplicate) throw new Error('Bunday sinf allaqachon mavjud.');
  updateObjectRow_(SHEETS.CLASSES, row._row, { class_name:name });
  return { classId:classIdKey_(classId), className:name };
}

function deactivateClass_(actor, classId) {
  if (!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.');
  const row = findRowByValue_(SHEETS.CLASSES, 'class_id', classId);
  if (!row || !(row.active === true || String(row.active).toLowerCase() === 'true')) throw new Error('Sinf topilmadi.');
  const teacherId = String(row.teacher_telegram_id || '').trim();
  if (teacherId) {
    const teacher = findRowByValue_(SHEETS.USERS, 'telegram_id', teacherId);
    if (teacher && teacher.role === ROLES.TEACHER && sameClassId_(teacher.class_id, classId)) {
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
    .filter(row => sameClassId_(row.class_id, classId))
    .sort((a,b) => String(a.full_name).localeCompare(String(b.full_name)));
}

function parseStudentNames_(text) {
  const seen = {};
  return String(text || '')
    .split(/\r?\n|;/)
    .map(value => String(value || '').trim().replace(/\s+/g, ' '))
    .filter(name => {
      if (!name) return false;
      const key = name.toLowerCase();
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
}

function addStudentsBulk_(actor, classId, text) {
  const names = parseStudentNames_(text);
  if (!names.length) throw new Error('Öquvçi ismlarini yuboring.');
  const existing = {};
  listActiveStudentsByClass_(classId).forEach(row => {
    existing[String(row.full_name || '').trim().toLowerCase()] = true;
  });
  const added = [];
  names.forEach(name => {
    const key = name.toLowerCase();
    if (existing[key]) return;
    added.push(addStudent_(actor, classId, name));
    existing[key] = true;
  });
  if (!added.length) throw new Error('Barcha yuborilgan öquvçilar allaqaçon sinfda mavjud.');
  return added;
}

function addStudent_(actor, classId, fullName) {
  if (!canManageStudentsInClass_(actor, classId)) throw new Error('Ruxsat yo‘q.');
  const classRow = findRowByValue_(SHEETS.CLASSES, 'class_id', classId);
  if (!classRow || !(classRow.active === true || String(classRow.active).toLowerCase() === 'true')) throw new Error('Sinf topilmadi.');
  const name = normalizeName_(fullName);
  const studentId = nextNumericId_(SHEETS.STUDENTS, 'student_id');
  appendObjectRow_(SHEETS.STUDENTS, { student_id:studentId, full_name:name, class_id:classIdKey_(classId), active:true });
  return { studentId, fullName:name, classId:classIdKey_(classId) };
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
    class_id: classId === null || classId === undefined ? '' : classIdKey_(classId),
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
        if (sameClassId_(existing.class_id, classId)) {
          const sameClass = findRowByValue_(SHEETS.CLASSES, 'class_id', classId);
          return { classId:classIdKey_(classId), className:sameClass ? String(sameClass.class_name) : '', telegramId:id };
        }
        throw new Error('Siz allaqachon boshqa sinfni olgansiz.');
      }
    }

    const classRow = findRowByValue_(SHEETS.CLASSES, 'class_id', classId);
    if (!classRow || !(classRow.active === true || String(classRow.active).toLowerCase() === 'true')) throw new Error('Sinf topilmadi.');
    if (String(classRow.teacher_telegram_id || '').trim()) throw new Error('Bu sinf band.');

    upsertUser_(id, fullName, ROLES.TEACHER, classId, true);
    updateObjectRow_(SHEETS.CLASSES, classRow._row, { teacher_telegram_id:id });
    syncCurrentClassHistoryTeacher_(classId, id);
    return { classId:classIdKey_(classId), className:String(classRow.class_name), telegramId:id };
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
    syncCurrentClassHistoryTeacher_(actor.classId, '');
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
    .filter(row => sameClassId_(row.class_id, classId))
    .sort((a,b) => String(a.full_name).localeCompare(String(b.full_name)));
  const saved = getRowsAsObjects_(SHEETS.ATTENDANCE).filter(row =>
    String(row.date) === dateKey && sameClassId_(row.class_id, classId)
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
  if (!classRow || !isActiveFlag_(classRow.active)) throw new Error('Sinf topilmadi.');
  const dateKey = normalizeDateKey_(date);
  if (!isSchoolDay_(dateKey)) throw new Error('Bu sana o‘qish kuni emas.');
  const year = findAcademicYearForDateFromRows_(getRowsAsObjects_(SHEETS.ACADEMIC_YEARS), dateKey);
  if (!year || String(year.status).toUpperCase() !== 'ACTIVE') throw new Error('Bu o‘quv yili faollashtirilmagan.');
  const students = listActiveRows_(SHEETS.STUDENTS).filter(row => sameClassId_(row.class_id, classId));
  const byId = {};
  (entries || []).forEach(entry => { byId[String(entry.studentId)] = entry; });
  const existing = getRowsAsObjects_(SHEETS.ATTENDANCE);
  const saved = [];
  students.forEach(student => {
    const entry = byId[String(student.student_id)];
    const status = entry && ATTENDANCE_CYCLE.indexOf(entry.status) >= 0 ? entry.status : ATTENDANCE_STATUS.KELDI;
    const row = existing.find(item => statisticsDateKey_(item.date) === dateKey && sameClassId_(item.class_id,classId) && String(item.student_id) === String(student.student_id));
    const data = {status:status, updated_by:String(actor.telegramId), updated_at:new Date().toISOString(), academic_year_id:String(year.year_id)};
    if (row) updateObjectRow_(SHEETS.ATTENDANCE,row._row,data);
    else appendObjectRow_(SHEETS.ATTENDANCE,{date:dateKey,class_id:classIdKey_(classId),student_id:student.student_id,status:status,updated_by:String(actor.telegramId),updated_at:data.updated_at,academic_year_id:String(year.year_id)});
    saved.push({studentId:Number(student.student_id),fullName:String(student.full_name),status:status});
  });
  return saved;
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

function attendanceModeKey_(telegramId, classId, date) {
  return 'attmode:' + String(telegramId) + ':' + classIdKey_(classId) + ':' + normalizeDateKey_(date);
}

function getAttendanceMode_(actor, classId, date) {
  const raw = CacheService.getScriptCache().get(attendanceModeKey_(actor.telegramId, classId, date));
  return raw === ATTENDANCE_STATUS.SABABLI ? ATTENDANCE_STATUS.SABABLI : ATTENDANCE_STATUS.SABABSIZ;
}

function setAttendanceMode_(actor, classId, date, mode) {
  const next = mode === ATTENDANCE_STATUS.SABABLI ? ATTENDANCE_STATUS.SABABLI : ATTENDANCE_STATUS.SABABSIZ;
  CacheService.getScriptCache().put(attendanceModeKey_(actor.telegramId, classId, date), next, 1800);
  return next;
}

function applyAttendanceModeToEntries_(entries, studentId, mode) {
  return (entries || []).map(item => {
    const copy = Object.assign({}, item);
    if (Number(copy.studentId) === Number(studentId)) {
      copy.status = copy.status === mode ? ATTENDANCE_STATUS.KELDI : mode;
    }
    return copy;
  });
}

function markAttendanceDraft_(actor, classId, studentId, date) {
  if (!canAccessClass_(actor, classId)) throw new Error('Ruxsat yo‘q.');
  const entries = getAttendanceDraft_(actor, classId, date);
  if (!entries.some(item => Number(item.studentId) === Number(studentId))) throw new Error('Öquvçi topilmadi.');
  const updated = applyAttendanceModeToEntries_(entries, studentId, getAttendanceMode_(actor, classId, date));
  setAttendanceDraft_(actor, classId, date, updated);
  return updated;
}

function setAllAttendanceKeldi_(actor, classId, date) {
  if (!canAccessClass_(actor, classId)) throw new Error('Ruxsat yo‘q.');
  const entries = getAttendanceDraft_(actor, classId, date).map(item => Object.assign({}, item, {status:ATTENDANCE_STATUS.KELDI}));
  setAttendanceDraft_(actor, classId, date, entries);
  return entries;
}

function attendanceMarker_(status) {
  if (status === ATTENDANCE_STATUS.SABABLI) return 'S';
  if (status === ATTENDANCE_STATUS.SABABSIZ) return 'X';
  return '✓';
}

function buildAttendanceReplyMarkup_(actor, classId, date, entries) {
  const dateKey = normalizeDateKey_(date);
  const mode = getAttendanceMode_(actor, classId, dateKey);
  const rows = [[
    {text:(mode === ATTENDANCE_STATUS.SABABSIZ ? '✓ ' : '') + 'Sababsiz', callback_data:'att:mode:' + classId + ':' + dateKey + ':SABABSIZ'},
    {text:(mode === ATTENDANCE_STATUS.SABABLI ? '✓ ' : '') + 'Sababli', callback_data:'att:mode:' + classId + ':' + dateKey + ':SABABLI'}
  ]];
  (entries || []).forEach(entry => rows.push([{
    text:attendanceMarker_(entry.status) + ' ' + entry.fullName,
    callback_data:'att:mark:' + classId + ':' + entry.studentId + ':' + dateKey
  }]));
  rows.push([
    {text:'Hammasi keldi', callback_data:'att:all:' + classId + ':' + dateKey},
    {text:'Saqlash', callback_data:'att:save:' + classId + ':' + dateKey}
  ]);
  return buildInlineKeyboard_(rows);
}

function buildAttendanceView_(actor, classId, date) {
  if (!canAccessClass_(actor, classId)) throw new Error('Ruxsat yo‘q.');
  const classRow = findRowByValue_(SHEETS.CLASSES, 'class_id', classId);
  if (!classRow || !(classRow.active === true || String(classRow.active).toLowerCase() === 'true')) throw new Error('Sinf topilmadi.');
  const dateKey = normalizeDateKey_(date);
  const entries = getAttendanceDraft_(actor, classId, dateKey);
  return {
    text:String(classRow.class_name) + ' — ' + dateKey + '\n\nBarcha öquvçi avval Keldi hisoblanadi. Rejimni tanlang va faqat kelmagan öquvçilarni bosing.',
    replyMarkup:buildAttendanceReplyMarkup_(actor, classId, dateKey, entries),
    entries:entries
  };
}


// ===== Statistics.gs =====

function canViewStatistics_(actor) {
  return Boolean(actor && (actor.role === ROLES.SUPER_ADMIN || actor.role === ROLES.ADMIN));
}

function statisticsActive_(value) {
  return value === true || String(value).toLowerCase() === 'true';
}

function statisticsDateKey_(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value || '').slice(0, 10);
}

function statisticsPersonName_(users, superAdminId, telegramId) {
  const id = String(telegramId || '').trim();
  if (!id) return 'Noma’lum';
  if (superAdminId && id === String(superAdminId)) return 'SUPER ADMIN';
  const user = (users || []).find(row => String(row.telegram_id) === id);
  return user && String(user.full_name || '').trim() ? String(user.full_name).trim() : ('Telegram ' + id);
}

function buildStatisticsModelFromRows_(classes, students, attendanceRows, users, superAdminId, dateKey) {
  const activeClasses = (classes || []).filter(row => statisticsActive_(row.active));
  const activeStudents = (students || []).filter(row => statisticsActive_(row.active));
  const todayRows = (attendanceRows || []).filter(row => statisticsDateKey_(row.date) === String(dateKey));
  const classStats = activeClasses.map(classRow => {
    const classId = classIdKey_(classRow.class_id);
    const classStudents = activeStudents.filter(row => sameClassId_(row.class_id, classId));
    const classAttendance = todayRows.filter(row => sameClassId_(row.class_id, classId));
    let latest = null;
    classAttendance.forEach(row => {
      if (!latest || String(row.updated_at || '') > String(latest.updated_at || '')) latest = row;
    });
    const byStudentId = {};
    classStudents.forEach(row => byStudentId[String(row.student_id)] = String(row.full_name || ''));
    const absent = [];
    let keldi = 0, sababli = 0, sababsiz = 0;
    classAttendance.forEach(row => {
      if (row.status === ATTENDANCE_STATUS.KELDI) keldi += 1;
      else if (row.status === ATTENDANCE_STATUS.SABABLI) {
        sababli += 1;
        absent.push({ studentId:String(row.student_id), studentName:byStudentId[String(row.student_id)] || ('ID ' + row.student_id), status:ATTENDANCE_STATUS.SABABLI });
      } else if (row.status === ATTENDANCE_STATUS.SABABSIZ) {
        sababsiz += 1;
        absent.push({ studentId:String(row.student_id), studentName:byStudentId[String(row.student_id)] || ('ID ' + row.student_id), status:ATTENDANCE_STATUS.SABABSIZ });
      }
    });
    const teacherId = String(classRow.teacher_telegram_id || '').trim();
    return {
      sheetRow: Number(classRow._row) || 0,
      classId: classId,
      className: String(classRow.class_name || classId),
      teacherId: teacherId,
      teacherName: teacherId ? statisticsPersonName_(users, superAdminId, teacherId) : 'Rahbar tanlanmagan',
      totalStudents: classStudents.length,
      submitted: classAttendance.length > 0,
      submittedById: latest ? String(latest.updated_by || '') : '',
      submittedByName: latest ? statisticsPersonName_(users, superAdminId, latest.updated_by) : '',
      submittedAt: latest ? String(latest.updated_at || '') : '',
      keldi: keldi,
      sababli: sababli,
      sababsiz: sababsiz,
      absent: absent
    };
  }).sort((a,b) => a.className.localeCompare(b.className));

  const absences = [];
  classStats.forEach(item => item.absent.forEach(absent => absences.push({
    classId:item.classId,
    className:item.className,
    studentId:absent.studentId,
    studentName:absent.studentName,
    status:absent.status
  })));

  return {
    date:String(dateKey),
    totalClasses:classStats.length,
    submittedCount:classStats.filter(item => item.submitted).length,
    missingCount:classStats.filter(item => !item.submitted).length,
    totalStudents:classStats.reduce((sum,item) => sum + item.totalStudents, 0),
    keldi:classStats.reduce((sum,item) => sum + item.keldi, 0),
    sababli:classStats.reduce((sum,item) => sum + item.sababli, 0),
    sababsiz:classStats.reduce((sum,item) => sum + item.sababsiz, 0),
    classes:classStats,
    absences:absences
  };
}

function getTodayStatisticsModel_(dateKey) {
  const date = dateKey || todayKey_();
  const classes = typeof stabilizeAllClassIds_ === 'function' ? stabilizeAllClassIds_() : listActiveClasses_();
  return buildStatisticsModelFromRows_(
    classes,
    getRowsAsObjects_(SHEETS.STUDENTS),
    getRowsAsObjects_(SHEETS.ATTENDANCE),
    getRowsAsObjects_(SHEETS.USERS),
    getSuperAdminId_(),
    date
  );
}

function formatStatisticsTime_(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'HH:mm');
}

function sendLongText_(chatId, text, replyMarkup) {
  const max = 3500;
  const lines = String(text || '').split('\n');
  const chunks = [];
  let current = '';
  lines.forEach(line => {
    const candidate = current ? current + '\n' + line : line;
    if (candidate.length > max && current) {
      chunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  });
  if (current || !chunks.length) chunks.push(current || '—');
  chunks.forEach((chunk, index) => sendMessage_(chatId, chunk, index === chunks.length - 1 ? replyMarkup : null));
}

function statisticsBackKeyboard_() {
  return buildInlineKeyboard_([[{text:'Statistikaga qaytish',callback_data:'stats:today'}]]);
}

function showStatisticsDashboard_(chatId, actor, dateKey) {
  if (!canViewStatistics_(actor)) throw new Error('Ruxsat yo‘q.');
  const model = getTodayStatisticsModel_(dateKey || todayKey_());
  const text = 'Bugungi statistika — ' + model.date + '\n\n' +
    'Sinflar: ' + model.totalClasses + '\n' +
    'Davomat bergan: ' + model.submittedCount + '\n' +
    'Davomat bermagan: ' + model.missingCount + '\n' +
    'Jami öquvçi: ' + model.totalStudents + '\n' +
    'Keldi: ' + model.keldi + '\n' +
    'Sababli: ' + model.sababli + '\n' +
    'Sababsiz: ' + model.sababsiz;
  sendMessage_(chatId, text, buildInlineKeyboard_([
    [{text:'Davomat berganlar',callback_data:'stats:submitted'},{text:'Davomat bermaganlar',callback_data:'stats:missing'}],
    [{text:'Kelmaganlar',callback_data:'stats:absent'}],
    [{text:'Sinf bo‘yicha',callback_data:'stats:classes'}]
  ]));
}

function showSubmittedStatistics_(chatId, actor) {
  if (!canViewStatistics_(actor)) throw new Error('Ruxsat yo‘q.');
  const model = getTodayStatisticsModel_(todayKey_());
  const items = model.classes.filter(item => item.submitted);
  const lines = ['Davomat bergan sinflar — ' + model.date, ''];
  if (!items.length) lines.push('Hali hech bir sinf davomat bermagan.');
  items.forEach((item,index) => lines.push(
    (index + 1) + '. ' + item.className +
    '\nRahbar: ' + item.teacherName +
    '\nTopshirgan: ' + item.submittedByName +
    '\nVaqt: ' + formatStatisticsTime_(item.submittedAt) +
    '\nKeldi ' + item.keldi + ' | Sababli ' + item.sababli + ' | Sababsiz ' + item.sababsiz
  ));
  sendLongText_(chatId, lines.join('\n'), statisticsBackKeyboard_());
}

function showMissingStatistics_(chatId, actor) {
  if (!canViewStatistics_(actor)) throw new Error('Ruxsat yo‘q.');
  const model = getTodayStatisticsModel_(todayKey_());
  const items = model.classes.filter(item => !item.submitted);
  const lines = ['Davomat bermagan sinflar — ' + model.date, ''];
  if (!items.length) lines.push('Barcha sinflar davomat bergan.');
  items.forEach((item,index) => lines.push((index + 1) + '. ' + item.className + ' — ' + item.teacherName + ' — ' + item.totalStudents + ' öquvçi'));
  sendLongText_(chatId, lines.join('\n'), statisticsBackKeyboard_());
}

function showAbsentStatistics_(chatId, actor) {
  if (!canViewStatistics_(actor)) throw new Error('Ruxsat yo‘q.');
  const model = getTodayStatisticsModel_(todayKey_());
  const lines = ['Bugun kelmaganlar — ' + model.date, ''];
  if (!model.absences.length) {
    lines.push('Sababli yoki sababsiz belgilangan öquvçi yo‘q.');
  } else {
    model.classes.forEach(item => {
      if (!item.absent.length) return;
      lines.push(item.className + ':');
      item.absent.forEach(absent => lines.push('- ' + absent.studentName + ' — ' + (absent.status === ATTENDANCE_STATUS.SABABLI ? 'Sababli' : 'Sababsiz')));
      lines.push('');
    });
  }
  sendLongText_(chatId, lines.join('\n'), statisticsBackKeyboard_());
}

function showStatisticsClassChoice_(chatId, actor) {
  if (!canViewStatistics_(actor)) throw new Error('Ruxsat yo‘q.');
  const model = getTodayStatisticsModel_(todayKey_());
  const rows = model.classes.map(item => [{text:item.className,callback_data:'stats:classrow:' + item.sheetRow}]);
  rows.push([{text:'Statistikaga qaytish',callback_data:'stats:today'}]);
  sendMessage_(chatId, 'Sinfni tanlang.', buildInlineKeyboard_(rows));
}

function showClassStatistics_(chatId, actor, sheetRow) {
  if (!canViewStatistics_(actor)) throw new Error('Ruxsat yo‘q.');
  const classRow = getClassBySheetRow_(sheetRow);
  const classId = typeof ensureStableClassIdForRow_ === 'function' ? ensureStableClassIdForRow_(classRow) : classIdKey_(classRow.class_id);
  const model = getTodayStatisticsModel_(todayKey_());
  const item = model.classes.find(row => sameClassId_(row.classId, classId) || Number(row.sheetRow) === Number(sheetRow));
  if (!item) throw new Error('Sinf topilmadi.');
  const lines = [
    item.className + ' — ' + model.date,
    '',
    'Rahbar: ' + item.teacherName,
    'Holat: ' + (item.submitted ? 'Davomat berilgan' : 'Davomat berilmagan'),
    'Jami öquvçi: ' + item.totalStudents
  ];
  if (item.submitted) {
    lines.push('Topshirgan: ' + item.submittedByName);
    lines.push('Vaqt: ' + formatStatisticsTime_(item.submittedAt));
    lines.push('Keldi: ' + item.keldi);
    lines.push('Sababli: ' + item.sababli);
    lines.push('Sababsiz: ' + item.sababsiz);
    if (item.absent.length) {
      lines.push('');
      lines.push('Kelmaganlar:');
      item.absent.forEach(absent => lines.push('- ' + absent.studentName + ' — ' + (absent.status === ATTENDANCE_STATUS.SABABLI ? 'Sababli' : 'Sababsiz')));
    }
  }
  sendLongText_(chatId, lines.join('\n'), buildInlineKeyboard_([
    [{text:'Sinflar',callback_data:'stats:classes'}],
    [{text:'Statistikaga qaytish',callback_data:'stats:today'}]
  ]));
}


// ===== RangeStatisticsAndNotifications.gs =====

function validDateKey_(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

function shiftDateKey_(dateKey, deltaDays) {
  if (!validDateKey_(dateKey)) throw new Error('Sana noto‘g‘ri.');
  const parts = dateKey.split('-').map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + Number(deltaDays || 0)));
  return d.toISOString().slice(0, 10);
}

function parseStatisticsRangeInput_(text) {
  const m = /^\s*(\d{4}-\d{2}-\d{2})\s*(?:-|–|—|\.\.)\s*(\d{4}-\d{2}-\d{2})\s*$/.exec(String(text || ''));
  if (!m || !validDateKey_(m[1]) || !validDateKey_(m[2])) throw new Error('Format: 2026-10-01 - 2026-10-15');
  if (m[1] > m[2]) throw new Error('Boshlanish sanasi tugash sanasidan keyin bo‘lishi mumkin emas.');
  return {start:m[1], end:m[2]};
}

function statisticsRangeKey_(telegramId) {
  return 'statsrange:' + String(telegramId);
}

function setStatisticsRange_(telegramId, range) {
  CacheService.getScriptCache().put(statisticsRangeKey_(telegramId), JSON.stringify(range), 21600);
  return range;
}

function getStatisticsRange_(telegramId) {
  const raw = CacheService.getScriptCache().get(statisticsRangeKey_(telegramId));
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (validDateKey_(parsed.start) && validDateKey_(parsed.end)) return parsed;
    } catch (_error) {}
  }
  const today = todayKey_();
  return {start:today,end:today};
}

function presetStatisticsRange_(preset) {
  const today = todayKey_();
  if (preset === 'yesterday') {
    const d = shiftDateKey_(today, -1);
    return {start:d,end:d};
  }
  if (preset === '7') return {start:shiftDateKey_(today,-6),end:today};
  if (preset === '30') return {start:shiftDateKey_(today,-29),end:today};
  return {start:today,end:today};
}

function buildStatisticsRangeModelFromRows_(classes, students, attendanceRows, users, superAdminId, startDate, endDate, academicYears, classHistory, calendarRows) {
  const years = academicYears || [];
  if (!years.length) {
    const activeDates = Array.from(new Set((attendanceRows || []).map(row => statisticsDateKey_(row.date)).filter(d => d >= startDate && d <= endDate))).sort();
    const legacyClasses = (classes || []).filter(row => statisticsActive_(row.active)).map(classRow => {
      const classId = classIdKey_(classRow.class_id);
      const classStudents = (students || []).filter(row => statisticsActive_(row.active) && sameClassId_(row.class_id,classId));
      const rows = (attendanceRows || []).filter(row => activeDates.indexOf(statisticsDateKey_(row.date)) >= 0 && sameClassId_(row.class_id,classId));
      const submitted = Array.from(new Set(rows.map(row => statisticsDateKey_(row.date))));
      let keldi=0,sababli=0,sababsiz=0; const absenceMap={}; const names={};
      classStudents.forEach(st => names[String(st.student_id)] = String(st.full_name || ''));
      rows.forEach(row => { if (row.status===ATTENDANCE_STATUS.KELDI) keldi++; else if (row.status===ATTENDANCE_STATUS.SABABLI || row.status===ATTENDANCE_STATUS.SABABSIZ) { if(row.status===ATTENDANCE_STATUS.SABABLI)sababli++;else sababsiz++; const id=String(row.student_id); if(!absenceMap[id]) absenceMap[id]={studentId:id,studentName:names[id]||('ID '+id),sababli:0,sababsiz:0,total:0}; absenceMap[id][row.status===ATTENDANCE_STATUS.SABABLI?'sababli':'sababsiz']++; absenceMap[id].total++; }});
      const teacherId=String(classRow.teacher_telegram_id||'');
      return {sheetRow:Number(classRow._row)||0,classId:classId,className:String(classRow.class_name||classId),teacherName:teacherId?statisticsPersonName_(users,superAdminId,teacherId):'Rahbar tanlanmagan',totalStudents:classStudents.length,submittedDays:submitted.length,missingDays:Math.max(0,activeDates.length-submitted.length),keldi:keldi,sababli:sababli,sababsiz:sababsiz,absences:Object.keys(absenceMap).map(k=>absenceMap[k])};
    });
    const top=[]; legacyClasses.forEach(c=>c.absences.forEach(a=>top.push(Object.assign({classId:c.classId,className:c.className},a)))); top.sort((a,b)=>b.total-a.total);
    return {start:startDate,end:endDate,schoolDays:activeDates.length,totalClasses:legacyClasses.length,totalStudents:legacyClasses.reduce((n,c)=>n+c.totalStudents,0),keldi:legacyClasses.reduce((n,c)=>n+c.keldi,0),sababli:legacyClasses.reduce((n,c)=>n+c.sababli,0),sababsiz:legacyClasses.reduce((n,c)=>n+c.sababsiz,0),classes:legacyClasses,topAbsences:top,days:[]};
  }
  const calendar = calendarRows || [];
  const history = classHistory || [];
  const schoolDates = enumerateSchoolDaysFromRows_(years,calendar,startDate,endDate);
  const yearForDate = {}; schoolDates.forEach(date => { const y=findAcademicYearForDateFromRows_(years,date); if(y)yearForDate[date]=String(y.year_id); });
  const snapshots = [];
  years.forEach(year => {
    const dates = schoolDates.filter(d => yearForDate[d] === String(year.year_id));
    if (!dates.length) return;
    let hs = history.filter(h => String(h.academic_year_id) === String(year.year_id));
    if (!hs.length) hs = (classes || []).filter(c => statisticsActive_(c.active)).map(c => ({class_id:c.class_id,academic_year_id:year.year_id,class_name:c.class_name,teacher_telegram_id:c.teacher_telegram_id,status:'ACTIVE',_row:c._row}));
    hs.forEach(h => snapshots.push({history:h,year:year,dates:dates}));
  });
  const classStats = snapshots.map(snapshot => {
    const h=snapshot.history, classId=classIdKey_(h.class_id), dateSet=snapshot.dates;
    const classStudents=(students||[]).filter(st=>sameClassId_(st.class_id,classId));
    const rows=(attendanceRows||[]).filter(row=>sameClassId_(row.class_id,classId) && dateSet.indexOf(statisticsDateKey_(row.date))>=0 && (!String(row.academic_year_id||'') || String(row.academic_year_id)===String(snapshot.year.year_id)));
    const submitted=Array.from(new Set(rows.map(row=>statisticsDateKey_(row.date)))); const names={}; classStudents.forEach(st=>names[String(st.student_id)]=String(st.full_name||''));
    let keldi=0,sababli=0,sababsiz=0; const map={};
    rows.forEach(row=>{ if(row.status===ATTENDANCE_STATUS.KELDI)keldi++; else if(row.status===ATTENDANCE_STATUS.SABABLI||row.status===ATTENDANCE_STATUS.SABABSIZ){ if(row.status===ATTENDANCE_STATUS.SABABLI)sababli++;else sababsiz++; const id=String(row.student_id); if(!map[id])map[id]={studentId:id,studentName:names[id]||('ID '+id),sababli:0,sababsiz:0,total:0}; map[id][row.status===ATTENDANCE_STATUS.SABABLI?'sababli':'sababsiz']++; map[id].total++; }});
    const teacherId=String(h.teacher_telegram_id||'');
    return {sheetRow:Number(h._row)||0,classId:classId,academicYearId:String(snapshot.year.year_id),className:String(h.class_name||classId),teacherName:teacherId?statisticsPersonName_(users,superAdminId,teacherId):'Rahbar tanlanmagan',totalStudents:classStudents.length,submittedDays:submitted.length,missingDays:Math.max(0,dateSet.length-submitted.length),keldi:keldi,sababli:sababli,sababsiz:sababsiz,absences:Object.keys(map).map(k=>map[k]).sort((a,b)=>b.total-a.total)};
  }).sort((a,b)=>a.academicYearId.localeCompare(b.academicYearId)||a.className.localeCompare(b.className));
  const top=[]; classStats.forEach(c=>c.absences.forEach(a=>top.push(Object.assign({classId:c.classId,className:c.className,academicYearId:c.academicYearId},a)))); top.sort((a,b)=>b.total-a.total||a.studentName.localeCompare(b.studentName));
  const days=schoolDates.map(date=>{ const yearId=yearForDate[date]; const hs=snapshots.filter(s=>String(s.year.year_id)===yearId).map(s=>s.history); const submissions=[],missing=[]; hs.forEach(h=>{ const rows=(attendanceRows||[]).filter(r=>statisticsDateKey_(r.date)===date&&sameClassId_(r.class_id,h.class_id)); if(!rows.length){missing.push({classId:classIdKey_(h.class_id),className:String(h.class_name),teacherName:String(h.teacher_telegram_id||'')?statisticsPersonName_(users,superAdminId,h.teacher_telegram_id):'Rahbar tanlanmagan'});return;} let latest=rows[0]; rows.forEach(r=>{if(String(r.updated_at||'')>String(latest.updated_at||''))latest=r;}); submissions.push({classId:classIdKey_(h.class_id),className:String(h.class_name),submittedByName:statisticsPersonName_(users,superAdminId,latest.updated_by),submittedAt:String(latest.updated_at||'')}); }); return {date:date,academicYearId:yearId,submissions:submissions,missing:missing}; });
  return {start:startDate,end:endDate,schoolDays:schoolDates.length,totalClasses:classStats.length,totalStudents:classStats.reduce((n,c)=>n+c.totalStudents,0),keldi:classStats.reduce((n,c)=>n+c.keldi,0),sababli:classStats.reduce((n,c)=>n+c.sababli,0),sababsiz:classStats.reduce((n,c)=>n+c.sababsiz,0),classes:classStats,topAbsences:top,days:days};
}

function getStatisticsRangeModel_(actor) {
  if (!canViewStatistics_(actor)) throw new Error('Ruxsat yo‘q.');
  const range = getStatisticsRange_(actor.telegramId);
  return buildStatisticsRangeModelFromRows_(
    getRowsAsObjects_(SHEETS.CLASSES), getRowsAsObjects_(SHEETS.STUDENTS), getRowsAsObjects_(SHEETS.ATTENDANCE),
    getRowsAsObjects_(SHEETS.USERS), getSuperAdminId_(), range.start, range.end,
    getRowsAsObjects_(SHEETS.ACADEMIC_YEARS), getRowsAsObjects_(SHEETS.CLASS_HISTORY), getRowsAsObjects_(SHEETS.CALENDAR)
  );
}

function showStatisticsPeriodMenu_(chatId, actor) {
  if (!canViewStatistics_(actor)) throw new Error('Ruxsat yo‘q.');
  sendMessage_(chatId,'Statistika muddatini tanlang.',buildInlineKeyboard_([
    [{text:'Bugun',callback_data:'stats:period:today'},{text:'Keça',callback_data:'stats:period:yesterday'}],
    [{text:'7 kun',callback_data:'stats:period:7'},{text:'30 kun',callback_data:'stats:period:30'}],
    [{text:'Istalgan muddat',callback_data:'stats:period:custom'}]
  ]));
}

function rangeBackKeyboard_() {
  return buildInlineKeyboard_([[{text:'Statistikaga qaytish',callback_data:'stats:range:home'}],[{text:'Muddatni özgartirish',callback_data:'stats:period'}]]);
}

function showStatisticsRangeDashboard_(chatId, actor) {
  const model = getStatisticsRangeModel_(actor);
  const label = model.start === model.end ? model.start : model.start + ' — ' + model.end;
  const text = 'Statistika — ' + label + '\n\n' +
    'Faol davomat kunlari: ' + model.schoolDays + '\n' +
    'Sinflar: ' + model.totalClasses + '\n' +
    'Jami öquvçi: ' + model.totalStudents + '\n' +
    'Keldi: ' + model.keldi + '\n' +
    'Sababli: ' + model.sababli + '\n' +
    'Sababsiz: ' + model.sababsiz;
  sendMessage_(chatId,text,buildInlineKeyboard_([
    [{text:'Sinflar kesimi',callback_data:'stats:range:classes'},{text:'Kelmaganlar',callback_data:'stats:range:absent'}],
    [{text:'Köp qoldirganlar',callback_data:'stats:range:top'},{text:'Kunlar böyicha',callback_data:'stats:range:days'}],
    [{text:'Muddatni özgartirish',callback_data:'stats:period'}]
  ]));
}

function showRangeClasses_(chatId, actor) {
  const model = getStatisticsRangeModel_(actor);
  const lines = ['Sinflar kesimi — ' + model.start + ' — ' + model.end,''];
  model.classes.forEach((item,index) => lines.push((index+1) + '. ' + item.className + ' — ' + item.teacherName + '\nDavomat: ' + item.submittedDays + '/' + model.schoolDays + ' kun | Keldi ' + item.keldi + ' | Sababli ' + item.sababli + ' | Sababsiz ' + item.sababsiz));
  if (!model.classes.length) lines.push('Sinf topilmadi.');
  sendLongText_(chatId,lines.join('\n'),rangeBackKeyboard_());
}

function showRangeAbsences_(chatId, actor) {
  const model = getStatisticsRangeModel_(actor);
  const lines = ['Kelmaganlar — ' + model.start + ' — ' + model.end,''];
  if (!model.topAbsences.length) lines.push('Kelmagan öquvçi yo‘q.');
  model.classes.forEach(item => {
    if (!item.absences.length) return;
    lines.push(item.className + ':');
    item.absences.forEach(absent => lines.push('- ' + absent.studentName + ' — Sababli ' + absent.sababli + ', Sababsiz ' + absent.sababsiz));
    lines.push('');
  });
  sendLongText_(chatId,lines.join('\n'),rangeBackKeyboard_());
}

function showRangeTopAbsences_(chatId, actor) {
  const model = getStatisticsRangeModel_(actor);
  const lines = ['Eng köp qoldirganlar — ' + model.start + ' — ' + model.end,''];
  if (!model.topAbsences.length) lines.push('Kelmagan öquvçi yo‘q.');
  model.topAbsences.slice(0,50).forEach((item,index) => lines.push((index+1) + '. ' + item.studentName + ' — ' + item.className + ' — ' + item.total + ' marta (Sababli ' + item.sababli + ', Sababsiz ' + item.sababsiz + ')'));
  sendLongText_(chatId,lines.join('\n'),rangeBackKeyboard_());
}

function showRangeDays_(chatId, actor) {
  const model = getStatisticsRangeModel_(actor);
  const lines = ['Kunlar böyicha — ' + model.start + ' — ' + model.end,''];
  if (!model.days.length) lines.push('Bu muddatda saqlangan davomat yo‘q.');
  model.days.forEach(day => {
    lines.push(day.date + ':');
    lines.push('Davomat bergan: ' + (day.submissions.length ? day.submissions.map(x => x.className + ' (' + x.submittedByName + ', ' + formatStatisticsTime_(x.submittedAt) + ')').join(', ') : 'yo‘q'));
    lines.push('Davomat bermagan: ' + (day.missing.length ? day.missing.map(x => x.className + ' (' + x.teacherName + ')').join(', ') : 'yo‘q'));
    lines.push('');
  });
  sendLongText_(chatId,lines.join('\n'),rangeBackKeyboard_());
}

function ensureSettingsSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(SHEETS.SETTINGS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.SETTINGS);
    sheet.getRange(1,1,1,SHEET_HEADERS.SETTINGS.length).setValues([SHEET_HEADERS.SETTINGS]);
  }
  return sheet;
}

function normalizeNotificationTime_(value) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(value || ''));
  if (!m) throw new Error('Vaqtni HH:MM formatida yuboring. Masalan: 08:30');
  const h = Number(m[1]), min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) throw new Error('Vaqt noto‘g‘ri.');
  return String(h).padStart(2,'0') + ':' + String(min).padStart(2,'0');
}

function notificationDueNow_(nowTime, targetTime) {
  const toMinutes = value => {
    const parts = String(value || '').split(':').map(Number);
    return parts.length === 2 && isFinite(parts[0]) && isFinite(parts[1]) ? parts[0] * 60 + parts[1] : -9999;
  };
  const diff = toMinutes(nowTime) - toMinutes(targetTime);
  return diff >= 0 && diff < 10;
}

function getNotificationSettings_(telegramId) {
  ensureSettingsSheet_();
  const row = findRowByValue_(SHEETS.SETTINGS,'telegram_id',String(telegramId));
  return row ? {
    telegramId:String(telegramId),
    enabled:row.notifications_enabled === true || String(row.notifications_enabled).toLowerCase() === 'true',
    time:String(row.notification_time || '08:00'),
    lastDate:String(row.last_notification_date || '')
  } : {telegramId:String(telegramId),enabled:false,time:'08:00',lastDate:''};
}

function saveNotificationSettings_(telegramId, updates) {
  ensureSettingsSheet_();
  const id = String(telegramId);
  const current = getNotificationSettings_(id);
  const next = {
    telegram_id:id,
    notifications_enabled:Object.prototype.hasOwnProperty.call(updates,'enabled') ? Boolean(updates.enabled) : current.enabled,
    notification_time:Object.prototype.hasOwnProperty.call(updates,'time') ? normalizeNotificationTime_(updates.time) : current.time,
    last_notification_date:Object.prototype.hasOwnProperty.call(updates,'lastDate') ? String(updates.lastDate || '') : current.lastDate
  };
  const row = findRowByValue_(SHEETS.SETTINGS,'telegram_id',id);
  if (row) updateObjectRow_(SHEETS.SETTINGS,row._row,next); else appendObjectRow_(SHEETS.SETTINGS,next);
  return getNotificationSettings_(id);
}

function ensureNotificationTrigger_() {
  const exists = ScriptApp.getProjectTriggers().some(trigger => trigger.getHandlerFunction() === 'processNotifications_');
  if (!exists) ScriptApp.newTrigger('processNotifications_').timeBased().everyMinutes(5).create();
  return true;
}

function showSettings_(chatId, actor) {
  if (!actor || actor.role === ROLES.UNASSIGNED) throw new Error('Ruxsat yo‘q.');
  const settings = getNotificationSettings_(actor.telegramId);
  const rows = [
    [{text:'Bildirişnoma: ' + (settings.enabled ? 'Yoqilgan' : 'Öçirilgan'),callback_data:'notify:toggle'}],
    [{text:'Vaqt: ' + settings.time,callback_data:'notify:time'}]
  ];
  if (actor.role === ROLES.TEACHER) rows.push([{text:'Sinfdan voz keçish',callback_data:'settings:release'}]);
  sendMessage_(chatId,'Sozlamalar\nBildirişnoma vaqti: ' + settings.time + '\nHolat: ' + (settings.enabled ? 'Yoqilgan' : 'Öçirilgan'),buildInlineKeyboard_(rows));
}

function processNotifications_() {
  ensureSettingsSheet_();
  const now = new Date();
  const nowTime = Utilities.formatDate(now,Session.getScriptTimeZone(),'HH:mm');
  const today = Utilities.formatDate(now,Session.getScriptTimeZone(),'yyyy-MM-dd');
  if (!isSchoolDay_(today)) return;
  const settingsRows = getRowsAsObjects_(SHEETS.SETTINGS).filter(row => isActiveFlag_(row.notifications_enabled));
  settingsRows.forEach(row => {
    const id = String(row.telegram_id || '').trim();
    if (!id || String(row.last_notification_date || '') === today || !notificationDueNow_(nowTime,String(row.notification_time || '08:00'))) return;
    try {
      const actor = resolveActor_(id);
      if (actor.role === ROLES.TEACHER && actor.classId) {
        const submitted = getRowsAsObjects_(SHEETS.ATTENDANCE).some(item => statisticsDateKey_(item.date) === today && sameClassId_(item.class_id,actor.classId));
        if (!submitted) sendMessage_(id,'Eslatma: bugungi davomat hali saqlanmagan.');
      } else if (actor.role === ROLES.ADMIN || actor.role === ROLES.SUPER_ADMIN) {
        const model = getTodayStatisticsModel_(today);
        const missing = model.classes.filter(item => !item.submitted);
        if (missing.length) sendLongText_(id,'Bugun davomat bermagan sinflar:\n' + missing.map(item => '- ' + item.className + ' — ' + item.teacherName).join('\n'));
      }
      saveNotificationSettings_(id,{lastDate:today});
    } catch (error) { console.error('Bildirişnoma xatosi:',error && error.message ? error.message : error); }
  });
}

// ===== AcademicYearCalendarCore.gs =====

function isActiveFlag_(value) {
  return value === true || String(value).toLowerCase() === 'true';
}

function validateAcademicYearInputFromRows_(input, existingRows) {
  const row = Object.assign({}, input || {});
  row.year_id = String(row.year_id || '').trim();
  row.title = String(row.title || '').trim();
  row.start_date = String(row.start_date || '').slice(0, 10);
  row.end_date = String(row.end_date || '').slice(0, 10);
  row.promotion_date = String(row.promotion_date || '').slice(0, 10);
  row.status = String(row.status || 'PLANNED').toUpperCase();
  if (!row.year_id || !row.title) throw new Error('O‘quv yili nomi bo‘sh bo‘lishi mumkin emas.');
  if (!validDateKey_(row.start_date) || !validDateKey_(row.end_date) || !validDateKey_(row.promotion_date)) throw new Error('O‘quv yili sanasi noto‘g‘ri.');
  if (!(row.start_date <= row.end_date && row.end_date <= row.promotion_date)) throw new Error('O‘quv yili sana tartibi noto‘g‘ri.');
  if (['PLANNED','ACTIVE','ARCHIVED'].indexOf(row.status) < 0) throw new Error('O‘quv yili holati noto‘g‘ri.');
  const rows = existingRows || [];
  if (rows.some(item => String(item.year_id) === row.year_id)) throw new Error('Bu o‘quv yili allaqachon mavjud.');
  if (row.status === 'ACTIVE' && rows.some(item => String(item.status).toUpperCase() === 'ACTIVE')) throw new Error('Bitta ACTIVE o‘quv yili allaqachon mavjud.');
  const overlap = rows.some(item => {
    const a = String(item.start_date || '').slice(0,10), b = String(item.end_date || '').slice(0,10);
    return validDateKey_(a) && validDateKey_(b) && row.start_date <= b && row.end_date >= a;
  });
  if (overlap) throw new Error('O‘quv yillari sana oralig‘i kesishmasligi kerak.');
  return row;
}

function validateAcademicYearInput_(input) {
  return validateAcademicYearInputFromRows_(input, getRowsAsObjects_(SHEETS.ACADEMIC_YEARS));
}

function findAcademicYearForDateFromRows_(years, dateKey) {
  const key = String(dateKey || '').slice(0,10);
  return (years || []).find(row => {
    const start = String(row.start_date || '').slice(0,10);
    const end = String(row.end_date || '').slice(0,10);
    return validDateKey_(start) && validDateKey_(end) && key >= start && key <= end;
  }) || null;
}

function resolveSchoolDayFromRows_(years, calendarRows, dateKey) {
  const key = String(dateKey || '').slice(0,10);
  if (!validDateKey_(key)) return false;
  if (!findAcademicYearForDateFromRows_(years || [], key)) return false;
  const events = (calendarRows || []).filter(row => isActiveFlag_(row.active) && key >= String(row.start_date || '').slice(0,10) && key <= String(row.end_date || '').slice(0,10));
  if (events.some(row => String(row.type) === 'WORKDAY')) return true;
  if (events.some(row => String(row.type) === 'VACATION' || String(row.type) === 'HOLIDAY')) return false;
  const parts = key.split('-').map(Number);
  const day = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).getUTCDay();
  return day >= 1 && day <= 5;
}

function enumerateDateKeys_(startDate, endDate) {
  const start = String(startDate || '').slice(0,10), end = String(endDate || '').slice(0,10);
  if (!validDateKey_(start) || !validDateKey_(end) || start > end) throw new Error('Sana oralig‘i noto‘g‘ri.');
  const out = [];
  let current = start;
  while (current <= end) { out.push(current); current = shiftDateKey_(current, 1); }
  return out;
}

function enumerateSchoolDaysFromRows_(years, calendarRows, startDate, endDate) {
  return enumerateDateKeys_(startDate, endDate).filter(date => resolveSchoolDayFromRows_(years, calendarRows, date));
}

function isSchoolDay_(dateKey) {
  return resolveSchoolDayFromRows_(getRowsAsObjects_(SHEETS.ACADEMIC_YEARS), getRowsAsObjects_(SHEETS.CALENDAR), String(dateKey || '').slice(0,10));
}

function enumerateSchoolDays_(startDate, endDate) {
  return enumerateSchoolDaysFromRows_(getRowsAsObjects_(SHEETS.ACADEMIC_YEARS), getRowsAsObjects_(SHEETS.CALENDAR), startDate, endDate);
}

function getActiveAcademicYear_() {
  return getRowsAsObjects_(SHEETS.ACADEMIC_YEARS).find(row => String(row.status).toUpperCase() === 'ACTIVE') || null;
}



// ===== AcademicYearSetupHistory.gs =====

function createAcademicYear_(actor, input) {
  if (!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.');
  const clean = validateAcademicYearInput_(input);
  appendObjectRow_(SHEETS.ACADEMIC_YEARS, {
    year_id:clean.year_id, title:clean.title, start_date:clean.start_date, end_date:clean.end_date,
    promotion_date:clean.promotion_date, status:clean.status, promoted_at:'', activated_at:''
  });
  return findRowByValue_(SHEETS.ACADEMIC_YEARS, 'year_id', clean.year_id);
}

function classHistoryParts_(className) {
  const m = /^(\d+)-(.+)$/.exec(String(className || '').trim());
  return m ? {grade:Number(m[1]), section:m[2]} : {grade:'', section:''};
}

function ensureClassHistorySnapshot_(classRow, academicYearRow) {
  if (!classRow || !academicYearRow) throw new Error('Sinf yoki o‘quv yili topilmadi.');
  const existing = getRowsAsObjects_(SHEETS.CLASS_HISTORY).find(row => sameClassId_(row.class_id, classRow.class_id) && String(row.academic_year_id) === String(academicYearRow.year_id));
  if (existing) return existing;
  const parts = classHistoryParts_(classRow.class_name);
  appendObjectRow_(SHEETS.CLASS_HISTORY, {
    class_id:classIdKey_(classRow.class_id), academic_year_id:String(academicYearRow.year_id), class_name:String(classRow.class_name),
    grade:parts.grade, section:parts.section, teacher_telegram_id:String(classRow.teacher_telegram_id || ''),
    active_from:String(academicYearRow.start_date), active_to:'', status:'ACTIVE'
  });
  return getRowsAsObjects_(SHEETS.CLASS_HISTORY).find(row => sameClassId_(row.class_id, classRow.class_id) && String(row.academic_year_id) === String(academicYearRow.year_id));
}

function backfillAttendanceAcademicYear_(academicYearRow) {
  if (!academicYearRow) return 0;
  let count = 0;
  getRowsAsObjects_(SHEETS.ATTENDANCE).forEach(row => {
    const date = statisticsDateKey_(row.date);
    if (!String(row.academic_year_id || '').trim() && date >= String(academicYearRow.start_date) && date <= String(academicYearRow.end_date)) {
      updateObjectRow_(SHEETS.ATTENDANCE, row._row, {academic_year_id:String(academicYearRow.year_id)});
      count += 1;
    }
  });
  return count;
}

function initializeCurrentAcademicYear_(actor, yearId) {
  if (!actor || actor.role !== ROLES.SUPER_ADMIN) throw new Error('Ruxsat yo‘q.');
  const row = findRowByValue_(SHEETS.ACADEMIC_YEARS, 'year_id', yearId);
  if (!row) throw new Error('O‘quv yili topilmadi.');
  const otherActive = getRowsAsObjects_(SHEETS.ACADEMIC_YEARS).find(item => String(item.status).toUpperCase() === 'ACTIVE' && String(item.year_id) !== String(yearId));
  if (otherActive) throw new Error('Boshqa faol o‘quv yili mavjud.');
  const today = todayKey_();
  if (today >= String(row.start_date) && today <= String(row.end_date) && String(row.status).toUpperCase() !== 'ACTIVE') {
    updateObjectRow_(SHEETS.ACADEMIC_YEARS, row._row, {status:'ACTIVE', activated_at:new Date().toISOString()});
  }
  const fresh = findRowByValue_(SHEETS.ACADEMIC_YEARS, 'year_id', yearId);
  listActiveRows_(SHEETS.CLASSES).forEach(classRow => {
    if (!String(classRow.start_year_id || '').trim()) updateObjectRow_(SHEETS.CLASSES, classRow._row, {start_year_id:String(yearId)});
    const again = findRowByValue_(SHEETS.CLASSES, 'class_id', classRow.class_id) || classRow;
    ensureClassHistorySnapshot_(again, fresh);
  });
  backfillAttendanceAcademicYear_(fresh);
  return fresh;
}

function syncCurrentClassHistoryTeacher_(classId, teacherTelegramId) {
  const year = getActiveAcademicYear_();
  if (!year) return false;
  const row = getRowsAsObjects_(SHEETS.CLASS_HISTORY).find(item => sameClassId_(item.class_id, classId) && String(item.academic_year_id) === String(year.year_id));
  if (!row) return false;
  updateObjectRow_(SHEETS.CLASS_HISTORY, row._row, {teacher_telegram_id:String(teacherTelegramId || '')});
  return true;
}



// ===== AcademicYearLifecycle.gs =====

function parseClassStage_(className) {
  const m = /^([5-9]|10|11)-(\d+)$/.exec(String(className || '').trim());
  return m ? {grade:Number(m[1]), section:m[2]} : null;
}

function nextClassName_(className) {
  const parsed = parseClassStage_(className);
  if (!parsed || parsed.grade === 11) return null;
  return String(parsed.grade + 1) + '-' + parsed.section;
}

function activatePlannedAcademicYears_(today) {
  const key = String(today || todayKey_()).slice(0,10);
  const activated = [];
  const activeNow = getActiveAcademicYear_();
  getRowsAsObjects_(SHEETS.ACADEMIC_YEARS).forEach(year => {
    if (String(year.status).toUpperCase() !== 'PLANNED') return;
    if (key < String(year.start_date) || key > String(year.end_date)) return;
    if (activeNow && String(activeNow.year_id) !== String(year.year_id)) return;
    updateObjectRow_(SHEETS.ACADEMIC_YEARS, year._row, {status:'ACTIVE', activated_at:new Date().toISOString()});
    const freshYear = findRowByValue_(SHEETS.ACADEMIC_YEARS, 'year_id', year.year_id);
    getRowsAsObjects_(SHEETS.CLASSES).forEach(classRow => {
      if (String(classRow.start_year_id || '') !== String(year.year_id) || isActiveFlag_(classRow.active)) return;
      updateObjectRow_(SHEETS.CLASSES, classRow._row, {active:true});
      ensureClassHistorySnapshot_(findRowByValue_(SHEETS.CLASSES,'class_id',classRow.class_id), freshYear);
    });
    activated.push(String(year.year_id));
  });
  return activated;
}

function promoteAcademicYear_(academicYearRow, today) {
  const result = {yearId:academicYearRow ? String(academicYearRow.year_id) : '', promotedCount:0, graduatedClasses:[], graduatedStudents:0, invalidClasses:[]};
  if (!academicYearRow || String(academicYearRow.status).toUpperCase() !== 'ACTIVE' || String(academicYearRow.promoted_at || '').trim()) return result;
  const key = String(today || todayKey_()).slice(0,10);
  if (key < String(academicYearRow.promotion_date)) return result;
  const yearId = String(academicYearRow.year_id);
  listActiveRows_(SHEETS.CLASSES).forEach(classRow => {
    const history = getRowsAsObjects_(SHEETS.CLASS_HISTORY).find(row => sameClassId_(row.class_id,classRow.class_id) && String(row.academic_year_id) === yearId);
    if (history && String(history.status).toUpperCase() !== 'ACTIVE') return;
    const parsed = parseClassStage_(classRow.class_name);
    if (!parsed) { result.invalidClasses.push(String(classRow.class_name || classRow.class_id)); return; }
    const historyRow = history || ensureClassHistorySnapshot_(classRow, academicYearRow);
    if (parsed.grade === 11) {
      updateObjectRow_(SHEETS.CLASS_HISTORY, historyRow._row, {status:'GRADUATED', active_to:key});
      updateObjectRow_(SHEETS.CLASSES, classRow._row, {active:false, archived_year_id:yearId, archived_at:new Date().toISOString(), teacher_telegram_id:''});
      getRowsAsObjects_(SHEETS.STUDENTS).filter(st => sameClassId_(st.class_id,classRow.class_id) && isActiveFlag_(st.active)).forEach(st => {
        updateObjectRow_(SHEETS.STUDENTS, st._row, {active:false, graduated_year_id:yearId, graduated_at:new Date().toISOString()});
        result.graduatedStudents += 1;
      });
      const teacherId = String(classRow.teacher_telegram_id || '').trim();
      if (teacherId) {
        const teacher = findRowByValue_(SHEETS.USERS,'telegram_id',teacherId);
        if (teacher && teacher.role === ROLES.TEACHER && sameClassId_(teacher.class_id,classRow.class_id)) updateObjectRow_(SHEETS.USERS, teacher._row, {active:false,class_id:''});
      }
      result.graduatedClasses.push(String(classRow.class_name));
    } else {
      const next = nextClassName_(classRow.class_name);
      updateObjectRow_(SHEETS.CLASS_HISTORY, historyRow._row, {status:'PROMOTED', active_to:key});
      updateObjectRow_(SHEETS.CLASSES, classRow._row, {class_name:next});
      result.promotedCount += 1;
    }
  });
  updateObjectRow_(SHEETS.ACADEMIC_YEARS, academicYearRow._row, {status:'ARCHIVED', promoted_at:new Date().toISOString()});
  return result;
}

function buildPromotionReport_(result) {
  const lines = ['O‘quv yili yakunlandi: ' + result.yearId, 'Keyingi bosqichga o‘tdi: ' + result.promotedCount, 'Bitirgan sinflar: ' + result.graduatedClasses.length, 'Bitirgan öquvçilar: ' + result.graduatedStudents];
  if (result.graduatedClasses.length) lines.push('Bitirganlar: ' + result.graduatedClasses.join(', '));
  if (result.invalidClasses.length) lines.push('Tekşirish kerak: ' + result.invalidClasses.join(', '));
  return lines.join('\n');
}

function notifyAdminsAcademicYearReport_(result) {
  if (!result || (!result.promotedCount && !result.graduatedClasses.length && !result.invalidClasses.length)) return false;
  const ids = {};
  const superId = getSuperAdminId_();
  if (superId) ids[String(superId)] = true;
  listActiveRows_(SHEETS.USERS).filter(row => row.role === ROLES.ADMIN).forEach(row => ids[String(row.telegram_id)] = true);
  const text = buildPromotionReport_(result);
  Object.keys(ids).forEach(id => { try { sendMessage_(id, text); } catch (error) { console.error('Admin xabari yuborilmadi:', error && error.message ? error.message : error); } });
  return true;
}

function processAcademicYearMaintenance_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const today = todayKey_();
    const activated = activatePlannedAcademicYears_(today);
    const activeYear = getActiveAcademicYear_();
    let promotion = null;
    if (activeYear && !String(activeYear.promoted_at || '').trim() && today >= String(activeYear.promotion_date)) {
      promotion = promoteAcademicYear_(activeYear, today);
      notifyAdminsAcademicYearReport_(promotion);
    }
    return {activated:activated, promotion:promotion};
  } finally {
    lock.releaseLock();
  }
}



// ===== AcademicYearTelegramUI.gs =====

function parseAcademicYearMessage_(text, status) {
  const parts = String(text || '').split('|').map(x => x.trim());
  if (parts.length !== 5) throw new Error('Format: 2026-2027 | 2026/2027 | 2026-09-02 | 2027-05-25 | 2027-06-01');
  return {year_id:parts[0],title:parts[1],start_date:parts[2],end_date:parts[3],promotion_date:parts[4],status:status || 'PLANNED'};
}

function showAcademicYearMenu_(chatId, actor) {
  if (!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.');
  const rows = [[{text:'Joriy yil',callback_data:'academ:current'},{text:'Sinflar holati',callback_data:'academ:status'}],[{text:'Yangi yil tayyorlash',callback_data:'academ:new'},{text:'Yangi 5-sinf',callback_data:'academ:five'}],[{text:'Promotion sanasi',callback_data:'academ:promotion'},{text:'Arxiv',callback_data:'academ:archive'}]];
  if (actor.role === ROLES.SUPER_ADMIN && !getActiveAcademicYear_()) rows.unshift([{text:'Joriy yilni boshlash',callback_data:'academ:init'}]);
  sendMessage_(chatId,'O‘quv yili',buildInlineKeyboard_(rows));
}

function showCurrentAcademicYear_(chatId, actor) {
  if (!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.');
  const y=getActiveAcademicYear_();
  if(!y) return sendMessage_(chatId,'Hozir faol o‘quv yili yo‘q.');
  sendMessage_(chatId,String(y.title||y.year_id)+'\nBoshlanish: '+y.start_date+'\nTugash: '+y.end_date+'\nKeyingi bosqich sanasi: '+y.promotion_date);
}

function showAcademicClassStatus_(chatId, actor) {
  if(!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.');
  const lines=['Sinflar holati',''];
  getRowsAsObjects_(SHEETS.CLASSES).forEach(c=>lines.push(String(c.class_name)+' — '+(isActiveFlag_(c.active)?'Faol':'Rejada/Arxiv')+(c.teacher_telegram_id?' — rahbar biriktirilgan':'')));
  sendLongText_(chatId,lines.join('\n'));
}

function showAcademicYearArchive_(chatId, actor) {
  if(!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.');
  const years=getRowsAsObjects_(SHEETS.ACADEMIC_YEARS).filter(y=>String(y.status).toUpperCase()==='ARCHIVED');
  if(!years.length) return sendMessage_(chatId,'Arxivlangan o‘quv yili yo‘q.');
  sendMessage_(chatId,'Arxiv',buildInlineKeyboard_(years.map(y=>[{text:String(y.title||y.year_id),callback_data:'academ:archiveyear:'+y.year_id}])));
}

function showArchivedYear_(chatId, actor, yearId) {
  if(!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.');
  const year=findRowByValue_(SHEETS.ACADEMIC_YEARS,'year_id',yearId);
  if(!year || String(year.status).toUpperCase()!=='ARCHIVED') throw new Error('Arxiv topilmadi.');
  const history=getRowsAsObjects_(SHEETS.CLASS_HISTORY).filter(h=>String(h.academic_year_id)===String(yearId));
  const lines=[String(year.title||year.year_id),''];
  history.forEach(h=>{ const grads=getRowsAsObjects_(SHEETS.STUDENTS).filter(st=>sameClassId_(st.class_id,h.class_id)&&String(st.graduated_year_id||'')===String(yearId)); lines.push(String(h.class_name)+' — '+String(h.status)+(grads.length?' — '+grads.length+' bitiruvçi':'')); });
  sendLongText_(chatId,lines.join('\n'));
}

function updatePromotionDate_(actor, yearId, dateKey) {
  if(!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.');
  if(!validDateKey_(dateKey)) throw new Error('Sana YYYY-MM-DD formatida bo‘lsin.');
  const row=findRowByValue_(SHEETS.ACADEMIC_YEARS,'year_id',yearId);
  if(!row) throw new Error('O‘quv yili topilmadi.');
  if(String(row.promoted_at||'').trim() || String(row.status).toUpperCase()==='ARCHIVED') throw new Error('Yakunlangan o‘quv yilini o‘zgartirib bo‘lmaydi.');
  if(String(dateKey)<String(row.end_date)) throw new Error('Keyingi bosqich sanasi o‘quv yili tugashidan oldin bo‘lishi mumkin emas.');
  updateObjectRow_(SHEETS.ACADEMIC_YEARS,row._row,{promotion_date:String(dateKey)});
  return true;
}

function createClassForAcademicYear_(actor, yearId, className) {
  if(!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.');
  const name=normalizeName_(className);
  if(!/^5-\d+$/.test(name)) throw new Error('Yangi sinf nomi 5-01 kabi bo‘lsin.');
  const year=findRowByValue_(SHEETS.ACADEMIC_YEARS,'year_id',yearId);
  if(!year || ['ACTIVE','PLANNED'].indexOf(String(year.status).toUpperCase())<0) throw new Error('O‘quv yili topilmadi.');
  const duplicate=getRowsAsObjects_(SHEETS.CLASSES).some(c=>String(c.class_name).toLowerCase()===name.toLowerCase() && !String(c.archived_at||''));
  if(duplicate) throw new Error('Bunday sinf allaqachon mavjud.');
  const classId=nextNumericId_(SHEETS.CLASSES,'class_id');
  const isActive=String(year.status).toUpperCase()==='ACTIVE';
  appendObjectRow_(SHEETS.CLASSES,{class_id:classId,class_name:name,teacher_telegram_id:'',active:isActive,start_year_id:String(yearId),archived_year_id:'',archived_at:''});
  if(isActive) ensureClassHistorySnapshot_(findRowByValue_(SHEETS.CLASSES,'class_id',classId),year);
  return {classId:classId,className:name,active:isActive};
}

function showFiveClassYearChoice_(chatId, actor) {
  if(!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.');
  const years=getRowsAsObjects_(SHEETS.ACADEMIC_YEARS).filter(y=>['ACTIVE','PLANNED'].indexOf(String(y.status).toUpperCase())>=0);
  if(!years.length) return sendMessage_(chatId,'Avval o‘quv yilini yarating.');
  sendMessage_(chatId,'Yangi 5-sinf qaysi o‘quv yiliga?',buildInlineKeyboard_(years.map(y=>[{text:String(y.title||y.year_id),callback_data:'academ:fiveyear:'+y.year_id}])));
}



// ===== CalendarAdmin.gs =====

function addCalendarEvent_(actor, input) {
  if(!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.');
  const type=String(input && input.type || '').toUpperCase();
  const start=String(input && input.start_date || '').slice(0,10), end=String(input && input.end_date || '').slice(0,10), title=String(input && input.title || '').trim();
  if(['VACATION','HOLIDAY','WORKDAY'].indexOf(type)<0) throw new Error('Taqvim turi noto‘g‘ri.');
  if(!validDateKey_(start)||!validDateKey_(end)||start>end) throw new Error('Taqvim sanasi noto‘g‘ri.');
  if(!title) throw new Error('Taqvim nomi bo‘sh bo‘lishi mumkin emas.');
  const eventId=nextNumericId_(SHEETS.CALENDAR,'event_id');
  appendObjectRow_(SHEETS.CALENDAR,{event_id:eventId,start_date:start,end_date:end,type:type,title:title,active:true,created_by:String(actor.telegramId),created_at:new Date().toISOString()});
  return {eventId:eventId,startDate:start,endDate:end,type:type,title:title};
}

function deactivateCalendarEvent_(actor, eventId) {
  if(!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.');
  const row=findRowByValue_(SHEETS.CALENDAR,'event_id',eventId);
  if(!row || !isActiveFlag_(row.active)) throw new Error('Taqvim yozuvi topilmadi.');
  updateObjectRow_(SHEETS.CALENDAR,row._row,{active:false});
  return true;
}

function parseCalendarEventMessage_(text, type) {
  const parts=String(text||'').split('|').map(x=>x.trim());
  if(parts.length!==3) throw new Error('Format: 2026-11-02 | 2026-11-08 | Kuzgi ta’til');
  return {start_date:parts[0],end_date:parts[1],title:parts[2],type:type};
}

function showCalendarMenu_(chatId, actor) {
  if(!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.');
  sendMessage_(chatId,'Taqvim',buildInlineKeyboard_([[{text:'Ta’til qo‘shish',callback_data:'calendar:add:VACATION'}],[{text:'Dam olish/Bayram qo‘shish',callback_data:'calendar:add:HOLIDAY'}],[{text:'Ish kuni qo‘shish',callback_data:'calendar:add:WORKDAY'}],[{text:'Taqvimni ko‘rish',callback_data:'calendar:list'}]]));
}

function showCalendarEvents_(chatId, actor) {
  if(!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.');
  const events=listActiveRows_(SHEETS.CALENDAR).sort((a,b)=>String(a.start_date).localeCompare(String(b.start_date)));
  if(!events.length) return sendMessage_(chatId,'Taqvimda maxsus kunlar yo‘q.');
  const rows=events.map(e=>[{text:String(e.start_date)+(String(e.end_date)!==String(e.start_date)?' — '+e.end_date:'')+' | '+e.title,callback_data:'calendar:delete:'+e.event_id}]);
  sendMessage_(chatId,'Taqvim yozuvlari. O‘chirish uchun yozuvni bosing.',buildInlineKeyboard_(rows));
}



// ===== UnifiedTriggers.gs =====

function installDavomatTriggers() {
  const existing = ScriptApp.getProjectTriggers().map(trigger => trigger.getHandlerFunction());
  if (existing.indexOf('processNotifications_') < 0) ScriptApp.newTrigger('processNotifications_').timeBased().everyMinutes(5).create();
  if (existing.indexOf('processAcademicYearMaintenance_') < 0) ScriptApp.newTrigger('processAcademicYearMaintenance_').timeBased().everyDays(1).atHour(3).create();
  return true;
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

function editMessageReplyMarkup_(chatId, messageId, replyMarkup) {
  return telegramCall_('editMessageReplyMarkup', {chat_id:chatId,message_id:messageId,reply_markup:replyMarkup});
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
    keyboard = [['Davomat','Statistika'],['Sinflar','Öquvçilar'],['O‘quv yili','Taqvim'],['Adminlar','Sozlamalar']];
  } else if (actor.role === ROLES.ADMIN) {
    keyboard = [['Davomat','Statistika'],['Sinflar','Öquvçilar'],['O‘quv yili','Taqvim'],['Sozlamalar']];
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
  Object.keys(SHEET_HEADERS).forEach(name => ensureSheetSchema_(name, SHEET_HEADERS[name]));
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

function installNotificationTrigger() {
  return installDavomatTriggers();
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
  return HtmlService.createHtmlOutput('OK');
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
    const classId = classIdKey_(row.class_id);
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

function getClassBySheetRow_(rowNumber) {
  const row = Number(rowNumber);
  const sheet = getSheet_(SHEETS.CLASSES);
  if (!Number.isInteger(row) || row < 2 || row > sheet.getLastRow()) throw new Error('Sinf topilmadi.');
  const headers = getHeaders_(SHEETS.CLASSES);
  const values = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
  const obj = { _row: row };
  headers.forEach((header, index) => obj[header] = values[index]);
  if (!(obj.active === true || String(obj.active).toLowerCase() === 'true')) throw new Error('Sinf topilmadi.');
  return obj;
}

function classIdIsCallbackSafe_(value) {
  return /^[A-Za-z0-9_-]{1,32}$/.test(classIdKey_(value));
}

function migrateUniqueClassReferences_(oldId, newId) {
  const oldKey = classIdKey_(oldId);
  const newKey = classIdKey_(newId);
  if (!oldKey || oldKey === newKey) return;
  [SHEETS.STUDENTS, SHEETS.ATTENDANCE].forEach(sheetName => {
    getRowsAsObjects_(sheetName).forEach(row => {
      if (sameClassId_(row.class_id, oldKey)) {
        updateObjectRow_(sheetName, row._row, { class_id:newKey });
      }
    });
  });
}

function ensureStableClassIdForRow_(classRow, originalCounts) {
  if (!classRow || !classRow._row) throw new Error('Sinf topilmadi.');
  const current = classIdKey_(classRow.class_id);
  const counts = originalCounts || {};
  const duplicateCount = Object.prototype.hasOwnProperty.call(counts, current)
    ? counts[current]
    : listActiveClasses_().filter(row => sameClassId_(row.class_id, current)).length;
  const needsChange = !current || duplicateCount !== 1 || !classIdIsCallbackSafe_(current);
  if (!needsChange) return current;

  const used = {};
  listActiveClasses_().forEach(row => {
    if (Number(row._row) !== Number(classRow._row)) {
      const key = classIdKey_(row.class_id);
      if (key) used[key] = true;
    }
  });
  let stable = 'C' + String(classRow._row);
  while (used[stable]) stable += '_';

  if (current && duplicateCount === 1) migrateUniqueClassReferences_(current, stable);
  updateObjectRow_(SHEETS.CLASSES, classRow._row, { class_id:stable });

  const teacherId = String(classRow.teacher_telegram_id || '').trim();
  if (teacherId) {
    const teacher = findRowByValue_(SHEETS.USERS, 'telegram_id', teacherId);
    if (teacher && teacher.role === ROLES.TEACHER) {
      updateObjectRow_(SHEETS.USERS, teacher._row, { class_id:stable });
    }
  }
  return stable;
}

function stabilizeAllClassIds_() {
  const original = listActiveClasses_();
  const counts = {};
  original.forEach(row => {
    const key = classIdKey_(row.class_id);
    counts[key] = (counts[key] || 0) + 1;
  });
  original.forEach(row => ensureStableClassIdForRow_(row, counts));
  return listActiveClasses_();
}

function showStudentsClassChoice_(chatId) {
  const classes = stabilizeAllClassIds_();
  const rows = classes.map(row => [{
    text: String(row.class_name),
    callback_data:'stu:classrow:' + row._row
  }]);
  sendMessage_(chatId, 'Sinfni tanlang.', buildInlineKeyboard_(rows));
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
    .filter(row => sameClassId_(row.class_id, classId))
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
      else if (pending.type === 'ADD_STUDENT') {
        const addedStudents = addStudentsBulk_(actor, pending.classId, text);
        clearPendingAction_(actor.telegramId);
        sendMessage_(chatId, addedStudents.length + ' ta öquvçi qo‘şildi.', buildMainMenu_(actor));
        return;
      }
      else if (pending.type === 'SET_NOTIFICATION_TIME') {
        const time = normalizeNotificationTime_(text);
        saveNotificationSettings_(actor.telegramId,{time:time});
        clearPendingAction_(actor.telegramId);
        showSettings_(chatId,actor);
        return;
      }
      else if (pending.type === 'STATS_RANGE') {
        const range = parseStatisticsRangeInput_(text);
        setStatisticsRange_(actor.telegramId,range);
        clearPendingAction_(actor.telegramId);
        showStatisticsRangeDashboard_(chatId,actor);
        return;
      }
      else if (pending.type === 'CREATE_ACADEMIC_YEAR') {
        createAcademicYear_(actor, parseAcademicYearMessage_(text,'PLANNED'));
      } else if (pending.type === 'INITIALIZE_ACADEMIC_YEAR') {
        if (actor.role !== ROLES.SUPER_ADMIN) throw new Error('Ruxsat yo‘q.');
        const created = createAcademicYear_(actor, parseAcademicYearMessage_(text,'PLANNED'));
        initializeCurrentAcademicYear_(actor, created.year_id);
      } else if (pending.type === 'EDIT_PROMOTION_DATE') {
        updatePromotionDate_(actor,pending.yearId,text);
      } else if (pending.type === 'ADD_FIVE_CLASS') {
        createClassForAcademicYear_(actor,pending.yearId,text);
      } else if (pending.type === 'ADD_CALENDAR_EVENT') {
        addCalendarEvent_(actor,parseCalendarEventMessage_(text,pending.calendarType));
      } else if (pending.type === 'ADD_ADMIN') {
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
    showSettings_(chatId, actor);
    return;
  }
  if (text === 'Statistika') {
    if (!canViewStatistics_(actor)) return sendMessage_(chatId,'Ruxsat yo‘q.');
    showStatisticsPeriodMenu_(chatId, actor);
    return;
  }
  if (text === 'O‘quv yili') {
    if (!canManageClasses_(actor)) return sendMessage_(chatId,'Ruxsat yo‘q.');
    showAcademicYearMenu_(chatId,actor);
    return;
  }
  if (text === 'Taqvim') {
    if (!canManageClasses_(actor)) return sendMessage_(chatId,'Ruxsat yo‘q.');
    showCalendarMenu_(chatId,actor);
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
  let callbackAnswered = false;
  try {
    const p = data.split(':');
    if (p[0] === 'claim' && p[1] === 'class') {
      if (actor.role !== ROLES.UNASSIGNED) throw new Error('Sizda allaqachon rol mavjud.');
      const claimed = claimClass_(actor.telegramId, telegramDisplayName_(callbackQuery.from), p[2]);
      if (messageId) editMessage_(chatId, messageId, claimed.className + ' sinf qabul qilindi.');
      const freshActor = resolveActor_(actor.telegramId);
      sendMessage_(chatId, 'Siz ' + claimed.className + ' sinf rahbarisiz.', buildMainMenu_(freshActor));
    } else if (p[0] === 'att' && p[1] === 'class') {
      const classId = p[2];
      if (!canAccessClass_(actor, classId)) throw new Error('Ruxsat yo‘q.');
      showAttendanceForClass_(chatId, messageId, actor, classId, p[3] || todayKey_(), Boolean(messageId));
    } else if (p[0] === 'att' && p[1] === 'mode') {
      const classId = p[2], date = p[3], mode = p[4];
      if (!canAccessClass_(actor,classId)) throw new Error('Ruxsat yo‘q.');
      try { answerCallback_(callbackQuery.id); callbackAnswered = true; } catch (_answerError) {}
      const previous = getAttendanceMode_(actor,classId,date);
      if (previous !== mode) {
        setAttendanceMode_(actor,classId,date,mode);
        editMessageReplyMarkup_(chatId,messageId,buildAttendanceReplyMarkup_(actor,classId,date,getAttendanceDraft_(actor,classId,date)));
      }
    } else if (p[0] === 'att' && p[1] === 'mark') {
      const classId = p[2], studentId = Number(p[3]), date = p[4];
      if (!canAccessClass_(actor,classId)) throw new Error('Ruxsat yo‘q.');
      try { answerCallback_(callbackQuery.id); callbackAnswered = true; } catch (_answerError) {}
      const entries = markAttendanceDraft_(actor,classId,studentId,date);
      editMessageReplyMarkup_(chatId,messageId,buildAttendanceReplyMarkup_(actor,classId,date,entries));
    } else if (p[0] === 'att' && p[1] === 'all') {
      const classId = p[2], date = p[3];
      if (!canAccessClass_(actor,classId)) throw new Error('Ruxsat yo‘q.');
      try { answerCallback_(callbackQuery.id); callbackAnswered = true; } catch (_answerError) {}
      const before = getAttendanceDraft_(actor,classId,date);
      if (before.some(item => item.status !== ATTENDANCE_STATUS.KELDI)) {
        const entries = setAllAttendanceKeldi_(actor,classId,date);
        editMessageReplyMarkup_(chatId,messageId,buildAttendanceReplyMarkup_(actor,classId,date,entries));
      }
    } else if (p[0] === 'att' && p[1] === 'cycle') {
      const classId = p[2], studentId = Number(p[3]), date = p[4];
      if (!canAccessClass_(actor, classId)) throw new Error('Ruxsat yo‘q.');
      cycleAttendanceDraft_(actor, classId, studentId, date);
      showAttendanceForClass_(chatId, messageId, actor, classId, date, true);
    } else if (p[0] === 'att' && p[1] === 'save') {
      const classId = p[2], date = p[3];
      if (!canAccessClass_(actor, classId)) throw new Error('Ruxsat yo‘q.');
      const entries = getAttendanceDraft_(actor, classId, date);
      const saved = saveAttendance_(actor, classId, date, entries);
      clearAttendanceDraft_(actor, classId, date);
      const s = attendanceSummary_(saved);
      const classRow = findRowByValue_(SHEETS.CLASSES,'class_id',classId);
      const text = String(classRow.class_name) + ' — ' + date + '\n\nKeldi: ' + s.KELDI + '\nSababli: ' + s.SABABLI + '\nSababsiz: ' + s.SABABSIZ;
      editMessage_(chatId, messageId, text, buildInlineKeyboard_([[{text:'Tahrirlash',callback_data:'att:class:'+classId+':'+date}]]));
    } else if (p[0] === 'hist' && p[1] === 'class') {
      showHistory_(chatId, actor, p[2]);
    } else if (p[0] === 'hist' && p[1] === 'open') {
      const classId = p[2];
      if (!canAccessClass_(actor,classId)) throw new Error('Ruxsat yo‘q.');
      showAttendanceForClass_(chatId, messageId, actor, classId, p[3], Boolean(messageId));
    } else if (data === 'cls:add') {
      if (!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.');
      setPendingAction_(actor.telegramId,{type:'ADD_CLASS'});
      sendMessage_(chatId,'Sinf nomini yuboring.');
    } else if (p[0] === 'cls' && p[1] === 'open') {
      if (!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.');
      const classId = p[2];
      const row = findRowByValue_(SHEETS.CLASSES,'class_id',classId);
      if (!row || !(row.active === true || String(row.active).toLowerCase()==='true')) throw new Error('Sinf topilmadi.');
      sendMessage_(chatId,String(row.class_name),buildInlineKeyboard_([
        [{text:'Nomini özgartirish',callback_data:'cls:rename:'+classId}],
        [{text:'Sinfni öçirish',callback_data:'cls:remove:'+classId}]
      ]));
    } else if (p[0] === 'cls' && p[1] === 'rename') {
      if (!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.');
      setPendingAction_(actor.telegramId,{type:'RENAME_CLASS',classId:p[2]});
      sendMessage_(chatId,'Yangi sinf nomini yuboring.');
    } else if (p[0] === 'cls' && p[1] === 'remove') {
      deactivateClass_(actor,p[2]);
      sendMessage_(chatId,'Sinf öçirildi.');
    } else if (p[0] === 'stu' && p[1] === 'classrow') {
    const classRow = getClassBySheetRow_(p[2]);
    const stableClassId = ensureStableClassIdForRow_(classRow);
    showStudentsForClass_(chatId, actor, stableClassId);
    } else if (p[0] === 'stu' && p[1] === 'class') {
      showStudentsForClass_(chatId, actor, p[2]);
    } else if (p[0] === 'stu' && p[1] === 'add') {
      const classId = p[2];
      if (!canManageStudentsInClass_(actor, classId)) throw new Error('Ruxsat yo‘q.');
      setPendingAction_(actor.telegramId,{type:'ADD_STUDENT',classId:classId});
      sendMessage_(chatId,'Öquvçilarni yuboring. Har bir öquvçi yangi qatorda bo‘lsin. Bir nechta öquvçini birdan yuborishingiz mumkin.');
    } else if (p[0] === 'stu' && p[1] === 'remove') {
      deactivateStudent_(actor,p[2]);
      sendMessage_(chatId,'Öquvçi çiqarildi.');
    } else if (data === 'settings:release') {
      const released = releaseOwnClass_(actor);
      if (messageId) editMessage_(chatId, messageId, released.className + ' sinfdan voz keçildi.');
      const freshActor = resolveActor_(actor.telegramId);
      sendMessage_(chatId, 'Sinf bo‘shatildi. Yangi sinf tanlashingiz mumkin.', buildMainMenu_(freshActor));
      showAvailableClasses_(chatId);
    } else if (data === 'stats:today') {
      showStatisticsDashboard_(chatId, actor, todayKey_());
    } else if (data === 'stats:submitted') {
      showSubmittedStatistics_(chatId, actor);
    } else if (data === 'stats:missing') {
      showMissingStatistics_(chatId, actor);
    } else if (data === 'stats:absent') {
      showAbsentStatistics_(chatId, actor);
    } else if (data === 'stats:classes') {
      showStatisticsClassChoice_(chatId, actor);
    } else if (p[0] === 'stats' && p[1] === 'classrow') {
      showClassStatistics_(chatId, actor, p[2]);
    } else if (data === 'stats:period') {
      showStatisticsPeriodMenu_(chatId,actor);
    } else if (p[0] === 'stats' && p[1] === 'period' && p[2] === 'custom') {
      setPendingAction_(actor.telegramId,{type:'STATS_RANGE'});
      sendMessage_(chatId,'Muddatni yuboring. Format: 2026-10-01 - 2026-10-15');
    } else if (p[0] === 'stats' && p[1] === 'period') {
      setStatisticsRange_(actor.telegramId,presetStatisticsRange_(p[2]));
      showStatisticsRangeDashboard_(chatId,actor);
    } else if (data === 'stats:range:home') {
      showStatisticsRangeDashboard_(chatId,actor);
    } else if (data === 'stats:range:classes') {
      showRangeClasses_(chatId,actor);
    } else if (data === 'stats:range:absent') {
      showRangeAbsences_(chatId,actor);
    } else if (data === 'stats:range:top') {
      showRangeTopAbsences_(chatId,actor);
    } else if (data === 'stats:range:days') {
      showRangeDays_(chatId,actor);
    } else if (data === 'notify:toggle') {
      const current = getNotificationSettings_(actor.telegramId);
      const next = saveNotificationSettings_(actor.telegramId,{enabled:!current.enabled});
      if (next.enabled) ensureNotificationTrigger_();
      showSettings_(chatId,actor);
    } else if (data === 'notify:time') {
      setPendingAction_(actor.telegramId,{type:'SET_NOTIFICATION_TIME'});
      sendMessage_(chatId,'Bildirişnoma vaqtini HH:MM formatida yuboring. Masalan: 08:30');
    } else if (data === 'academ:current') {
      showCurrentAcademicYear_(chatId,actor);
    } else if (data === 'academ:status') {
      showAcademicClassStatus_(chatId,actor);
    } else if (data === 'academ:new') {
      if(!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.'); setPendingAction_(actor.telegramId,{type:'CREATE_ACADEMIC_YEAR'}); sendMessage_(chatId,'Format: 2026-2027 | 2026/2027 | 2026-09-02 | 2027-05-25 | 2027-06-01');
    } else if (data === 'academ:init') {
      if(actor.role!==ROLES.SUPER_ADMIN) throw new Error('Ruxsat yo‘q.'); setPendingAction_(actor.telegramId,{type:'INITIALIZE_ACADEMIC_YEAR'}); sendMessage_(chatId,'Joriy o‘quv yilini yuboring: 2026-2027 | 2026/2027 | 2026-09-02 | 2027-05-25 | 2027-06-01');
    } else if (data === 'academ:promotion') {
      if(!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.'); const y=getActiveAcademicYear_(); if(!y) throw new Error('Faol o‘quv yili yo‘q.'); setPendingAction_(actor.telegramId,{type:'EDIT_PROMOTION_DATE',yearId:String(y.year_id)}); sendMessage_(chatId,'Yangi sanani YYYY-MM-DD formatida yuboring.');
    } else if (data === 'academ:archive') {
      showAcademicYearArchive_(chatId,actor);
    } else if (p[0] === 'academ' && p[1] === 'archiveyear') {
      showArchivedYear_(chatId,actor,p.slice(2).join(':'));
    } else if (data === 'academ:five') {
      showFiveClassYearChoice_(chatId,actor);
    } else if (p[0] === 'academ' && p[1] === 'fiveyear') {
      if(!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.'); setPendingAction_(actor.telegramId,{type:'ADD_FIVE_CLASS',yearId:p.slice(2).join(':')}); sendMessage_(chatId,'Yangi 5-sinf nomini yuboring. Masalan: 5-01');
    } else if (p[0] === 'calendar' && p[1] === 'add') {
      if(!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.');
      if(['VACATION','HOLIDAY','WORKDAY'].indexOf(p[2])<0) throw new Error('Taqvim turi noto‘g‘ri.');
      setPendingAction_(actor.telegramId,{type:'ADD_CALENDAR_EVENT',calendarType:p[2]});
      sendMessage_(chatId,'Format: 2026-11-02 | 2026-11-08 | Nomi');
    } else if (data === 'calendar:list') {
      showCalendarEvents_(chatId,actor);
    } else if (p[0] === 'calendar' && p[1] === 'delete') {
      deactivateCalendarEvent_(actor,p[2]); sendMessage_(chatId,'Taqvim yozuvi o‘chirildi.');
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
    if (!callbackAnswered) { try { answerCallback_(callbackQuery.id); } catch (_answerError) {} }
  } catch (error) {
    try { answerCallback_(callbackQuery.id, error && error.message ? error.message : 'Xatolik.'); }
    catch (_answerError) { console.error('Callback answer error'); }
  }
}

