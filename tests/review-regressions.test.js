const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync('Code.gs','utf8');
const ctx = { console, Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error, isFinite, parseInt };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(code,ctx);
const expr = source => vm.runInContext(source,ctx);
const fn = name => expr(name);
const assert = (condition,message) => { if(!condition) throw new Error(message); };
const SHEETS = expr('SHEETS');

// Existing production data may contain a leading zero in grade 5.
assert(fn('nextClassName_')('05-01') === '6-01', '05-01 must promote to 6-01');

// A next-year planned 5-01 must be allowed while this year's 5-01 cohort is still active.
const db = {};
Object.keys(SHEETS).forEach(k => db[SHEETS[k]] = []);
db[SHEETS.ACADEMIC_YEARS] = [
  {year_id:'2026-2027',title:'2026/2027',start_date:'2026-09-02',end_date:'2027-05-25',promotion_date:'2027-06-01',status:'ACTIVE'},
  {year_id:'2027-2028',title:'2027/2028',start_date:'2027-09-02',end_date:'2028-05-25',promotion_date:'2028-06-01',status:'PLANNED'}
];
db[SHEETS.CLASSES] = [
  {class_id:1,class_name:'5-01',teacher_telegram_id:'100',active:true,start_year_id:'2026-2027',archived_year_id:'',archived_at:''}
];
ctx.getRowsAsObjects_ = name => (db[name] || []).map((row,index)=>({...row,_row:index+2}));
ctx.findRowByValue_ = (name,col,value) => ctx.getRowsAsObjects_(name).find(row=>String(row[col])===String(value)) || null;
ctx.appendObjectRow_ = (name,obj) => { db[name].push({...obj}); return obj; };
ctx.updateObjectRow_ = (name,rowNumber,updates) => Object.assign(db[name][Number(rowNumber)-2],updates);
ctx.nextNumericId_ = (name,col) => (db[name] || []).reduce((m,row)=>Math.max(m,Number(row[col])||0),0)+1;
ctx.listActiveRows_ = name => ctx.getRowsAsObjects_(name).filter(row=>row.active===true||String(row.active).toLowerCase()==='true');
const admin = {telegramId:'10',role:'ADMIN'};
const planned = fn('createClassForAcademicYear_')(admin,'2027-2028','5-01');
assert(planned.classId === 2 && planned.active === false, 'planned 5-01 should get a new inactive class_id');
let duplicateRejected = false;
try { fn('createClassForAcademicYear_')(admin,'2027-2028','5-01'); } catch (_e) { duplicateRejected = true; }
assert(duplicateRejected, 'second planned 5-01 for the same year must be rejected');

// Multi-year class rows need their own denominator, not the whole interval denominator.
const years = [
  {year_id:'2026-2027',start_date:'2026-09-02',end_date:'2027-05-25',status:'ARCHIVED'},
  {year_id:'2027-2028',start_date:'2027-09-02',end_date:'2028-05-25',status:'ACTIVE'}
];
const history = [
  {class_id:'A',academic_year_id:'2026-2027',class_name:'6-01',teacher_telegram_id:'100',status:'PROMOTED'},
  {class_id:'A',academic_year_id:'2027-2028',class_name:'7-01',teacher_telegram_id:'100',status:'ACTIVE'}
];
const model = fn('buildStatisticsRangeModelFromRows_')([], [{student_id:1,full_name:'Ali',class_id:'A',active:true}], [
  {date:'2026-10-12',academic_year_id:'2026-2027',class_id:'A',student_id:1,status:'KELDI',updated_by:'100',updated_at:'2026-10-12T08:00:00Z'},
  {date:'2027-09-02',academic_year_id:'2027-2028',class_id:'A',student_id:1,status:'KELDI',updated_by:'100',updated_at:'2027-09-02T08:00:00Z'}
], [{telegram_id:'100',full_name:'Teacher',role:'TEACHER',class_id:'A',active:true}], '999', '2026-10-12','2027-09-02', years, history, []);
const oldClass = model.classes.find(item=>item.className==='6-01');
assert(Number(oldClass.schoolDays) === Number(oldClass.submittedDays) + Number(oldClass.missingDays), 'class-specific school-day denominator missing');
assert(oldClass.schoolDays < model.schoolDays, 'historic class denominator must not use entire multi-year interval');
assert(code.includes("item.schoolDays || model.schoolDays"), 'range class UI must use class-specific denominator');

// Today's non-school day should stop before rendering an editable attendance form.
assert(code.includes("dateKey === todayKey_() && !isSchoolDay_(dateKey)"), 'today non-school-day attendance form is not blocked early');
console.log('review regressions passed');
