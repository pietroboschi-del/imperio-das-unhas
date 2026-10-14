/* A4: manual tasks use PostgreSQL; V66 automatic alerts remain separate.
 * Browser legacy tasks are read-only and are never migrated implicitly. */
(function(){
 'use strict';
 const map={u1:'big',u2:'shopping-contagem',u3:'centro'};
 const production=()=>location.protocol!=='file:'&&!['','localhost','127.0.0.1'].includes(location.hostname);
 const principal=()=>{try{return JSON.parse(sessionStorage.getItem('imperio-v99-central-principal')||'null')}catch{return null}};
 const active=()=>!!window.__imperioCentralApi?.status?.()?.endpoint&&sessionStorage.getItem('imperio-v99-central-authenticated')==='1'&&!!principal()?.userId;
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const report=e=>window.toast?.('Tarefas: '+String(e?.message||e));
 const state=()=>typeof db!=='undefined'?db:window.db;
 const pageActive=()=>typeof page!=='undefined'&&page==='actions';
 const allowed=(unit,perm)=>{
  const p=principal();if(!active()||!p)return false;
  if(p.networkAdmin)return true;
  const a=p.unitAccesses?.find(x=>x.unitId===unit&&x.active!==false);
  const perms=[...(p.permissions||[]),...(a?.permissions||[])];
  return !!a&&(perms.includes('*')||perms.includes(perm));
 };
 const units=perm=>['centro','big','shopping-contagem'].filter(u=>allowed(u,perm));
 // Include identity, access matrix and CSRF: a user switch or permission refresh changes the generation.
 const identity=()=>JSON.stringify({authenticated:active(),endpoint:window.__imperioCentralApi?.status?.()?.endpoint||'',
  csrf:sessionStorage.getItem('imperio-v96-shadow-csrf')||'',principal:principal()});
 let rows=[],people=[],generation=0,context='',pending=null,key='',loading=false,error='';
 const filters={unit:'all',status:'open',priority:'all',assignee:'all'};
 const old={render:window.renderAdmin,open:window.v66OpenTask,save:window.v66SaveTask,
  complete:window.v66CompleteTask,reopen:window.v66ReopenTask};
 function invalidate(){
  generation++;context='';rows=[];people=[];pending=null;key='';loading=false;error='';
  if(document.getElementById('a4Title'))window.closeModal?.();
  filters.unit='all';filters.status='open';filters.priority='all';filters.assignee='all';
  if(pageActive()&&production()){const h=document.getElementById('adminPage');if(h)h.innerHTML='<p role="status">Sessão central indisponível. Entre novamente para consultar tarefas.</p>';}
 }
 function syncIdentity(){
  const next=identity();
  if(next!==context){generation++;context=next;rows=[];people=[];pending=null;key='';loading=false;error='';
   if(document.getElementById('a4Title'))window.closeModal?.();
   filters.unit='all';filters.status='open';filters.priority='all';filters.assignee='all';}
  return next;
 }
 async function api(path,unit,method='GET',body,idempotency){
  if(!active())throw Error('Sessão central indisponível');
  const headers={Accept:'application/json','X-Unit-Id':unit};
  if(body!==undefined)headers['Content-Type']='application/json';
  if(method!=='GET'){
   const csrf=sessionStorage.getItem('imperio-v96-shadow-csrf');
   if(!csrf)throw Error('Token CSRF ausente');
   headers['X-CSRF-Token']=csrf;headers['Idempotency-Key']=idempotency||crypto.randomUUID();
  }
  const requestIdentity=identity();
  const resp=await fetch(window.__imperioCentralApi.status().endpoint+path,
   {method,body:body===undefined?undefined:JSON.stringify(body),headers,credentials:'include',cache:'no-store'});
  // An expired response from the previous user must never disable a newer login.
  if(resp.status===401){
   if(identity()===requestIdentity){invalidate();window.__imperioCentralApi?.disable?.();}
   throw Error('Sessão expirada');
  }
  const result=await resp.json().catch(()=>null);
  if(!resp.ok)throw Error(Array.isArray(result?.message)?result.message.join(', '):result?.message||'HTTP '+resp.status);
  return result;
 }
 function filtered(){
  return rows.filter(t=>(filters.unit==='all'||t.unitId===filters.unit)
   &&(filters.status==='all'||(filters.status==='open'?t.status!=='DONE':filters.status==='done'?t.status==='DONE':t.status===filters.status))
   &&(filters.priority==='all'||t.priority===filters.priority)
   &&(filters.assignee==='all'||t.assignedUserId===filters.assignee));
 }
 const option=(value,label,current)=>'<option value="'+escape(value)+'" '+(value===current?'selected':'')+'>'+escape(label)+'</option>';
 function show(){
  if(!pageActive()||!production())return;
  const host=document.getElementById('adminPage');if(!host)return;
  if(!active()){host.innerHTML='<p role="status">Sessão central indisponível. Entre novamente para consultar tarefas.</p>';return;}
  let target=host.querySelector('#a4TaskCentral');
  if(!target){target=document.createElement('section');target.id='a4TaskCentral';host.prepend(target);}
  let boundary=host.querySelector('#a4AutomaticHeading');
  if(!boundary){boundary=document.createElement('div');boundary.id='a4AutomaticHeading';
   boundary.innerHTML='<h3>Alertas automáticos V66 — seção independente</h3><p class="muted">Os indicadores abaixo se referem apenas aos alertas automáticos; não incluem tarefas centrais ou locais.</p>';
   target.insertAdjacentElement('afterend',boundary);}
  const items=filtered(),open=rows.filter(t=>t.status!=='DONE'),done=rows.filter(t=>t.status==='DONE');
  const overdue=open.filter(t=>t.dueDate&&String(t.dueDate).slice(0,10)<new Date().toISOString().slice(0,10));
  const peopleOptions=[...new Map(rows.map(t=>[t.assignedUserId,people.find(p=>p.id===t.assignedUserId)?.displayName||t.assignedUserId]).filter(x=>x[0])).entries()];
  // A4-F04: never expose browser-stored tasks in the shared production interface.
  // Unit-level tasks.read cannot establish ownership of pre-central local records.
  const list=items.map(t=>{
   const editable=allowed(t.unitId,'tasks.manage')&&t.sourceType==='MANUAL';
   const buttons=editable?'<button class="btn btn-ghost btn-sm" onclick="v66OpenTask(\''+escape(t.id)+'\')">Editar</button> <button class="btn btn-primary btn-sm" onclick="window.__a4Task.status(\''+escape(t.id)+'\')">'+(t.status==='DONE'?'Reabrir':'Concluir')+'</button>':'';
   return '<div class="v66-item" data-central-task="'+escape(t.id)+'"><div class="v66-main"><h4>'+escape(t.title)+'</h4><p>'+escape(t.note||'')+'</p><div class="v66-meta"><span class="v66-chip">'+escape(t.unitId)+'</span><span class="v66-chip">'+escape(t.priority)+'</span><span class="v66-chip">'+escape(t.dueDate?String(t.dueDate).slice(0,10):'Sem prazo')+'</span><span class="v66-chip">'+(t.status==='DONE'?'Concluída':'Aberta')+'</span><span class="v66-chip">'+escape(people.find(p=>p.id===t.assignedUserId)?.displayName||t.assignedUserId)+'</span><span class="v66-chip">'+(t.sourceType==='MANUAL'?'Manual':'Automática, somente leitura')+'</span></div></div><div class="v66-actions">'+buttons+'</div></div>';
  }).join('');
  // The Tarefas navigation badge counts the same central OPEN records as this panel.
  const nav=document.querySelector('#adminTabs button[onclick*="actions"]');
  if(nav){let badge=nav.querySelector('.v66-badge');if(open.length){if(!badge){badge=document.createElement('span');badge.className='v66-badge';nav.appendChild(badge);}badge.textContent=open.length>99?'99+':String(open.length);}else badge?.remove();}
  const readUnits=units('tasks.read');const canCreate=units('tasks.manage').length>0;
  target.innerHTML='<div class="card" style="padding:15px;margin-bottom:16px">'
   +'<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center"><h3 style="margin:0">Tarefas centrais — PostgreSQL</h3><button class="btn btn-ghost btn-sm" onclick="window.__a4Task.refresh(true)">Atualizar</button>'
   +(canCreate?'<button class="btn btn-primary btn-sm" onclick="v66OpenTask()">+ Nova tarefa</button>':'')+'</div>'
   +'<p class="muted">Fonte exclusiva desta seção: PostgreSQL. Filtros e contadores utilizam somente registros carregados.</p>'
   +'<div class="v66-kpis"><div class="v66-kpi"><span>Carregadas</span><b data-a4-count="loaded">'+rows.length+'</b></div><div class="v66-kpi"><span>Abertas</span><b data-a4-count="open">'+open.length+'</b></div><div class="v66-kpi"><span>Concluídas</span><b data-a4-count="done">'+done.length+'</b></div><div class="v66-kpi"><span>Vencidas</span><b data-a4-count="overdue">'+overdue.length+'</b></div><div class="v66-kpi"><span>No filtro</span><b data-a4-count="filtered">'+items.length+'</b></div></div>'
   +'<div class="v66-filter"><div class="v66-filter-grid">'
   +'<div class="field"><label>Unidade</label><select id="a4FilterUnit" onchange="window.__a4Task.filter()">'+option('all','Todas permitidas',filters.unit)+readUnits.map(u=>option(u,u,filters.unit)).join('')+'</select></div>'
   +'<div class="field"><label>Status</label><select id="a4FilterStatus" onchange="window.__a4Task.filter()">'+option('open','Abertas',filters.status)+option('done','Concluídas',filters.status)+option('all','Todas',filters.status)+'</select></div>'
   +'<div class="field"><label>Prioridade</label><select id="a4FilterPriority" onchange="window.__a4Task.filter()">'+['all','low','normal','high','critical'].map(p=>option(p,p==='all'?'Todas':p,filters.priority)).join('')+'</select></div>'
   +'<div class="field"><label>Responsável</label><select id="a4FilterAssignee" onchange="window.__a4Task.filter()">'+option('all','Todos',filters.assignee)+peopleOptions.map(p=>option(p[0],p[1],filters.assignee)).join('')+'</select></div>'
   +'</div></div>'
   +(loading?'<p role="status">Atualizando tarefas centrais...</p>':'')
   +(error?'<p role="alert">'+escape(error)+'</p>':'')
   +(list?'<div class="v66-list">'+list+'</div>':'<p class="muted">Nenhuma tarefa central corresponde aos filtros.</p>')
   +'</div>';
 }
 function filter(){
  if(!active()){invalidate();return;}
  [['unit','a4FilterUnit'],['status','a4FilterStatus'],['priority','a4FilterPriority'],['assignee','a4FilterAssignee']].forEach(([name,id])=>{
   const el=document.getElementById(id);if(el)filters[name]=el.value;
  });
  show();
 }
 function refresh(force=false){
  if(!production())return Promise.resolve([]);
  const ctx=syncIdentity();
  if(!active()){invalidate();return Promise.resolve([]);}
  if(pending&&pending.context===ctx&&!force)return pending.promise;
  const seq=++generation;loading=true;error='';show();
  const valid=()=>active()&&identity()===ctx&&context===ctx&&generation===seq;
  const run=(async()=>{
   try{
    const parts=await Promise.all(units('tasks.read').map(async unit=>{
     const found=[],ids=new Set();let cursor='';
     for(let i=0;i<100;i++){
      const page=await api('/api/v1/tasks'+(cursor?'?cursor='+encodeURIComponent(cursor):''),unit);
      if(!valid())return [];
      if(!Array.isArray(page))throw Error('Resposta de tarefas inválida');
      for(const row of page)if(!ids.has(row.id)){ids.add(row.id);found.push(row);}
      if(page.length<200)return found;
      cursor=page[page.length-1]?.id;if(!cursor)throw Error('Paginação de tarefas inválida');
     }
     throw Error('Limite de paginação das tarefas atingido');
    }));
    if(!valid())return [];
    let users=[{id:principal()?.userId,displayName:principal()?.displayName||'Eu',active:true}];
    if(principal()?.networkAdmin){try{users=await api('/api/v1/admin/users','centro')}catch(e){if(!valid())return [];}}
    if(!valid())return [];
    rows=[...new Map(parts.flat().map(t=>[t.id,t])).values()];
    people=Array.isArray(users)?users:[];loading=false;error='';show();return rows;
   }catch(e){
    if(valid()){rows=[];people=[];loading=false;error=String(e.message||e);show();throw e;}
    return [];
   }
  })();
  pending={context:ctx,promise:run};run.then(()=>{if(pending?.promise===run)pending=null},()=>{if(pending?.promise===run)pending=null});
  return run;
 }
 function choices(unit,owner){
  const current=principal()?.userId;
  const arr=people.filter(p=>p.active!==false&&(p.id===current||p.networkAdmin||p.unitAccesses?.some(a=>a.active!==false&&a.unitId===unit)));
  if(owner&&!arr.some(p=>p.id===owner))arr.push({id:owner,displayName:owner});
  return arr;
 }
 function updateAssignees(){
  const unit=document.getElementById('a4Unit')?.value,sel=document.getElementById('a4Assignee');
  if(!sel)return;const oldId=sel.value;
  const users=choices(unit,principal()?.userId);
  sel.innerHTML=users.map(p=>option(p.id,p.displayName||p.username||p.id,oldId)).join('');
 }
 function form(id=''){
  const t=rows.find(x=>x.id===id),manage=units('tasks.manage');
  if(id&&(!t||t.sourceType!=='MANUAL'||!manage.includes(t.unitId)))throw Error('Tarefa não editável nesta unidade');
  if(!manage.length)throw Error('Sem permissão de gerenciamento');
  let unit=t?.unitId||map[document.getElementById('unitPicker')?.value]||document.getElementById('unitPicker')?.value||manage[0];
  if(!manage.includes(unit))unit=manage[0];
  const owner=t?.assignedUserId||principal()?.userId;
  const users=choices(unit,owner);
  modal(t?'Editar tarefa central':'Nova tarefa central','<div class="v66-task-form">'
   +'<div class="field full"><label>Título</label><input id="a4Title" maxlength="160" value="'+escape(t?.title||'')+'"></div>'
   +'<div class="field"><label>Prazo</label><input id="a4Due" type="date" value="'+escape(t?.dueDate?String(t.dueDate).slice(0,10):'')+'"></div>'
   +'<div class="field"><label>Prioridade</label><select id="a4Priority">'+['low','normal','high','critical'].map(p=>option(p,p,t?.priority||'normal')).join('')+'</select></div>'
   +'<div class="field"><label>Categoria</label><select id="a4Category">'+['general','finance','clients','stock','professionals','partnership'].map(p=>option(p,p,t?.category||'general')).join('')+'</select></div>'
   +'<div class="field"><label>Unidade</label><select id="a4Unit" '+(t?'disabled':'onchange="window.__a4Task.updateAssignees()"')+'>'+manage.map(u=>option(u,u,unit)).join('')+'</select></div>'
   +'<div class="field"><label>Responsável</label><select id="a4Assignee">'+users.map(p=>option(p.id,p.displayName||p.username||p.id,owner)).join('')+'</select></div>'
   +'<div class="field full"><label>Observação</label><textarea id="a4Note" maxlength="2000">'+escape(t?.note||'')+'</textarea></div></div>',
   '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="v66SaveTask(\''+escape(id)+'\')">Salvar no PostgreSQL</button>');
  key=crypto.randomUUID();return true;
 }
 async function save(id=''){
  if(!production())return old.save?.(id);
  const ctx=syncIdentity(),t=rows.find(x=>x.id===id),value=k=>document.getElementById(k)?.value||'';
  const unit=t?.unitId||value('a4Unit');
  const body={title:value('a4Title').trim(),dueDate:value('a4Due')||null,priority:value('a4Priority'),category:value('a4Category'),unitId:unit,assignedUserId:value('a4Assignee'),note:value('a4Note').trim()};
  if(t)body.expectedUpdatedAt=t.updatedAt;
  try{
   if(!active()||!allowed(unit,'tasks.manage'))throw Error('Acesso central não autorizado');
   if(id&&(!t||t.sourceType!=='MANUAL'))throw Error('Tarefa não editável');
   if(!body.title)throw Error('Título obrigatório');
   await api('/api/v1/tasks'+(t?'/'+encodeURIComponent(t.id):''),unit,t?'PATCH':'POST',body,key||(key=crypto.randomUUID()));
   if(identity()!==ctx)return false;
   await refresh(true);
   if(identity()!==ctx)return false;
   key='';closeModal();window.toast?.('Tarefa gravada no PostgreSQL');return true;
  }catch(e){if(identity()===ctx)report(e);return false;}
 }
 async function status(id){
  if(!production())return false;
  const ctx=syncIdentity(),t=rows.find(x=>x.id===id);if(!t)return false;
  try{
   if(!allowed(t.unitId,'tasks.manage')||t.sourceType!=='MANUAL')throw Error('Sem permissão');
   await api('/api/v1/tasks/'+encodeURIComponent(id)+'/'+(t.status==='DONE'?'reopen':'complete'),t.unitId,'POST',{expectedUpdatedAt:t.updatedAt},crypto.randomUUID());
   if(identity()!==ctx)return false;
   await refresh(true);
   if(identity()!==ctx)return false;
   window.toast?.('Status confirmado pelo PostgreSQL');return true;
  }catch(e){if(identity()===ctx)report(e);return false;}
 }
 window.v66OpenTask=function(id=''){if(!production())return old.open?.(id);try{syncIdentity();if(!active())throw Error('Login central obrigatório');return form(id)}catch(e){report(e);return false}};
 window.v66SaveTask=save;
 window.v66CompleteTask=id=>production()?status(id):old.complete?.(id);
 window.v66ReopenTask=id=>production()?status(id):old.reopen?.(id);
 // V66 filter refresh re-renders the alert list directly; apply the same local-task mask.
 const priorV66Refresh=window.v66Refresh;
 if(typeof priorV66Refresh==='function')window.v66Refresh=function(){
  if(!production()||!pageActive())return priorV66Refresh.apply(this,arguments);
  const local=state(),previous=local?.managementTasks;
  let result;try{if(local)local.managementTasks=[];result=priorV66Refresh.apply(this,arguments);}
  finally{if(local)local.managementTasks=previous;}
  show();return result;
 };
 // V66 exposes read/metric methods used by navigation and other UI bridges.
 // Keep the original alert logic but never let it read shared browser tasks in production.
 const v66Public=window.__imperioV66;
 for(const methodName of ['manualRows','allItems','filteredItems','activeCount','renderActions']){
  const previousMethod=v66Public?.[methodName];if(typeof previousMethod!=='function')continue;
  v66Public[methodName]=function(){
   if(!production())return previousMethod.apply(this,arguments);
   const local=state(),previous=local?.managementTasks;
   let result;try{if(local)local.managementTasks=[];result=previousMethod.apply(this,arguments);}
   finally{if(local)local.managementTasks=previous;}
   if(methodName==='renderActions'&&pageActive())show();
   return result;
  };
 }
 // Preserve the V66 filter/alert/automation handlers and mask legacy manual rows only during its rendering.
 window.renderAdmin=function(){
  if(!production()||!pageActive())return old.render?.apply(this,arguments);
  syncIdentity();
  if(!active()){invalidate();return;}
  const local=state(),previous=local?.managementTasks;
  let out;try{if(local)local.managementTasks=[];out=old.render?.apply(this,arguments);}
  finally{if(local)local.managementTasks=previous;}
  show();refresh().catch(e=>{if(active())report(e)});return out;
 };
 try{renderAdmin=window.renderAdmin}catch{}
 const baseDisable=window.__imperioCentralApi?.disable;
 if(typeof baseDisable==='function')window.__imperioCentralApi.disable=function(){invalidate();return baseDisable.apply(this,arguments)};
 window.addEventListener?.('focus',()=>{if(production()&&pageActive()&&identity()!==context){invalidate();if(active())refresh().catch(report)}});
 window.__a4Task={refresh:force=>refresh(force===true).catch(e=>{if(active())report(e);return []}),
  status,filter,updateAssignees,invalidate,rows:()=>{if(identity()!==context)return [];return rows.slice()},
  counts:()=>({loaded:rows.length,filtered:filtered().length}),sourceOfTruth:'postgresql'};
})();
