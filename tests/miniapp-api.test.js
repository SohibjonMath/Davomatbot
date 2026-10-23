const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert');

const code = fs.readFileSync('Code.gs', 'utf8');
const now = Math.floor(Date.now()/1000);
const TOKEN = '9999999:TELEGRAM_BOT_TEST_TOKEN';
const today = '2026-10-23';
const users = [
  {telegram_id:'100',full_name:'Teacher',role:'TEACHER',class_id:5,active:true},
  {telegram_id:'200',full_name:'Other',role:'TEACHER',class_id:6,active:true}
];
const db = {
  USERS: users,
  CLASSES: [
    {class_id:5,class_name:'6-02',active:true},
    {class_id:6,class_name:'7-01',active:true}
  ],
  STUDENTS: [
    {student_id:1,full_name:'Ali',class_id:5,active:true},
    {student_id:2,full_name:'Madina',class_id:5,active:true}
  ],
  ACADEMIC_YEARS: [{
    year_id:'2026-2027',title:'2026/2027',start_date:'2026-09-02',
    end_date:'2027-05-25',status:'ACTIVE'
  }],
  CALENDAR: [],
  _DAVOMAT_BAZA: [
    {date:'2026-10-15',class_id:5,student_id:1,status:'KELDI'},
    {date:'2026-10-15',class_id:5,student_id:2,status:'SABABLI'}
  ]
};
// Strictly emulate Apps Script's HMAC overloads. Mixing String and Byte[] throws.
const sign = (value,key) => {
  const strings=typeof value==='string' && typeof key==='string';
  const bytes=Array.isArray(value) && Array.isArray(key);
  if(!strings && !bytes)throw new TypeError('computeHmacSha256Signature does not accept mixed types');
  const input=strings?Buffer.from(value,'utf8'):Buffer.from(value.map(v=>v&255));
  const secret=strings?Buffer.from(key,'utf8'):Buffer.from(key.map(v=>v&255));
  return Array.from(crypto.createHmac('sha256',secret).update(input).digest(),v=>v>127?v-256:v);
};
const ctx = {
  console,Date,JSON,Math,Object,Array,String,Number,Boolean,RegExp,Error,isFinite,parseInt,
  Utilities:{
    computeHmacSha256Signature:sign,
    newBlob: text => ({
      getBytes: () => Array.from(Buffer.from(text,'utf8'),v=>v>127?v-256:v)
    })
  },
  SpreadsheetApp:{},LockService:{}
};
vm.createContext(ctx);
vm.runInContext(code,ctx);
ctx.getTelegramToken_ = () => TOKEN;
ctx.getSuperAdminId_ = () => null;
ctx.getRowsAsObjects_ = name => db[name] || [];
ctx.listActiveClasses_ = () => db.CLASSES;
ctx.getActiveAcademicYear_ = () => db.ACADEMIC_YEARS[0];
ctx.getSpreadsheet_ = () => ({getSheetByName:()=>null});
ctx.todayKey_ = () => today;

function initData(userId,authDate=now,firstName='') {
  const user=JSON.stringify(firstName?{id:userId,first_name:firstName}:{id:userId});
  const body='auth_date='+authDate+'\nquery_id=xx\nuser='+user;
  const secret=crypto.createHmac('sha256','WebAppData').update(TOKEN).digest();
  const hash=crypto.createHmac('sha256',secret).update(body).digest('hex');
  return new URLSearchParams({
    user:user,
    query_id:'xx',auth_date:String(authDate),hash
  }).toString();
}
const fn=name=>vm.runInContext(name,ctx);
const data=initData(100);
const user=fn('fastAppParseInitData_')(data);
assert.strictEqual(String(user.id),'100');
assert.strictEqual(fn('fastAppParseInitData_')(initData(100,now,'Öquvçi')).first_name,'Öquvçi');
const loaded=fn('fastAppApi_')({action:'bootstrap',initData:data});
assert.strictEqual(loaded.classes.length,1,'teachers should only see their own class');
assert.strictEqual(loaded.classes[0].name,'6-02');
assert.strictEqual(loaded.students.length,2);
const month=fn('fastAppApi_')({action:'month',initData:data,classId:'5',month:'2026-10'});
assert.strictEqual(month.dates['2026-10-15']['2'],'SABABLI');
assert.throws(()=>fn('fastAppApi_')({action:'month',initData:data,classId:'6',month:'2026-10'}),/Ruxsat/);
assert.throws(()=>fn('fastAppApi_')({action:'save',initData:data,classId:'6',dates:['2026-10-15'],entries:[]}),/Ruxsat/);
const tampered=new URLSearchParams(data);
tampered.set('query_id','altered');
assert.throws(()=>fn('fastAppParseInitData_')(tampered.toString()),/tasdi/i);
const parsed=new URLSearchParams(data);
parsed.set('user',JSON.stringify({id:200}));
assert.throws(()=>fn('fastAppParseInitData_')(parsed.toString()),/tasdi/i);
assert.throws(()=>fn('fastAppParseInitData_')(initData(100,now-90000)),/eskirgan/);
assert.throws(()=>fn('fastAppParseInitData_')(''),/Telegram/);
console.log('Signed Telegram auth, class permissions and one-call month API passed');
