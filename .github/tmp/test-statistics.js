const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync('Code.gs', 'utf8');
const context = { console };
vm.createContext(context);
vm.runInContext(code, context);
if (typeof context.buildStatisticsModelFromRows_ !== 'function') {
  console.error('Missing buildStatisticsModelFromRows_');
  process.exit(1);
}
const classes = [
  {_row:2,class_id:'A',class_name:'6-01',teacher_telegram_id:'100',active:true},
  {_row:3,class_id:'B',class_name:'7-01',teacher_telegram_id:'200',active:true}
];
const students = [
  {student_id:1,full_name:'Ali Valiyev',class_id:'A',active:true},
  {student_id:2,full_name:'Madina Karimova',class_id:'A',active:true},
  {student_id:3,full_name:'Sardor Olimov',class_id:'B',active:true}
];
const attendance = [
  {date:'2026-10-15',class_id:'A',student_id:1,status:'KELDI',updated_by:'100',updated_at:'2026-10-15T08:00:00.000Z'},
  {date:'2026-10-15',class_id:'A',student_id:2,status:'SABABSIZ',updated_by:'100',updated_at:'2026-10-15T08:00:00.000Z'}
];
const users = [
  {telegram_id:'100',full_name:'Teacher A',role:'TEACHER',class_id:'A',active:true},
  {telegram_id:'200',full_name:'Teacher B',role:'TEACHER',class_id:'B',active:true}
];
const model = context.buildStatisticsModelFromRows_(classes, students, attendance, users, '999', '2026-10-15');
const assert = (ok, msg) => { if (!ok) { console.error(msg); process.exit(1); } };
assert(model.totalClasses === 2, 'totalClasses');
assert(model.submittedCount === 1, 'submittedCount');
assert(model.missingCount === 1, 'missingCount');
assert(model.totalStudents === 3, 'totalStudents');
assert(model.keldi === 1 && model.sababsiz === 1 && model.sababli === 0, 'status totals');
assert(model.absences.length === 1 && model.absences[0].studentName === 'Madina Karimova', 'absences');
assert(model.classes[0].submittedByName === 'Teacher A', 'submitted by');
assert(model.classes[1].submitted === false && model.classes[1].teacherName === 'Teacher B', 'missing class teacher');
console.log('Admin statistics behavior verified.');
