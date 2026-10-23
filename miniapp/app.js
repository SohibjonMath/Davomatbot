(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const tg=window.Telegram?.WebApp;
  const initData=tg?.initData||'';
  const S={data:null,page:'attendance',classId:'',month:'',multi:false,
    dates:new Set(),states:{},dirty:false,saving:false,
    cache:new Map(),loading:new Map(),lastSaved:''};
  const monthNames=['yanvar','fevral','mart','aprel','may','iyun','iyul','avgust','sentabr','oktabr','noyabr','dekabr'];
  const pad=n=>String(n).padStart(2,'0');
  const parts=date=>date.split('-').map(Number);
  const nextMonth=(month,diff)=>{
    const [y,m]=parts(month);return new Date(Date.UTC(y,m-1+diff,1)).toISOString().slice(0,7);
  };
  const monthKey=date=>date.slice(0,7);
  const students=()=>S.data?.students.filter(row=>row.classId===S.classId)||[];
  const savedMonth=month=>S.cache.get(S.classId+'|'+month);
  const statusesFor=day=>savedMonth(monthKey(day))?.[day]||{};
  function notice(text,type=''){
    $('status').textContent=text;$('status').className='status'+(type?' '+type:'');
  }
  function showError(text) {
    $('errorNotice').textContent=text;$('errorNotice').classList.remove('hidden');
    notice(text,'error');
  }
  function clearError(){$('errorNotice').classList.add('hidden');}
  function loading(on){$('loader').classList.toggle('active',on);}
  async function api(action,other={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),29000);
    try{
      const response=await fetch('/api/attendance',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action,initData,...other}),signal:controller.signal,cache:'no-store'
      });
      const result=await response.json();
      if(!response.ok||!result.ok)throw new Error(result.error||'Ma’lumot yüklanmadi.');
      return result.data;
    }catch(error){
      if(error?.name==='AbortError')throw new Error('Server javobi keçikdi. Davomatni tekşirib qayta urinib köring.');
      throw error;
    }finally{clearTimeout(timer);}
  }
  function schoolDay(date){
    const year=S.data.year;
    if(date<year.start||date>year.end)return 'outside';
    const [y,m,d]=parts(date),weekday=new Date(Date.UTC(y,m-1,d)).getUTCDay();
    const events=S.data.holidays.filter(e=>date>=e.from&&date<=e.to);
    const work=events.some(e=>e.type==='WORKDAY');
    if(!work&&events.some(e=>e.type==='HOLIDAY'||e.type==='VACATION'))return 'off';
    if(!work&&(weekday===0||weekday===6))return 'off';
    return date>S.data.today?'future':'school';
  }
  function monthData(classId,month) {
    const key=classId+'|'+month;
    if(S.cache.has(key))return Promise.resolve(S.cache.get(key));
    if(S.loading.has(key))return S.loading.get(key);
    loading(true);
    const promise=api('month',{classId,month}).then(result=>{
      S.cache.set(key,result.dates||{});
      if(S.classId===classId){
        if(S.page==='history'&&S.month===month)drawCalendar();
        if([...S.dates].some(d=>monthKey(d)===month))fillRoster();
        if(S.page==='attendance'&&monthKey(S.data.today)===month)renderToday();
      }
      return result.dates||{};
    }).catch(error=>{
      if(S.classId===classId)showError(error.message);
      throw error;
    }).finally(()=>{S.loading.delete(key);if(!S.loading.size)loading(false);});
    S.loading.set(key,promise);
    return promise;
  }
  function getStatus(date){
    const n=students().length;
    if(!S.cache.has(S.classId+'|'+monthKey(date)))return {count:0,total:n,loading:true};
    const marks=statusesFor(date),ids=new Set(students().map(s=>String(s.id)));
    const count=Object.keys(marks).filter(id=>ids.has(String(id))).length;
    return {count,total:n,loading:false};
  }
  function renderToday(){
    if(!S.data||S.page!=='attendance')return;
    const today=S.data.today,st=getStatus(today),el=$('todayStatus');
    el.className='todayStatus';
    if(schoolDay(today)!=='school') {
      el.textContent='Bugun öqiş kuni emas.';
      $('todayNotice').textContent='Dam olish yoki ta’til kuni. Ötgan sanalardagi davomat alohida açiladi.';
      $('todayNotice').classList.remove('hidden');
      return;
    }
    $('todayNotice').classList.add('hidden');
    if(st.loading)el.textContent='Davomat tekşirilmoqda…';
    else if(!st.count){el.classList.add('unsaved');el.textContent='Davomat hali berilmagan.';}
    else if(st.count<st.total){el.classList.add('partial');el.textContent='Qisman berilgan: '+st.count+' / '+st.total;}
    else {el.classList.add('saved');el.textContent='Davomat berilgan: '+st.count+' / '+st.total;}
  }
  function drawCalendar(){
    if(!S.data||S.page!=='history')return;
    const el=$('calendar');el.textContent='';
    const [year,month]=parts(S.month),dayCount=new Date(Date.UTC(year,month,0)).getUTCDate();
    $('monthTitle').textContent=monthNames[month-1]+' '+year;
    const blank=(new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7;
    for(let i=0;i<blank;i++){const cell=document.createElement('span');cell.className='emptyDay';el.appendChild(cell);}
    for(let n=1;n<=dayCount;n++){
      const date=S.month+'-'+pad(n),state=schoolDay(date),st=getStatus(date),selected=S.dates.has(date);
      const button=document.createElement('button');button.type='button';button.className='day';
      const num=document.createElement('strong');num.className='num';num.textContent=n;
      const note=document.createElement('span');note.className='note';
      if(state!=='school'||date>=S.data.today){
        button.classList.add(state==='off'?'off':'inactive');
        note.textContent=state==='off'?'Dam':date===S.data.today?'Bugun':'—';button.disabled=true;
      } else if(st.loading){note.textContent='…';}
      else if(st.total&&st.count>=st.total){button.classList.add('saved');note.textContent='Berilgan';}
      else if(st.count){button.classList.add('partial');note.textContent='Chala';}
      else{button.classList.add('missing');note.textContent='Yoq';}
      if(selected)button.classList.add('selected');
      button.setAttribute('aria-label',date+' '+note.textContent);
      button.append(num,note);
      button.addEventListener('click',()=>chooseDate(date));
      el.appendChild(button);
    }
    $('prevMonth').disabled=S.month<=monthKey(S.data.year.start)||S.saving;
    $('nextMonth').disabled=S.month>=monthKey(S.data.today)||S.saving;
    $('dateHelp').textContent=S.dates.size?S.dates.size+' ta sana tanlandi.':'Davomat kiritiladigan sanani tanlang.';
  }
  function drawSummary() {
    const n=students().length,counts={KELDI:0,SABABLI:0,SABABSIZ:0};
    students().forEach(st=>{const status=S.states[String(st.id)];if(counts[status]!==undefined)counts[status]++;});
    const html=[
      ['KELDI','Keldi','present'],['SABABLI','Sababli','excused'],['SABABSIZ','Sababsiz','absent']
    ].map(([code,label,color])=>'<div class="'+color+'"><strong>'+counts[code]+'</strong>'+label+'</div>').join('');
    $('summary').innerHTML=n?html:'';
  }
  function fillRoster(){
    if(!S.data||!['attendance','history'].includes(S.page))return;
    const dates=[...S.dates].sort(),list=students();
    $('count').textContent=list.length+' ta';
    $('summary').innerHTML='';
    if(!dates.length||schoolDay(dates[0])!=='school'){
      $('emptyRoster').textContent=S.page==='history'?'Avval sanani tanlang.':'Bugun öqiş kuni emas.';
      $('emptyRoster').classList.remove('hidden');$('rosterArea').classList.add('hidden');
      updateSave();return;
    }
    const requested=dates.filter(day=>!savedMonth(monthKey(day)));
    if(requested.length){
      $('emptyRoster').textContent='Davomat yüklanmoqda…';
      $('emptyRoster').classList.remove('hidden');$('rosterArea').classList.add('hidden');
      for(const month of new Set(requested.map(monthKey)))monthData(S.classId,month).catch(()=>{});
      updateSave();return;
    }
    if(!S.dirty) {
      const prior=dates.length===1?statusesFor(dates[0]):{};
      S.states={};list.forEach(st=>{S.states[String(st.id)]=prior[String(st.id)]||'KELDI';});
    }
    $('emptyRoster').classList.add('hidden');$('rosterArea').classList.remove('hidden');
    $('currentSelection').textContent=dates.length===1?dates[0]:dates.length+' kun';
    drawStudents();drawSummary();updateSave();
  }
  function drawStudents(){
    const el=$('students');el.textContent='';
    const search=$('search').value.trim().toLocaleLowerCase(),fragment=document.createDocumentFragment();
    for(const st of students().filter(row=>row.name.toLocaleLowerCase().includes(search))){
      const row=document.createElement('div');row.className='studentRow';
      const name=document.createElement('span');name.className='studentName';name.textContent=st.name;
      const states=document.createElement('div');states.className='states';
      for(const [status,label] of [['KELDI','+'],['SABABLI','s'],['SABABSIZ','−']]){
        const button=document.createElement('button');button.type='button';
        button.className='statusBtn';button.dataset.status=status;
        button.dataset.active=String(S.states[String(st.id)]===status);
        button.textContent=label;
        button.setAttribute('aria-label',st.name+': '+status);
        button.addEventListener('click',()=>{
          if(S.saving)return;
          S.states[String(st.id)]=status;S.dirty=true;
          states.querySelectorAll('button').forEach(b=>{b.dataset.active=String(b.dataset.status===status);});
          drawSummary();updateSave();
        });
        states.appendChild(button);
      }
      row.append(name,states);fragment.appendChild(row);
    }
    el.appendChild(fragment);
  }
  function updateSave(){
    const dates=[...S.dates];
    const ready=!!dates.length&&dates.every(day=>!!savedMonth(monthKey(day)));
    $('save').disabled=!ready||S.saving||!students().length;
    $('save').innerHTML=S.saving?'<i class="fa-solid fa-spinner fa-spin"></i> Saqlanmoqda…':
      '<i class="fa-solid fa-floppy-disk"></i> Saqlash'+(dates.length>1?' ('+dates.length+')':'');
    for(const id of ['classSelect','allPresent','multi','clearDates'])$(id).disabled=S.saving;
  }
  function selectMonth(month){
    if(month<monthKey(S.data.year.start)||month>monthKey(S.data.today))return;
    S.month=month;drawCalendar();monthData(S.classId,month).catch(()=>{});
  }
  function chooseDate(date){
    if(S.saving||S.page!=='history'||schoolDay(date)!=='school'||date>=S.data.today)return;
    if(!S.multi){S.dates=new Set([date]);}
    else if(S.dates.has(date)){S.dates.delete(date);}
    else if(S.dates.size<25){S.dates.add(date);}
    else{notice('25 tagacha sana tanlaş mumkin.','error');return;}
    S.states={};S.dirty=false;drawCalendar();fillRoster();
  }
  function showAttendance(page){
    S.page=page;
    $('app').classList.remove('hidden');$('sticky').classList.remove('hidden');
    $('sectionPanel').classList.add('hidden');
    const history=page==='history';
    $('historyPanel').classList.toggle('hidden',!history);
    $('attendanceTitle').textContent=history?'Ötgan sanalar':'Bugungi davomat';
    $('switchHistory').innerHTML=history?'<i class="fa-solid fa-arrow-left"></i> Bugungi davomat':
      '<i class="fa-solid fa-clock-rotate-left"></i> Ötgan sanalar';
    $('pageTitle').textContent=history?'Ötgan sanalar':'Davomat';
    $('selectedDate').textContent=history?'Öquv yili: '+S.data.year.id:S.data.today;
    $('todayStatus').classList.toggle('hidden',history);
    $('todayNotice').classList.toggle('hidden',history);
    S.multi=false;$('multi').checked=false;
    S.dates=history?new Set():schoolDay(S.data.today)==='school'?new Set([S.data.today]):new Set();
    S.month=history?monthKey(S.data.today):monthKey(S.data.today);
    S.states={};S.dirty=false;$('search').value='';
    clearError();
    if(history){drawCalendar();monthData(S.classId,S.month).catch(()=>{});}
    else{renderToday();monthData(S.classId,S.month).catch(()=>{});}
    fillRoster();
  }
  async function saveNow(){
    if(S.saving||!S.dates.size)return;
    const classId=S.classId,dates=[...S.dates].sort(),
      entries=students().map(st=>({studentId:st.id,status:S.states[String(st.id)]||'KELDI'}));
    S.saving=true;updateSave();notice('Davomat saqlanmoqda…');
    try{
      const result=await api('save',{classId,dates,entries});
      dates.forEach(day=>{
        const key=classId+'|'+monthKey(day),data=S.cache.get(key)||{};
        data[day]=Object.fromEntries(entries.map(st=>[String(st.studentId),st.status]));
        S.cache.set(key,data);
      });
      S.dirty=false;
      renderToday();drawCalendar();fillRoster();
      notice(dates.length+' kun davomat saqlandi.','ok');
      tg?.HapticFeedback?.notificationOccurred?.('success');
      if(result?.summary)notice('Keldi: '+result.summary.KELDI+' · Sababli: '+result.summary.SABABLI+' · Sababsiz: '+result.summary.SABABSIZ,'ok');
    }catch(error){showError(error.message);}
    finally{S.saving=false;updateSave();}
  }
  function requestSave(){
    if(S.saving||!S.dates.size)return;
    const overwritten=[...S.dates].filter(d=>getStatus(d).count);
    if(!overwritten.length)return saveNow();
    $('dialogText').textContent=overwritten.length+' ta sanada davomat avval kiritilgan. Tasdiqlasangiz shu sanalar yangilanadi.';
    $('confirmDialog').showModal();
  }
  async function refreshBootstrap(){
    const data=await api('bootstrap'),previous=S.classId;
    S.data=data;S.cache.clear();S.states={};S.dirty=false;S.dates.clear();
    setClasses(previous);
    $('academicTag').textContent=data.year.id;
    window.DavomatSections?.updateBootstrap?.(data);
  }
  function setClasses(preferred=''){
    const select=$('classSelect');select.textContent='';
    for(const cls of S.data.classes||[]){
      const option=document.createElement('option');option.value=cls.id;option.textContent=cls.name;select.appendChild(option);
    }
    S.classId=S.data.classes?.some(row=>row.id===preferred)?preferred:S.data.classes?.[0]?.id||'';
    select.value=S.classId;
  }
  async function start(){
    tg?.ready();tg?.expand();loading(true);
    if(!initData){showError('Davomatni Telegramdagi menyudan açing.');loading(false);return;}
    try {
      S.data=await api('bootstrap');
      setClasses();$('academicTag').textContent=S.data.year.id;
      clearError();
      window.DavomatSections.start(S.data,api,refreshBootstrap,showAttendance);
    }catch(error){showError(error.message);}
    finally{loading(false);}
  }
  $('classSelect').addEventListener('change',()=>{
    S.classId=$('classSelect').value;
    S.dates=S.page==='attendance'?new Set([S.data.today]):new Set();
    S.states={};S.dirty=false;
    if(S.page==='attendance')renderToday();else drawCalendar();
    fillRoster();monthData(S.classId,S.month).catch(()=>{});
  });
  $('switchHistory').addEventListener('click',()=>window.DavomatSections.show(S.page==='history'?'attendance':'history'));
  $('prevMonth').addEventListener('click',()=>selectMonth(nextMonth(S.month,-1)));
  $('nextMonth').addEventListener('click',()=>selectMonth(nextMonth(S.month,1)));
  $('multi').addEventListener('change',e=>{S.multi=e.target.checked;S.dates.clear();S.dirty=false;S.states={};drawCalendar();fillRoster();});
  $('clearDates').addEventListener('click',()=>{S.dates.clear();S.states={};S.dirty=false;drawCalendar();fillRoster();});
  $('search').addEventListener('input',drawStudents);
  $('allPresent').addEventListener('click',()=>{
    if(S.saving)return;
    students().forEach(st=>{S.states[String(st.id)]='KELDI';});
    S.dirty=true;drawStudents();drawSummary();updateSave();
  });
  $('save').addEventListener('click',requestSave);
  $('cancelConfirm').addEventListener('click',()=>$('confirmDialog').close());
  $('acceptConfirm').addEventListener('click',()=>{$('confirmDialog').close();saveNow();});
  $('sectionCancel').addEventListener('click',()=>$('sectionDialog').close());
  start();
})();