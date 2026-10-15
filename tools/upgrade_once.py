from pathlib import Path
import re

p = Path('Code.gs')
s = p.read_text()

def replace_once(old, new, label):
    global s
    if old not in s:
        raise SystemExit(f'{label} not found')
    s = s.replace(old, new, 1)

def regex_replace(pattern, replacement, label):
    global s
    s2, n = re.subn(pattern, replacement, s, count=1, flags=re.S)
    if n != 1:
        raise SystemExit(f'{label} not found or ambiguous: {n}')
    s = s2

# SETTINGS schema
replace_once("  ATTENDANCE: 'ATTENDANCE'\n});", "  ATTENDANCE: 'ATTENDANCE',\n  SETTINGS: 'SETTINGS'\n});", 'SHEETS ATTENDANCE')
replace_once("  ATTENDANCE: ['date','class_id','student_id','status','updated_by','updated_at']\n});", "  ATTENDANCE: ['date','class_id','student_id','status','updated_by','updated_at'],\n  SETTINGS: ['telegram_id','notifications_enabled','notification_time','last_notification_date']\n});", 'SHEET_HEADERS ATTENDANCE')

fast_attendance = r'''function attendanceModeKey_(telegramId, classId, date) {
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
    text:String(classRow.class_name) + ' — ' + dateKey + '\\n\\nBarcha öquvçi avval Keldi hisoblanadi. Rejimni tanlang va faqat kelmagan öquvçilarni bosing.',
    replyMarkup:buildAttendanceReplyMarkup_(actor, classId, dateKey, entries),
    entries:entries
  };
}
'''
regex_replace(r"function buildAttendanceView_\(actor, classId, date\) \{.*?\n\}\n\n\n\n// ===== Statistics\.gs =====", fast_attendance + "\n\n// ===== Statistics.gs =====", 'attendance view')

extra = r'''
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

function buildStatisticsRangeModelFromRows_(classes, students, attendanceRows, users, superAdminId, startDate, endDate) {
  const activeClasses = (classes || []).filter(row => statisticsActive_(row.active));
  const activeStudents = (students || []).filter(row => statisticsActive_(row.active));
  const rangeRows = (attendanceRows || []).filter(row => {
    const d = statisticsDateKey_(row.date);
    return d >= startDate && d <= endDate;
  });
  const activeDateMap = {};
  rangeRows.forEach(row => { activeDateMap[statisticsDateKey_(row.date)] = true; });
  const activeDates = Object.keys(activeDateMap).sort();
  const classStats = activeClasses.map(classRow => {
    const classId = classIdKey_(classRow.class_id);
    const classStudents = activeStudents.filter(row => sameClassId_(row.class_id,classId));
    const classRows = rangeRows.filter(row => sameClassId_(row.class_id,classId));
    const dateMap = {};
    let keldi = 0, sababli = 0, sababsiz = 0;
    const absentMap = {};
    const studentNames = {};
    classStudents.forEach(row => studentNames[String(row.student_id)] = String(row.full_name || ''));
    classRows.forEach(row => {
      const date = statisticsDateKey_(row.date);
      dateMap[date] = true;
      if (row.status === ATTENDANCE_STATUS.KELDI) keldi += 1;
      else if (row.status === ATTENDANCE_STATUS.SABABLI || row.status === ATTENDANCE_STATUS.SABABSIZ) {
        if (row.status === ATTENDANCE_STATUS.SABABLI) sababli += 1; else sababsiz += 1;
        const sid = String(row.student_id);
        if (!absentMap[sid]) absentMap[sid] = {studentId:sid,studentName:studentNames[sid] || ('ID ' + sid),sababli:0,sababsiz:0,total:0};
        if (row.status === ATTENDANCE_STATUS.SABABLI) absentMap[sid].sababli += 1; else absentMap[sid].sababsiz += 1;
        absentMap[sid].total += 1;
      }
    });
    const teacherId = String(classRow.teacher_telegram_id || '').trim();
    return {
      sheetRow:Number(classRow._row) || 0,
      classId:classId,
      className:String(classRow.class_name || classId),
      teacherName:teacherId ? statisticsPersonName_(users,superAdminId,teacherId) : 'Rahbar tanlanmagan',
      totalStudents:classStudents.length,
      submittedDays:Object.keys(dateMap).length,
      missingDays:Math.max(0,activeDates.length - Object.keys(dateMap).length),
      keldi:keldi,sababli:sababli,sababsiz:sababsiz,
      absences:Object.keys(absentMap).map(key => absentMap[key]).sort((a,b) => b.total - a.total || a.studentName.localeCompare(b.studentName))
    };
  }).sort((a,b) => a.className.localeCompare(b.className));
  const topAbsences = [];
  classStats.forEach(item => item.absences.forEach(absent => topAbsences.push(Object.assign({classId:item.classId,className:item.className},absent))));
  topAbsences.sort((a,b) => b.total - a.total || a.studentName.localeCompare(b.studentName));
  const days = activeDates.map(date => {
    const submissions = [];
    const missing = [];
    classStats.forEach(item => {
      const rows = rangeRows.filter(row => statisticsDateKey_(row.date) === date && sameClassId_(row.class_id,item.classId));
      if (!rows.length) {
        missing.push({classId:item.classId,className:item.className,teacherName:item.teacherName});
        return;
      }
      let latest = rows[0];
      rows.forEach(row => { if (String(row.updated_at || '') > String(latest.updated_at || '')) latest = row; });
      submissions.push({classId:item.classId,className:item.className,submittedByName:statisticsPersonName_(users,superAdminId,latest.updated_by),submittedAt:String(latest.updated_at || '')});
    });
    return {date:date,submissions:submissions,missing:missing};
  });
  return {
    start:startDate,end:endDate,schoolDays:activeDates.length,
    totalClasses:classStats.length,
    totalStudents:classStats.reduce((sum,item) => sum + item.totalStudents,0),
    keldi:classStats.reduce((sum,item) => sum + item.keldi,0),
    sababli:classStats.reduce((sum,item) => sum + item.sababli,0),
    sababsiz:classStats.reduce((sum,item) => sum + item.sababsiz,0),
    classes:classStats,topAbsences:topAbsences,days:days
  };
}

function getStatisticsRangeModel_(actor) {
  if (!canViewStatistics_(actor)) throw new Error('Ruxsat yo‘q.');
  const range = getStatisticsRange_(actor.telegramId);
  const classes = typeof stabilizeAllClassIds_ === 'function' ? stabilizeAllClassIds_() : listActiveClasses_();
  return buildStatisticsRangeModelFromRows_(classes,getRowsAsObjects_(SHEETS.STUDENTS),getRowsAsObjects_(SHEETS.ATTENDANCE),getRowsAsObjects_(SHEETS.USERS),getSuperAdminId_(),range.start,range.end);
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
  const settingsRows = getRowsAsObjects_(SHEETS.SETTINGS).filter(row => row.notifications_enabled === true || String(row.notifications_enabled).toLowerCase() === 'true');
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
    } catch (error) {
      console.error('Bildirişnoma xatosi:',error && error.message ? error.message : error);
    }
    try { saveNotificationSettings_(id,{lastDate:today}); } catch (_saveError) {}
  });
}

'''
replace_once('// ===== Telegram.gs =====', extra + '// ===== Telegram.gs =====', 'Telegram marker')

replace_once("function editMessage_(chatId, messageId, text, replyMarkup) {\n  const payload = { chat_id: chatId, message_id: messageId, text: text };\n  if (replyMarkup) payload.reply_markup = replyMarkup;\n  return telegramCall_('editMessageText', payload);\n}\n", "function editMessage_(chatId, messageId, text, replyMarkup) {\n  const payload = { chat_id: chatId, message_id: messageId, text: text };\n  if (replyMarkup) payload.reply_markup = replyMarkup;\n  return telegramCall_('editMessageText', payload);\n}\n\nfunction editMessageReplyMarkup_(chatId, messageId, replyMarkup) {\n  return telegramCall_('editMessageReplyMarkup', {chat_id:chatId,message_id:messageId,reply_markup:replyMarkup});\n}\n", 'editMessage')

new_menu = r'''function buildMainMenu_(actor) {
  let keyboard = [];
  if (actor.role === ROLES.SUPER_ADMIN) {
    keyboard = [['Davomat','Statistika'],['Sinflar','Öquvçilar'],['Adminlar','Sozlamalar']];
  } else if (actor.role === ROLES.ADMIN) {
    keyboard = [['Davomat','Statistika'],['Sinflar','Öquvçilar'],['Sozlamalar']];
  } else if (actor.role === ROLES.TEACHER) {
    keyboard = [['Bugungi davomat','Öquvçilar'],['Oldingi davomatlar','Sozlamalar']];
  } else if (actor.role === ROLES.UNASSIGNED) {
    keyboard = [['Sinf tanlash']];
  }
  return { keyboard: keyboard, resize_keyboard: true, is_persistent: true };
}

function buildInlineKeyboard_'''
regex_replace(r"function buildMainMenu_\(actor\) \{.*?\n\}\n\nfunction buildInlineKeyboard_", new_menu, 'main menu')

replace_once("function setupDavomatOne() {\n  return ensureSchema_();\n}", "function setupDavomatOne() {\n  return ensureSchema_();\n}\n\nfunction installNotificationTrigger() {\n  ensureSchema_();\n  return ensureNotificationTrigger_();\n}", 'setupDavomatOne')

pending_old = "      else if (pending.type === 'ADD_ADMIN') {\n        const parsed = parseTelegramPerson_(text);\n        addAdmin_(actor, parsed.telegramId, parsed.fullName);\n      } else throw new Error('Amal topilmadi.');"
pending_new = "      else if (pending.type === 'SET_NOTIFICATION_TIME') {\n        const time = normalizeNotificationTime_(text);\n        saveNotificationSettings_(actor.telegramId,{time:time});\n        clearPendingAction_(actor.telegramId);\n        showSettings_(chatId,actor);\n        return;\n      }\n      else if (pending.type === 'STATS_RANGE') {\n        const range = parseStatisticsRangeInput_(text);\n        setStatisticsRange_(actor.telegramId,range);\n        clearPendingAction_(actor.telegramId);\n        showStatisticsRangeDashboard_(chatId,actor);\n        return;\n      }\n      else if (pending.type === 'ADD_ADMIN') {\n        const parsed = parseTelegramPerson_(text);\n        addAdmin_(actor, parsed.telegramId, parsed.fullName);\n      } else throw new Error('Amal topilmadi.');"
replace_once(pending_old,pending_new,'pending handlers')

replace_once("  if (text === 'Sozlamalar') {\n    showTeacherSettings_(chatId, actor);\n    return;\n  }", "  if (text === 'Sozlamalar') {\n    showSettings_(chatId, actor);\n    return;\n  }", 'settings text handler')
replace_once("  if (text === 'Statistika') {\n    if (!canViewStatistics_(actor)) return sendMessage_(chatId,'Ruxsat yo‘q.');\n    showStatisticsDashboard_(chatId, actor, todayKey_());\n    return;\n  }", "  if (text === 'Statistika') {\n    if (!canViewStatistics_(actor)) return sendMessage_(chatId,'Ruxsat yo‘q.');\n    showStatisticsPeriodMenu_(chatId, actor);\n    return;\n  }", 'statistics text handler')

replace_once("  const messageId = callbackQuery.message ? callbackQuery.message.message_id : null;\n  try {", "  const messageId = callbackQuery.message ? callbackQuery.message.message_id : null;\n  let callbackAnswered = false;\n  try {", 'callbackAnswered state')

fast_callbacks = r'''    } else if (p[0] === 'att' && p[1] === 'mode') {
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
'''
replace_once("    } else if (p[0] === 'att' && p[1] === 'cycle') {", fast_callbacks + "    } else if (p[0] === 'att' && p[1] === 'cycle') {", 'attendance cycle callback')
replace_once("    try { answerCallback_(callbackQuery.id); } catch (_answerError) {}\n  } catch (error) {", "    if (!callbackAnswered) { try { answerCallback_(callbackQuery.id); } catch (_answerError) {} }\n  } catch (error) {", 'callback final answer')

more_callbacks = r'''    } else if (data === 'stats:period') {
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
'''
replace_once("    } else if (data === 'admin:add') {", more_callbacks + "    } else if (data === 'admin:add') {", 'admin callback anchor')

p.write_text(s)
