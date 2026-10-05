import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const html=fs.readFileSync(path.join(repoRoot,'index.html'),'utf8');
let tests=0;const ok=(v,m)=>{tests++;if(!v)throw new Error(m)};

ok(html.includes("const UNIT_TO_CENTRAL=Object.freeze({u1:'big',u2:'shopping-contagem',u3:'centro'"),'mapeamento local para central');
ok(html.includes("const UNIT_TO_LOCAL=Object.freeze({big:'u1','shopping-contagem':'u2',centro:'u3'"),'mapeamento central para local');
ok(html.includes("const CENTRAL_UNIT_OPTIONS=Object.freeze([{localId:'u3',centralId:'centro'"),'seletor central possui as três unidades canônicas');
ok(html.includes('function centralFallbackCentralUnitId()'),'contexto estrutural possui fallback de unidade autorizado');
ok(html.includes("fetch(endpoint()+'/api/v1/health'"),'requisição central recupera gate atual quando o seletor está vazio');
ok(html.includes("let uid=opt.unitRequired===false?'':await ensureCentralUnitId()"),'escritas operacionais resolvem unidade e configuração estrutural pode ser global');
ok(html.includes("CENTRAL_CSRF_KEY='imperio-v96-shadow-csrf'"),'CSRF central usa armazenamento autenticado');
ok(html.includes("function centralCsrf(){try{return sessionStorage.getItem(CENTRAL_CSRF_KEY)||''}"),'escritas reutilizam CSRF da sessão backend');
ok(html.includes("const PRODUCTION_API='https://imperio-backend-production-5086.up.railway.app'"),'API central de produção configurada');
ok(html.includes("officialProductionMode()?PRODUCTION_API:'http://127.0.0.1:3000'"),'localhost permanece somente para desenvolvimento');
ok(html.includes("sourceOfTruth:centralEnabled()?'postgresql_central':'blocked_or_legacy_local'"),'status distingue fonte central de unidade bloqueada/desenvolvimento');
ok(html.includes("db.bookings=(db.bookings||[]).filter(b=>!(b.unit===uid&&b.date===date))"),'refresh central substitui agenda local da unidade/dia e evita mistura silenciosa');
ok(html.includes("registrationUnit:UNIT_TO_LOCAL[x.registrationUnitId]"),'cliente central retorna ao ID local de apresentação');
ok(html.includes("if(!officialProductionMode())"),'produção não autentica silenciosamente pelo legado');
ok(html.includes("applyCentralUnitGate();renderAdmin();toast('Sessão central autenticada ✓')"),'login central aplica gate antes da operação');
ok(html.includes("createBlockSeries(body,key=operationKey('block_series'))"),'ponte expõe bloqueio recorrente central');
ok(html.includes("updateClient(id,body)"),'ponte expõe atualização central de cliente');
ok(html.includes("updateBooking(id,body)"),'ponte expõe atualização central de agenda');
ok(!html.includes("Edição de cliente ainda não liberada no modo central; nenhuma alteração foi salva."),'edição de cliente não está artificialmente bloqueada');
ok(!html.includes("Alteração de agendamento existente ainda não liberada no modo central; nenhuma alteração foi salva."),'edição de agenda não está artificialmente bloqueada');

ok(html.includes("V99 · PUBLIC BOOKING CENTRAL CATALOG"),'ponte pública central está instalada');
ok(html.includes("centralPublicRequest('/api/v1/public/catalog?unitId='+encodeURIComponent(centralId))"),'frontend público lê catálogo central por unidade');
ok(html.includes("credentials:'omit'"),'rotas públicas não dependem da sessão administrativa');
ok(html.includes("centralPublicRequest('/api/v1/public/occupancy?unitId='+encodeURIComponent(centralId)+'&date='+encodeURIComponent(date))"),'busca de horário consulta ocupação central antes de calcular disponibilidade');
ok(html.includes("centralPublicRequest('/api/v1/public/bookings',{method:'POST',body,key:bk.centralOperationKey"),'confirmação pública grava no endpoint central com idempotência');
ok(html.includes("if(!production())return legacyOpenBooking.apply(this,arguments)"),'desenvolvimento local mantém o fluxo legado');
ok(html.includes("Agendamento em breve"),'unidades bloqueadas não oferecem escrita pública');
ok(html.includes("sourceOfTruth:'postgresql_public_catalog_and_occupancy'"),'fonte pública oficial fica declarada como PostgreSQL');
ok(html.includes("function v56PublicAvailabilityCalculation(unitId,date,serviceIds,preferredPro=''"),'motor público aceita unidade, data, serviços e preferência explicitamente');
ok(html.includes("window.__imperioPublicAvailabilityEngine={calculate:v56PublicAvailabilityCalculation}"),'motor público reutilizável é exposto sem duplicar algoritmo');
ok(html.includes("async function queryAvailability(unitId,date,serviceIds,preferredPro=''"),'consulta silenciosa aceita parâmetros explícitos');
ok(html.includes('let snapshot=availabilityStateSnapshot();')&&html.includes('finally{restoreAvailabilityState(snapshot)}'),'consulta silenciosa restaura estado temporário de disponibilidade');
ok(html.includes('generation=++slotSearchGeneration')&&html.includes("JSON.stringify((bk.serviceIds||[]).map(String))===JSON.stringify(serviceIds)")&&html.includes("String(document.getElementById('bkPublicPro')?.value??bk.pro??'')===preferredPro"),'busca pública rejeita resposta obsoleta após mudança de unidade/data/serviços/preferência');
ok(html.includes('queryAvailability,findAlternativeRecommendations,useAlternativeRecommendation,submitBooking'),'ponte pública expõe disponibilidade isolada e recomendação entre unidades');
ok(html.includes("if((bk.publicResults||[]).length)return true;"),'unidade original com horário encerra a busca sem recomendações');
ok(html.includes("findAlternativeRecommendations(localId,date,serviceIds,preferredPro,stillCurrent)"),'alternativas só são buscadas depois do zero na unidade normal');
ok(html.includes("dates=[String(date),addDaysISO(String(date),1)]"),'recomendação consulta mesma data antes do dia seguinte');
ok(html.includes("!data?.bookingEnabled||!catalogHasAllServices(data,ids)"),'alternativa exige bookingEnabled e todos os serviços');
ok(html.includes("if(preferredPro&&supportsPreferred)")&&html.includes("queryAvailability(centralId,candidateDate,ids,preferredPro)")&&html.includes("queryAvailability(centralId,candidateDate,ids,'')"),'preferência profissional é tentada antes do fallback sem preferência');
ok(html.includes("slice(0,2)"),'interface limita recomendações a duas unidades');
ok(html.includes('Disponível com outra profissional'),'fallback de profissional é sinalizado na interface');
ok(html.includes('window.v99PublicUseRecommendation=useAlternativeRecommendation'),'botão de recomendação usa orquestrador dedicado');
ok(html.includes("return window.v56PublicSearchSlots()"),'clique na recomendação retorna ao fluxo normal de searchSlots');

const recStart=html.indexOf('function catalogHasAllServices('),recEnd=html.indexOf('function renderAlternativeRecommendations(',recStart);
ok(recStart>=0&&recEnd>recStart,'bloco puro de recomendação localizado');
const recSource=html.slice(recStart,recEnd);
const UNIT_TO_CENTRAL={u1:'big',u2:'shopping-contagem',u3:'centro',big:'big','shopping-contagem':'shopping-contagem',centro:'centro'};
const UNIT_TO_LOCAL={big:'u1','shopping-contagem':'u2',centro:'u3',u1:'u1',u2:'u2',u3:'u3'};
const selectedDate='2026-10-06',nextDate='2026-10-07',calls=[];
const visible=[
 {id:'big',name:'Big Shopping'},
 {id:'missing',name:'Sem todos os serviços'},
 {id:'noschedule',name:'Sem escala'},
 {id:'shopping-contagem',profile:{publicName:'Shopping Contagem'}},
 {id:'centro',profile:{publicName:'Centro de Contagem'}},
 {id:'third',name:'Terceira alternativa'}
];
const catalogsById={
 missing:{unit:{id:'missing',name:'Sem todos os serviços'},bookingEnabled:true,services:[{id:'s1'}],professionals:[]},
 noschedule:{unit:{id:'noschedule',name:'Sem escala'},bookingEnabled:true,services:[{id:'s1'},{id:'s2'}],professionals:[{id:'p1',serviceIds:['s1','s2']}]},
 'shopping-contagem':{unit:{id:'shopping-contagem',name:'Shopping Contagem'},bookingEnabled:true,services:[{id:'s1'},{id:'s2'}],professionals:[{id:'p1',serviceIds:['s1','s2']}]},
 centro:{unit:{id:'centro',name:'Centro de Contagem'},bookingEnabled:true,services:[{id:'s1'},{id:'s2'}],professionals:[{id:'p1',serviceIds:['s1','s2']}]},
 third:{unit:{id:'third',name:'Terceira alternativa'},bookingEnabled:true,services:[{id:'s1'},{id:'s2'}],professionals:[{id:'p1',serviceIds:['s1','s2']}]}
};
const queryStub=async(unit,date,services,pro)=>{
 calls.push({unit,date,services:[...services],pro});
 if(unit==='shopping-contagem'&&date===selectedDate&&pro==='p1')return [{date,start:'18:30',assignments:[{serviceId:'s1',proId:'p1'},{serviceId:'s2',proId:'p1'}]}];
 if(unit==='centro'&&date===nextDate&&pro==='')return [{date,start:'09:30',assignments:[{serviceId:'s1',proId:'p2'},{serviceId:'s2',proId:'p3'}]}];
 if(unit==='third')return [{date,start:'08:00',assignments:[]}];
 return [];
};
const addDays=(iso,n)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const recFactory=new Function('UNIT_TO_CENTRAL','UNIT_TO_LOCAL','publicUnits','catalog','queryAvailability','addDaysISO','localDateISO','availabilityDateLabel',recSource+';return {findAlternativeRecommendations,catalogHasAllServices,catalogSupportsPreferred};');
const recApi=recFactory(UNIT_TO_CENTRAL,UNIT_TO_LOCAL,async()=>visible,async id=>catalogsById[id],queryStub,addDays,()=>selectedDate,d=>d);
const recommendations=await recApi.findAlternativeRecommendations('u1',selectedDate,['s1','s2'],'p1',()=>true);
ok(recommendations.length===2,'no máximo duas sugestões são retornadas');
ok(recommendations[0].centralUnitId==='shopping-contagem'&&recommendations[0].date===selectedDate&&recommendations[0].slot.start==='18:30','mesma data tem prioridade e primeiro horário válido da unidade é usado');
ok(recommendations[0].fallbackProfessional===false,'mesma profissional é preservada quando existe horário válido');
ok(recommendations[1].centralUnitId==='centro'&&recommendations[1].date===nextDate&&recommendations[1].slot.start==='09:30','dia seguinte é consultado quando a mesma data não tem vaga');
ok(recommendations[1].fallbackProfessional===true,'fallback sem preferência é marcado quando necessário');
ok(!recommendations.some(x=>x.centralUnitId==='big'),'unidade atual nunca é sugerida');
ok(!recommendations.some(x=>x.centralUnitId==='missing'),'unidade sem todos os serviços não é sugerida');
ok(!recommendations.some(x=>x.centralUnitId==='noschedule'),'unidade sem horário calculado/escala não é sugerida');
ok(!calls.some(x=>x.unit==='missing'),'unidade sem todos os serviços nem consulta disponibilidade');
ok(calls.findIndex(x=>x.unit==='shopping-contagem'&&x.pro==='p1')<calls.findIndex(x=>x.unit==='centro'&&x.pro===''),'consulta com preferência ocorre antes do fallback sem preferência');
ok(!calls.some(x=>x.unit==='shopping-contagem'&&x.date===nextDate),'dia seguinte não é consultado quando a mesma data já encontrou vaga');
const staleRecommendations=await recApi.findAlternativeRecommendations('u1',selectedDate,['s1','s2'],'p1',()=>false);
ok(staleRecommendations===null,'resultado silencioso obsoleto é descartado');

const useStart=html.indexOf('async function useAlternativeRecommendation('),useEnd=html.indexOf('\n async function searchSlots(base){',useStart);
ok(useStart>=0&&useEnd>useStart,'orquestrador do clique localizado');
const useSource=html.slice(useStart,useEnd);
ok(!useSource.includes('/api/v1/public/bookings')&&!useSource.includes('submitBooking')&&!useSource.includes('bookingStep(4)'),'recomendação não cria booking nem avança para confirmação');
const renderStart=html.indexOf('function renderAlternativeRecommendations('),renderEnd=html.indexOf('\n async function useAlternativeRecommendation(',renderStart),renderSource=html.slice(renderStart,renderEnd);
ok(renderSource.includes('v99-public-alt-title')&&renderSource.includes('Não encontramos horário nesta unidade'),'E2C destaca ausência de horário na unidade escolhida');
ok(renderSource.includes('v99-public-alt-subtitle')&&renderSource.includes('Encontramos estas opções em outras unidades:'),'E2C apresenta introdução clara para alternativas');
ok(renderSource.includes('v99-public-alt-unit')&&renderSource.includes('v99-public-alt-date')&&renderSource.includes('v99-public-alt-time'),'E2C separa unidade, data e horário por hierarquia visual');
ok(renderSource.includes('v99-public-alt-note')&&renderSource.includes('Disponível com outra profissional'),'E2C preserva aviso discreto do fallback profissional');
ok(renderSource.includes('v99-public-alt-action')&&renderSource.includes('Ver este horário'),'E2C usa ação dedicada e fácil de tocar');
ok(renderSource.includes('v99-public-alt-empty')&&renderSource.includes('Nenhuma alternativa disponível agora.'),'E2C possui estado visual para ausência de alternativa');
ok(html.includes('v99-public-alt-loading')&&html.includes('Procurando opções em outras unidades...'),'E2C possui estado visual de carregamento das alternativas');
ok(html.includes('.v99-public-alt-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))'),'E2C usa grid responsivo sem forçar largura mínima');
ok(html.includes('@media(max-width:560px)')&&html.includes('.v99-public-alt-list{grid-template-columns:1fr}'),'E2C empilha sugestões no celular');
ok(html.includes('@media(max-width:430px)')&&html.includes('.v99-public-alt-slots{gap:12px;width:100%;max-width:100%;overflow:hidden}'),'E2C protege faixa 320–430 px contra overflow horizontal');
ok(html.includes('.v99-public-alt-action{width:100%;max-width:100%;min-height:48px;padding:11px 14px}'),'E2C mantém botão com largura e alvo de toque adequados no celular');
ok(!renderSource.includes('style="'),'E2C remove estilos inline da renderização das sugestões');
function clickHarness(catalogImpl){
 let dateEl={value:selectedDate},proEl={value:'p1'},searchCalls=0,applyCalls=0,toasts=[],bk={unit:'u1',date:selectedDate,pro:'p1',serviceIds:['s1','s2'],assignments:[{old:true}],publicResults:[{old:true}],time:'17:00'};
 let document={getElementById:id=>id==='bkPublicDate'?dateEl:id==='bkPublicPro'?proEl:null};
 let window={bk,v56PublicRenderProfessionalOptions:()=>{},v56PublicSearchSlots:async()=>{searchCalls++;return true}};
 let factory=new Function('document','window','bk','catalog','catalogHasAllServices','toast','UNIT_TO_LOCAL','initialState','applyCatalog',`let slotSearchGeneration=0,alternativeRecommendationState=initialState;${useSource};return {useAlternativeRecommendation,get:()=>({generation:slotSearchGeneration,state:alternativeRecommendationState,searchCalls,bk,date:document.getElementById('bkPublicDate').value,pro:document.getElementById('bkPublicPro').value})};`);
 let state=[{centralUnitId:'shopping-contagem',localUnitId:'u2',unitName:'Shopping Contagem',date:nextDate,slot:{start:'09:30'},preferredPro:'p1',fallbackProfessional:true,serviceIds:['s1','s2']}];
 let api=factory(document,window,bk,catalogImpl,(data,ids)=>ids.every(id=>data.services.some(s=>s.id===id)),m=>toasts.push(m),UNIT_TO_LOCAL,state,()=>{applyCalls++});
 return {api,bk,dateEl,proEl,get searchCalls(){return searchCalls},get applyCalls(){return applyCalls},toasts};
}
const validCatalog={bookingEnabled:true,services:[{id:'s1'},{id:'s2'}]};
const click=clickHarness(async()=>validCatalog);
await click.api.useAlternativeRecommendation(0);
ok(click.bk.unit==='u2'&&click.bk.date===nextDate,'clique troca unidade e data para a sugestão');
ok(click.bk.pro===''&&click.proEl.value==='','fallback limpa a preferência antes da busca normal');
ok(click.bk.assignments.length===0&&click.bk.publicResults.length===0&&click.bk.time===null,'clique não reutiliza slot/assignment da recomendação');
ok(click.searchCalls===1,'clique executa exatamente uma nova busca normal');
let resolveCatalog;const pendingCatalog=new Promise(r=>{resolveCatalog=r}),staleClick=clickHarness(()=>pendingCatalog),pending=staleClick.api.useAlternativeRecommendation(0);
staleClick.dateEl.value='2026-10-08';resolveCatalog(validCatalog);await pending;
ok(staleClick.bk.unit==='u1'&&staleClick.searchCalls===0,'mudança rápida de data descarta clique assíncrono obsoleto');

const markerIndex=html.indexOf('V99 · PUBLIC BOOKING CENTRAL CATALOG'),scriptOpen=html.lastIndexOf('<script',markerIndex),scriptBody=html.indexOf('>',scriptOpen)+1,scriptClose=html.indexOf('</script>',markerIndex);
new Function(html.slice(scriptBody,scriptClose));tests++;


console.log(JSON.stringify({ok:true,tests,feature:'v99_frontend_central_bridge'}));
