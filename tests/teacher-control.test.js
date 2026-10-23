const fs=require('fs');
const vm=require('vm');
const assert=require('assert');
const code=fs.readFileSync('Code.gs','utf8');
const context={Date,JSON,Math,Object,String,Number,Array,Boolean,RegExp,Error,console};
vm.createContext(context);vm.runInContext(code,context);
const db={
  CLASSES:[
    {class_id:1,class_name:'5-01',active:true,teacher_telegram_id:'101'},
    {class_id:2,class_name:'6-01',active:true,teacher_telegram_id:'102'},
    {class_id:3,class_name:'7-01',active:true,teacher_telegram_id:'103'},
    {class_id:4,class_name:'8-01',active:true,teacher_telegram_id:''}
  ],
  STUDENTS:[
    {student_id:11,class_id:1,active:true},{student_id:12,class_id:1,active:true},
    {student_id:21,class_id:2,active:true},{student_id:22,class_id:2,active:true},
    {student_id:31,class_id:3,active:true},{student_id:41,class_id:4,active:true}
  ],
  USERS:[{telegram_id:'101',full_name:'Rahbar A',active:true},{telegram_id:'102',full_name:'Rahbar B',active:true},
    {telegram_id:'103',full_name:'Rahbar C',active:true}],
  ACADEMIC_YEARS:[{year_id:'2026-2027',start_date:'2026-09-02',end_date:'2027-05-25',status:'ACTIVE'}],
  CALENDAR:[],_DAVOMAT_BAZA:[]
};
const current='2026-10-23';
const table={ids:[[11],[12],[21],[22],[31],[41]],marks:[['+'],['s'],['-'],[''],[''],['']]};
context.todayKey_=()=>current;
context.getRowsAsObjects_=name=>db[name]||[];
context.getSpreadsheet_=()=>({getSheetByName:()=>({
  getLastColumn:()=>4,getLastRow:()=>7,
  getRange:(row,col,height,width)=>({
    getDisplayValues:()=>[['2026-10-23']],
    getValues:()=>col===3?table.ids:table.marks
  })
})});
const evaluate=name=>vm.runInContext(name,context);
const admin={role:'ADMIN',telegramId:'500'};
const model=evaluate('fastAppControl_')(admin,current);
assert.strictEqual(model.total,4);
assert.strictEqual(model.done,1);
assert.strictEqual(model.partial,1);
assert.strictEqual(model.missing,1);
assert.strictEqual(model.unassigned,1);
const byName=Object.fromEntries(Array.from(model.items,x=>[x.name,x]));
assert.strictEqual(byName['5-01'].status,'done');
assert.strictEqual(byName['5-01'].teacherName,'Rahbar A');
assert.strictEqual(byName['6-01'].status,'partial');
assert.strictEqual(byName['7-01'].status,'missing');
assert.strictEqual(byName['8-01'].status,'unassigned');
assert.strictEqual(byName['5-01'].keldi,1);
assert.strictEqual(byName['5-01'].sababli,1);
assert.throws(()=>evaluate('fastAppControl_')({role:'TEACHER',telegramId:'101',classId:'1'},current),/Ruxsat/);
assert.throws(()=>evaluate('fastAppControl_')(admin,'2026-11-03'),/Sana/);
console.log('Admin class-teacher oversight returns correct full/partial/missing/unassigned status and teacher names');
