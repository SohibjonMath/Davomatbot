const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync('Code.gs', 'utf8');
const ctx = { console, Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error, isFinite, parseInt };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(code, ctx);
const SHEETS = vm.runInContext('SHEETS', ctx);
const db = {};
Object.keys(SHEETS).forEach(k => db[SHEETS[k]] = []);
db[SHEETS.ACADEMIC_YEARS] = [{
  year_id:'2027-2028', title:'2027/2028', start_date:'2027-09-02', end_date:'2028-05-25',
  promotion_date:'2028-06-01', status:'PLANNED', promoted_at:'', activated_at:''
}];
db[SHEETS.CLASSES] = [
  {class_id:1,class_name:'6-01',teacher_telegram_id:'100',active:true,start_year_id:'2026-2027',archived_year_id:'',archived_at:''},
  {class_id:2,class_name:'5-01',teacher_telegram_id:'',active:false,start_year_id:'2027-2028',archived_year_id:'',archived_at:''}
];
db[SHEETS.CLASS_HISTORY] = [
  {class_id:1,academic_year_id:'2026-2027',class_name:'5-01',grade:5,section:'01',teacher_telegram_id:'100',active_from:'2026-09-02',active_to:'2027-06-01',status:'PROMOTED'}
];
ctx.getRowsAsObjects_ = name => (db[name] || []).map((row,index) => ({...row,_row:index+2}));
ctx.findRowByValue_ = (name,col,value) => ctx.getRowsAsObjects_(name).find(row => String(row[col]) === String(value)) || null;
ctx.appendObjectRow_ = (name,obj) => { db[name].push({...obj}); return obj; };
ctx.updateObjectRow_ = (name,rowNumber,updates) => Object.assign(db[name][Number(rowNumber)-2],updates);
ctx.listActiveRows_ = name => ctx.getRowsAsObjects_(name).filter(row => row.active === true || String(row.active).toLowerCase() === 'true');

const activate = vm.runInContext('activatePlannedAcademicYears_', ctx);
activate('2027-09-02');
if (db[SHEETS.CLASSES][1].active !== true) throw new Error('planned 5th grade was not activated');
let current = db[SHEETS.CLASS_HISTORY].filter(row => row.academic_year_id === '2027-2028');
if (!current.some(row => String(row.class_id) === '1' && row.class_name === '6-01')) {
  throw new Error('continuing class did not receive new-year history snapshot');
}
if (!current.some(row => String(row.class_id) === '2' && row.class_name === '5-01')) {
  throw new Error('planned 5th grade did not receive history snapshot');
}
activate('2027-09-02');
current = db[SHEETS.CLASS_HISTORY].filter(row => row.academic_year_id === '2027-2028');
if (current.length !== 2) throw new Error('activation is not idempotent; duplicate history rows created');
console.log('activation history regression passed');
