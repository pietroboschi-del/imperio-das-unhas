import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {PrismaClient} from '@prisma/client';

const prisma=new PrismaClient(),port=Number(process.env.FINANCE_MATH_TEST_PORT||3104),base='http://127.0.0.1:'+port,sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(){for(let i=0;i<80;i++){try{if((await fetch(base+'/api/v1/health')).ok)return}catch{}await sleep(400)}throw Error('backend não iniciou')}
const cookie=r=>(r.headers.get('set-cookie')||'').split(';')[0];
async function main(){
 const p=spawn(process.execPath,['dist/src/main.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:String(port),OPERATIONAL_WRITES_ENABLED:'true'},stdio:['ignore','pipe','pipe']});
 try{
  await wait();
  let r=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD})});
  assert.ok(r.ok,'login owner CI');
  const c=cookie(r),a=await r.json(),h={'content-type':'application/json','cookie':c,'x-csrf-token':a.csrfToken,'x-unit-id':'centro'};
  r=await fetch(base+'/api/v1/commands',{method:'POST',headers:{...h,'idempotency-key':'math-check'},body:JSON.stringify({serviceDate:'2026-10-08',grossAmount:100,discountAmount:10})});
  assert.ok(r.ok,'abre comanda matemática');const cmd=await r.json();

  const invalid={grossAmount:100,discountAmount:10,appliedSignalAmount:10,appliedCreditAmount:5,customerFeeAmount:2,amountDue:79,items:[],snapshot:{tipPreview:{gross:3}}};
  r=await fetch(base+`/api/v1/commands/${cmd.id}/snapshot`,{method:'PUT',headers:h,body:JSON.stringify(invalid)});
  assert.equal(r.status,409,'saldo incompatível deve ser rejeitado');
  let stored=await prisma.openCommand.findUniqueOrThrow({where:{id:cmd.id}});
  assert.equal(String(stored.remainingAmount),'90','snapshot inválido não altera saldo');
  assert.equal(String(stored.appliedSignalAmount),'0','snapshot inválido não apropria sinal');

  const valid={...invalid,amountDue:80};
  r=await fetch(base+`/api/v1/commands/${cmd.id}/snapshot`,{method:'PUT',headers:h,body:JSON.stringify(valid)});
  assert.ok(r.ok,'composição coerente aceita');
  stored=await prisma.openCommand.findUniqueOrThrow({where:{id:cmd.id}});
  assert.equal(String(stored.remainingAmount),'80');
  assert.equal(String(stored.appliedSignalAmount),'10');
  assert.equal(String(stored.appliedCreditAmount),'5');
  assert.equal(String(stored.customerFeeAmount),'2');

  const excessiveItemDiscount={grossAmount:100,discountAmount:10,appliedSignalAmount:0,appliedCreditAmount:0,customerFeeAmount:0,amountDue:90,items:[{serviceId:'finance-s1',professionalId:'finance-p1',quantity:2,unitPrice:20,discountAmount:45}],snapshot:{}};
  r=await fetch(base+`/api/v1/commands/${cmd.id}/snapshot`,{method:'PUT',headers:h,body:JSON.stringify(excessiveItemDiscount)});
  assert.equal(r.status,409,'desconto do item acima de quantidade x preço deve ser rejeitado');
  assert.equal(await prisma.commandServiceItem.count({where:{commandId:cmd.id}}),0,'item inválido não deve ser persistido');

  const validItem={...excessiveItemDiscount,items:[{serviceId:'finance-s1',professionalId:'finance-p1',quantity:2,unitPrice:20,discountAmount:5}]};
  r=await fetch(base+`/api/v1/commands/${cmd.id}/snapshot`,{method:'PUT',headers:h,body:JSON.stringify(validItem)});
  assert.ok(r.ok,'item com quantidade, preço e desconto coerentes é aceito');
  const item=await prisma.commandServiceItem.findFirstOrThrow({where:{commandId:cmd.id}});
  assert.equal(String(item.quantity),'2','quantidade do item é persistida no banco central');
  assert.equal(String(item.netServiceAmount),'35','líquido do item respeita quantidade x preço menos desconto');

  const mixedLines={grossAmount:70,discountAmount:7,appliedSignalAmount:0,appliedCreditAmount:0,customerFeeAmount:0,amountDue:63,items:[{serviceId:'finance-s1',professionalId:'finance-p1',quantity:2,unitPrice:20,discountAmount:5}],snapshot:{lines:[{type:'service',serviceId:'finance-s1',professionalId:'finance-p1',qty:2,unitPrice:20,discount:5},{type:'product',productId:'prod-ci',qty:3,unitPrice:10,discount:2}]}};
  r=await fetch(base+`/api/v1/commands/${cmd.id}/snapshot`,{method:'PUT',headers:h,body:JSON.stringify(mixedLines)});
  assert.ok(r.ok,'totais aceitam composição mista de serviço e produto');
  let mixedStored=await prisma.openCommand.findUniqueOrThrow({where:{id:cmd.id}});
  assert.equal(String(mixedStored.grossAmount),'70');
  assert.equal(String(mixedStored.discountAmount),'7');

  const mismatchedTotals={...mixedLines,grossAmount:60,amountDue:53};
  r=await fetch(base+`/api/v1/commands/${cmd.id}/snapshot`,{method:'PUT',headers:h,body:JSON.stringify(mismatchedTotals)});
  assert.equal(r.status,409,'totais divergentes das linhas do snapshot devem ser rejeitados');
  mixedStored=await prisma.openCommand.findUniqueOrThrow({where:{id:cmd.id}});
  assert.equal(String(mixedStored.grossAmount),'70','snapshot inválido não altera bruto previamente consistente');
  assert.equal(String(mixedStored.discountAmount),'7','snapshot inválido não altera desconto previamente consistente');
  console.log(JSON.stringify({ok:true,feature:'finance_math_consistency'}));
 }finally{
  if(p.exitCode===null&&p.signalCode===null){p.kill('SIGTERM');await Promise.race([once(p,'exit'),sleep(3000)]).catch(()=>{})}
  await prisma.$disconnect();
 }
}
main().catch(async e=>{console.error(e.stack||e);await prisma.$disconnect().catch(()=>{});process.exit(1)});
