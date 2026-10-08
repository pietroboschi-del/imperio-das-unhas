import assert from 'node:assert/strict';
import {cp,mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {PrismaClient} from '@prisma/client';
import {buildReadinessReport} from '../tools/three-unit-readiness.mjs';

let prisma;
let adminPrisma;
const ISOLATED_SCHEMA='readiness_integration_fixture';
let tests=0;
const ok=(value,message)=>{tests++;assert.ok(value,message)};
const equal=(actual,expected,message)=>{tests++;assert.equal(actual,expected,message)};

async function assertSafeTestDatabase(){
  const rows=await adminPrisma.$queryRaw`SELECT current_database() AS database_name`;
  const current=String(rows[0]?.database_name||''),expected=String(process.env.READINESS_TEST_DATABASE||'');
  const url=new URL(String(process.env.DATABASE_URL||''));
  assert.ok(expected&&current===expected,'READINESS_TEST_DATABASE must exactly match the connected database');
  assert.match(current,/(?:_ci|_test)$/,'readiness integration requires a dedicated CI/test database');
  assert.ok(['localhost','127.0.0.1','::1'].includes(url.hostname),'readiness integration requires a local isolated PostgreSQL host');
  assert.ok(!url.searchParams.has('schema')||url.searchParams.get('schema')==='public','readiness integration requires the original public schema');
  const existing=await adminPrisma.$queryRaw`SELECT schema_name FROM information_schema.schemata WHERE schema_name=${ISOLATED_SCHEMA}`;
  assert.equal(existing.length,0,'readiness fixture schema must not preexist; manual CI cleanup required');
}

async function cleanup(){
  await prisma.bookingItem.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.stockTransferItem.deleteMany();
  await prisma.stockTransfer.deleteMany();
  await prisma.stockPurchaseItem.deleteMany();
  await prisma.stockPurchase.deleteMany();
  await prisma.stockBalance.deleteMany();
  await prisma.stockBalanceOpening.deleteMany();
  await prisma.stockLocation.deleteMany();
  await prisma.product.deleteMany();
  await prisma.clientDuplicateReview.deleteMany();
  await prisma.migrationEntity.deleteMany();
  await prisma.migrationEnvelope.deleteMany();
  await prisma.clientUnitLink.deleteMany();
  await prisma.client.deleteMany();
  await prisma.professionalUnit.deleteMany();
  await prisma.professional.deleteMany();
  await prisma.service.deleteMany();
  await prisma.serviceCategory.deleteMany();
  await prisma.workstation.deleteMany();
  await prisma.userUnitAccess.deleteMany();
  await prisma.session.deleteMany();
  await prisma.userCredentialToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.unit.deleteMany();
}

async function localMigrationFixture(){
  const root=await mkdtemp(path.join(tmpdir(),'imperio-readiness-'));
  await cp(new URL('../prisma/migrations/',import.meta.url),root,{recursive:true});
  const pending='20990101_pending_readiness_fixture';
  const dir=path.join(root,pending);await mkdir(dir);await writeFile(path.join(dir,'migration.sql'),'SELECT 1;\n');
  return {root,pending};
}

async function addProfessional({id,active=true,link=true,published=true,services=[],schedule={}}){
  await prisma.professional.create({data:{id,name:id,active,legacyPayload:{show:published,online:published,services,schedule}}});
  if(link)await prisma.professionalUnit.create({data:{professionalId:id,unitId:'centro',active:true}});
}

let fixture;
let schemaCreated=false;
let mainFailure;
try{
  adminPrisma=new PrismaClient();
  await assertSafeTestDatabase();
  await adminPrisma.$executeRawUnsafe('CREATE SCHEMA "'+ISOLATED_SCHEMA+'"');
  schemaCreated=true;
  const fixtureUrl=new URL(process.env.DATABASE_URL);
  fixtureUrl.searchParams.set('schema',ISOLATED_SCHEMA);
  const migrated=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{
    cwd:new URL('../',import.meta.url),env:{...process.env,DATABASE_URL:fixtureUrl.toString()},encoding:'utf8',timeout:120000
  });
  assert.equal(migrated.status,0,'isolated readiness migrations failed: '+String(migrated.stderr||'').slice(0,500));
  prisma=new PrismaClient({datasources:{db:{url:fixtureUrl.toString()}}});
  const schemaIdentity=await prisma.$queryRaw`SELECT current_schema() AS schema_name,current_database() AS database_name`;
  equal(schemaIdentity[0]?.schema_name,ISOLATED_SCHEMA,'Prisma must use isolated schema');
  equal(schemaIdentity[0]?.database_name,process.env.READINESS_TEST_DATABASE,'Prisma must use expected CI database');
  const sharedAdminBefore=await adminPrisma.user.count({where:{username:process.env.ADMIN_USERNAME}});
  ok(sharedAdminBefore>0,'shared CI owner fixture exists before isolated test');
  await cleanup();
  fixture=await localMigrationFixture();
  let report=await buildReadinessReport(prisma,{migrationsDir:fixture.root,now:new Date('2026-10-08T12:00:00.000Z')});
  equal(report.readiness.result,'BLOCKED','banco vazio bloqueia readiness');
  equal(report.units.centro.exists,false,'banco vazio informa unidade ausente');
  equal(report.professionals.centro.publicCatalogEligible,0,'banco vazio não inventa profissionais');
  equal(report.businessDataReadiness.result,'EXPECTED_EMPTY_STATE','dados comerciais vazios são esperados');
  equal(report.businessDataReadiness.clientMigration,'POST_GO_LIVE_USER_DRIVEN','migração não bloqueia entrega');
  equal(report.technicalReadiness.migrationsReady,false,'migration pendente continua bloqueio técnico');
  ok(report.technicalReadiness.blockers.includes('CANONICAL_UNITS'),'ausência de unidades é bloqueio estrutural');

  for(const [id,name] of [['centro','Centro de Contagem'],['big','Big Shopping'],['shopping-contagem','Shopping Contagem']]){
    await prisma.unit.create({data:{id,name,timezone:'America/Sao_Paulo',active:true}});
  }
  report=await buildReadinessReport(prisma,{migrationsDir:fixture.root,now:new Date('2026-10-08T12:00:00.000Z')});
  ok(['centro','big','shopping-contagem'].every(id=>report.units[id].exists&&report.units[id].active),'três unidades válidas são reconhecidas');
  equal(report.units.aliases['big-shopping'].exists,false,'alias big-shopping ausente');
  equal(report.units.aliases.central.exists,false,'central não é Unit');

  await prisma.user.create({data:{id:'readiness-user',username:'readiness-user',displayName:'Readiness User',active:true,unitAccesses:{create:{unitId:'centro',role:'reception',permissions:[],active:true}}}});
  report=await buildReadinessReport(prisma,{migrationsDir:fixture.root,now:new Date('2026-10-08T12:00:00.000Z')});
  equal(report.users.byUnit.centro.operableProfiles,0,'papel sem permissões não torna usuário operacional');
  await prisma.userUnitAccess.updateMany({where:{userId:'readiness-user',unitId:'centro'},data:{permissions:['agenda.read','agenda.manage','clients.read','clients.manage']}});
  await prisma.serviceCategory.create({data:{id:'nails',name:'Unhas',active:true}});
  await prisma.service.create({data:{id:'manicure',categoryId:'nails',name:'Manicure',price:'40',durationMin:30,active:true,legacyPayload:{show:true,online:true,proRules:{}}}});

  await addProfessional({id:'p-no-link',link:false,published:true,services:['manicure'],schedule:{'centro-4':{work:true,start:'09:00',end:'18:00'}}});
  await addProfessional({id:'p-inactive',active:false,published:true,services:['manicure'],schedule:{'centro-4':{work:true,start:'09:00',end:'18:00'}}});
  await addProfessional({id:'p-inactive-link',active:false,published:true,services:['manicure'],schedule:{'centro-4':{work:true,start:'09:00',end:'18:00'}}});
  await prisma.professionalUnit.updateMany({where:{professionalId:'p-inactive-link'},data:{active:false}});
  await addProfessional({id:'p-hidden',published:false,services:['manicure'],schedule:{'centro-4':{work:true,start:'09:00',end:'18:00'}}});
  await addProfessional({id:'p-no-service',published:true,services:[],schedule:{'centro-4':{work:true,start:'09:00',end:'18:00'}}});
  await addProfessional({id:'p-no-schedule',published:true,services:['manicure'],schedule:{}});
  await addProfessional({id:'p-no-resource',published:true,services:['manicure'],schedule:{'centro-4':{work:true,start:'09:00',end:'18:00'}}});

  report=await buildReadinessReport(prisma,{migrationsDir:fixture.root,now:new Date('2026-10-08T12:00:00.000Z')});
  ok(report.professionals.centro.exclusionReasons.NO_PROFESSIONALUNIT>=1,'profissional sem vínculo é classificado');
  ok(report.professionals.centro.exclusionReasons.INACTIVE>=2,'profissional inativo é classificado mesmo com vínculo inativo');
  ok(report.professionals.centro.exclusionReasons.NOT_PUBLISHED>=1,'profissional não publicado é classificado');
  ok(report.professionals.centro.exclusionReasons.NO_ELIGIBLE_SERVICE>=1,'profissional sem serviço é classificado');
  ok(report.professionals.centro.exclusionReasons.NO_VALID_SCHEDULE>=1,'profissional sem escala é classificado');
  ok(report.professionals.centro.exclusionReasons.NO_RESOURCE>=1,'profissional sem recurso é classificado');
  equal(report.professionals.centro.publicCatalogEligible,0,'sem recurso não existe cadeia operacional completa');

  await prisma.workstation.create({data:{id:'centro-nails-1',unitId:'centro',name:'Mesa 1',allowedCategoryIds:['nails'],active:true,legacyPayload:{capacity:1}}});
  await addProfessional({id:'p-ready',published:true,services:['manicure'],schedule:{'centro-4':{work:true,start:'09:00',end:'18:00'}}});
  await prisma.stockLocation.createMany({data:[
    {id:'stock-central',kind:'CENTRAL',unitId:null,name:'Central',active:true},
    {id:'stock-centro',kind:'UNIT',unitId:'centro',name:'Centro',active:true},
    {id:'stock-big',kind:'UNIT',unitId:'big',name:'Big',active:true},
    {id:'stock-shopping',kind:'UNIT',unitId:'shopping-contagem',name:'Shopping',active:true},
  ]});
  report=await buildReadinessReport(prisma,{migrationsDir:fixture.root,now:new Date('2026-10-08T12:00:00.000Z')});
  equal(report.professionals.centro.publicCatalogEligible,2,'recurso completa as duas cadeias elegíveis');
  equal(report.stock.locations.central.exists,true,'central é StockLocation');
  equal(report.units.aliases.central.exists,false,'central continua fora de Unit');
  equal(report.readiness.units.centro.operationalChainReady,true,'cadeia completa é reconhecida');
  ok(report.migrations.pending.some(x=>x.migrationName===fixture.pending),'migration local ausente no banco fica pending');
  equal(report.readiness.migrationsReady,false,'migration pending bloqueia readiness global');
  equal(report.technicalReadiness.result,'BLOCKED','migration pendente bloqueia readiness técnica, mesmo com profissionais');
  equal(report.businessDataReadiness.result,'EXPECTED_EMPTY_STATE','ausência de clientes e saldo não bloqueia readiness estrutural');
  await prisma.unit.update({where:{id:'centro'},data:{active:false}});
  report=await buildReadinessReport(prisma,{migrationsDir:fixture.root,now:new Date('2026-10-08T12:00:00.000Z')});
  equal(report.readiness.units.centro.operationalChainReady,false,'unidade inativa bloqueia cadeia operacional');
  await prisma.unit.update({where:{id:'centro'},data:{active:true}});

  const incomplete='20990102_incomplete_fixture',unexpected='20990103_unexpected_fixture';
  await prisma.$executeRaw`INSERT INTO "_prisma_migrations" (id,checksum,migration_name,started_at,applied_steps_count) VALUES ('readiness-incomplete','fixture',${incomplete},NOW(),0)`;
  await prisma.$executeRaw`INSERT INTO "_prisma_migrations" (id,checksum,migration_name,started_at,finished_at,applied_steps_count) VALUES ('readiness-unexpected','fixture',${unexpected},NOW(),NOW(),1)`;
  report=await buildReadinessReport(prisma,{migrationsDir:fixture.root,now:new Date('2026-10-08T12:00:00.000Z')});
  ok(report.migrations.incomplete.some(x=>x.migrationName===incomplete),'migration incompleta é detectada');
  ok(report.migrations.unexpected.some(x=>x.migrationName===unexpected),'migration inesperada é detectada');

  console.log(JSON.stringify({ok:true,tests,feature:'three_unit_readiness_integration'}));
 }catch(error){mainFailure=error;
}finally{
  const teardownErrors=[];
  async function step(label,fn){try{await fn()}catch(error){teardownErrors.push(new Error(label+': '+String(error?.code||error?.name||'FAILED')))}}
  if(prisma)await step('isolated Prisma disconnect',()=>prisma.$disconnect());
  if(fixture?.root)await step('temporary migration directory removal',()=>rm(fixture.root,{recursive:true,force:true}));
  if(adminPrisma){
    if(schemaCreated){
      await step('isolated schema removal',()=>adminPrisma.$executeRawUnsafe('DROP SCHEMA "'+ISOLATED_SCHEMA+'" CASCADE'));
      await step('isolated schema removal verification',async()=>{
        const rows=await adminPrisma.$queryRaw`SELECT schema_name FROM information_schema.schemata WHERE schema_name=${ISOLATED_SCHEMA}`;
        assert.equal(rows.length,0,'isolated schema still exists');
      });
      await step('shared administrator preserved',async()=>{
        const count=await adminPrisma.user.count({where:{username:process.env.ADMIN_USERNAME}});
        assert.ok(count>0,'shared administrator fixture disappeared');
      });
    }
    await step('administrator Prisma disconnect',()=>adminPrisma.$disconnect());
  }
  if(mainFailure||teardownErrors.length)throw new AggregateError(
    [...(mainFailure?[mainFailure]:[]),...teardownErrors],
    'readiness integration failed ('+(mainFailure?'body':'no body failure')+', '+teardownErrors.length+' teardown error(s))'
  );
}
