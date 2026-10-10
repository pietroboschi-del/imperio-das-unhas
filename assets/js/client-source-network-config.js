/* Phase 5: client acquisition sources live in Postgres for all three units.
 * No implicit writes, no local-only personalization, no trusts from local roles. */
(function(){
 'use strict';
 const KEY='clients.source';
 const ROUTE='/api/v1/config/client-sources';
 let serverVersion=null, busy=false, loaded=false;
 const original={};
 const production=()=>location.protocol!=='file:'&&location.hostname!=='localhost'&&location.hostname!=='127.0.0.1';
 const endpoint=()=>String(window.__imperioCentralApi?.status?.()?.endpoint||'https://imperio-backend-production-5086.up.railway.app').replace(/\/+$/,'');
 const principal=()=>{try{
   if(sessionStorage.getItem('imperio-v99-central-authenticated')!=='1')return null;
   return JSON.parse(sessionStorage.getItem('imperio-v99-central-principal')||'null');
 }catch(e){return null}};
 const owner=()=>{const p=principal();return !!p&&p.networkAdmin===true&&p.systemRole==='OWNER'&&!!(p.userId||p.id)};
 const notify=s=>{if(typeof window.toast==='function')window.toast(s);else console.warn(s)};
 async function request(method,body){
   const headers={Accept:'application/json'};
   if(body!==undefined)headers['Content-Type']='application/json';
   if(method!=='GET'){
     const csrf=sessionStorage.getItem('imperio-v96-shadow-csrf');
     if(!csrf)throw new Error('Token de sessão ausente. Reabra a Área da equipe.');
     headers['X-CSRF-Token']=csrf;
   }
   const res=await fetch(endpoint()+ROUTE,{method,credentials:'include',headers,
     ...(body!==undefined?{body:JSON.stringify(body)}:{})});
   const data=await res.json().catch(()=>null);
   if(!res.ok)throw new Error((Array.isArray(data?.message)?data.message.join(' · '):data?.message)||('HTTP '+res.status));
   if(!data||!Array.isArray(data.options)||!Number.isSafeInteger(data.version))
     throw new Error('Configuração central de origem inválida');
   return data;
 }
 function apply(data){
   if(!data||!Array.isArray(data.options)||!Number.isSafeInteger(data.version))
     throw new Error('Resposta central inválida');
   const opts=data.options.map((o,i)=>({
     id:String(o.id),label:String(o.label),value:String(o.label),
     active:o.active!==false,order:Number(o.order||((i+1)*10)),
     isDefault:o.isDefault===true,previousLabels:Array.isArray(o.previousLabels)?o.previousLabels.map(String):[],
     legacy:false,
   }));
   if(!opts.some(o=>o.active))throw new Error('Nenhuma opção de origem ativa no servidor');
   if(!window.db||!db.systemSettings||!db.systemSettings.optionSets)
     throw new Error('Configuração de formulário indisponível');
   const current=db.systemSettings.optionSets[KEY]||{};
   db.systemSettings.optionSets[KEY]={...current,key:KEY,label:'Como conheceu',
     module:'clients',field:'source',scope:'global',unitOverrides:{},options:opts};
   db.acquisitionSources=opts.map(o=>({id:o.id,name:o.label,active:o.active,order:o.order}));
   serverVersion=data.version;loaded=true;
 }
 async function refresh(){
   if(!production())return false;
   const data=await request('GET');
   apply(data);return true;
 }
 function mutate(kind,args){
   const existing=db.systemSettings?.optionSets?.[KEY]?.options||[];
   const options=existing.map(o=>({...o,previousLabels:[...(o.previousLabels||[])]}));
   const id=String(args[1]||''),target=options.find(o=>o.id===id);
   const duplicate=label=>options.some(o=>o.id!==id&&String(o.label).trim().toLocaleLowerCase('pt-BR')===label.trim().toLocaleLowerCase('pt-BR'));
   if(kind==='add'){
     const text=String(document.getElementById('v71NewOption')?.value||'').trim();
     if(!text||text.length>100||duplicate(text))throw new Error('Informe uma opção nova válida, sem duplicação');
     options.push({id:'opt_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),label:text,active:true,order:options.length*10+10,isDefault:false,previousLabels:[]});
   }else{
     if(!target)throw new Error('Opção não encontrada');
     if(kind==='rename'){
       const text=String(args[2]||'').trim();
       if(!text||text.length>100||duplicate(text))throw new Error('Nome inválido ou repetido');
       if(target.label!==text){
         if(target.label&&!target.previousLabels.includes(target.label))target.previousLabels.push(target.label);
         target.label=text;
       }
     }else if(kind==='toggle'){
       if(target.active&&options.filter(o=>o.active).length===1)throw new Error('Mantenha pelo menos uma opção ativa');
       target.active=!target.active;
       if(!target.active)target.isDefault=false;
     }else if(kind==='move'){
       const ordered=options.sort((a,b)=>a.order-b.order);
       const i=ordered.findIndex(o=>o.id===id),j=i+Number(args[2]||0);
       if(j<0||j>=ordered.length)return null;
       [ordered[i],ordered[j]]=[ordered[j],ordered[i]];
       ordered.forEach((o,n)=>o.order=(n+1)*10);
     }else if(kind==='default'){
       if(!target.active)throw new Error('Opção inativa não pode ser padrão');
       options.forEach(o=>o.isDefault=o.id===id);
     }
   }
   return options.map((o,i)=>({id:o.id,label:o.label,active:o.active!==false,
     order:(i+1)*10,isDefault:!!o.isDefault,previousLabels:o.previousLabels||[]}));
 }
 async function change(kind,args){
   if(busy)return false;
   busy=true;
   try{
     if(!owner())throw new Error('Apenas a Administração da rede pode alterar estas opções');
     // Always fetch latest network revision to prevent silent overwrites.
     await refresh();
     const next=mutate(kind,args);
     if(next===null)return false;
     const saved=await request('PUT',{expectedVersion:serverVersion,options:next});
     apply(saved);
     const list=document.getElementById('v71OptionList');
     if(list&&original.openOptionSet)original.openOptionSet(KEY);
     notify('Opções salvas para as três unidades ✓');
     return true;
   }catch(e){
     // No local mutation before server acknowledged the change.
     notify('Configuração não salva: '+e.message);
     return false;
   }finally{busy=false}
 }
 function install(){
   const wrappers=[
     ['openClientForm',async function(base,args){try{await refresh();return base.apply(this,args)}catch(e){notify('Não foi possível carregar “Como conheceu”: '+e.message);return false}}],
     ['openQuickClientFromReservation',async function(base,args){try{await refresh();return base.apply(this,args)}catch(e){notify('Não foi possível carregar “Como conheceu”: '+e.message);return false}}],
     ['v71OpenFieldsSettings',async function(base,args){try{await refresh();return base.apply(this,args)}catch(e){notify('Configurações centrais indisponíveis: '+e.message);return false}}],
     ['v71OpenOptionSet',async function(base,args){try{await refresh();return base.apply(this,args)}catch(e){notify('Opções centrais indisponíveis: '+e.message);return false}}],
   ];
   for(const [name,wrap] of wrappers){
     const base=window[name];if(typeof base!=='function')continue;
     original[name==='v71OpenOptionSet'?'openOptionSet':name]=base;
     const fn=function(...args){if(!production())return base.apply(this,args);return wrap.call(this,base,args)};
     window[name]=fn;try{if(name==='openClientForm')openClientForm=fn;else if(name==='openQuickClientFromReservation')openQuickClientFromReservation=fn}catch(e){}
   }
   for(const [name,kind] of [['v71AddOption','add'],['v71RenameOption','rename'],['v71ToggleOption','toggle'],['v71MoveOption','move'],['v71SetDefaultOption','default']]){
     const base=window[name];if(typeof base!=='function')continue;
     window[name]=function(...args){
       if(!production()||String(args[0])!==KEY)return base.apply(this,args);
       return change(kind,args);
     };
   }
   window.__imperioNetworkClientSources={refresh,status:()=>({loaded,version:serverVersion,network:true})};
 }
 install();
})();