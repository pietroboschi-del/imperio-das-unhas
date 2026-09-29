import fs from 'fs';import path from 'path';import url from 'url';
const root=path.resolve(path.dirname(url.fileURLToPath(import.meta.url)),'..');let tests=0;function ok(c,m){tests++;if(!c)throw new Error(m)}function read(p){return fs.readFileSync(path.join(root,p),'utf8')}
const pkg=JSON.parse(read('package.json'));ok(['imperio-backend-v97','imperio-backend-v98a','imperio-backend-v98b'].includes(pkg.name),'package V97/V98a');ok(['0.97.0','0.98.0','0.98.1'].includes(pkg.version),'versão compatível');ok(pkg.scripts['test:readthrough'],'script read-through');
const env=read('.env.example');ok(env.includes('READ_THROUGH_ENABLED=false'),'read-through desligado por padrão');ok(env.includes('OPERATIONAL_WRITES_ENABLED=false'),'writes remotos seguem desligados');
const app=read('src/app.module.ts');ok(app.includes('ReadThroughModule'),'módulo registrado');
const svc=read('src/read-through/read-through.service.ts');
ok(svc.includes('assertExactEnvelope'),'exige envelope exato');ok(svc.includes("X-Imperio")||svc.includes("x-imperio-instance-id"),'headers snapshot');ok(svc.includes('OPERATIONAL_WRITES_ENABLED'),'bloqueia com writes remotos');ok(svc.includes("source:'postgresql_verified_read_through'"),'fonte catálogo identificada');ok(svc.includes("source:'postgresql_verified_preview_only'"),'preview unitário identificado');ok(svc.includes('legacyPayload'),'preserva shape legado');ok(svc.includes('unitLinks:{some:{unitId,active:true}}'),'clientes isolados por unidade');ok(svc.includes('take:5000'),'limite de leitura');ok(svc.includes('stableHash'),'fingerprint canônico');
const ctl=read('src/read-through/read-through.controller.ts');ok(ctl.includes("@Controller('api/v1/read-through')"),'namespace V97');ok(ctl.includes("@Get('catalog')"),'catálogo');ok(ctl.includes("@Get('unit-preview')"),'preview unitário');ok(ctl.includes('@UnitScoped()'),'preview unit scoped');

const main=read('src/main.ts');ok(main.includes('X-Imperio-Instance-Id')&&main.includes('X-Imperio-Revision')&&main.includes('X-Imperio-Data-Hash'),'CORS libera headers de snapshot');
const arch=read('src/architecture/architecture.controller.ts');ok(/release:'V(?:97|98[ab])'/.test(arch),'health V97/V98');ok(arch.includes('readThroughEnabled'),'status expõe read-through');
console.log(JSON.stringify({ok:true,tests,feature:'v97_read_through_backend_contract'}));
