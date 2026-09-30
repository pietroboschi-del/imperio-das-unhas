import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
let n=0;const ok=(v,m)=>{n++;assert.ok(v,m)};
ok(html.includes("u3:'centro'"),'legacy Centro maps to canonical Centro');
ok(html.includes("centro:'u3'"),'canonical Centro maps back to legacy UI id');
ok(html.includes("CENTRAL_CSRF_KEY='imperio-v96-shadow-csrf'"),'central session uses backend CSRF storage');ok(html.includes("function centralCsrf(){try{return csrf()||sessionStorage.getItem(CENTRAL_CSRF_KEY)||''}"),'central writes reuse authenticated CSRF token');
ok(html.includes("scope:'centro_first'"),'cutover is intentionally Centro-first');ok(html.includes("imperio-v99-central-authenticated"),'Centro requires central authenticated session');ok(html.includes("option&&!centralCanUse('centro')"),'Centro is removed from picker without central authorization');ok(html.includes("Sessão central autenticada ✓"),'staff login opens central session');
ok(html.includes("financeMode:'legacy_local_until_parity'"),'finance remains explicitly outside the first cutover');
ok(html.includes("updateClient(id,body)"),'client edits use central API');
ok(html.includes("updateBooking(id,body)"),'booking edits use central API');
ok(html.includes("createBlockSeries(body,key=operationKey('block_series'))"),'recurring blocks use atomic central endpoint');
ok(html.includes("items:newItems.map(it=>centralItemPayload(it,resDraft.date))"),'new bookings support multiple items');
ok(html.includes("items:combined.map(it=>centralItemPayload(it,original.date))"),'append service updates complete central visit');
ok(!html.includes("if(!centralEnabled()||id)return legacySaveClient"),'client edit has no silent local fallback');
ok(!html.includes("if(!centralEnabled()||resDraft?.appendToBookingId)return legacySaveReservation"),'append service has no silent local fallback');
ok(!html.includes("No corte central inicial, salve um serviço por agendamento"),'single-service cutover limitation removed');
ok(html.includes("Salve as alterações da reserva no banco central antes de abrir a comanda"),'unsaved central agenda edits cannot leak into local finance');
console.log(JSON.stringify({ok:true,tests:n,feature:'frontend_centro_cutover_contract'}));

ok(!html.includes('value="master"'),'login no longer exposes legacy username by default');
ok(!html.includes('value="demo"'),'login no longer exposes legacy password by default');
