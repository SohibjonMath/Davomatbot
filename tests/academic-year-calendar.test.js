const fs = require('fs');
const vm = require('vm');

const code = fs.readFileSync('Code.gs', 'utf8');
const ctx = { console, Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error, isFinite, parseInt };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(code, ctx);

const focus = process.argv[2] || 'all';
let failures = 0;
let ran = 0;
function selected(group) { return focus === 'all' || focus === group; }
function expr(source) { return vm.runInContext(source, ctx); }
function fn(name) { return expr(name); }
function assert(condition, message) { if (!condition) throw new Error(message); }
function equal(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error((message || 'values differ') + `\nactual=${a}\nexpected=${e}`);
}
function throws(call, contains) {
  let err = null;
  try { call(); } catch (e) { err = e; }
  assert(err, 'expected function to throw');
  if (contains) assert(String(err.message || err).includes(contains), `expected error containing ${contains}, got ${err.message}`);
}
function test(group, name, body) {
  if (!selected(group)) return;
  ran += 1;
  try { body(); console.log(`PASS [${group}] ${name}`); }
  catch (e) { failures += 1; console.error(`FAIL [${group}] ${name}: ${e.stack || e}`); }
}

function active(value) { return value === true || String(value).toLowerCase() === 'true'; }
function installMemoryDb(seed) {
  const SHEETS = expr('SHEETS');
  const db = {};
  Object.keys(SHEETS).forEach(k => { db[SHEETS[k]] = (seed[SHEETS[k]] || []).map(x => ({...x})); });
  ctx.__db = db;
  ctx.getRowsAsObjects_ = function(name) { return (db[name] || []).map((r, i) => ({...r, _row:i + 2})); };
  ctx.findRowByValue_ = function(name, col, value) { return ctx.getRowsAsObjects_(name).find(r => String(r[col]) === String(value)) || null; };
  ctx.appendObjectRow_ = function(name, obj) { if (!db[name]) db[name] = []; db[name].push({...obj}); return obj; };
  ctx.updateObjectRow_ = function(name, rowNumber, updates) { Object.assign(db[name][Number(rowNumber) - 2], updates); };
  ctx.listActiveRows_ = function(name) { return ctx.getRowsAsObjects_(name).filter(r => active(r.active)); };
  ctx.nextNumericId_ = function(name, col) { return (db[name] || []).reduce((m, r) => Math.max(m, Number(r[col]) || 0), 0) + 1; };
  ctx.setRowActive_ = function(name, col, id, value) { const r = ctx.findRowByValue_(name, col, id); if (!r) return false; ctx.updateObjectRow_(name, r._row, {active:Boolean(value)}); return true; };
  ctx.getSuperAdminId_ = () => '999';
  ctx.LockService = { getScriptLock: () => ({ waitLock(){}, releaseLock(){} }) };
  ctx.Utilities = { formatDate: (d, _tz, fmt) => {
    const iso = new Date(d).toISOString();
    if (fmt === 'yyyy-MM-dd') return iso.slice(0, 10);
    if (fmt === 'HH:mm') return iso.slice(11,16);
    return iso;
  }};
  ctx.Session = { getScriptTimeZone: () => 'Asia/Tashkent' };
  ctx.sendMessage_ = () => true;
  ctx.sendLongText_ = () => true;
  return db;
}

// Task 1 — schema
test('schema', 'declares new sheets and additive columns', () => {
  const SHEETS = expr('SHEETS');
  const H = expr('SHEET_HEADERS');
  equal([SHEETS.ACADEMIC_YEARS, SHEETS.CLASS_HISTORY, SHEETS.CALENDAR], ['ACADEMIC_YEARS','CLASS_HISTORY','CALENDAR']);
  equal(H.ACADEMIC_YEARS, ['year_id','title','start_date','end_date','promotion_date','status','promoted_at','activated_at']);
  equal(H.CLASS_HISTORY, ['class_id','academic_year_id','class_name','grade','section','teacher_telegram_id','active_from','active_to','status']);
  equal(H.CALENDAR, ['event_id','start_date','end_date','type','title','active','created_by','created_at']);
  assert(H.CLASSES.includes('start_year_id') && H.CLASSES.includes('archived_year_id') && H.CLASSES.includes('archived_at'), 'CLASSES archive fields missing');
  assert(H.STUDENTS.includes('graduated_year_id') && H.STUDENTS.includes('graduated_at'), 'STUDENTS graduation fields missing');
  assert(H.ATTENDANCE.includes('academic_year_id'), 'ATTENDANCE academic year field missing');
});

test('schema', 'mergeHeaders preserves existing order and appends only missing headers', () => {
  equal(fn('mergeHeaders_')(['class_id','class_name'], ['class_id','class_name','active']), ['class_id','class_name','active']);
  equal(fn('mergeHeaders_')(['class_name','class_id','legacy'], ['class_id','class_name','active']), ['class_name','class_id','legacy','active']);
});

// Task 2 — school day engine
test('school-day', 'validates academic year dates and overlap', () => {
  const valid = fn('validateAcademicYearInputFromRows_')({year_id:'2026-2027',title:'2026/2027',start_date:'2026-09-02',end_date:'2027-05-25',promotion_date:'2027-06-01',status:'PLANNED'}, []);
  assert(valid.year_id === '2026-2027', 'valid year rejected');
  throws(() => fn('validateAcademicYearInputFromRows_')({year_id:'x',title:'x',start_date:'2027-05-25',end_date:'2026-09-02',promotion_date:'2027-06-01',status:'PLANNED'}, []), 'sana');
  throws(() => fn('validateAcademicYearInputFromRows_')({year_id:'2027-2028',title:'x',start_date:'2027-05-20',end_date:'2028-05-25',promotion_date:'2028-06-01',status:'PLANNED'}, [{year_id:'2026-2027',start_date:'2026-09-02',end_date:'2027-05-25',status:'ARCHIVED'}]), 'kesish');
  throws(() => fn('validateAcademicYearInputFromRows_')({year_id:'b',title:'b',start_date:'2027-09-02',end_date:'2028-05-25',promotion_date:'2028-06-01',status:'ACTIVE'}, [{year_id:'a',start_date:'2026-09-02',end_date:'2027-05-25',status:'ACTIVE'}]), 'ACTIVE');
});

test('school-day', 'weekday/weekend and calendar precedence are correct', () => {
  const years = [{year_id:'2026-2027',start_date:'2026-09-02',end_date:'2027-05-25',status:'ACTIVE'}];
  const resolve = fn('resolveSchoolDayFromRows_');
  assert(resolve(years, [], '2026-10-12') === true, 'Monday should be school day');
  assert(resolve(years, [], '2026-10-17') === false, 'Saturday should be off');
  assert(resolve(years, [{start_date:'2026-10-12',end_date:'2026-10-12',type:'VACATION',active:true}], '2026-10-12') === false, 'vacation should close weekday');
  assert(resolve(years, [{start_date:'2026-10-17',end_date:'2026-10-17',type:'WORKDAY',active:true}], '2026-10-17') === true, 'WORKDAY should open weekend');
  assert(resolve(years, [
    {start_date:'2026-10-12',end_date:'2026-10-12',type:'HOLIDAY',active:true},
    {start_date:'2026-10-12',end_date:'2026-10-12',type:'WORKDAY',active:true}
  ], '2026-10-12') === true, 'WORKDAY must beat HOLIDAY');
  assert(resolve(years, [{start_date:'2026-08-01',end_date:'2026-08-01',type:'WORKDAY',active:true}], '2026-08-01') === false, 'outside academic year must stay closed');
});

// Task 3 — setup/history
test('setup', 'initialization is idempotent and backfills only in-range attendance', () => {
  const S = expr('SHEETS');
  const db = installMemoryDb({
    [S.ACADEMIC_YEARS]: [{year_id:'2026-2027',title:'2026/2027',start_date:'2026-09-02',end_date:'2027-05-25',promotion_date:'2027-06-01',status:'PLANNED',promoted_at:'',activated_at:''}],
    [S.CLASSES]: [{class_id:1,class_name:'6-01',teacher_telegram_id:'100',active:true,start_year_id:'',archived_year_id:'',archived_at:''}],
    [S.STUDENTS]: [{student_id:1,full_name:'Ali',class_id:1,active:true,graduated_year_id:'',graduated_at:''}],
    [S.ATTENDANCE]: [
      {date:'2026-10-10',class_id:1,student_id:1,status:'KELDI',updated_by:'100',updated_at:'x',academic_year_id:''},
      {date:'2026-08-10',class_id:1,student_id:1,status:'KELDI',updated_by:'100',updated_at:'x',academic_year_id:''}
    ],
    [S.CLASS_HISTORY]: [], [S.USERS]: [], [S.CALENDAR]: [], [S.SETTINGS]: []
  });
  ctx.todayKey_ = () => '2026-10-16';
  fn('initializeCurrentAcademicYear_')({telegramId:'999',role:'SUPER_ADMIN'}, '2026-2027');
  fn('initializeCurrentAcademicYear_')({telegramId:'999',role:'SUPER_ADMIN'}, '2026-2027');
  assert(db[S.CLASSES][0].start_year_id === '2026-2027', 'start_year_id not set');
  assert(db[S.CLASS_HISTORY].length === 1, 'duplicate history snapshot');
  assert(db[S.ATTENDANCE][0].academic_year_id === '2026-2027', 'in-range attendance not backfilled');
  assert(db[S.ATTENDANCE][1].academic_year_id === '', 'out-of-range attendance should not be touched');
});

test('setup', 'teacher history sync changes current snapshot only', () => {
  const S = expr('SHEETS');
  const db = installMemoryDb({
    [S.ACADEMIC_YEARS]: [{year_id:'2026-2027',start_date:'2026-09-02',end_date:'2027-05-25',promotion_date:'2027-06-01',status:'ACTIVE'}],
    [S.CLASS_HISTORY]: [
      {class_id:1,academic_year_id:'2025-2026',class_name:'5-01',teacher_telegram_id:'old',status:'PROMOTED'},
      {class_id:1,academic_year_id:'2026-2027',class_name:'6-01',teacher_telegram_id:'100',status:'ACTIVE'}
    ]
  });
  fn('syncCurrentClassHistoryTeacher_')(1, '200');
  assert(db[S.CLASS_HISTORY][0].teacher_telegram_id === 'old', 'historic teacher was mutated');
  assert(db[S.CLASS_HISTORY][1].teacher_telegram_id === '200', 'current teacher was not synced');
});

// Task 4 — lifecycle
test('lifecycle', 'class stage promotion parser handles 5-11 and rejects invalid names', () => {
  equal(fn('parseClassStage_')('5-01'), {grade:5,section:'01'});
  assert(fn('nextClassName_')('5-01') === '6-01', '5-01 should become 6-01');
  assert(fn('nextClassName_')('10-03') === '11-03', '10-03 should become 11-03');
  assert(fn('nextClassName_')('11-01') === null, '11 should graduate');
  assert(fn('parseClassStage_')('5-A') === null && fn('parseClassStage_')('') === null, 'invalid names must reject');
});

test('lifecycle', 'promotion graduates 11, keeps IDs, skips invalid and is idempotent', () => {
  const S = expr('SHEETS');
  const db = installMemoryDb({
    [S.ACADEMIC_YEARS]: [{year_id:'2026-2027',title:'2026/2027',start_date:'2026-09-02',end_date:'2027-05-25',promotion_date:'2027-06-01',status:'ACTIVE',promoted_at:'',activated_at:'x'}],
    [S.CLASSES]: [
      {class_id:1,class_name:'5-01',teacher_telegram_id:'100',active:true,start_year_id:'2026-2027',archived_year_id:'',archived_at:''},
      {class_id:2,class_name:'11-01',teacher_telegram_id:'200',active:true,start_year_id:'2026-2027',archived_year_id:'',archived_at:''},
      {class_id:3,class_name:'5-A',teacher_telegram_id:'',active:true,start_year_id:'2026-2027',archived_year_id:'',archived_at:''}
    ],
    [S.STUDENTS]: [
      {student_id:1,full_name:'A',class_id:1,active:true,graduated_year_id:'',graduated_at:''},
      {student_id:2,full_name:'B',class_id:2,active:true,graduated_year_id:'',graduated_at:''}
    ],
    [S.USERS]: [
      {telegram_id:'100',full_name:'T1',role:'TEACHER',class_id:1,active:true},
      {telegram_id:'200',full_name:'T2',role:'TEACHER',class_id:2,active:true}
    ],
    [S.CLASS_HISTORY]: [
      {class_id:1,academic_year_id:'2026-2027',class_name:'5-01',grade:5,section:'01',teacher_telegram_id:'100',active_from:'2026-09-02',active_to:'',status:'ACTIVE'},
      {class_id:2,academic_year_id:'2026-2027',class_name:'11-01',grade:11,section:'01',teacher_telegram_id:'200',active_from:'2026-09-02',active_to:'',status:'ACTIVE'},
      {class_id:3,academic_year_id:'2026-2027',class_name:'5-A',grade:'',section:'',teacher_telegram_id:'',active_from:'2026-09-02',active_to:'',status:'ACTIVE'}
    ],
    [S.ATTENDANCE]: [], [S.CALENDAR]: [], [S.SETTINGS]: []
  });
  const yearRow = ctx.findRowByValue_(S.ACADEMIC_YEARS,'year_id','2026-2027');
  const first = fn('promoteAcademicYear_')(yearRow,'2027-06-01');
  assert(db[S.CLASSES][0].class_id === 1 && db[S.CLASSES][0].class_name === '6-01', 'promoted class ID/name wrong');
  assert(db[S.CLASSES][1].active === false && db[S.CLASSES][1].archived_year_id === '2026-2027', '11 class not archived');
  assert(db[S.STUDENTS][1].active === false && db[S.STUDENTS][1].graduated_year_id === '2026-2027', 'graduate student not archived');
  assert(db[S.USERS][1].active === false && db[S.USERS][1].class_id === '', 'graduating teacher not released');
  assert(first.invalidClasses.includes('5-A'), 'invalid class missing from report');
  const second = fn('promoteAcademicYear_')(ctx.findRowByValue_(S.ACADEMIC_YEARS,'year_id','2026-2027'),'2027-06-01');
  assert(db[S.CLASSES][0].class_name === '6-01', 'second run promoted twice');
  assert(second.promotedCount === 0 && second.graduatedClasses.length === 0, 'second run should be no-op');
});

// Task 5 — integrations
test('integrations', 'range statistics count calendar school days and historic names', () => {
  const years = [
    {year_id:'2026-2027',start_date:'2026-09-02',end_date:'2027-05-25',status:'ARCHIVED'},
    {year_id:'2027-2028',start_date:'2027-09-02',end_date:'2028-05-25',status:'ACTIVE'}
  ];
  const history = [
    {class_id:'A',academic_year_id:'2026-2027',class_name:'6-01',teacher_telegram_id:'100',status:'PROMOTED'},
    {class_id:'A',academic_year_id:'2027-2028',class_name:'7-01',teacher_telegram_id:'100',status:'ACTIVE'}
  ];
  const students = [{student_id:1,full_name:'Ali',class_id:'A',active:true}];
  const attendance = [
    {date:'2026-10-12',academic_year_id:'2026-2027',class_id:'A',student_id:1,status:'SABABSIZ',updated_by:'100',updated_at:'2026-10-12T08:00:00Z'},
    {date:'2027-09-02',academic_year_id:'2027-2028',class_id:'A',student_id:1,status:'KELDI',updated_by:'100',updated_at:'2027-09-02T08:00:00Z'}
  ];
  const users = [{telegram_id:'100',full_name:'Teacher',role:'TEACHER',class_id:'A',active:true}];
  const calendar = [{start_date:'2026-10-13',end_date:'2026-10-13',type:'VACATION',active:true}];
  const model = fn('buildStatisticsRangeModelFromRows_')([], students, attendance, users, '999', '2026-10-12','2027-09-02', years, history, calendar);
  assert(model.schoolDays > 2, 'calendar should enumerate real school days even without attendance');
  assert(model.classes.some(x => x.className === '6-01') && model.classes.some(x => x.className === '7-01'), 'historic names missing across years');
  const old = model.classes.find(x => x.className === '6-01');
  assert(old.missingDays > 0, 'missing school days should be counted');
  assert(!model.days.some(x => x.date === '2026-10-13'), 'vacation day should not be a school day');
});

test('integrations', 'notification processor has an early non-school-day gate', () => {
  assert(code.includes("if (!isSchoolDay_(today)) return"), 'processNotifications_ must return early on non-school day');
  assert(code.includes('academic_year_id'), 'attendance integration must write academic year id');
});

// Task 6 — academic year UI
test('academic-ui', 'admin academic-year routes and read-only archive UI exist', () => {
  ['function showAcademicYearMenu_','function showCurrentAcademicYear_','function showAcademicYearArchive_','function showArchivedYear_','O‘quv yili','academ:current','academ:new','academ:archive','academ:five'].forEach(s => assert(code.includes(s), `missing ${s}`));
  assert(code.includes("actor.role !== ROLES.SUPER_ADMIN") || code.includes("ROLES.SUPER_ADMIN"), 'initial setup must be super-admin guarded');
  assert(code.includes('CREATE_ACADEMIC_YEAR') && code.includes('INITIALIZE_ACADEMIC_YEAR') && code.includes('EDIT_PROMOTION_DATE') && code.includes('ADD_FIVE_CLASS'), 'pending academic flows missing');
});

// Task 7 — calendar UI
test('calendar-ui', 'calendar CRUD validates roles, types and soft delete', () => {
  ['function addCalendarEvent_','function deactivateCalendarEvent_','function showCalendarMenu_','function showCalendarEvents_','VACATION','HOLIDAY','WORKDAY','Taqvim'].forEach(s => assert(code.includes(s), `missing ${s}`));
  const S = expr('SHEETS');
  const db = installMemoryDb({[S.CALENDAR]:[],[S.ACADEMIC_YEARS]:[{year_id:'2026-2027',start_date:'2026-09-02',end_date:'2027-05-25',status:'ACTIVE'}]});
  const admin = {telegramId:'10',role:'ADMIN'};
  const ev = fn('addCalendarEvent_')(admin,{start_date:'2026-10-12',end_date:'2026-10-12',type:'HOLIDAY',title:'Test'});
  assert(ev.eventId === 1 && db[S.CALENDAR][0].active === true, 'calendar event not created');
  throws(() => fn('addCalendarEvent_')({telegramId:'20',role:'TEACHER'},{start_date:'2026-10-12',end_date:'2026-10-12',type:'HOLIDAY',title:'X'}), 'Ruxsat');
  throws(() => fn('addCalendarEvent_')(admin,{start_date:'2026-10-13',end_date:'2026-10-12',type:'HOLIDAY',title:'X'}), 'sana');
  fn('deactivateCalendarEvent_')(admin,1);
  assert(db[S.CALENDAR][0].active === false, 'delete must soft-deactivate');
});

// Task 8 — triggers
test('triggers', 'unified trigger installer is idempotent and legacy entry point remains callable', () => {
  let handlers = [];
  const makeBuilder = name => ({
    timeBased(){ return this; }, everyMinutes(){ return this; }, everyDays(){ return this; }, atHour(){ return this; },
    create(){ handlers.push(name); return {getHandlerFunction:() => name}; }
  });
  ctx.ScriptApp = {
    getProjectTriggers: () => handlers.map(h => ({getHandlerFunction:() => h})),
    newTrigger: name => makeBuilder(name)
  };
  fn('installDavomatTriggers')();
  fn('installDavomatTriggers')();
  equal(handlers.sort(), ['processAcademicYearMaintenance_','processNotifications_'].sort(), 'duplicate/missing triggers');
  assert(typeof fn('installNotificationTrigger') === 'function', 'legacy installer missing');
});

if (!ran) {
  console.error(`Unknown focus: ${focus}`);
  process.exit(2);
}
if (failures) {
  console.error(`${failures}/${ran} tests failed`);
  process.exit(1);
}
console.log(`${ran}/${ran} tests passed`);
