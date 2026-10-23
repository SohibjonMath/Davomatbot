const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync('Code.gs', 'utf8');

class Range {
  constructor(sheet, row, col, height, width) {
    Object.assign(this, {sheet, row, col, height, width});
  }
  getValues() {
    return Array.from({length:this.height}, (_,i) =>
      Array.from({length:this.width}, (_,j) => this.sheet.rows[this.row+i-1]?.[this.col+j-1] ?? ''));
  }
  setValues(values) {
    assert.strictEqual(values.length, this.height);
    values.forEach((record,i) => {
      assert.strictEqual(record.length,this.width);
      record.forEach((value,j) => {
        const row = this.sheet.rows[this.row+i-1] ||= [];
        row[this.col+j-1] = value;
      });
    });
    return this;
  }
  setValue(value) { return this.setValues([[value]]); }
}

class Sheet {
  constructor(name, rows) { this.name=name; this.rows=rows.map(x=>x.slice()); }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return Math.max(0,...this.rows.map(x=>x.length)); }
  getRange(row,col=1,height=1,width=1) { return new Range(this,row,col,height,width); }
  setName(name) { this.name=name; }
  appendRow(row) { this.rows.push(row.slice()); }
}

function test(initialYear) {
  const sheets = [
    new Sheet('CLASSES', [['class_id','class_name','teacher_telegram_id','active','start_year_id','archived_year_id','archived_at'],[4,'5-01','100',true,'2026-2027','','']]),
    new Sheet('STUDENTS', [['student_id','full_name','class_id','active','graduated_year_id','graduated_at'],[1,'Test Student',4,true,'','']]),
    new Sheet('USERS', [['telegram_id','full_name','role','class_id','active']]),
    new Sheet('ATTENDANCE', [['date','class_id','student_id','status','updated_by','updated_at','academic_year_id'],['2026-10-15',4,1,'KELDI','100','now','']])
  ];
  if (initialYear) sheets.push(new Sheet('ACADEMIC_YEARS', [
    ['year_id','title','start_date','end_date','promotion_date','status','promoted_at','activated_at'],
    ['2028-2029','2028/2029','2028-09-02','2029-05-25','2029-06-01','PLANNED','','']
  ]));
  const spreadsheet = {
    getSheetByName(name) { return sheets.find(x=>x.name===name) || null; },
    insertSheet(name) { const sheet=new Sheet(name,[]); sheets.push(sheet); return sheet; }
  };
  const cache = new Map();
  const ctx = {
    console, Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error, isFinite, parseInt,
    SpreadsheetApp: {openById:() => spreadsheet},
    CacheService: {getScriptCache:() => ({
      get:key=>cache.get(key),put:(key,value)=>cache.set(key,value),remove:key=>cache.delete(key)
    })},
    LockService: {getScriptLock:() => ({waitLock(){},releaseLock(){}})},
    Session: {getScriptTimeZone:()=>'Asia/Tashkent'},
    Utilities: {formatDate:date=>new Date(date).toISOString().slice(0,10)}
  };
  vm.createContext(ctx);
  vm.runInContext(code,ctx);
  vm.runInContext("todayKey_ = () => '2026-10-23'",ctx);
  const call = expr => vm.runInContext(expr,ctx);
  const active=call('getActiveAcademicYear_()');
  const isFridaySchoolDay=call("isSchoolDay_('2026-10-23')");
  call('ensureInitialAcademicYear_()');
  const years=call('getRowsAsObjects_(SHEETS.ACADEMIC_YEARS)');
  assert.strictEqual(years.length,1,'init must be idempotent');
  assert.ok(sheets.some(x=>x.name==='CALENDAR'),'missing calendar tab must be restored');
  assert.strictEqual(sheets.find(x=>x.name==='ATTENDANCE').rows.length,2,'legacy data must not be lost');
  if(initialYear) {
    assert.strictEqual(active,null,'do not activate an existing planned year');
    assert.strictEqual(isFridaySchoolDay,false);
    assert.strictEqual(years[0].year_id,'2028-2029','do not replace configured year');
  } else {
    assert.strictEqual(active.year_id,'2026-2027','automatically initialize current year');
    assert.strictEqual(isFridaySchoolDay,true);
    assert.strictEqual(years[0].status,'ACTIVE');
  }
}
test(false);
test(true);
console.log('Auto-bootstrap of older attendance spreadsheets passed');
