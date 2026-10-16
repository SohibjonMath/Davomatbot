from pathlib import Path
import re
import sys

PATH = Path('Code.gs')
s = PATH.read_text(encoding='utf-8')
task = int(sys.argv[1])


def replace_function(source, name, replacement):
    token = f'function {name}('
    start = source.find(token)
    if start < 0:
        raise SystemExit(f'function not found: {name}')
    next_func = source.find('\nfunction ', start + len(token))
    next_section = source.find('\n\n// =====', start + len(token))
    ends = [x for x in (next_func, next_section) if x >= 0]
    end = min(ends) if ends else len(source)
    return source[:start] + replacement.rstrip() + '\n\n' + source[end:].lstrip('\n')


def append_section(source, marker, body):
    tag = f'// ===== {marker} ====='
    if tag in source:
        return source
    insert_before = '// ===== Telegram.gs ====='
    idx = source.find(insert_before)
    block = '\n\n' + tag + '\n\n' + body.strip() + '\n\n'
    if idx < 0:
        return source.rstrip() + block
    return source[:idx] + block + source[idx:]


def task1(source):
    sheets = """const SHEETS = Object.freeze({
  CLASSES: 'CLASSES',
  STUDENTS: 'STUDENTS',
  USERS: 'USERS',
  ATTENDANCE: 'ATTENDANCE',
  SETTINGS: 'SETTINGS',
  ACADEMIC_YEARS: 'ACADEMIC_YEARS',
  CLASS_HISTORY: 'CLASS_HISTORY',
  CALENDAR: 'CALENDAR'
});"""
    headers = """const SHEET_HEADERS = Object.freeze({
  CLASSES: ['class_id','class_name','teacher_telegram_id','active','start_year_id','archived_year_id','archived_at'],
  STUDENTS: ['student_id','full_name','class_id','active','graduated_year_id','graduated_at'],
  USERS: ['telegram_id','full_name','role','class_id','active'],
  ATTENDANCE: ['date','class_id','student_id','status','updated_by','updated_at','academic_year_id'],
  SETTINGS: ['telegram_id','notifications_enabled','notification_time','last_notification_date'],
  ACADEMIC_YEARS: ['year_id','title','start_date','end_date','promotion_date','status','promoted_at','activated_at'],
  CLASS_HISTORY: ['class_id','academic_year_id','class_name','grade','section','teacher_telegram_id','active_from','active_to','status'],
  CALENDAR: ['event_id','start_date','end_date','type','title','active','created_by','created_at']
});"""
    source = re.sub(r"const SHEETS = Object\.freeze\(\{.*?\n\}\);", sheets, source, count=1, flags=re.S)
    source = re.sub(r"const SHEET_HEADERS = Object\.freeze\(\{.*?\n\}\);", headers, source, count=1, flags=re.S)
    helpers = r"""
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
"""
    marker = '// ===== State.gs ====='
    if 'function mergeHeaders_(' not in source:
        source = source.replace(marker, helpers.strip() + '\n\n\n' + marker, 1)
    ensure = r"""function ensureSchema_() {
  Object.keys(SHEET_HEADERS).forEach(name => ensureSheetSchema_(name, SHEET_HEADERS[name]));
  return true;
}"""
    source = replace_function(source, 'ensureSchema_', ensure)
    return source


def task2(source):
    body = r"""
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
"""
    return append_section(source, 'AcademicYearCalendarCore.gs', body)


def task3(source):
    body = r"""
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
"""
    source = append_section(source, 'AcademicYearSetupHistory.gs', body)
    if 'syncCurrentClassHistoryTeacher_(classId, id);' not in source:
        source = source.replace("    updateObjectRow_(SHEETS.CLASSES, classRow._row, { teacher_telegram_id:id });\n    return { classId:classIdKey_(classId)", "    updateObjectRow_(SHEETS.CLASSES, classRow._row, { teacher_telegram_id:id });\n    syncCurrentClassHistoryTeacher_(classId, id);\n    return { classId:classIdKey_(classId)", 1)
    if "syncCurrentClassHistoryTeacher_(actor.classId, '');" not in source:
        source = source.replace("    updateObjectRow_(SHEETS.CLASSES, classRow._row, { teacher_telegram_id:'' });\n    const userRow", "    updateObjectRow_(SHEETS.CLASSES, classRow._row, { teacher_telegram_id:'' });\n    syncCurrentClassHistoryTeacher_(actor.classId, '');\n    const userRow", 1)
    return source


def task4(source):
    body = r"""
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
"""
    return append_section(source, 'AcademicYearLifecycle.gs', body)


def task5(source):
    save = r"""function saveAttendance_(actor, classId, date, entries) {
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
}"""
    source = replace_function(source, 'saveAttendance_', save)
    stats = r"""function buildStatisticsRangeModelFromRows_(classes, students, attendanceRows, users, superAdminId, startDate, endDate, academicYears, classHistory, calendarRows) {
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
}"""
    source = replace_function(source, 'buildStatisticsRangeModelFromRows_', stats)
    get_model = r"""function getStatisticsRangeModel_(actor) {
  if (!canViewStatistics_(actor)) throw new Error('Ruxsat yo‘q.');
  const range = getStatisticsRange_(actor.telegramId);
  return buildStatisticsRangeModelFromRows_(
    getRowsAsObjects_(SHEETS.CLASSES), getRowsAsObjects_(SHEETS.STUDENTS), getRowsAsObjects_(SHEETS.ATTENDANCE),
    getRowsAsObjects_(SHEETS.USERS), getSuperAdminId_(), range.start, range.end,
    getRowsAsObjects_(SHEETS.ACADEMIC_YEARS), getRowsAsObjects_(SHEETS.CLASS_HISTORY), getRowsAsObjects_(SHEETS.CALENDAR)
  );
}"""
    source = replace_function(source, 'getStatisticsRangeModel_', get_model)
    notify = r"""function processNotifications_() {
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
}"""
    source = replace_function(source, 'processNotifications_', notify)
    return source


def task6(source):
    ui = r"""
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
"""
    source = append_section(source, 'AcademicYearTelegramUI.gs', ui)
    main = r"""function buildMainMenu_(actor) {
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
}"""
    source = replace_function(source, 'buildMainMenu_', main)
    pending_anchor = "      else if (pending.type === 'ADD_ADMIN') {"
    pending = """      else if (pending.type === 'CREATE_ACADEMIC_YEAR') {
        createAcademicYear_(actor, parseAcademicYearMessage_(text,'PLANNED'));
      } else if (pending.type === 'INITIALIZE_ACADEMIC_YEAR') {
        if (actor.role !== ROLES.SUPER_ADMIN) throw new Error('Ruxsat yo‘q.');
        const created = createAcademicYear_(actor, parseAcademicYearMessage_(text,'PLANNED'));
        initializeCurrentAcademicYear_(actor, created.year_id);
      } else if (pending.type === 'EDIT_PROMOTION_DATE') {
        updatePromotionDate_(actor,pending.yearId,text);
      } else if (pending.type === 'ADD_FIVE_CLASS') {
        createClassForAcademicYear_(actor,pending.yearId,text);
""" + pending_anchor
    if 'CREATE_ACADEMIC_YEAR' not in source[source.find('function handleText_('):]:
        source = source.replace(pending_anchor, pending, 1)
    text_anchor = "  if (text === 'Adminlar') {"
    text_insert = """  if (text === 'O‘quv yili') {
    if (!canManageClasses_(actor)) return sendMessage_(chatId,'Ruxsat yo‘q.');
    showAcademicYearMenu_(chatId,actor);
    return;
  }
  if (text === 'Taqvim') {
    if (!canManageClasses_(actor)) return sendMessage_(chatId,'Ruxsat yo‘q.');
    showCalendarMenu_(chatId,actor);
    return;
  }
""" + text_anchor
    if "text === 'O‘quv yili'" not in source:
        source = source.replace(text_anchor, text_insert, 1)
    cb_anchor = "    } else if (data === 'admin:add') {"
    cb_insert = """    } else if (data === 'academ:current') {
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
""" + cb_anchor
    if "data === 'academ:current'" not in source:
        source = source.replace(cb_anchor, cb_insert, 1)
    return source


def task7(source):
    body = r"""
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
"""
    source = append_section(source, 'CalendarAdmin.gs', body)
    anchor = "      else if (pending.type === 'ADD_ADMIN') {"
    if 'ADD_CALENDAR_EVENT' not in source[source.find('function handleText_('):]:
        source = source.replace(anchor, """      else if (pending.type === 'ADD_CALENDAR_EVENT') {
        addCalendarEvent_(actor,parseCalendarEventMessage_(text,pending.calendarType));
""" + anchor, 1)
    cb_anchor = "    } else if (data === 'admin:add') {"
    if "p[0] === 'calendar'" not in source:
        source = source.replace(cb_anchor, """    } else if (p[0] === 'calendar' && p[1] === 'add') {
      if(!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.');
      if(['VACATION','HOLIDAY','WORKDAY'].indexOf(p[2])<0) throw new Error('Taqvim turi noto‘g‘ri.');
      setPendingAction_(actor.telegramId,{type:'ADD_CALENDAR_EVENT',calendarType:p[2]});
      sendMessage_(chatId,'Format: 2026-11-02 | 2026-11-08 | Nomi');
    } else if (data === 'calendar:list') {
      showCalendarEvents_(chatId,actor);
    } else if (p[0] === 'calendar' && p[1] === 'delete') {
      deactivateCalendarEvent_(actor,p[2]); sendMessage_(chatId,'Taqvim yozuvi o‘chirildi.');
""" + cb_anchor, 1)
    return source


def task8(source):
    body = r"""
function installDavomatTriggers() {
  const existing = ScriptApp.getProjectTriggers().map(trigger => trigger.getHandlerFunction());
  if (existing.indexOf('processNotifications_') < 0) ScriptApp.newTrigger('processNotifications_').timeBased().everyMinutes(5).create();
  if (existing.indexOf('processAcademicYearMaintenance_') < 0) ScriptApp.newTrigger('processAcademicYearMaintenance_').timeBased().everyDays(1).atHour(3).create();
  return true;
}
"""
    source = append_section(source, 'UnifiedTriggers.gs', body)
    legacy = r"""function installNotificationTrigger() {
  return installDavomatTriggers();
}"""
    if 'function installNotificationTrigger(' in source:
        source = replace_function(source, 'installNotificationTrigger', legacy)
    else:
        source += '\n\n' + legacy + '\n'
    return source

funcs = {1:task1,2:task2,3:task3,4:task4,5:task5,6:task6,7:task7,8:task8}
if task not in funcs:
    raise SystemExit('task must be 1..8')
s = funcs[task](s)
PATH.write_text(s, encoding='utf-8')
print(f'applied task {task}')
