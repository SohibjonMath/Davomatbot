const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync('Code.gs','utf8');
const context = { console };
vm.createContext(context);
vm.runInContext(code, context);
const must = (cond, msg) => { if (!cond) { console.error(msg); process.exit(1); } };
must(typeof context.parseStatisticsRangeInput_ === 'function', 'missing range parser');
must(typeof context.buildStatisticsRangeModelFromRows_ === 'function', 'missing range model');
must(typeof context.applyAttendanceModeToEntries_ === 'function', 'missing fast attendance helper');
must(typeof context.normalizeNotificationTime_ === 'function', 'missing notification time normalizer');
must(typeof context.notificationDueNow_ === 'function', 'missing notification due helper');
const parsed = context.parseStatisticsRangeInput_('2026-10-01 - 2026-10-15');
must(parsed.start === '2026-10-01' && parsed.end === '2026-10-15', 'range parse failed');
const classes = [
  {_row:2,class_id:'A',class_name:'6-01',teacher_telegram_id:'100',active:true},
  {_row:3,class_id:'B',class_name:'7-01',teacher_telegram_id:'200',active:true}
];
const students = [
  {student_id:1,full_name:'Ali',class_id:'A',active:true},
  {student_id:2,full_name:'Madina',class_id:'A',active:true},
  {student_id:3,full_name:'Sardor',class_id:'B',active:true}
];
const attendance = [
  {date:'2026-10-14',class_id:'A',student_id:1,status:'KELDI',updated_by:'100',updated_at:'2026-10-14T08:00:00.000Z'},
  {date:'2026-10-14',class_id:'A',student_id:2,status:'SABABSIZ',updated_by:'100',updated_at:'2026-10-14T08:00:00.000Z'},
  {date:'2026-10-15',class_id:'A',student_id:1,status:'KELDI',updated_by:'100',updated_at:'2026-10-15T08:00:00.000Z'},
  {date:'2026-10-15',class_id:'A',student_id:2,status:'SABABLI',updated_by:'100',updated_at:'2026-10-15T08:00:00.000Z'}
];
const users = [
  {telegram_id:'100',full_name:'Teacher A',role:'TEACHER',class_id:'A',active:true},
  {telegram_id:'200',full_name:'Teacher B',role:'TEACHER',class_id:'B',active:true}
];
const model = context.buildStatisticsRangeModelFromRows_(classes, students, attendance, users, '999', '2026-10-14', '2026-10-15');
must(model.schoolDays === 2, 'schoolDays');
must(model.keldi === 2 && model.sababli === 1 && model.sababsiz === 1, 'range totals');
must(model.classes[0].submittedDays === 2 && model.classes[0].missingDays === 0, 'class A activity');
must(model.classes[1].submittedDays === 0 && model.classes[1].missingDays === 2, 'class B missing');
must(model.topAbsences[0].studentName === 'Madina' && model.topAbsences[0].total === 2, 'top absences');
const entries = [{studentId:1,status:'KELDI'},{studentId:2,status:'KELDI'}];
const one = context.applyAttendanceModeToEntries_(entries, 2, 'SABABSIZ');
must(one[1].status === 'SABABSIZ', 'fast mark absent');
const two = context.applyAttendanceModeToEntries_(one, 2, 'SABABSIZ');
must(two[1].status === 'KELDI', 'fast mark toggle back');
must(context.normalizeNotificationTime_('9:05') === '09:05', 'time normalize');
must(context.notificationDueNow_('09:07','09:05') === true, 'notification due window');
must(context.notificationDueNow_('09:20','09:05') === false, 'notification stale window');
must(code.includes("SETTINGS: 'SETTINGS'"), 'SETTINGS sheet missing');
must(code.includes("telegramCall_('editMessageReplyMarkup'"), 'fast reply-markup edit missing');
must(code.includes('function processNotifications_()'), 'notification processor missing');
console.log('Upgrade behavior verified.');
