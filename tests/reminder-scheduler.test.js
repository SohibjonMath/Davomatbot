const fs=require('fs');
const vm=require('vm');
const assert=require('assert');
const code=fs.readFileSync('Code.gs','utf8');
const tests=[];
const nowBase=Date.parse('2026-10-23T02:00:00.000Z'); // 07:00 in Uzbekistan
let instant=nowBase,schoolDay=true;
class TestDate extends Date {
  constructor(...args){super(...(args.length?args:[instant]));}
  static now(){return instant;}
}
const sheets={
  SETTINGS:[
    {telegram_id:'11',reminder_mode:'off',notification_time:'07:00'},
    {telegram_id:'12',reminder_mode:'once',notification_time:'07:00'},
    {telegram_id:'13',reminder_mode:'repeat',notification_time:'09:00',reminder_end_time:'10:00',reminder_interval_minutes:1},
    {telegram_id:'14',reminder_mode:'repeat',notification_time:'07:00',reminder_end_time:'09:00',reminder_interval_minutes:1},
    {telegram_id:'15',reminder_mode:'repeat',notification_time:'07:00',reminder_end_time:'09:00',reminder_interval_minutes:1},
    {telegram_id:'16',reminder_mode:'repeat',notification_time:'07:00',reminder_end_time:'09:00',reminder_interval_minutes:5}
  ],
  USERS:[
    {telegram_id:'11',class_id:'1',role:'TEACHER',active:true},
    {telegram_id:'12',class_id:'2',role:'TEACHER',active:true},
    {telegram_id:'13',class_id:'3',role:'TEACHER',active:true},
    {telegram_id:'14',class_id:'4',role:'TEACHER',active:true},
    {telegram_id:'15',class_id:'5',role:'TEACHER',active:true},
    {telegram_id:'16',class_id:'6',role:'TEACHER',active:true}
  ],
  CLASSES:Array.from({length:6},(_,i)=>({class_id:String(i+1),class_name:(i+5)+'-01',
    teacher_telegram_id:String(i+11),active:true})),
  STUDENTS:Array.from({length:6},(_,i)=>({student_id:String(i+100),class_id:String(i+1),active:true})),
  _DAVOMAT_BAZA:[{student_id:'104',class_id:'5',status:'KELDI',date:'2026-10-23'}],
  CALENDAR:[]
};
let sent=[],lock=0,unlocked=0,triggerLog=[],currentTriggers=[],config={};
const ctx={
  Date:TestDate,JSON,Math,Object,String,Number,Array,Boolean,RegExp,Error,isFinite,parseInt,console,
  Utilities:{formatDate:(date,tz,fmt)=>{
    const local=new Date(date.getTime()+5*3600000).toISOString();
    return fmt==='HH:mm'?local.slice(11,16):local.slice(0,10);
  }},
  Session:{getScriptTimeZone:()=> 'Asia/Tashkent'},
  LockService:{getScriptLock:()=>({
    tryLock:()=>{lock++;return true;},releaseLock:()=>{unlocked++;}
  })},
  PropertiesService:{getScriptProperties:()=>({
    getProperty:name=>config[name]||null,setProperty:(name,value)=>{config[name]=value;}
  })},
  ScriptApp:{
    getProjectTriggers:()=>currentTriggers,
    deleteTrigger:t=>{triggerLog.push('deleted');currentTriggers=currentTriggers.filter(x=>x!==t);},
    newTrigger:name=>({timeBased:()=>({everyMinutes:n=>({
      create:()=>{triggerLog.push(n);currentTriggers.push({getHandlerFunction:()=>name});}
    })})})
  }
};
vm.createContext(ctx);vm.runInContext(code,ctx);
ctx.resetRequestCache_=()=>{};
ctx.getRowsAsObjects_=name=>sheets[name]||[];
ctx.getSuperAdminId_=()=> '999';
ctx.isSchoolDay_=()=>schoolDay;
ctx.listActiveClasses_=()=>sheets.CLASSES;
ctx.ensureSettingsSheet_=()=>{};
ctx.getFastDavomatUrl_=()=> 'https://davomat-imi.netlify.app/';
ctx.sendMessage_=(id,message,replyMarkup)=>sent.push({id,message,replyMarkup});
ctx.saveNotificationSettings_=(id,input)=>{
  const row=sheets.SETTINGS.find(r=>r.telegram_id===id);
  Object.assign(row,{'last_notification_date':input.lastDate||row.last_notification_date||'',
    'reminder_last_sent_at':input.lastSentAt||row.reminder_last_sent_at||'',
    'reminder_muted_date':input.mutedDate!==undefined?input.mutedDate:row.reminder_muted_date||''});
  return row;
};
const fn=name=>vm.runInContext(name,ctx);
const run=()=>fn('processNotifications_')();
run();
assert.deepStrictEqual(sent.map(x=>x.id),['12','14','16'],'Send only due unfinished teachers');
assert(sent.every(m=>m.replyMarkup.inline_keyboard[0][0].web_app.url.includes('page=attendance')));
assert(sent.every(m=>m.replyMarkup.inline_keyboard[1][0].web_app.url.includes('page=settings')));
assert(sent.every(m=>m.replyMarkup.inline_keyboard[1][1].callback_data==='rem:mute'));
assert(sent.every(m=>m.message.includes('1')),'Progress included');
assert.strictEqual(lock,unlocked);
run(); assert.strictEqual(sent.length,3,'No duplicate in same minute');
instant+=60*1000;run();
assert.deepStrictEqual(sent.map(x=>x.id),['12','14','16','14'],'Only 1-minute schedule repeats');
sheets._DAVOMAT_BAZA.push({student_id:'103',class_id:'4',status:'SABABLI',date:'2026-10-23'});
instant+=60*1000;run();
assert.strictEqual(sent.length,4,'Full attendance stops reminders immediately');
instant+=4*60*1000;run();
assert.strictEqual(sent.filter(x=>x.id==='16').length,2,'Five minute interval');
sheets.SETTINGS.find(x=>x.telegram_id==='16').reminder_muted_date='2026-10-23';
instant+=5*60*1000;run();
assert.strictEqual(sent.filter(x=>x.id==='16').length,2,'Muted date stops repeating');
schoolDay=false;instant+=60*60*1000;run();
assert.strictEqual(sent.length,5,'Holiday emits no notifications');
schoolDay=true;instant=Date.parse('2026-10-23T04:10:00Z');run();
assert.strictEqual(sent.filter(x=>x.id==='13').length,1,'09:00 user starts only after 09:00');
instant=Date.parse('2026-10-23T05:01:00Z');run();
assert.strictEqual(sent.filter(x=>x.id==='13').length,1,'Stop at configured end');
assert.strictEqual(lock,unlocked,'No leaked locks');
const once=fn('notificationSettingsFromRow_')({telegram_id:'100',notifications_enabled:true,notification_time:'08:00'},'100');
assert.strictEqual(once.mode,'once','Old saved settings retain once-daily behavior');
assert.strictEqual(fn('notificationDue_')({...once,lastDate:'2026-10-23'},new TestDate(),'09:00','2026-10-23'),false);
assert.throws(()=>fn('notificationInterval_')(0));
assert.throws(()=>fn('notificationInterval_')(61));
assert.strictEqual(fn('notificationInterval_')(1),1);
let cadence=fn('ensureNotificationTrigger_')();
assert.strictEqual(cadence,1);
sheets.SETTINGS.forEach(row=>{row.reminder_mode='off';});
cadence=fn('ensureNotificationTrigger_')();
assert.strictEqual(cadence,5);
assert(triggerLog.includes('deleted'),'Minute trigger must be retired when unused');
console.log('PASS: independent times, 1/5-minute repeats, one-time, no dupes, completed class, mute today, holidays, end time, buttons and trigger downgrade');
