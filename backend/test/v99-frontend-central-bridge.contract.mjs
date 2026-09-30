import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const html=fs.readFileSync(path.join(repoRoot,'index.html'),'utf8');
let tests=0;const ok=(v,m)=>{tests++;if(!v)throw new Error(m)};

ok(html.includes("const UNIT_TO_CENTRAL=Object.freeze({u1:'big',u2:'shopping-contagem',u3:'centro'"),'mapeamento local para central');
ok(html.includes("const UNIT_TO_LOCAL=Object.freeze({big:'u1','shopping-contagem':'u2',centro:'u3'"),'mapeamento central para local');
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

console.log(JSON.stringify({ok:true,tests,feature:'v99_frontend_central_bridge'}));
