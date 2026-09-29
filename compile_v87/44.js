

/* ===== V81 · ALERTA SIMPLES DE AGENDA CHEIA ===== */
(function(){
 const V81_SCHEMA=81,MIGRATION_ID='v81-agenda-full-alert',HORIZON_DAYS=7;
 let cache={token:'',rows:[]};
 function now(){return new Date().toISOString()}
 function today(){return typeof localDateISO==='function'?localDateISO():new Date().toISOString().slice(0,10)}
 function addDays(d,n){return typeof addDaysISO==='function'?addDaysISO(d,n):(()=>{let x=new Date(d+'T12:00:00');x.setDate(x.getDate()+n);return x.toISOString().slice(0,10)})()}
 function esc(v){return typeof escapeHtml==='function'?escapeHtml(String(v??'')):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
 function migId(x){return typeof x==='string'?x:x?.id}
 function unitName(id){return (db.units||[]).find(u=>u.id===id)?.name||id||'Unidade'}
 function allowedUnits(){let rows=window.__imperioV63?.allowedUnits?.()||null;if(Array.isArray(rows))return rows.filter(u=>u.active!==false);return (db.units||[]).filter(u=>u.active!==false)}
 function isEligibleServiceForPro(serviceId,proId,unitId){return (availabilityEligiblePros(serviceId,unitId)||[]).some(p=>p.id===proId)}
 function serviceRows(){return (db.services||[]).filter(s=>s.active!==false&&Number(s.duration||0)>0)}
 function dayModel(unitId,date){
  let pros=(db.pros||[]).filter(p=>p.active!==false&&(p.units||[]).includes(unitId)),services=serviceRows(),scheduled=0,eligiblePairs=0,checked=0,firstStart='',lastEnd='';
  for(const p of pros){let win=availabilityWorkWindow(p.id,date,unitId);if(!win)continue;scheduled++;if(!firstStart||timeToMin(win.start)<timeToMin(firstStart))firstStart=win.start;if(!lastEnd||timeToMin(win.end)>timeToMin(lastEnd))lastEnd=win.end;
   let start=timeToMin(win.start),end=timeToMin(win.end);if(date===today()){let n=new Date(),cur=n.getHours()*60+n.getMinutes();start=Math.max(start,Math.ceil(cur/15)*15)}
   if(start>=end)continue;
   for(const s of services){if(!isEligibleServiceForPro(s.id,p.id,unitId))continue;eligiblePairs++;let dur=availabilityServiceDuration(s.id,p.id);for(let m=start;m+dur<=end;m+=15){checked++;if(availabilityPlacement(p.id,s.id,date,minToTime(m),unitId,false,[]))return {configured:true,full:false,scheduledProfessionals:scheduled,eligiblePairs,checked,firstStart,lastEnd,available:{proId:p.id,serviceId:s.id,start:minToTime(m)}}}}
  }
  return {configured:scheduled>0,full:scheduled>0&&eligiblePairs>0,scheduledProfessionals:scheduled,eligiblePairs,checked,firstStart,lastEnd,available:null};
 }
 function token(){let t=today(),b=(db.bookings||[]).filter(x=>x.date>=t&&x.date<=addDays(t,HORIZON_DAYS-1)).map(x=>[x.id,x.unit,x.date,x.status,(x.items||[]).map(i=>[i.pro,i.serviceId,i.time,i.duration]).join('~')]).join('|'),p=(db.pros||[]).map(x=>[x.id,x.active!==false,(x.units||[]).join(','),JSON.stringify(x.schedule||{}),(x.services||[]).join(',')]).join('|'),s=(db.services||[]).map(x=>[x.id,x.active!==false,x.duration,x.category,JSON.stringify(x.proRules||{})]).join('|'),q=Math.floor(Date.now()/900000);return `${t}:${q}:${b}:${p}:${s}`}
 function alerts(force=false){let tk=token();if(!force&&cache.token===tk)return cache.rows.slice();let out=[],t=today();for(const u of allowedUnits())for(let i=0;i<HORIZON_DAYS;i++){let date=addDays(t,i),m=dayModel(u.id,date);if(!m.configured||!m.full)continue;out.push({key:`agenda_full:${u.id}:${date}`,kind:'alert',category:'general',priority:i===0?'high':'normal',title:'Agenda cheia',detail:`${unitName(u.id)} · ${typeof formatDateBR==='function'?formatDateBR(date):date} · sem horários livres reais${m.firstStart&&m.lastEnd?` · escala ${m.firstStart}–${m.lastEnd}`:''}`,dueDate:date,unitId:u.id,sourceType:'agenda_full',sourceId:`${u.id}:${date}`,status:'open',agendaFull:true,scheduledProfessionals:m.scheduledProfessionals});}cache={token:tk,rows:out};return out.slice()}
 function invalidate(){cache={token:'',rows:[]}}
 function selectedModel(){let uid=document.getElementById('unitPicker')?.value||'',date=typeof agendaDate!=='undefined'?agendaDate:'';return uid&&date?dayModel(uid,date):null}
 function injectAgendaBadge(){try{if(typeof page!=='undefined'&&page!=='agenda')return false;let m=selectedModel(),bar=document.querySelector('.agenda-toolbar');if(!bar)return false;bar.querySelectorAll('.v81-agenda-full-chip').forEach(x=>x.remove());if(!m?.configured||!m.full)return false;let el=document.createElement('span');el.className='v81-agenda-full-chip';el.textContent='Agenda cheia · sem horários livres';el.title='Leitura operacional: existe escala cadastrada, mas nenhum serviço ativo compatível possui horário realmente livre. Possíveis encaixes não contam como vaga livre.';bar.appendChild(el);return true}catch(e){return false}}
 function ensureStyle(){if(document.getElementById('v81Style'))return;let st=document.createElement('style');st.id='v81Style';st.textContent='.v81-agenda-full-chip{display:inline-flex;align-items:center;border:1px solid #dfc7e4;background:#faf5fb;color:#704578;border-radius:999px;padding:5px 9px;font-size:9px;font-weight:850;white-space:nowrap}';document.head.appendChild(st)}
 function ensureMigration(){let changed=false;db.migrationHistory=Array.isArray(db.migrationHistory)?db.migrationHistory:[];if(!db.migrationHistory.some(x=>migId(x)===MIGRATION_ID)){db.migrationHistory.push({id:MIGRATION_ID,version:V81_SCHEMA,status:'applied',appliedAt:now(),note:'Alerta derivado de Agenda cheia por unidade/data, reutilizando disponibilidade canônica e sem tratar encaixe como vaga livre.'});changed=true}if(Number(db.schemaVersion||0)<V81_SCHEMA){db.schemaVersion=V81_SCHEMA;db.schemaMigratedAt=now();changed=true}if(changed)save({render:false});return changed}
 function wrapInvalidate(name){let base=window[name];if(typeof base!=='function'||base.__v81Wrapped)return;let fn=function(){let out=base.apply(this,arguments);invalidate();return out};fn.__v81Wrapped=true;window[name]=fn;try{eval(name+'=window[name]')}catch(e){}}
 ensureStyle();ensureMigration();
 ['saveReservation','saveExistingBooking','saveBlockTime','saveBlockEdit','deleteBlock','agendaDrop'].forEach(wrapInvalidate);
 const baseRender=window.renderAgenda;window.renderAgenda=function(){let out=baseRender?baseRender.apply(this,arguments):undefined;injectAgendaBadge();return out};try{renderAgenda=window.renderAgenda}catch(e){}
 if(window.__imperioV66){const baseGen=window.__imperioV66.generatedAlerts?.bind(window.__imperioV66)||(()=>[]),baseCount=window.__imperioV66.activeCount?.bind(window.__imperioV66)||(()=>0);window.__imperioV66.generatedAlerts=function(){return [...baseGen(),...alerts()]};window.__imperioV66.activeCount=function(){return Number(baseCount()||0)+alerts().length}}
 const baseAdmin=window.renderAdmin;window.renderAdmin=function(){let out=baseAdmin?baseAdmin.apply(this,arguments):undefined;try{let host=typeof adminPage!=='undefined'?adminPage:document.getElementById('adminPage');if(host?.innerHTML)host.innerHTML=host.innerHTML.replace(/(<span>Versão funcional<\/span><b>)[^<]*(<\/b>)/,'$1V81 · Alerta simples de Agenda cheia$2')}catch(e){}return out};try{renderAdmin=window.renderAdmin}catch(e){}
 window.__imperioV81={schema:V81_SCHEMA,migrationId:MIGRATION_ID,horizonDays:HORIZON_DAYS,dayModel,agendaFullAlerts:alerts,invalidate,injectAgendaBadge};
 injectAgendaBadge();
})();

