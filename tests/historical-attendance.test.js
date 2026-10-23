const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync('Code.gs', 'utf8');
const db = {
  CLASSES: [{class_id:'5',class_name:'5-01',active:true}],
  ACADEMIC_YEARS: [{
    year_id:'2026-2027',start_date:'2026-09-02',
    end_date:'2027-05-25',status:'ACTIVE'
  }],
  CALENDAR: [
    {start_date:'2026-10-19',end_date:'2026-10-19',type:'VACATION',active:true},
    {start_date:'2026-10-24',end_date:'2026-10-24',type:'WORKDAY',active:true}
  ]
};
const messages = [], opened = [];
const ctx = {console,Date,JSON,Math,Object,Array,String,Number,Boolean,RegExp,Error,isFinite,parseInt};
vm.createContext(ctx);
vm.runInContext(code,ctx);
ctx.getRowsAsObjects_ = name => db[name] || [];
ctx.findRowByValue_ = (name,column,value) =>
  (db[name] || []).find(row => String(row[column]) === String(value)) || null;
ctx.todayKey_ = () => '2026-10-23';
ctx.sendMessage_ = (chatId,text,replyMarkup) =>
  messages.push({kind:'send',chatId,text,replyMarkup});
ctx.editMessage_ = (chatId,messageId,text,replyMarkup) =>
  messages.push({kind:'edit',chatId,messageId,text,replyMarkup});
ctx.getAttendanceDraft_ = (_actor,classId,date) => {
  opened.push({classId,date});
  return [{studentId:1,fullName:'Test Student',status:'KELDI'}];
};
ctx.getAttendanceMode_ = () => 'SABABSIZ';
const fn = name => vm.runInContext(name,ctx);
const admin = {role:'ADMIN',telegramId:'100'};
const teacher = {role:'TEACHER',telegramId:'200',classId:'5'};
const year = db.ACADEMIC_YEARS[0];
const sep = fn('attendanceMonthDates_')('2026-09',year,db.CALENDAR,'2026-10-23');
const oct = fn('attendanceMonthDates_')('2026-10',year,db.CALENDAR,'2026-10-23');
assert.strictEqual(sep[0],'2026-09-02','all school days since start must be present');
assert.ok(!sep.includes('2026-09-01'));
assert.ok(!oct.includes('2026-10-19'),'vacation excluded');
assert.ok(!oct.includes('2026-10-24'),'future custom workday excluded');
assert.ok(oct.includes('2026-10-23'),'today available');
const firstMonth = fn('attendanceCalendarView_')(teacher,'5','2026-09');
const currentMonth = fn('attendanceCalendarView_')(admin,'5','2026-10');
const buttons = view => view.replyMarkup.inline_keyboard.flat();
assert.ok(buttons(firstMonth).some(b => b.callback_data === 'att:day:5:2026-09-02'));
assert.ok(buttons(firstMonth).some(b => b.callback_data === 'att:days:5:2026-10'));
assert.ok(buttons(currentMonth).some(b => b.callback_data === 'att:days:5:2026-09'));
assert.ok(!buttons(currentMonth).some(b => b.callback_data === 'att:day:5:2026-10-19'));
fn('attendanceEditableDate_')('2026-09-02');
fn('attendanceEditableDate_')('2026-10-23');
for (const date of ['2026-09-01','2026-10-19','2026-10-24','2027-05-25','bogus']) {
  assert.throws(() => fn('attendanceEditableDate_')(date),undefined,date+' must be blocked');
}
assert.throws(() => fn('attendanceCalendarView_')(
  {role:'TEACHER',telegramId:'300',classId:'6'},'5','2026-10'
),/Ruxsat/);
assert.throws(() => fn('attendanceCalendarView_')(teacher,'5','2026-08'));
assert.throws(() => fn('attendanceCalendarView_')(teacher,'5','2026-11'));
fn('showAttendanceForClass_')(200,null,teacher,'5','2026-09-02',false);
assert.strictEqual(opened[0].date,'2026-09-02','past unsaved form can open');
assert.ok(buttons({replyMarkup:messages[0].replyMarkup})
  .some(b => b.callback_data === 'att:days:5:2026-09'),'form needs calendar navigation');
fn('showHistory_')(200,teacher,'5');
assert.ok(messages.at(-1).text.includes('2026-10'),'history must offer complete current month');
console.log('Historical attendance date/calendar regression passed');
