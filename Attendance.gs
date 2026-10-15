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
