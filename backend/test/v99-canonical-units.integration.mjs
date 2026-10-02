import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {ensureCanonicalUnits,CANONICAL_UNITS} from '../dist/src/core/canonical-units.js';
import {UserAdminService} from '../dist/src/users/user-admin.service.js';
import {assertOperationalWriteEnabled,operationalWriteStatus} from '../dist/src/common/operational-write-gate.js';

const prisma=new PrismaClient();
const username='ci_all_units_reception';
const oldEnabled=process.env.OPERATIONAL_WRITES_ENABLED;
const oldUnits=process.env.OPERATIONAL_WRITES_UNITS;

try{
  await prisma.$connect();
  await prisma.user.deleteMany({where:{username,networkAdmin:false}});
  await prisma.unit.upsert({
    where:{id:'centro'},
    create:{id:'centro',name:'Centro legado',timezone:'UTC',active:false},
    update:{name:'Centro legado',timezone:'UTC',active:false},
  });
  await prisma.unit.upsert({
    where:{id:'big'},
    create:{id:'big',name:'Big legado',timezone:'UTC',active:false},
    update:{name:'Big legado',timezone:'UTC',active:false},
  });

  const result=await ensureCanonicalUnits(prisma);
  const rows=await prisma.unit.findMany({
    where:{id:{in:CANONICAL_UNITS.map(x=>x.id)}},
    select:{id:true,name:true,timezone:true,active:true},
    orderBy:{id:'asc'},
  });
  assert.equal(rows.length,3,'as três unidades canônicas devem existir');
  for(const expected of CANONICAL_UNITS){
    const row=rows.find(x=>x.id===expected.id);
    assert.ok(row,expected.id+' deve existir');
    assert.equal(row.name,expected.name,expected.id+' deve ter nome canônico');
    assert.equal(row.timezone,expected.timezone,expected.id+' deve usar timezone canônico');
    assert.equal(row.active,true,expected.id+' deve estar tecnicamente ativa');
  }
  assert.ok(result.changedIds.includes('big'),'Big inativa deve ser reconciliada');

  const users=new UserAdminService(prisma);
  const created=await users.create(username,'CI Todas as Unidades',{
    active:true,
    systemRole:'OPERATOR',
    permissions:['units.read'],
    units:CANONICAL_UNITS.map(x=>({unitId:x.id,role:'reception',permissions:['agenda.read','clients.read']})),
  });
  const persisted=await prisma.user.findUnique({
    where:{id:created.id},
    select:{unitAccesses:{where:{active:true},select:{unitId:true}}},
  });
  assert.deepEqual(
    (persisted?.unitAccesses||[]).map(x=>x.unitId).sort(),
    CANONICAL_UNITS.map(x=>x.id).sort(),
    'usuário com Todas as unidades deve persistir os três vínculos',
  );

  process.env.OPERATIONAL_WRITES_ENABLED='true';
  process.env.OPERATIONAL_WRITES_UNITS='centro';
  assert.doesNotThrow(()=>assertOperationalWriteEnabled('centro'));
  assert.throws(()=>assertOperationalWriteEnabled('big'),/não habilitada para esta unidade/);
  assert.throws(()=>assertOperationalWriteEnabled('shopping-contagem'),/não habilitada para esta unidade/);
  assert.deepEqual(operationalWriteStatus().allowedUnits,['centro']);

  await prisma.user.delete({where:{id:created.id}});
  console.log(JSON.stringify({ok:true,feature:'canonical_units_and_all_units_user',units:rows,operationalWriteUnits:['centro']}));
}finally{
  process.env.OPERATIONAL_WRITES_ENABLED=oldEnabled;
  process.env.OPERATIONAL_WRITES_UNITS=oldUnits;
  await prisma.user.deleteMany({where:{username,networkAdmin:false}}).catch(()=>{});
  await prisma.$disconnect();
}
