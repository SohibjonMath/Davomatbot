/* All Davomat sections share one Telegram Mini App session and one API.
   Tab switching and searching happen in the browser, without Telegram callbacks. */
(() => {
  'use strict';
  const labels = {
    attendance:'Davomat',history:'Ötgan sanalar',statistics:'Statistika',control:'Rahbarlar nazorati',classes:'Sinflar',
    students:'Öquvçilar',year:'Öquv yili',calendar:'Taqvim',
    admins:'Adminlar',settings:'Sozlamalar'
  };
  const icons = {
    attendance:'clipboard-check',history:'calendar-days',statistics:'chart-column',control:'clipboard-list',classes:'school',
    students:'users',year:'calendar-days',calendar:'calendar',
    admins:'user-shield',settings:'gear'
  };
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
  const btn = (text,action,extra='',cls='') =>
    '<button type="button" class="sectionButton '+cls+'" data-action="'+esc(action)+'" '+extra+'>'+esc(text)+'</button>';
  const item = (title,subtitle,buttons='') =>
    '<div class="sectionItem"><div class="details"><strong>'+esc(title)+'</strong>'+
    (subtitle?'<small>'+esc(subtitle)+'</small>':'')+'</div>'+
    (buttons?'<div class="actions">'+buttons+'</div>':'')+'</div>';
  const empty = text => '<div class="sectionEmpty">'+esc(text)+'</div>';
  const metricTone=name=>{
    if(/Topşirgan|Berilgan|Davomat bergan|Keldi/i.test(name))return 'tone-done';
    if(/Bermagan|Rahbarsiz|Davomat bermagan|Sababsiz/i.test(name))return 'tone-missing';
    if(/Chala|Sababli/i.test(name))return 'tone-partial';
    return '';
  };
  const metrics = pairs => '<div class="sectionGrid">'+pairs.map(([name,value])=>
    '<div class="sectionMetric '+metricTone(name)+'"><span>'+esc(name)+'</span><strong>'+esc(value)+'</strong></div>').join('')+'</div>';

  const store = {
    api:null,bootstrap:null,afterWrite:null,onAttendance:null,page:'attendance',cache:new Map(),
    allowed:[],studentClass:'',studentSearch:'',
    startDate:'',endDate:'',controlFilter:'all',busy:false,serial:0
  };

  function message(text,error=false) {
    const el=$('sectionStatus');
    el.textContent=text||'';
    el.className='sectionMessage'+(error?' error':'');
  }
  function changeView(page) {
    const attendance=page==='attendance'||page==='history';
    $('app').classList.toggle('hidden',!attendance);
    $('sticky').classList.toggle('hidden',!attendance);
    $('sectionPanel').classList.toggle('hidden',attendance);
    if(!attendance){
      $('pageTitle').textContent=labels[page]||'Davomat';
      $('pageSubtitle').textContent='Namangan 1-IMI';
    }
  }
  function start(bootstrap,api,afterWrite,onAttendance) {
    store.bootstrap=bootstrap;
    store.api=api;
    store.afterWrite=afterWrite;
    store.onAttendance=onAttendance;
    store.allowed=Array.isArray(bootstrap.pages)?bootstrap.pages:['attendance','history'];
    $('sectionPanel').addEventListener('click',handleClick);
    $('sectionPanel').addEventListener('change',handleChange);
    $('sectionPanel').addEventListener('input',handleInput);
    const requested=new URLSearchParams(location.search).get('page')||'attendance';
    show(store.allowed.includes(requested)?requested:'attendance');
  }
  async function show(page,force=false,options=null) {
    if(!store.allowed.includes(page))return;
    store.page=page;
    changeView(page);
    if(page==='attendance'||page==='history') {
      if(typeof store.onAttendance==='function')store.onAttendance(page);
      return;
    }
    const serial=++store.serial;
    if(!force&&store.cache.has(page)) {
      render(page,store.cache.get(page));
      return;
    }
    $('sectionPanel').innerHTML='<div class="card"><div class="sectionEmpty">Ma’lumotlar yüklanmoqda…</div></div>';
    try {
      const data=await store.api('section',{page,options:options||{}});
      if(serial!==store.serial||store.page!==page)return;
      store.cache.set(page,data);
      render(page,data);
    } catch(e) {
      if(serial===store.serial){
        $('sectionPanel').innerHTML='<div class="card">'+empty(e.message||'Ma’lumotlarni yüklab bo‘lmadi.')+
          '<div class="sectionToolbar">'+btn('Qayta urinish','retry')+'</div></div>';
      }
    }
  }
  async function refresh(page=store.page) {
    store.cache.delete(page);
    await show(page,true);
  }
  async function mutate(operation,data={},page=store.page) {
    if(store.busy)return;
    store.busy=true;
    message('Saqlanmoqda…');
    try {
      await store.api('manage',{operation,...data});
      if(typeof store.afterWrite==='function')await store.afterWrite();
      store.cache.clear();
      await refresh(page);
      message('Özgariş saqlandi.');
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success');
    } catch(err){
      message(err.message||'Saqlab bo‘lmadi.',true);
    } finally {
      store.busy=false;
    }
  }
  function modal(title,fields,submit,confirmText='Saqlaş') {
    const dlg=$('sectionDialog');
    $('sectionDialogTitle').textContent=title;
    const form=$('sectionForm');
    form.innerHTML='';
    fields.forEach(field=>{
      const label=document.createElement('label');
      label.textContent=field.label;
      const input=document.createElement(field.kind==='textarea'?'textarea':field.kind==='select'?'select':'input');
      input.name=field.name;input.required=field.required!==false;
      if(field.kind!=='textarea'&&field.kind!=='select')input.type=field.kind||'text';
      if(field.placeholder)input.placeholder=field.placeholder;
      if(field.value!=null)input.value=String(field.value);
      if(field.kind==='select')for(const option of field.options||[]){
        const el=document.createElement('option');el.value=option.value;el.textContent=option.label;input.appendChild(el);
      }
      label.appendChild(input);form.appendChild(label);
    });
    $('sectionDialogError').textContent='';
    $('sectionSubmit').textContent=confirmText;
    $('sectionSubmit').disabled=false;
    dlg.showModal();
    const finish=async event=>{
      event.preventDefault();
      $('sectionSubmit').disabled=true;
      const data=Object.fromEntries(new FormData(form).entries());
      try {
        await submit(data);
        dlg.close();
      } catch(err) {
        $('sectionDialogError').textContent=err.message||'Saqlanmadi.';
        $('sectionSubmit').disabled=false;
      }
    };
    form.onsubmit=finish;
  }
  function confirmAction(title,text,operation,data,page) {
    const dlg=$('sectionDialog');
    $('sectionDialogTitle').textContent=title;
    $('sectionDialogError').textContent='';
    const form=$('sectionForm');
    form.innerHTML='';
    const desc=document.createElement('p');desc.className='small muted';desc.textContent=text;form.appendChild(desc);
    $('sectionSubmit').textContent='Tasdiqlash';
    $('sectionSubmit').disabled=false;
    form.onsubmit=async event=>{
      event.preventDefault();
      dlg.close();
      await mutate(operation,data,page);
    };
    dlg.showModal();
  }
  function modalAction(title,fields,operation,extra={},page=store.page){
    modal(title,fields,async data=>{
      // mutate deliberately returns a result only when the action succeeds.
      if(store.busy)throw new Error('Özgarish amalga oshirilmoqda.');
      store.busy=true;
      try{
        await store.api('manage',{operation,...extra,...data});
        if(typeof store.afterWrite==='function')await store.afterWrite();
        store.cache.clear();
        store.busy=false;
        await refresh(page);
        message('Özgariş saqlandi.');
      } catch(err){store.busy=false;throw err;}
    });
  }
  function heading(page,actionButton=''){
    return '<div class="sectionHeading"><h2><i class="fa-solid fa-'+icons[page]+'"></i> '+labels[page]+'</h2>'+
      actionButton+'</div><div id="sectionStatus" class="sectionMessage"></div>';
  }

  function render(page,data) {
    if(page==='statistics')return renderStats(data);
    if(page==='control')return renderControl(data);
    if(page==='classes')return renderClasses(data);
    if(page==='students')return renderStudents(data);
    if(page==='year')return renderYears(data);
    if(page==='calendar')return renderCalendar(data);
    if(page==='admins')return renderAdmins(data);
    if(page==='settings')return renderSettings(data);
  }
  function renderStats(data) {
    const m=data.model||{},range=data.mode==='range';
    const start=store.startDate||m.start||m.date||store.bootstrap.today;
    const end=store.endDate||m.end||m.date||store.bootstrap.today;
    const dateFields='<div class="sectionToolbar">'+
      '<label class="small">Dan <input id="statsFrom" type="date" value="'+esc(start)+'" max="'+esc(store.bootstrap.today)+'"></label>'+
      '<label class="small">Gaça <input id="statsTo" type="date" value="'+esc(end)+'" max="'+esc(store.bootstrap.today)+'"></label>'+
      btn('Körsatish','stats.filter','','accent')+'</div>';
    let cards;
    if(range) {
      cards=metrics([['Öquv kunlari',m.schoolDays||0],['Sinflar',m.totalClasses||0],['Öquvçilar',m.totalStudents||0],
        ['Keldi',m.keldi||0],['Sababli',m.sababli||0],['Sababsiz',m.sababsiz||0]]);
    } else {
      cards=metrics([['Davomat bergan',m.submittedCount||0],['Davomat bermagan',m.missingCount||0],
        ['Öquvçilar',m.totalStudents||0],['Keldi',m.keldi||0],['Sababli',m.sababli||0],['Sababsiz',m.sababsiz||0]]);
    }
    const classes=(m.classes||[]).map(c=>{
      const marked=(c.keldi||0)+(c.sababli||0)+(c.sababsiz||0);
      const classState=range
        ?(c.submittedDays===0?'missing':c.missingDays>0?'partial':'done')
        :(!c.submitted?'missing':marked<(c.totalStudents||0)?'partial':'done');
      const note=range
        ?'Davomatli kunlar: '+(c.submittedDays||0)+' / '+(c.schoolDays||0)+' · Keldi: '+(c.keldi||0)+' · Sababli: '+(c.sababli||0)+' · Sababsiz: '+(c.sababsiz||0)
        :(c.submitted?'Davomat berilgan':'Davomat berilmagan')+' · Keldi: '+(c.keldi||0)+' · Sababli: '+(c.sababli||0)+' · Sababsiz: '+(c.sababsiz||0);
      return '<div class="sectionItem tone-'+classState+'"><div class="details"><strong>'+esc(c.className)+'</strong>'+ 
        '<small>'+esc(c.teacherName||'Rahbar biriktirilmagan')+'</small><small>'+esc(note)+'</small></div></div>';
    }).join('');
    const absences=(!range?m.absences:m.topAbsences)||[];
    const absenceList=absences.slice(0,50).map(x=>item(x.studentName,(x.className||'')+' · '+(x.status||('Jami '+x.total)))).join('');
    $('sectionPanel').innerHTML='<div class="card">'+heading('statistics')+dateFields+cards+
      '<h3>Sinflar kesimida</h3><div class="sectionList">'+(classes||empty('Ma’lumot yo‘q.'))+'</div>'+
      '<h3>Kelmagan öquvçilar</h3><div class="sectionList">'+(absenceList||empty('Kelmagan öquvçi yo‘q.'))+'</div></div>';
  }

  function renderControl(data) {
    const totals=metrics([
      ['Barcha sinflar',data.total||0],['Topşirgan',data.done||0],
      ['Bermagan',data.missing||0],['Chala',data.partial||0],
      ['Rahbarsiz',data.unassigned||0]
    ]);
    const tone={done:'done',missing:'missing',partial:'partial',unassigned:'unassigned'};
    const status={done:'To‘liq berilgan',missing:'Berilmagan',partial:'Qisman berilgan',unassigned:'Rahbar yo‘q'};
    const rows=(data.items||[]).map(row=>{
      const state=tone[row.status]||'missing';
      return '<div class="sectionItem tone-'+state+'" data-state="'+state+'"><div class="details"><strong>'+esc(row.name)+'</strong>'+
        '<small>'+esc(row.teacherName||'Rahbar biriktirilmagan')+'</small>'+
        '<small>'+esc(status[row.status]||'Berilmagan')+' · '+esc(row.submitted||0)+' / '+esc(row.total||0)+
        ' · Keldi '+esc(row.keldi||0)+' · Sababli '+esc(row.sababli||0)+' · Sababsiz '+esc(row.sababsiz||0)+'</small></div>'+
        '<span class="stateLabel">'+esc(status[row.status]||'Berilmagan')+'</span></div>';
    }).join('');
    const dateInput='<div class="sectionToolbar"><label class="small">Sana <input id="controlDate" type="date" value="'+
      esc(data.date)+'" max="'+esc(store.bootstrap.today)+'"></label>'+
      btn('Körsatish','control.filter','','accent')+'</div>';
    const filters=[['all','Barchasi'],['done','Berilgan'],['missing','Berilmagan'],['partial','Chala'],['unassigned','Rahbarsiz']]
      .map(([key,label])=>btn(label,'control.show','data-filter="'+key+'"'+(store.controlFilter===key?' aria-pressed="true"':''))).join('');
    $('sectionPanel').innerHTML='<div class="card">'+heading('control')+dateInput+
      (data.schoolDay?'':'<div class="sectionEmpty">Bu sana öqiş kuni emas.</div>')+
      totals+'<div class="controlFilters">'+filters+'</div><div class="sectionList" id="controlList">'+
      (rows||empty('Sinf topilmadi.'))+'</div></div>';
    applyControlFilter();
  }

  function applyControlFilter() {
    const list=$('controlList');
    if(!list)return;
    list.querySelectorAll('.sectionItem').forEach(row=>{
      row.classList.toggle('hidden',store.controlFilter!=='all' && row.dataset.state!==store.controlFilter);
    });
  }
  function renderClasses(data) {
    const rows=(data.items||[]).map(c=>{
      const assigned=Boolean(c.teacherId);
      const teacher=assigned ? (c.teacher||('Telegram ID: '+c.teacherId)):'Rahbar biriktirilmagan';
      const note=c.students+' ta öquvçi · '+teacher;
      const teacherButtons=btn(assigned?'Almashtirish':'Rahbar biriktirish','class.teacher.assign',
          'data-id="'+esc(c.id)+'"',assigned?'':'accent')+
        (assigned?btn('Rahbarni olib tashlash','class.teacher.remove',
          'data-id="'+esc(c.id)+'"','danger'):'');
      return '<div class="sectionItem '+(assigned?'tone-done':'tone-unassigned')+'"><div class="details"><strong>'+esc(c.name)+'</strong>'+
        '<small>'+esc(note)+'</small></div><div class="actions">'+
        teacherButtons+
        btn('Sinf nomi','class.rename','data-id="'+esc(c.id)+'"')+
        btn('Sinfni arxivlash','class.remove','data-id="'+esc(c.id)+'"','danger')+'</div></div>';
    }).join('');
    $('sectionPanel').innerHTML='<div class="card">'+heading('classes',btn('Sinf qoşish','class.add','','accent'))+
      '<div class="sectionList">'+(rows||empty('Sinflar topilmadi.'))+'</div></div>';
  }
  function renderStudents(data) {
    const classes=data.classes||[],first=classes[0]?.id||'';
    if(!classes.some(c=>c.id===store.studentClass))store.studentClass=first;
    const choices=classes.map(c=>'<option value="'+esc(c.id)+'" '+(c.id===store.studentClass?'selected':'')+'>'+esc(c.name)+'</option>').join('');
    const rows=(data.items||[]).filter(s=>s.classId===store.studentClass&&s.name.toLowerCase().includes(store.studentSearch.toLowerCase()))
      .sort((a,b)=>a.name.localeCompare(b.name)).map(s=>item(s.name,'Öquvçi raqami: '+s.id,
        btn('Olib taşlash','student.remove','data-id="'+esc(s.id)+'" data-name="'+esc(s.name)+'"','danger'))).join('');
    $('sectionPanel').innerHTML='<div class="card">'+heading('students',btn('Öquvçi qoşish','student.add','','accent'))+
      '<div class="sectionToolbar"><select id="sectionClass">'+choices+'</select>'+
      '<input id="sectionSearch" type="search" placeholder="Ism-familiya orqali qidiriş" value="'+esc(store.studentSearch)+'"></div>'+
      '<div class="sectionList" id="sectionStudentList">'+(rows||empty('Öquvçi topilmadi.'))+'</div></div>';
  }
  function renderYears(data) {
    const years=(data.years||[]).map(y=>{
      const state=y.status==='ACTIVE'?'tone-done':y.status==='PLANNED'?'tone-partial':'tone-muted';
      const buttons=(y.status!=='ARCHIVED'?btn('Sana','year.promotion','data-id="'+esc(y.id)+'"'):'')+
        (y.status==='PLANNED'?btn('5-sinf qoşish','year.five','data-id="'+esc(y.id)+'"'):'')+
        (y.status==='PLANNED'&&store.bootstrap.role==='SUPER_ADMIN'?btn('Faollashtirish','year.activate','data-id="'+esc(y.id)+'"'):'');
      return '<div class="sectionItem '+state+'"><div class="details"><strong>'+esc(y.title||y.id)+'</strong>'+
        '<small>'+esc(y.start+' — '+y.end+' · Keyingi bosqich: '+y.promotion+' · '+y.status)+'</small></div>'+
        '<div class="actions">'+buttons+'</div></div>';
    }).join('');
    const archives=(data.archive||[]).filter(y=>y.status==='GRADUATED'||y.status==='PROMOTED')
      .map(y=>item(y.className,y.yearId+' · '+y.status)).join('');
    $('sectionPanel').innerHTML='<div class="card">'+heading('year',btn('Yangi yil','year.add','','accent'))+
      '<div class="sectionList">'+(years||empty('Öquv yili ma’lumoti yo‘q.'))+'</div>'+
      '<h3>Ötgan sinflar</h3><div class="sectionList">'+(archives||empty('Arxiv yozuvi yo‘q.'))+'</div></div>';
  }
  function renderCalendar(data) {
    const names={HOLIDAY:'Dam olish / bayram',VACATION:'Ta’til',WORKDAY:'Öqiş kuni'};
    const list=(data.items||[]).map(e=>{
      const state=e.type==='WORKDAY'?'tone-done':e.type==='VACATION'?'tone-partial':'tone-muted';
      return '<div class="sectionItem '+state+'"><div class="details"><strong>'+esc(e.title)+'</strong>'+
        '<small>'+esc(e.start+(e.end===e.start?'':' — '+e.end)+' · '+(names[e.type]||e.type))+'</small></div>'+
        '<div class="actions">'+btn('Olib taşlash','calendar.remove','data-id="'+esc(e.id)+'" data-name="'+esc(e.title)+'"','danger')+'</div></div>';
    }).join('');
    $('sectionPanel').innerHTML='<div class="card">'+heading('calendar',btn('Kun qoşish','calendar.add','','accent'))+
      '<div class="sectionList">'+(list||empty('Maxsus kunlar kiritilmagan.'))+'</div></div>';
  }
  function renderAdmins(data) {
    const list=(data.items||[]).map(a=>item(a.name,'Telegram ID: '+a.id,
      btn('Ruxsatni bekor qilish','admin.remove','data-id="'+esc(a.id)+'" data-name="'+esc(a.name)+'"','danger'))).join('');
    $('sectionPanel').innerHTML='<div class="card">'+heading('admins',btn('Admin qoşish','admin.add','','accent'))+
      '<div class="sectionList">'+(list||empty('Admin topilmadi.'))+'</div></div>';
  }
  function renderSettings(data) {
    const n=data.notifications||{};
    const list='<div class="sectionItem"><div class="details"><strong>Davomat eslatmasi</strong><small>'+
      (n.enabled?'Yoqilgan':'Öchirilgan')+' · Har kuni '+esc(n.time||'08:00')+'</small></div>'+
      '<div class="actions">'+btn(n.enabled?'Öchirish':'Yoqish','settings.toggle','data-enabled="'+(!n.enabled)+'"')+'</div></div>';
    const input='<div class="sectionToolbar"><label>Bildirişnoma vaqti: <input id="sectionNotifyTime" type="time" value="'+esc(n.time||'08:00')+'"></label>'+
      btn('Vaqtni saqlaş','settings.time','','accent')+'</div>';
    $('sectionPanel').innerHTML='<div class="card">'+heading('settings')+
      (data.className?'<p class="small">Sinf: '+esc(data.className)+'</p>':'')+list+input+'</div>';
  }

  async function handleClick(event) {
    const button=event.target.closest('button[data-action]');
    if(!button)return;
    const action=button.dataset.action, id=button.dataset.id||'';
    const page=store.page, datum=store.cache.get(page);
    if(action==='retry')return refresh();
    if(action==='control.show') {
      store.controlFilter=button.dataset.filter||'all';
      renderControl(store.cache.get('control'));
      return;
    }
    if(action==='control.filter'){
      store.controlFilter='all';
      return show('control',true,{date:$('controlDate')?.value});
    }
    if(action==='stats.filter') {
      const start=$('statsFrom')?.value,end=$('statsTo')?.value;
      store.startDate=start;store.endDate=end;
      return show('statistics',true,{start,end});
    }
    if(action==='class.add')return modalAction('Yangi sinf',[{name:'name',label:'Sinf nomi',placeholder:'5-01'}],'class.add');
    if(action==='class.rename') {
      const record=datum.items.find(v=>v.id===id);
      return modalAction('Sinf nomini özgartirish',[{name:'name',label:'Sinf nomi',value:record?.name}],'class.rename',{classId:id});
    }
    if(action==='class.teacher.assign') {
      const record=datum?.items.find(v=>v.id===id);
      if(!record)return;
      return modalAction(record.teacherId?'Sinf rahbarini almashtirish':'Sinf rahbarini biriktirish',[
        {name:'id',label:'Yangi rahbarning Telegram IDsi',placeholder:'123456789'},
        {name:'name',label:'Ism familiya (mavjud rahbar uchun ixtiyoriy)',required:false,
          placeholder:'Aliyev Sardor'}
      ],'class.teacher.assign',{classId:id,expectedTeacherId:record.teacherId||''},page);
    }
    if(action==='class.teacher.remove') {
      const record=datum?.items.find(v=>v.id===id);
      if(!record||!record.teacherId)return;
      return confirmAction('Sinf rahbarini olib tashlash',
        record.name+' sinfining rahbari '+(record.teacher||record.teacherId)+
        ' sinfdan chiqariladi va davomatga kirish huquqi bekor qilinadi. Öquvchilar hamda eski davomat saqlanadi.',
        'class.teacher.remove',{classId:id,expectedTeacherId:record.teacherId},page);
    }
    if(action==='class.remove')return confirmAction('Sinfni arxivlash','Sinf faolligi bekor qilinadi. Davomat tarixi saqlanib qoladi.',
      'class.remove',{classId:id},page);
    if(action==='student.add') {
      if(!store.studentClass)return;
      return modalAction('Öquvçi qoşish',[{name:'names',label:'Ism-familiyalar (har qatorga bittadan)',kind:'textarea',
        placeholder:'Aliyev Sardor\nKarimova Madina'}],'student.add',{classId:store.studentClass});
    }
    if(action==='student.remove')return confirmAction('Öquvçini olib taşlash',button.dataset.name+' ro‘yxatdan chiqariladi. Eski davomat tarixi saqlanadi.',
      'student.remove',{id},page);
    if(action==='year.add')return modalAction('Yangi öquv yilini yaratish',[
      {name:'yearId',label:'Yil',placeholder:'2027-2028'},
      {name:'title',label:'Nomi',placeholder:'2027/2028'},
      {name:'start',label:'Boshlanish',kind:'date'},
      {name:'end',label:'Tugash',kind:'date'},
      {name:'promotion',label:'Keyingi bosqich sanasi',kind:'date'}
    ],'year.create');
    if(action==='year.promotion'){
      const record=datum.years.find(v=>v.id===id);
      return modalAction('Keyingi bosqich sanasi',[{name:'date',label:'Sana',kind:'date',value:record?.promotion}],
        'year.promotion',{yearId:id});
    }
    if(action==='year.five')return modalAction('Yangi 5-sinf',[{name:'name',label:'Sinf',placeholder:'5-01'}],
      'year.newFive',{yearId:id});
    if(action==='year.activate')return confirmAction('Öquv yilini faollashtirish','Öquv yili joriy taqvimga mos bolsa faollashtiriladi.',
      'year.activate',{yearId:id},page);
    if(action==='calendar.add')return modalAction('Maxsus kun qoşish',[
      {name:'type',label:'Turi',kind:'select',options:[
        {value:'VACATION',label:'Ta’til'}, {value:'HOLIDAY',label:'Dam olish / bayram'},
        {value:'WORKDAY',label:'Öqish kuni'}]},
      {name:'start',label:'Boshlanish',kind:'date'},
      {name:'end',label:'Tugash',kind:'date'},
      {name:'title',label:'Nomi',placeholder:'Kuzgi ta’til'}
    ],'calendar.add');
    if(action==='calendar.remove')return confirmAction('Maxsus kunni olib taşlash',button.dataset.name+' o‘chiriladi.',
      'calendar.remove',{id},page);
    if(action==='admin.add')return modalAction('Admin qoşish',[
      {name:'id',label:'Telegram ID',placeholder:'123456789'},
      {name:'name',label:'Ism familiyasi',placeholder:'Aliyev Sardor'}
    ],'admin.add');
    if(action==='admin.remove')return confirmAction('Admin ruxsatini bekor qilish',button.dataset.name+' adminlikdan chiqariladi.',
      'admin.remove',{id},page);
    if(action==='settings.toggle')return mutate('settings.save',{enabled:button.dataset.enabled==='true'},page);
    if(action==='settings.time')return mutate('settings.save',{time:$('sectionNotifyTime').value},page);
  }
  function handleChange(event) {
    if(event.target.id==='sectionClass') {
      store.studentClass=event.target.value;store.studentSearch='';
      renderStudents(store.cache.get('students'));
    }
  }
  function handleInput(event){
    if(event.target.id==='sectionSearch'){
      store.studentSearch=event.target.value;
      const data=store.cache.get('students');
      if(data) {
        // Do not rebuild the text input while the user is typing.
        const rows=(data.items||[]).filter(s=>s.classId===store.studentClass&&
          s.name.toLowerCase().includes(store.studentSearch.toLowerCase()))
          .sort((a,b)=>a.name.localeCompare(b.name)).map(s=>item(s.name,'Öquvçi raqami: '+s.id,
            btn('Olib taşlash','student.remove','data-id="'+esc(s.id)+'" data-name="'+esc(s.name)+'"','danger'))).join('');
        $('sectionStudentList').innerHTML=rows||empty('Öquvçi topilmadi.');
      }
    }
  }

  function updateBootstrap(bootstrap) {
    store.bootstrap=bootstrap;
    store.allowed=bootstrap.pages||['attendance','history'];
    store.cache.clear();
  }
  window.DavomatSections={start,show,updateBootstrap};
})();