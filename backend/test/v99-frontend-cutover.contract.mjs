import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
let n=0;const ok=(v,m)=>{n++;assert.ok(v,m)};

ok(html.includes("u1:'big',u2:'shopping-contagem',u3:'centro'"),'três unidades locais mapeiam para IDs centrais canônicos');
ok(html.includes("big:'u1','shopping-contagem':'u2',centro:'u3'"),'IDs centrais retornam ao shape legado da UI');
ok(html.includes("const PRODUCTION_API='https://imperio-backend-production-5086.up.railway.app'"),'frontend oficial aponta para backend de produção');
ok(html.includes("function officialProductionMode()"),'frontend diferencia produção de desenvolvimento local');
ok(html.includes("CENTRAL_WRITE_UNITS='imperio-v99-central-write-units'"),'allowlist operacional é persistida na sessão');
ok(html.includes("function centralWriteUnits()"),'frontend lê allowlist operacional');
ok(html.includes("function centralUnitAllowed(unitId)"),'frontend valida unidade contra allowlist');
ok(html.includes("function centralEnabled(){let id=centralUnitId();return centralAuthenticated()&&!!id&&centralCanUse(id)&&centralUnitAllowed(id)}"),'modo central não é hardcoded no Centro');
ok(!html.includes("centralUnitId()==='centro'"),'nenhuma trava estrutural exige reconstrução para liberar outras unidades');
ok(html.includes("scope:'controlled_three_unit_rollout'"),'status declara rollout único e controlado para três unidades');
ok(html.includes("operationalWriteUnits:centralWriteUnits()"),'status expõe unidades operacionalmente liberadas');
ok(html.includes("health.operationalWritesEnabled===true&&Array.isArray(health.operationalWriteUnits)"),'login sincroniza allowlist a partir do backend');
ok(html.includes("if(!officialProductionMode())"),'fallback local fica restrito a desenvolvimento, não à produção oficial');
ok(html.includes("function applyCentralUnitGate()")&&html.includes("!centralUnitAllowed(id)"),'unidades ainda não liberadas são removidas da operação diária');
ok(html.includes("updateClient(id,body)"),'edição de cliente usa API central');
ok(html.includes("updateBooking(id,body)"),'edição de agenda usa API central');
ok(html.includes("createBlockSeries(body,key=operationKey('block_series'))"),'bloqueios recorrentes usam endpoint central atômico');
ok(html.includes("items:newItems.map(it=>centralItemPayload(it,resDraft.date))"),'agenda suporta multi-serviço');
ok(html.includes("items:combined.map(it=>centralItemPayload(it,original.date))"),'adição de serviço atualiza visita central completa');
ok(!html.includes("No corte central inicial, salve um serviço por agendamento"),'limitação de serviço único removida');
ok(html.includes("financeMode:'postgresql_central'"),'financeiro operacional usa PostgreSQL central no modo oficial');
ok(html.includes("cashSessions(date='')")&&html.includes("syncCommand(id,body)")&&html.includes("cashAdjustment(id,body")&&html.includes("reopenCash(id,body)"),'ponte financeira expõe leitura, snapshot e ciclo de caixa centrais');
ok(html.includes("if(officialProductionMode()){\n const legacyRenderCashV99"),'ponte financeira não altera runtime legado fora da produção oficial');
ok(html.includes('central_finance_refresh')&&html.includes('Comanda não finalizada no banco central'),'frontend trata PostgreSQL como autoridade antes de finalizar a comanda');
ok(html.includes("Salve as alterações da reserva no banco central antes de abrir a comanda"),'alterações pendentes de agenda não vazam para financeiro');
ok(!html.includes('value="master"'),'login não expõe usuário legado padrão');
ok(!html.includes('value="demo"'),'login não expõe senha legado padrão');

console.log(JSON.stringify({ok:true,tests:n,feature:'frontend_official_three_unit_rollout'}));
