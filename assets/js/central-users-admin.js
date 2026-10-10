/* Central-only users administration. Never uses V63 identity or user writes. */
(function(){
 'use strict';
 const API=()=>window.__imperioCentralApi?.status?.().endpoint||'';
 const csrf=()=>sessionStorage.getItem('imperio-v96-shadow-csrf')||'';
 let principal=null, generation=0, users=[],units=[];
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const host=()=>document.getElementById('adminPage');
 function deny(message='Acesso administrativo central não autorizado'){principal=null;users=[];const h=host();if(h)h.innerHTML='<h2>Usuários e Acessos — Administração Central</h2><p role="alert">'+esc(message)+'</p>';}
 async function request(path,method='GET',body){
  const headers={Accept:'application/json'};
  if(body!==undefined)headers['Content-Type']='application/json';
  if(method!=='GET'){const token=csrf();if(!token)throw new Error('CSRF indisponível');headers['X-CSRF-Token']=token;}
  const response=await fetch(API()+path,{method,credentials:'include',headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
  if(response.status===401){window.__imperioCentralApi?.disable?.();if(typeof showOnly==='function')showOnly('loginApp');throw new Error('Sessão inválida ou expirada')}if(response.status===403)throw new Error('Sem autorização');
  if(!response.ok)throw new Error('Falha HTTP '+response.status);
  return response.json();
 }
 async function verify(){
  // This request is authoritative. A forged sessionStorage principal is never sufficient.
  const data=await request('/api/v1/auth/me');
  if(!data?.user?.userId||data.user.networkAdmin!==true)throw new Error('Acesso restrito ao administrador de rede');
  principal=data.user;
  const badge=document.getElementById('v63CurrentUserBadge');
  if(badge)badge.textContent=(principal.displayName||principal.username||'Master')+' · Administração da rede';
  return principal;
 }
 const permissions=['units.read','agenda.read','agenda.manage','clients.read','clients.manage','cash.read','cash.open','cash.close','cash.adjust','cash.reopen','finance.read','finance.manage','stock.read','stock.manage','catalog.read','catalog.manage','professionals.read','professionals.manage','reports.read'];
 function renderList(){
  const h=host();if(!h)return;
  h.innerHTML='<div class="page-head"><h1>Usuários e Acessos — Administração Central</h1><button class="btn btn-primary" id="centralUsersNew">Novo usuário</button></div><p>Fonte de verdade: backend central. Outras configurações permanecem restritas.</p><div id="centralUsersRows"></div>';
  const rows=document.getElementById('centralUsersRows');
  users.forEach(u=>{
   const item=document.createElement('div');item.className='report-card';
   item.innerHTML='<b>'+esc(u.displayName||u.username)+'</b> · '+esc(u.username)+' · '+(u.active?'Ativo':'Inativo')+(u.networkAdmin?' · Administrador da rede':'')+' ';
   if(!u.networkAdmin){const edit=document.createElement('button');edit.className='btn btn-soft btn-sm';edit.textContent='Editar';edit.addEventListener('click',()=>editor(u));item.appendChild(edit);}
   rows.appendChild(item);
  });
  document.getElementById('centralUsersNew').addEventListener('click',()=>editor(null));
 }
 function editor(u){
  if(!principal?.networkAdmin)return deny();
  const h=host();if(!h)return;
  const selected=new Set((u?.unitAccesses||[]).map(x=>x.unitId));
  const globals=new Set(u?.permissions||[]);
  h.innerHTML='<h2>'+esc(u?'Editar acesso central':'Novo usuário central')+'</h2><form id="centralUsersForm" class="form-grid">'+
   '<div class="field"><label>Nome<input name="displayName" required value="'+esc(u?.displayName||'')+'"></label></div>'+
   '<div class="field"><label>Login<input name="username" required value="'+esc(u?.username||'')+'"></label></div>'+
   '<div class="field"><label>Perfil<select name="systemRole"><option value="OPERATOR">Operação</option><option value="ADMINISTRATIVE">Administração</option></select></label></div>'+
   '<div class="field"><label><input type="checkbox" name="active" '+(u?.active!==false?'checked':'')+'> Ativo</label></div>'+
   '<fieldset><legend>Unidades</legend>'+units.map(x=>'<label class="check"><input type="checkbox" data-unit="'+esc(x.id)+'" '+(selected.has(x.id)?'checked':'')+'> '+esc(x.name||x.id)+'</label>').join('')+'</fieldset>'+
   '<fieldset><legend>Permissões por unidade</legend>'+units.filter(x=>selected.has(x.id)).map(x=>'<div><b>'+esc(x.name||x.id)+'</b>'+permissions.map(p=>'<label class="check"><input type="checkbox" data-unit-permission="'+esc(x.id)+'" value="'+p+'" '+(new Set((u?.unitAccesses||[]).find(a=>a.unitId===x.id)?.permissions||[]).has(p)?'checked':'')+'> '+p+'</label>').join('')+'</div>').join('')+'</fieldset>'+ 
   '<fieldset><legend>Permissões globais</legend>'+permissions.map(p=>'<label class="check"><input type="checkbox" data-global="'+p+'" '+(globals.has(p)?'checked':'')+'> '+p+'</label>').join('')+'</fieldset>'+
   '<div class="field full"><button class="btn btn-primary" type="submit">Salvar no backend</button> <button class="btn btn-soft" type="button" id="centralUsersBack">Voltar</button></div></form><p id="centralUsersMessage" role="status"></p>';
  h.querySelector('[name="systemRole"]').value=u?.systemRole||'OPERATOR';
  h.querySelector('#centralUsersBack').addEventListener('click',renderList);
  h.querySelector('#centralUsersForm').addEventListener('submit',async event=>{
   event.preventDefault();
   const form=event.currentTarget,submit=form.querySelector('[type="submit"]');submit.disabled=true;
   try{
    await verify();
    if(u?.networkAdmin)throw new Error('Conta Master protegida');
    const ids=[...form.querySelectorAll('[data-unit]:checked')].map(x=>x.dataset.unit);
    if(!ids.length)throw new Error('Selecione pelo menos uma unidade');
    const payload={displayName:form.elements.displayName.value.trim(),username:form.elements.username.value.trim(),systemRole:form.elements.systemRole.value,active:form.elements.active.checked,permissions:[...form.querySelectorAll('[data-global]:checked')].map(x=>x.dataset.global),units:ids.map(unitId=>({unitId,role:'reception',permissions:[...form.querySelectorAll('[data-unit-permission]:checked')].filter(x=>x.dataset.unitPermission===unitId).map(x=>x.value)}))};
    if(!payload.displayName||!payload.username)throw new Error('Nome e login obrigatórios');
    const saved=await request(u?'/api/v1/admin/users/'+encodeURIComponent(u.id)+'/access':'/api/v1/admin/users',u?'PATCH':'POST',payload);
    if(!u){
     // Activation is intentionally a separate, explicit owner action; no token is stored.
     await load();
     const note=document.createElement('p');note.textContent='Usuário criado. Para ativá-lo, gere o token temporário abaixo e compartilhe-o de forma segura.';
     const activate=document.createElement('button');activate.className='btn btn-soft';activate.textContent='Gerar token de ativação';
     activate.addEventListener('click',async()=>{activate.disabled=true;try{await verify();const result=await request('/api/v1/auth/users/'+encodeURIComponent(saved.id)+'/activation-token','POST',{});const output=document.createElement('textarea');output.readOnly=true;output.rows=3;output.value=result.token||'';output.setAttribute('aria-label','Token temporário de ativação');note.appendChild(output);activate.remove();}catch(e){note.textContent='Ativação indisponível: '+e.message;}});
     note.appendChild(activate);host()?.appendChild(note);
    }else await load();
   }catch(e){const msg=document.getElementById('centralUsersMessage');if(msg)msg.textContent=e.message;submit.disabled=false;if(/Sessão inválida|sem autorização|restrito/.test(e.message))deny(e.message);}
  });
 }
 async function load(){
  const current=++generation;
  try{
   await verify();
   const [list,unitList]=await Promise.all([request('/api/v1/admin/users'),request('/api/v1/units')]);
   if(current!==generation)return;
   users=Array.isArray(list)?list:[];units=Array.isArray(unitList)?unitList:[];
   renderList();
  }catch(e){if(current===generation)deny(e.message);}
 }
 function open(){
  if(typeof window.setPage==='function')window.setPage('central-users');
  else {const h=host();if(h)h.innerHTML='';load();}
 }
 function install(){
  const tabs=document.getElementById('adminTabs');if(!tabs||tabs.querySelector('#centralUsersNav'))return;
  const button=document.createElement('button');button.id='centralUsersNav';button.textContent='Usuários e Acessos';button.type='button';button.addEventListener('click',open);tabs.appendChild(button);
 }
 const baseNav=window.buildAdminNav;
 if(typeof baseNav==='function')window.buildAdminNav=function(){const r=baseNav.apply(this,arguments);install();verify().catch(()=>{});return r;};
 const baseSetPage=window.setPage;
 if(typeof baseSetPage==='function')window.setPage=function(target){
  if(target==='central-users'){if(typeof page!=='undefined')page=target;install();const h=host();if(h)h.innerHTML='<p>Verificando identidade no backend...</p>';load();return;}
  generation++;principal=null;return baseSetPage.apply(this,arguments);
 };
 const baseRender=window.renderAdmin;
 if(typeof baseRender==='function')window.renderAdmin=function(){if(typeof page!=='undefined'&&page==='central-users')return load();return baseRender.apply(this,arguments);};
 // Restore an existing owner cookie session when entering the staff area.
 // The backend /auth/me is the sole authority; browser storage only mirrors its validated response.
 const legacyStaffOpen=window.openLogin;
 if(typeof legacyStaffOpen==='function'){
  let restoring=false;
  const resumeStaff=async function(){
   if(restoring)return false;
   restoring=true;
   try{
    const identity=await request('/api/v1/auth/me');
    if(!identity?.user?.userId||identity.user.networkAdmin!==true)
     throw new Error('Reautenticação necessária');
    const token=await request('/api/v1/auth/csrf');
    if(!token?.csrfToken)throw new Error('Token CSRF indisponível');
    const [health,unitRows]=await Promise.all([request('/api/v1/health'),request('/api/v1/units')]);
    if(!health?.ok||!Array.isArray(unitRows))throw new Error('Estado central indisponível');
    const writeUnits=health.operationalWritesEnabled===true&&Array.isArray(health.operationalWriteUnits)?health.operationalWriteUnits:[];
    window.__imperioProfessionalUnitHydration?.hydrateUnits(unitRows);
    sessionStorage.setItem('imperio-v99-central-principal',JSON.stringify(identity.user));
    sessionStorage.setItem('imperio-v96-shadow-csrf',token.csrfToken);
    sessionStorage.setItem('imperio-v99-central-write-units',JSON.stringify(writeUnits));
    sessionStorage.setItem('imperio-v99-central-authenticated','1');
    showOnly('adminApp');
    buildAdminNav();
    renderAdmin();
    return true;
   }catch(e){
    // Never treat a prior sessionStorage value as proof of authorization.
    window.__imperioCentralApi?.disable?.();
    legacyStaffOpen();
    return false;
   }finally{restoring=false;}
  };
  window.openLogin=function(){
   if(!window.__imperioCentralApi?.status?.().endpoint)return legacyStaffOpen.apply(this,arguments);
   if(!/^https?:$/.test(location.protocol))return legacyStaffOpen.apply(this,arguments);
   return resumeStaff();
  };
 }
 install();
 window.__imperioCentralUsersSecure={open,verify,load};
})();
