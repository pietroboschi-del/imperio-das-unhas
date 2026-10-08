import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {PrismaClient} from '@prisma/client';

const schema='readiness_integration_fixture';
const db=new PrismaClient();
const stages=['after_schema','after_migration','client_init','mid_fixture','assertion'];
let checks=0;
try{
  const url=new URL(process.env.DATABASE_URL||'');
  assert.ok(['localhost','127.0.0.1','::1'].includes(url.hostname));
  assert.match(String(process.env.READINESS_TEST_DATABASE||''),/(?:_ci|_test)$/);
  const original=await db.$queryRaw`SELECT current_database() AS name`;
  assert.equal(original[0]?.name,process.env.READINESS_TEST_DATABASE);
  const ownerBefore=await db.user.count({where:{username:process.env.ADMIN_USERNAME}});
  assert.ok(ownerBefore>0,'shared owner must exist before failure harness');
  for(const stage of stages){
    const child=spawnSync(process.execPath,['test/v99-three-unit-readiness.integration.mjs'],{
      cwd:new URL('../',import.meta.url),
      env:{...process.env,READINESS_INJECT_FAILURE:stage},
      encoding:'utf8',timeout:180000
    });
    assert.equal(child.status,1,'injected '+stage+' must fail without exposing stderr');
    const found=await db.$queryRaw`SELECT schema_name FROM information_schema.schemata WHERE schema_name=${schema}`;
    assert.equal(found.length,0,'schema remains after '+stage);
    assert.equal(await db.user.count({where:{username:process.env.ADMIN_USERNAME}}),ownerBefore,'owner changed after '+stage);
    checks+=3;
  }
  console.log(JSON.stringify({ok:true,checks,feature:'readiness_teardown_failure_injection'}));
}finally{await db.$disconnect()}
