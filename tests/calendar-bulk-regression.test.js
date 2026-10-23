const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync('Code.gs','utf8');
const cache = new Map();
const calls = [];
const ctx = {console,Date,JSON,Math,Object,Array,String,Number,Boolean,RegExp,Error,isFinite,parseInt};
vm.createContext(ctx);
vm.runInContext(code,ctx);
const db = {
  CLASSES:[{class_id:'5',class_name:'6-02',active:true}],
  STUDENTS:[
    {student_id:1,full_name:'Ali',class_id:5,active:true},
    {student_id:2,full_name:'Madina',class_id:5,active:true}
  ],
  ACADEMIC_YEARS:[{
    year_id:'2026-2027',start_date:'2026-09-02',
    end_date:'2027-05-25',status:'ACTIVE'
  }],
  CALENDAR:[{
    start_date:'2026-10-19',end_date:'2026-10-19',
    type:'VACATION',active:true
  }],
  _DAVOMAT_BAZA:[{
    date:'2026-10-15',class_id:5,student_id:1,status:'KELDI'
  }]
};
ctx.getRowsAsObjects_=name=>db[name]||[];
ctx.findRowByValue_=(name,column,value)=>
  (db[name]||[]).find(row=>String(row[column])===String(value))||null;
ctx.todayKey_=()=> '2026-10-23';
ctx.CacheService={getScriptCache:()=>({
  get:key=>cache.get(key),
  put:(key,value)=>cache.set(key,value),
  remove:key=>cache.delete(key)
})};
ctx.sendMessage_=(chat,text,markup)=>calls.push({method:'send',text,markup});
ctx.editMessage_=(chat,id,text,markup)=>calls.push({method:'edit',text,markup});
ctx.editMessageReplyMarkup_=(chat,id,markup)=>calls.push({method:'markup',markup});
ctx.answerCallback_=(id,text)=>calls.push({method:'ack',text});
const fn = name=>vm.runInContext(name,ctx);
const actor={telegramId:'100',role:'TEACHER',classId:'5'};
const view=fn('attendanceCalendarView_')(actor,'5','2026-10');
const buttons=view.replyMarkup.inline_keyboard.flat();
assert(buttons.some(b=>b.text.startsWith('◐15')),'partial saved status');
assert(buttons.some(b=>b.text.startsWith('○14')),'unsent status');
assert(buttons.some(b=>b.text.startsWith('⛔19')),'vacation status');
assert(buttons.some(b=>b.text.startsWith('⏸24')),'weekend status');
assert(buttons.some(b=>b.text.startsWith('⏳26')),'future status');
assert(fn('attendanceEditableDate_')('2026-09-02'),'first school day');
assert.throws(()=>fn('attendanceEditableDate_')('2026-09-01'));
assert.throws(()=>fn('attendanceEditableDate_')('2026-10-19'));
assert.throws(()=>fn('attendanceEditableDate_')('2026-10-24'));
const callback=data=>fn('handleCallback_')({
  data,id:'test',message:{chat:{id:100},message_id:55}
},actor,true);
callback('att:multi:5:2026-10');
callback('att:pick:5:2026-10-15');
callback('att:pick:5:2026-09-02');
callback('att:bulkform:5');
let prev=calls.length;
callback('att:bmode:5:SABABSIZ');
assert.strictEqual(calls.length,prev,'no redundant Telegram edit');
callback('att:bmode:5:SABABLI');
callback('att:bmark:5:2');
callback('att:breview:5');
let draft=fn('attendanceBulkGet_')(actor,'5');
assert.deepStrictEqual(Array.from(draft.dates),['2026-09-02','2026-10-15']);
assert.strictEqual(draft.entries[1].status,'SABABLI');
assert.strictEqual(draft.stage,'review');
assert(calls.at(-1).text.includes('avval davomat berilgan'),'overwrite confirmation');
assert.strictEqual(calls.filter(x=>x.method==='markup').length,2);

const date = new Date('2026-09-01T19:00:00.000Z');
ctx.Session={getScriptTimeZone:()=> 'Asia/Tashkent'};
ctx.Utilities={formatDate:d=>new Date(d.getTime()+5*3600000).toISOString().slice(0,10)};
assert.strictEqual(fn('statisticsDateKey_')(date),'2026-09-02','native Sheets Date timezone');
assert(fn('findAcademicYearForDateFromRows_')([{
  start_date:date,end_date:new Date('2027-05-24T19:00:00.000Z')
}], '2026-09-02'),'native Date must match year');
console.log('Calendar and bulk callback regressions passed');
