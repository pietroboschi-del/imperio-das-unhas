/* A4: central manual-task source of truth. No implicit migration of browser tasks. */
(function(){
 'use strict';
 const map={u1:'big',u2:'shopping-contagem',u3:'centro'};
 const production=()=>location.protocol!=='file:'&&!['','localhost','127.0.0.1'].includes(location.hostname);
 const active=()=>!!window.__imperioCentralApi?.status?.()?.endpoint&&sessionStorage.getItem('imperio-v99-central-authenticated')==='1';
 const principal=()=>{try{return JSON.parse(sessionStorage.getItem('imperio-v99-central-principal')||'null')}catch{return null}};
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const report=e=>window.toast?.('Tarefas: '+String(e?.message||e));
 const allowed=(unit,perm)=>{let p=principal();if(!p)return false;if(p.networkAdmin)return true;let a=p.unitAccesses?.find(x=>x.unitId===unit);let g=[...(p.permissions||[]),...(a?.permissions||[])];return !!a&&(g.includes('*')||g.includes(perm))};
 const units=(perm)=>['centro','big','shopping-contagem'].filter(u=>allowed(u,perm));
 const state=()=>typeof db!=='undefined'?db:window.db;
 const pageActive=()=>typeof page!=='undefined'&&page==='actions';
 let rows=[],people=[],busy=false,key='';
 const old={render:window.renderAdmin,open:window.v66OpenTask,save:window.v66SaveTask,complete:window.v66CompleteTask,reopen:window.v66ReopenTask,refresh:window.v66Refresh};
 async function api(path,unit,method='GET',body,idempotency){
  if(!active())throw Error('Sessão central indisponível');
  const headers={Accept:'application/json','X-Unit-Id':unit};
  if(body!==undefined)headers['Content-Type']='application/json';
  if(method!=='GET'){let csrf=sessionStorage.getItem('imperio-v96-shadow-csrf');if(!csrf)throw Error('Token CSRF ausente');headers['X-CSRF-Token']=csrf;headers['Idempotency-Key']=idempotency||crypto.randomUUID()}
  const r=await fetch(window.__imperioCentralApi.status().endpoint+path,{method,body:body===undefined?undefined:JSON.stringify(body),headers,credentials:'include',cache:'no-store'});
  const result=await r.json().catch(()=>null);
  if(!r.ok)throw Error(Array.isArray(result?.message)?result.message.join(', '):result?.message||'HTTP '+r.status);
  return result;
 }
 function show(){
  if(!pageActive())return;
  let host=document.getElementById('adminPage');if(!host)return;
  let target=host.querySelector('#a4TaskCentral');if(!target){target=document.createElement('section');target.id='a4TaskCentral';host.prepend(target)}
  let items=rows.map(t=>'<div class="v66-item"><div class="v66-main"><h4>'+escape(t.title)+'</h4><p>'+escape(t.note||'')+'</p><div class="v66-meta"><span class="v66-chip">'+escape(t.unitId)+'</span><span class="v66-chip">'+escape(t.priority)+'</span><span class="v66-chip">'+escape(t.dueDate?String(t.dueDate).slice(0,10):'Sem prazo')+'</span><span class="v66-chip">'+escape(t.status==='DONE'?'Concluída':'Aberta')+'</span><span class="v66-chip">'+escape(people.find(p=>p.id===t.assignedUserId)?.displayName||t.assignedUserId)+'</span></div></div><div class="v66-actions">'+((allowed(t.unitId,'tasks.manage')&&t.sourceType==='MANUAL')?'<button class="btn btn-ghost btn-sm" onclick="v66OpenTask(\''+escape(t.id)+'\')">Editar</button><button class="btn btn-primary btn-sm" onclick="window.__a4Task.status(\''+escape(t.id)+'\')">'+(t.status==='DONE'?'Reabrir':'Concluir')+'</button>':'')+'</div></div>').join('');
  target.innerHTML='<div class="card" style="padding:15px;margin-bottom:16px"><div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center"><h3 style="margin:0">Tarefas centrais — PostgreSQL</h3><button class="btn btn-ghost btn-sm" onclick="window.__a4Task.refresh()">Atualizar</button><button class="btn btn-primary btn-sm" onclick="v66OpenTask()">+ Nova tarefa</button></div><p class="muted">Sem importação automática de tarefas antigas armazenadas neste computador.</p>'+(items?'<div class="v66-list">'+items+'</div>':'<p class="muted">Sem tarefas centrais visíveis.</p>')+'</div>';
 }
 async function refresh(){
  if(!production())return [];
  if(!active()){rows=[];show();throw Error('Autenticação no backend obrigatória')}
  if(busy)return rows;busy=true;
  try{
   const parts=await Promise.all(units('tasks.read').map(async u=>{
    let all=[],cursor='';for(let i=0;i<100;i++){
     let page=await api('/api/v1/tasks'+(cursor?'?cursor='+encodeURIComponent(cursor):''),u);
     if(!Array.isArray(page))throw Error('Lista inválida');
     all.push(...page);if(page.length<200)return all;
     cursor=page[page.length-1]?.id;if(!cursor)throw Error('Página sem cursor');
    }throw Error('Limite da listagem de tarefas atingido');
   }));
   rows=parts.flat();
   people=[{id:principal()?.userId,displayName:principal()?.displayName||'Eu',active:true}];
   if(principal()?.networkAdmin){try{people=await api('/api/v1/admin/users','centro')}catch{}}
   show();return rows;
  }catch(e){rows=[];show();throw e}finally{busy=false}
 }
 function form(id=''){
  let t=rows.find(x=>x.id===id),allowedUnits=units('tasks.manage');
  if(id&&!t)throw Error('Tarefa não localizada no PostgreSQL');
  if(!allowedUnits.length)throw Error('Sem permissão de gerenciamento');
  let unit=t?.unitId||map[document.getElementById('unitPicker')?.value]||document.getElementById('unitPicker')?.value||allowedUnits[0];
  if(!allowedUnits.includes(unit))unit=allowedUnits[0];
  let owner=t?.assignedUserId||principal()?.userId;
  const candidates=people.filter(p=>p.active!==false&&(p.id===principal()?.userId||p.networkAdmin||p.unitAccesses?.some(a=>a.active!==false&&a.unitId===unit)));
  if(!candidates.some(p=>p.id===owner))candidates.push({id:owner,displayName:owner});
  modal(t?'Editar tarefa central':'Nova tarefa central','<div class="v66-task-form"><div class="field full"><label>Título</label><input id="a4Title" maxlength="160" value="'+escape(t?.title||'')+'"></div><div class="field"><label>Prazo</label><input id="a4Due" type="date" value="'+escape(t?.dueDate?String(t.dueDate).slice(0,10):'')+'"></div><div class="field"><label>Prioridade</label><select id="a4Priority">'+['low','normal','high','critical'].map(p=>'<option value="'+p+'" '+((t?.priority||'normal')===p?'selected':'')+'>'+p+'</option>').join('')+'</select></div><div class="field"><label>Categoria</label><select id="a4Category">'+['general','finance','clients','stock','professionals','partnership'].map(p=>'<option value="'+p+'" '+((t?.category||'general')===p?'selected':'')+'>'+p+'</option>').join('')+'</select></div><div class="field"><label>Unidade</label><select id="a4Unit" '+(t?'disabled':'')+'>'+allowedUnits.map(u=>'<option value="'+u+'" '+(u===unit?'selected':'')+'>'+u+'</option>').join('')+'</select></div><div class="field"><label>Responsável</label><select id="a4Assignee">'+candidates.map(p=>'<option value="'+escape(p.id)+'" '+(owner===p.id?'selected':'')+'>'+escape(p.displayName||p.username||p.id)+'</option>').join('')+'</select></div><div class="field full"><label>Observação</label><textarea id="a4Note" maxlength="2000">'+escape(t?.note||'')+'</textarea></div></div>','<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="v66SaveTask(\''+escape(id)+'\')">Salvar no PostgreSQL</button>');
  key=crypto.randomUUID();return true;
 }
 async function save(id=''){
  if(!production())return old.save?.(id);
  let t=rows.find(x=>x.id===id),value=k=>document.getElementById(k)?.value||'';
  let unit=value('a4Unit'),body={title:value('a4Title').trim(),dueDate:value('a4Due')||null,priority:value('a4Priority'),category:value('a4Category'),unitId:unit,assignedUserId:value('a4Assignee'),note:value('a4Note').trim()};
  if(t)body.expectedUpdatedAt=t.updatedAt;
  try{
   if(!active()||!allowed(unit,'tasks.manage'))throw Error('Acesso central não autorizado');
   if(!body.title)throw Error('Título obrigatório');
   await api('/api/v1/tasks'+(t?'/'+encodeURIComponent(t.id):''),unit,t?'PATCH':'POST',body,key||(key=crypto.randomUUID()));
   await refresh();key='';closeModal();window.toast?.('Tarefa gravada no PostgreSQL');return true;
  }catch(e){report(e);return false}
 }
 async function status(id){
  if(!production())return false;
  let t=rows.find(x=>x.id===id);if(!t)return false;
  try{if(!allowed(t.unitId,'tasks.manage'))throw Error('Sem permissão');
   await api('/api/v1/tasks/'+encodeURIComponent(id)+'/'+(t.status==='DONE'?'reopen':'complete'),t.unitId,'POST',{expectedUpdatedAt:t.updatedAt},crypto.randomUUID());
   await refresh();window.toast?.('Status confirmado pelo PostgreSQL');return true;
  }catch(e){report(e);return false}
 }
 window.v66OpenTask=function(id=''){if(!production())return old.open?.(id);try{if(!active())throw Error('Login central obrigatório');return form(id)}catch(e){report(e);return false}};
 window.v66SaveTask=save;
 window.v66CompleteTask=id=>production()?status(id):old.complete?.(id);
 window.v66ReopenTask=id=>production()?status(id):old.reopen?.(id);
 window.v66Refresh=function(){if(!production())return old.refresh?.();refresh().catch(report)};
 let visiblePrincipal=null;
 window.renderAdmin=function(){const actor=active()?principal()?.userId||null:null;if(actor!==visiblePrincipal){rows=[];people=[];visiblePrincipal=actor}let local=state(),masked=production()&&pageActive()&&local,prior=masked?local.managementTasks:null,out;try{if(masked)local.managementTasks=[];out=old.render?.apply(this,arguments)}finally{if(masked)local.managementTasks=prior}if(production()&&pageActive()){show();refresh().catch(report)}return out};
 try{renderAdmin=window.renderAdmin}catch{}
 window.__a4Task={refresh:()=>refresh().catch(report),status,rows:()=>rows,sourceOfTruth:'postgresql'};
})();
