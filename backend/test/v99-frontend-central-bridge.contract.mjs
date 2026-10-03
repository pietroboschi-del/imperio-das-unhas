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

console.log(JSON.stringify({ok:true,tests,feature:'v99_frontend_central_bridge'}));
