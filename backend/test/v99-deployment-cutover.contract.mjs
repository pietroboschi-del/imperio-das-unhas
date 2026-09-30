import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let tests=0;
const ok=(v,m)=>{tests++;if(!v)throw new Error(m)};
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

const pkg=JSON.parse(read('package.json'));
const docker=read('Dockerfile');
const env=read('.env.production.example');
const gate=read('src/common/operational-write-gate.ts');
const core=read('src/core/core-write.controller.ts');
const finance=read('src/core/finance-write.controller.ts');
const publicBooking=read('src/core/public-booking.controller.ts');

ok(pkg.scripts.start==='node dist/main.js','entrypoint aponta para artefato real do Nest');
ok(pkg.scripts['start:prod']==='node dist/main.js','start:prod consistente');
ok(docker.includes('npm run prisma:migrate && npm start'),'container aplica migrations antes de iniciar');
ok(docker.includes('HEALTHCHECK')&&docker.includes('/api/v1/health'),'container possui healthcheck');
ok(env.includes('COOKIE_SECURE=true'),'cookie seguro em produção');
ok(env.includes('OPERATIONAL_WRITES_ENABLED=true')&&env.includes('OPERATIONAL_WRITES_UNITS=centro'),'template inicial limita escrita ao Centro');
ok(env.includes('MIGRATION_IMPORT_ENABLED=false')&&env.includes('OPENAPI_ENABLED=false'),'recursos sensíveis desligados no template');
ok(gate.includes('OPERATIONAL_WRITES_UNITS')&&gate.includes('allow.length&&unitId&&!allow.includes(unitId)'),'gate implementa allowlist opcional');
ok(core.includes('assertOperationalWriteEnabled(req.unitId!)'),'core write usa gate por unidade');
ok(finance.includes('assertOperationalWriteEnabled(req.unitId!)'),'finance write usa gate por unidade');
ok(publicBooking.includes("assertOperationalWriteEnabled(b.unitId,'Agendamento online central ainda não habilitado neste ambiente')"),'site usa gate por unidade');

console.log(JSON.stringify({ok:true,tests,feature:'v99_deployment_cutover_contract'}));
