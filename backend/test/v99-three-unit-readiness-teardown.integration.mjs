import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {PrismaClient} from '@prisma/client';

const schema='readiness_integration_fixture';
const db=new PrismaClient();
const cases=[
  {stage:null,expected:0},
  {stage:'after_schema',expected:1},
  {stage:'migration_failure',expected:1},
  {stage:'after_migration',expected:1},
  {stage:'client_init',expected:1},
  {stage:'mid_fixture',expected:1},
  {stage:'assertion',expected:1},
  {stage:'body_and_teardown',expected:1},
];
let checks=0;
try{
  const url=new URL(process.env.DATABASE_URL||'');
  assert.ok(['localhost','127.0.0.1','::1'].includes(url.hostname));
  assert.ok(!url.searchParams.has('schema')||url.searchParams.get('schema')==='public');
  assert.match(String(process.env.READINESS_TEST_DATABASE||''),/(?:_ci|_test)$/);
  const original=await db.$queryRaw`SELECT current_database() AS name,current_schema() AS schema`;
  assert.equal(original[0]?.name,process.env.READINESS_TEST_DATABASE);
  assert.equal(original[0]?.schema,'public');

  // Existing shared fixtures are sentinels: do not create or clean public data.
  const sharedFixtureSnapshot=async()=>({
    owners:await db.user.findMany({where:{username:process.env.ADMIN_USERNAME},select:{id:true,username:true,active:true},orderBy:{id:'asc'}}),
    units:await db.unit.findMany({select:{id:true,name:true,active:true},orderBy:{id:'asc'}}),
    services:await db.service.findMany({select:{id:true,name:true,active:true,price:true,durationMin:true},orderBy:{id:'asc'}}),
  });
  const before=await sharedFixtureSnapshot();
  assert.ok(before.owners.length>0,'shared CI owner must exist before failure harness');
  for(const scenario of cases){
    const child=spawnSync(process.execPath,['test/v99-three-unit-readiness.integration.mjs'],{
      cwd:new URL('../',import.meta.url),
      env:{...process.env,READINESS_INJECT_FAILURE:scenario.stage||''},
      encoding:'utf8',timeout:180000
    });
    assert.equal(child.status,scenario.expected,'scenario '+String(scenario.stage)+' exit code mismatch');
    if(scenario.stage==='body_and_teardown'){
      assert.match(child.stderr,/READINESS_INJECTED_body_and_teardown/,'body failure missing from AggregateError');
      assert.match(child.stderr,/READINESS_INJECTED_teardown/,'original teardown error missing from AggregateError');
      assert.ok(child.stderr.includes('teardown error(s)'), 'AggregateError teardown count missing');
      checks+=3;
    }
    const found=await db.$queryRaw`SELECT schema_name FROM information_schema.schemata WHERE schema_name=${schema}`;
    assert.equal(found.length,0,'schema remains after '+String(scenario.stage));
    assert.deepEqual(await sharedFixtureSnapshot(),before,'shared public fixtures changed after '+String(scenario.stage));
    checks+=3;
  }
  console.log(JSON.stringify({ok:true,checks,feature:'readiness_teardown_failure_injection'}));
}finally{await db.$disconnect()}
