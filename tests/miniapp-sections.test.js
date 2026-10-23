const fs=require('fs');
const vm=require('vm');
const assert=require('assert');
const code=fs.readFileSync('Code.gs','utf8');
const html=fs.readFileSync('miniapp/index.html','utf8');
const sections=fs.readFileSync('miniapp/sections.js','utf8');
const app=fs.readFileSync('miniapp/app.js','utf8');
const proxy=fs.readFileSync('netlify/functions/attendance.mjs','utf8');

assert.doesNotThrow(()=>new Function(code));
assert.doesNotThrow(()=>new Function(sections));
assert.doesNotThrow(()=>new Function(app));
assert(html.includes('id="sectionPanel"')&&html.includes('/sections.js'));
for(const page of ['statistics','classes','students','year','calendar','admins','settings']){
  assert(sections.includes(page),'Missing Mini App section '+page);
}

const ctx={
  console,Date,JSON,Math,Object,Array,String,Number,Boolean,RegExp,Error,isFinite,parseInt,
  PropertiesService:{getScriptProperties:()=>({getProperty:()=>null})}
};
vm.createContext(ctx);vm.runInContext(code,ctx);
const database={
  CLASSES:[{class_id:4,class_name:'5-01',active:true,teacher_telegram_id:'400'}],
  STUDENTS:[{student_id:1,full_name:'Ali',class_id:4,active:true}],
  USERS:[{telegram_id:'400',full_name:'Domla',class_id:4,role:'TEACHER',active:true},
    {telegram_id:'500',full_name:'Admin',role:'ADMIN',active:true}],
  ACADEMIC_YEARS:[{year_id:'2026-2027',title:'2026/2027',
    start_date:'2026-09-02',end_date:'2027-05-25',promotion_date:'2027-06-01',status:'ACTIVE'}],
  CLASS_HISTORY:[],CALENDAR:[],_DAVOMAT_BAZA:[]
};
ctx.getRowsAsObjects_=name=>database[name]||[];
ctx.getSpreadsheet_=()=>({getSheetByName:()=>null});
ctx.todayKey_=()=> '2026-10-23';
ctx.getSuperAdminId_=()=> '900';
ctx.getNotificationSettings_=()=> ({enabled:true,time:'08:00'});

const call=name=>vm.runInContext(name,ctx);
const roles=[
  {role:'SUPER_ADMIN',telegramId:'900',buttons:10},
  {role:'ADMIN',telegramId:'500',buttons:9},
  {role:'TEACHER',telegramId:'400',classId:'4',buttons:4}
];
for(const actor of roles){
  const menu=call('buildMainMenu_')(actor);
  assert(menu.inline_keyboard,'Buttons must be inline to provide signed Mini App initData');
  const buttons=menu.inline_keyboard.flat();
  assert.strictEqual(buttons.length,actor.buttons);
  for(const item of buttons){
    assert(item.web_app.url.startsWith('https://davomat-imi.netlify.app/?page='),
      'All menu items must directly open the correct Mini App URL');
  }
  for(const page of call('fastAppPages_')(actor).filter(x=>x!=='attendance'&&x!=='history')){
    const response=call('fastAppSection_')(actor,page);
    assert.strictEqual(response.page,page);
  }
}
assert(call('buildMainMenu_')({role:'UNASSIGNED'}).keyboard,'Unassigned users need claim flow');
const teacher=roles[2];
for(const page of ['statistics','control','classes','year','calendar','admins']){
  assert.throws(()=>call('fastAppSection_')(teacher,page),/Ruxsat/);
}
assert.throws(()=>call('fastAppManage_')(teacher,'admin.add',{id:'8',name:'Test'}),/Ruxsat/);
assert(call('fastAppPages_')(roles[1]).includes('control'),'Admins can monitor class teachers');
assert(proxy.includes("'section', 'manage'"),'Netlify proxy must support all sections');
assert(proxy.includes("action === 'manage'"),'Mutations must not be retried after ambiguous results');
console.log('All Mini App section routes, roles and authenticated inline buttons passed');
