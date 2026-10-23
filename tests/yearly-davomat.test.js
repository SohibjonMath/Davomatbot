const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
class Range {
  constructor(sheet,r,c,h,w) { Object.assign(this,{sheet,r,c,h,w}); }
  getValues() { return Array.from({length:this.h},(_,i)=>Array.from({length:this.w},(_,j)=>this.sheet.rows[this.r+i-1]?.[this.c+j-1] ?? '')); }
  getDisplayValues() { return this.getValues().map(row=>row.map(String)); }
  setValues(rows) {
    assert.strictEqual(rows.length,this.h);
    rows.forEach((r,i)=>{assert.strictEqual(r.length,this.w); r.forEach((v,j)=>{const row=this.sheet.rows[this.r+i-1] ||= [];row[this.c+j-1]=v;});});
    return this;
  }
  setValue(x) { return this.setValues([[x]]); }
  setNumberFormat() { return this; } setBackground() { return this; } setFontColor() { return this; }
  setFontWeight() { return this; } setBackgrounds() { return this; } setNote() { return this; }
  sort(spec) {
    const rows=this.sheet.rows.slice(this.r-1,this.r+this.h-1);
    rows.sort((a,b)=>{ for (const {column,ascending} of spec) {
      const d=String(a[column-1]||'').localeCompare(String(b[column-1]||''));
      if(d) return ascending?d:-d;
    } return 0; });
    this.sheet.rows.splice(this.r-1,this.h,...rows);return this;
  }
}
class Sheet {
  constructor(name,rows=[]) {this.name=name;this.rows=rows;this.hidden=false;this.hiddenColumns=[];}
  getLastRow() {let n=this.rows.length;while(n&&!(this.rows[n-1]||[]).some(x=>x!==''&&x!==undefined&&x!==null))n--;return n;}
  getLastColumn() {return Math.max(0,...this.rows.map(row=>{let n=row.length;while(n&&(row[n-1]===''||row[n-1]===undefined))n--;return n;}));}
  getMaxRows() {return 1000;} getMaxColumns() {return 50;}
  getRange(r,c=1,h=1,w=1) {return typeof r==='string'?new Range(this,1,1,1,1):new Range(this,r,c,h,w);}
  setName(value) {this.name=value;} hideSheet() {this.hidden=true;}isSheetHidden(){return this.hidden;}
  hideColumns(c){this.hiddenColumns.push(c);}isColumnHiddenByUser(c){return this.hiddenColumns.includes(c);}
  clearContents(){this.rows=[];} insertColumnBefore(c){this.rows.forEach(row=>row.splice(c-1,0,''));}
  insertRowsAfter(){} insertColumnsAfter(){}setFrozenRows(){}setFrozenColumns(){}
  setColumnWidth(){}setColumnWidths(){}setTabColor(){}
  appendRow(row){this.rows.push(row.slice());}
}
const sheets=[
  new Sheet('ATTENDANCE',[
    ['date','class_id','student_id','status','updated_by','updated_at','academic_year_id'],
    ['2026-10-15',4,1,'KELDI','100','now','2026-2027'],
    ['2026-10-15',4,2,'SABABLI','100','now','2026-2027']
  ]),
  new Sheet('STUDENTS',[
    ['student_id','full_name','class_id','active','graduated_year_id','graduated_at'],
    [1,'Aliyev Sardor',4,true,'',''],[2,'Karimova Madina',4,true,'',''],[3,'Rasulov Aziz',4,true,'','']
  ]),
  new Sheet('CLASSES',[
    ['class_id','class_name','teacher_telegram_id','active','start_year_id','archived_year_id','archived_at'],
    [4,'5-01','100',true,'2026-2027','','']
  ]),
  new Sheet('ACADEMIC_YEARS',[
    ['year_id','title','start_date','end_date','promotion_date','status','promoted_at','activated_at'],
    ['2026-2027','2026/2027','2026-09-02','2027-05-25','2027-06-01','ACTIVE','','']
  ]),
  new Sheet('CLASS_HISTORY',[
    ['class_id','academic_year_id','class_name','grade','section','teacher_telegram_id','active_from','active_to','status']
  ])
];
const ss={getSheetByName:name=>sheets.find(sheet=>sheet.name===name),insertSheet(name){const sheet=new Sheet(name);sheets.push(sheet);return sheet;}};
const cache=new Map();
const ctx={
  console, Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error,
  SpreadsheetApp:{openById:()=>ss},
  CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  Session:{getScriptTimeZone:()=> 'Asia/Tashkent'},
  Utilities:{formatDate:d=>new Date(d).toISOString().slice(0,10)}
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Code.gs','utf8'),ctx);
const run=code=>vm.runInContext(code,ctx);
assert.strictEqual(run('SHEETS.ATTENDANCE'),'_DAVOMAT_BAZA');
const created=run('setupDavomatOne()');
assert.strictEqual(created[0],'2026-2027 davomat');
const log=sheets.find(x=>x.name==='_DAVOMAT_BAZA'),view=sheets.find(x=>x.name==='2026-2027 davomat');
assert.ok(log.hidden && view && view.hiddenColumns.includes(3),'legacy log must be preserved, renamed and hidden');
assert.ok(!sheets.some(x=>x.name==='ATTENDANCE'),'do not recreate the old visible tab');
assert.deepStrictEqual(Array.from(view.rows[0]),['Ism familiyasi','Sinfi','ID','2026-10-15']);
assert.deepStrictEqual(Array.from(run("loadAttendance_(4,'2026-10-15')").map(x=>x.status)),['KELDI','SABABLI','KELDI']);
const actor={telegramId:'100',role:'TEACHER',classId:'4'};
ctx.__actor=actor;
function save(date) {
  run("saveAttendance_(__actor,4,'" + date + "',[{studentId:1,status:'SABABSIZ'},{studentId:2,status:'KELDI'},{studentId:3,status:'SABABLI'}])");
}
save('2026-10-16');
save('2026-10-14');
save('2026-10-16');
assert.deepStrictEqual(Array.from(view.rows[0].slice(3)),['2026-10-14','2026-10-15','2026-10-16'],'day columns must be sorted');
assert.strictEqual(log.getLastRow(),10,'re-saving the same day should upsert, not duplicate');
const col=view.rows[0].indexOf('2026-10-16');
assert.deepStrictEqual(view.rows.slice(1).map(r=>r[col]),['-','+','s']);
assert.strictEqual(view.rows.length,4,'include active students with no previous attendance');
console.log('Annual attendance migration, saving, and backdated sorting passed');
