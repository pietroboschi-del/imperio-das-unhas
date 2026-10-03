import fs from 'node:fs';
import assert from 'node:assert/strict';
const src=fs.readFileSync(new URL('../tools/three-unit-readiness.mjs',import.meta.url),'utf8');
let tests=0;const ok=(v,m)=>{tests++;assert.ok(v,m)};
ok(src.includes("const UNITS=['centro','big','shopping-contagem']"),'diagnóstico cobre as três unidades');
for(const needle of ['professionalUnit.count','userUnitAccess.count','clientUnitLink.count','booking.count','cashSession.count','service.count','user.count'])ok(src.includes(needle),'consulta somente contagens: '+needle);
for(const forbidden of ['.create(','.update(','.upsert(','.delete(','.deleteMany(','.createMany(','.$executeRaw'])ok(!src.includes(forbidden),'diagnóstico não contém escrita: '+forbidden);
ok(src.includes('readOnly:true'),'saída declara modo somente leitura');
console.log(JSON.stringify({ok:true,tests,feature:'three_unit_readonly_readiness'}));
