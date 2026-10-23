const fs=require('fs');
const vm=require('vm');
const assert=require('assert');
const code=fs.readFileSync('Code.gs','utf8');
const ctx={
  Date,Number,String,Object,Array,Boolean,Math,JSON,RegExp,Error,isFinite,console,
  Session:{getScriptTimeZone:()=> 'Asia/Tashkent'},
  Utilities:{formatDate:(date,tz,fmt)=>{
    assert.strictEqual(tz,'Asia/Tashkent');
    assert.strictEqual(fmt,'HH:mm');
    return new Date(date.getTime()+5*3600000).toISOString().slice(11,16);
  }}
};
vm.createContext(ctx);
vm.runInContext(code,ctx);
const fn=name=>vm.runInContext(name,ctx);
const normalize=fn('normalizeNotificationTime_');
const stored=fn('storedNotificationTime_');
const cases=[
  ['07:00','07:00'],
  ['7:00','07:00'],
  ['09:15:00','09:15'],
  ['7:30 AM','07:30'],
  ['9:15 PM','21:15'],
  [new Date('1899-12-30T02:00:00.000Z'),'07:00'],
  ['1899-12-30T02:00:00.000Z','07:00'],
  [0.375,'09:00'],
  [0,'00:00']
];
cases.forEach(([value,expected])=>assert.strictEqual(normalize(value),expected));
assert.strictEqual(stored(null,'08:00'),'08:00');
assert.strictEqual(stored('bad-old-value','08:00'),'08:00');
assert.throws(()=>normalize('25:00'),/noto‘g‘ri/);
assert.throws(()=>normalize('bad-user-value'),/HH:MM/);

const settings=fn('notificationSettingsFromRow_')({
  telegram_id:'123',notifications_enabled:true,
  notification_time:new Date('1899-12-30T02:00:00.000Z'),
  reminder_end_time:'1899-12-30T07:00:00.000Z',
  reminder_mode:'repeat',reminder_interval_minutes:5
},'123');
assert.strictEqual(settings.time,'07:00');
assert.strictEqual(settings.endTime,'12:00');
assert.strictEqual(settings.interval,5);
assert.strictEqual(settings.mode,'repeat');

const corrupt=fn('notificationSettingsFromRow_')({
  telegram_id:'123',reminder_mode:'once',
  notification_time:'legacy-incorrect',reminder_end_time:''
},'123');
assert.strictEqual(corrupt.time,'08:00');
assert.strictEqual(corrupt.endTime,'12:00');
console.log('PASS: legacy Google Sheets reminder time formats and Mini App settings load');
