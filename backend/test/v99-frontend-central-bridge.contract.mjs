import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const html=fs.readFileSync(path.join(repoRoot,'index.html'),'utf8');
let tests=0;
const ok=(value,message)=>{tests++;if(!value)throw new Error(message)};

ok(html.includes("units:[{id:'u1',name:'Big Shopping'"),'legado mantém IDs locais de unidade');
ok(html.includes("const CENTRAL_UNIT_MAP=Object.freeze({u1:'big',u2:'shopping-contagem',u3:'centro'"),'mapeamento local para central');
ok(html.includes("const LOCAL_UNIT_MAP=Object.freeze({big:'u1','shopping-contagem':'u2',centro:'u3'"),'mapeamento central para local');
ok(html.includes("function centralUnitId(){let local=localUnitId();return CENTRAL_UNIT_MAP[local]||local}"),'header usa ID central');
ok(html.includes("function centralCsrf(){try{return csrf()}catch(e){return ''}}"),'ponte reutiliza CSRF autenticado');
ok(html.includes("const PRODUCTION_API='https://imperio-backend-production-5086.up.railway.app'"),'frontend conhece API central de produção');
ok(html.includes("function defaultEndpoint(){try{let h=String(location?.hostname||'').toLowerCase();"),'frontend diferencia ambiente local de produção');
ok(html.includes("let uid=localUnitId();for(const x of rows||[])"),'agendamentos centrais entram no shape local');
ok(html.includes("localUid=localUnitId();for(const p of pros||[])"),'profissionais centrais entram na unidade local');
ok(html.includes("registrationUnit:toLocalUnitId(x.registrationUnitId)"),'unidade de cadastro de cliente volta ao ID local');
ok(html.includes("localUnitId:localUnitId(),unitId:centralUnitId()"),'status expõe IDs local e central');
ok(!html.includes("if(!centralEnabled()||id)return legacySaveClient"),'edição de cliente não cai silenciosamente no legado');
ok(!html.includes("if(!centralEnabled()||resDraft?.appendToBookingId)return legacySaveReservation"),'edição de agenda não cai silenciosamente no legado');
ok(html.includes("Edição de cliente ainda não liberada no modo central; nenhuma alteração foi salva."),'edição de cliente central bloqueada explicitamente');
ok(html.includes("Alteração de agendamento existente ainda não liberada no modo central; nenhuma alteração foi salva."),'edição de agenda central bloqueada explicitamente');
ok(html.includes("let wrapped=function auditClientBridge(id=''){if(!centralEnabled())return legacySaveClient.apply(this,arguments)"),'fallback de cliente preserva retorno síncrono legado');
ok(html.includes("let wrapped=function(){if(!centralEnabled())return legacySaveReservation.apply(this,arguments)"),'fallback de agenda preserva retorno síncrono legado');
ok(!html.includes("let wrapped=async function(id=''){if(!centralEnabled())return legacySaveClient"),'cliente não converte fallback legado em Promise');
ok(!html.includes("let wrapped=async function(){if(!centralEnabled())return legacySaveReservation"),'agenda não converte fallback legado em Promise');
ok(html.includes("function auditClientBridge"),'wrapper de cliente mantém marcador de auditoria detectável');

console.log(JSON.stringify({ok:true,tests,feature:'v99_frontend_central_bridge'}));
