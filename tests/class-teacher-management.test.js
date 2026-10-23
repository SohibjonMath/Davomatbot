const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync('Code.gs', 'utf8');
const db = {
  CLASSES: [
    {class_id:4,class_name:'5-01',teacher_telegram_id:'101',active:true},
    {class_id:5,class_name:'6-01',teacher_telegram_id:'105',active:true}
  ],
  USERS: [
    {telegram_id:'101',full_name:'Old Teacher',role:'TEACHER',class_id:'4',active:true},
    {telegram_id:'105',full_name:'Other Teacher',role:'TEACHER',class_id:'5',active:true},
    {telegram_id:'106',full_name:'Admin',role:'ADMIN',class_id:'',active:true}
  ],
  STUDENTS: [{student_id:11,full_name:'Pupil',class_id:4,active:true}],
  _DAVOMAT_BAZA: [{date:'2026-10-19',class_id:4,student_id:11,status:'KELDI'}],
  ACADEMIC_YEARS: [{year_id:'2026-2027',status:'ACTIVE',start_date:'2026-09-02',end_date:'2027-05-25'}],
  CLASS_HISTORY: [{class_id:4,academic_year_id:'2026-2027',teacher_telegram_id:'101',class_name:'5-01'}]
};
let locks=0,releases=0;
const context = {
  console,Date,JSON,Math,Object,Array,String,Number,Boolean,RegExp,Error,
  LockService:{getScriptLock:()=>({waitLock(){locks++;},releaseLock(){releases++;}})}
};
vm.createContext(context);
vm.runInContext(code,context);
context.getSuperAdminId_=()=> '999';
context.getRowsAsObjects_=name=>(db[name]||[]).map((row,i)=>({...row,_row:i+2}));
context.findRowByValue_=(sheet,key,value)=>context.getRowsAsObjects_(sheet)
  .find(row=>String(row[key])===String(value))||null;
context.updateObjectRow_=(sheet,row,updates)=>Object.assign(db[sheet][row-2],updates);
context.appendObjectRow_=(sheet,row)=>{(db[sheet] ||= []).push({...row});return row;};
context.todayKey_=()=> '2026-10-23';

const call=name=>vm.runInContext(name,context);
const admin={role:'ADMIN',telegramId:'106'};
const teacher={role:'TEACHER',telegramId:'101',classId:'4'};

assert.throws(()=>call('changeClassTeacher_')(teacher,4,'101','',''),/Ruxsat/);
assert.throws(()=>call('changeClassTeacher_')(admin,4,'outdated','',''),/o‘zgargan/);
const removed=call('fastAppManage_')(admin,'class.teacher.remove',{classId:'4',expectedTeacherId:'101'});
assert.strictEqual(removed.teacherId,'');
assert.strictEqual(db.CLASSES[0].teacher_telegram_id,'');
assert.strictEqual(db.USERS[0].role,'REVOKED');
assert.strictEqual(db.USERS[0].active,false);
assert.strictEqual(db.USERS[0].class_id,'');
assert.strictEqual(db.CLASS_HISTORY[0].teacher_telegram_id,'');
assert.strictEqual(db.STUDENTS.length,1);
assert.strictEqual(db._DAVOMAT_BAZA.length,1);
assert.throws(()=>call('claimClass_')('101','Old Teacher',4),/bekor qilingan/);
assert.throws(()=>call('fastAppManage_')(admin,'class.teacher.assign',
  {classId:4,expectedTeacherId:'',id:'105',name:'Other Teacher'}),/boshqa sinf/);
assert.throws(()=>call('fastAppManage_')(admin,'class.teacher.assign',
  {classId:4,expectedTeacherId:'',id:'106',name:'Admin'}),/Administratorni/);
assert.throws(()=>call('fastAppManage_')(admin,'class.teacher.assign',
  {classId:4,expectedTeacherId:'',id:'999',name:'Root'}),/SUPER ADMIN/);
call('fastAppManage_')(admin,'class.teacher.assign',{
  classId:4,expectedTeacherId:'',id:'101',name:'Old Teacher'
});
assert.strictEqual(db.USERS[0].role,'TEACHER');
assert.strictEqual(db.USERS[0].active,true);
const replacement=call('fastAppManage_')(admin,'class.teacher.assign',{
  classId:4,expectedTeacherId:'101',id:'108',name:'New Teacher'
});
assert.strictEqual(replacement.teacherId,'108');
assert.strictEqual(db.CLASS_HISTORY[0].teacher_telegram_id,'108');
assert.strictEqual(db.USERS[0].role,'REVOKED');
assert.strictEqual(db.USERS.find(row=>row.telegram_id==='108').active,true);
assert.throws(()=>call('changeClassTeacher_')(admin,4,'101','',''),/o‘zgargan/);
assert.strictEqual(locks,releases,'Locks must be released even after rejected actions');

console.log('Class teacher remove/assign/reassign safety and attendance preservation passed');
