import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {PrismaClient} from '@prisma/client';
import {readFileSync} from 'node:fs';
if(!String(process.env.DATABASE_URL||'').includes('imperio_ci')||!/(localhost|127\.0\.0\.1)/.test(process.env.DATABASE_URL||''))throw Error('A3 integration must use isolated imperio_ci');
const prisma=new PrismaClient(),port=Number(process.env.A3_FINANCE_TEST_PORT||3227),root='http://127.0.0.1:'+port;
const cookie=r=>(r.headers.get('set-cookie')||'').split(';')[0];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(){for(let i=0;i<80;i++){try{if((await fetch(root+'/api/v1/health')).ok)return}catch{}await pause(250)}throw Error('Nest não iniciou para A3')}
async function main(){
 const frontendFile=new URL('../../assets/js/a3-finance-central.js',import.meta.url);
 execFileSync(process.execPath,['--check',frontendFile.pathname]);
 const src=readFileSync(frontendFile,'utf8');
 assert.match(src,/function centralClosedRows\(/);assert.match(src,/central finance|central-only financial/i);
 const server=spawn(process.execPath,['dist/src/main.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:String(port),OPERATIONAL_WRITES_ENABLED:'true',OPERATIONAL_WRITES_UNITS:''},stdio:['ignore','pipe','pipe']});
 try{
  await wait();
  const login=async(username,password)=>{
   const r=await fetch(root+'/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password})});
   assert.ok(r.ok,'login sintético');const a=await r.json();return{cookie:cookie(r),csrf:a.csrfToken};
  };
  const owner=await login(process.env.ADMIN_USERNAME,process.env.ADMIN_PASSWORD);
  const operator=await login('finance_centro_ci','finance-password-123');
  const call=(user,unit,path,method='GET',body,key)=>fetch(root+'/api/v1'+path,{method,headers:{'content-type':'application/json',cookie:user.cookie,'x-csrf-token':user.csrf,'x-unit-id':unit,...(key?{'idempotency-key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});
  let count=0;const ok=(x,m)=>{assert.ok(x,m);count++};
  const acct=async(unit,id,type='BANK')=>{
   const r=await call(owner,unit,'/finance/accounts','POST',{id,name:'Conta '+id,type,unitId:unit});
   ok(r.ok,'conta '+unit+' registrada');
  };
  await acct('centro','a3_centro_bank');await acct('centro','a3_centro_cash','CASH');await acct('big','a3_big_bank');await acct('shopping-contagem','a3_shopping_bank');
  let r=await call(operator,'big','/finance/accounts');ok(r.status===403,'operador Centro não lê contas Big');
  const day='2026-10-07',another='2026-10-08';
  const amount={direction:'income',status:'Efetivado',date:day,competenceDate:day,amount:20,accountId:'a3_centro_cash',cashSessionId:null,category:'Outros',description:'Lançamento CI A3'};
  r=await call(owner,'centro','/cash-sessions','POST',{businessDate:day,openingAmount:0},'a3-fresh-cash-session');ok(r.ok,'abre nova sessão sintética após fechamento das regressões anteriores');
  const open=await prisma.cashSession.findFirstOrThrow({where:{unitId:'centro',businessDate:new Date(day+'T00:00:00.000Z'),status:'OPEN'}});
  amount.cashSessionId=open.id;
  r=await call(operator,'centro','/finance/entries','POST',amount,'a3-manual-unique');ok(r.ok,'grava lançamento central');const created=await r.json();
  r=await call(operator,'centro','/finance/entries','POST',amount,'a3-manual-unique');ok(r.ok&&(await r.json()).id===created.id,'replay não duplica lançamento');
  r=await call(operator,'centro','/finance/entries','POST',{...amount,amount:30},'a3-manual-unique');ok(r.status===409,'mesma chave não altera valor');
  r=await call(owner,'centro','/finance/entries?from=2026-10-01&to=2026-10-31');const entries=await r.json();ok(entries.filter(e=>e.id===created.id).length===1,'segunda sessão lê a mesma entrada');
  r=await call(operator,'big','/finance/entries');ok(r.status===403,'isolamento de lançamentos financeiros');
  r=await call(owner,'big','/finance/entries','POST',{...amount,cashSessionId:null,accountId:'a3_big_bank',date:another,competenceDate:another},'a3-big-once');ok(r.ok,'lançamento Big persistido');
  r=await call(owner,'shopping-contagem','/finance/entries','POST',{...amount,cashSessionId:null,accountId:'a3_shopping_bank',date:another,competenceDate:another},'a3-shopping-once');ok(r.ok,'lançamento Shopping persistido');
  r=await call(owner,'centro','/finance/entries?from=2026-10-08&to=2026-10-08');ok((await r.json()).filter(e=>e.id===created.id).length===0,'filtro de período respeitado');
  r=await call(owner,'big','/finance/entries');ok((await r.json()).every(x=>x.unitId==='big'),'sem mistura Centro e Big');
  r=await call(owner,'shopping-contagem','/finance/entries');ok((await r.json()).every(x=>x.unitId==='shopping-contagem'),'sem mistura Shopping');
  r=await call(owner,'centro','/commands','POST',{clientId:'a2-fin-client',serviceDate:day,grossAmount:150},'a3-monthly-command');ok(r.ok,'abre comanda mensal');const cmd=await r.json();
  r=await call(owner,'centro','/commands/'+cmd.id+'/payments','POST',{method:'MONTHLY_RECEIVABLE',amount:150},'a3-monthly-credit');ok(r.ok,'conta mensal não exige caixa nem credita recebimento');
  const rv=await prisma.receivableOpening.findFirstOrThrow({where:{clientId:'a2-fin-client',originalAmount:150}});
  ok(Number(rv.balance)===150,'recebível central de competência 150 persistido');
  await prisma.receivableOpening.create({data:{id:'a3-foreign-big',clientId:'a2-fin-client',unitId:'big',sourceDate:new Date(day+'T00:00:00.000Z'),originalAmount:250,balance:250,status:'OPEN'}});
  const monthly={clientId:'a2-fin-client',receivableIds:[rv.id],amount:50,date:day,accountId:'a3_centro_bank',method:'PIX',cashSessionId:open.id};
  r=await call(owner,'centro','/finance/receivables/settle','POST',monthly,'a3-monthly-50');ok(r.ok,'liquida 50 mensal');const settlement=await r.json();
  r=await call(operator,'centro','/finance/receivables/settle','POST',monthly,'a3-monthly-50');ok(r.status===403,'permissão separada de baixa mensal');
  r=await call(owner,'centro','/finance/receivables/settle','POST',monthly,'a3-monthly-50');ok(r.ok&&(await r.json()).id===settlement.id,'repetição não duplica baixa');
  ok(Number((await prisma.receivableOpening.findUniqueOrThrow({where:{id:rv.id}})).balance)===100,'saldo mensal preserva pagamento parcial');
  ok(Number((await prisma.receivableOpening.findUniqueOrThrow({where:{id:'a3-foreign-big'}})).balance)===250,'divida Big nao bloqueia baixa Centro nem sofre mutacao');
  r=await call(owner,'centro','/finance/receivables/settle','POST',{...monthly,receivableIds:[]},'a3-empty-selection');ok(r.status===409,'obrigacoes explicitamente selecionadas obrigatorias');
  r=await call(owner,'centro','/finance/receivables/settle','POST',{...monthly,receivableIds:[rv.id,'not-a-receivable']},'a3-missing-debt');ok(r.status===409,'baixa de obrigacao inexistente impedida');
  const race=await Promise.all(['A','B'].map(v=>call(owner,'centro','/finance/receivables/settle','POST',{...monthly,amount:80},'a3-monthly-race-'+v)));
  ok(race.map(v=>v.status).sort().join(',')==='201,409','concorrência bloqueia recebimento duplicado');
  ok(Number((await prisma.receivableOpening.findUniqueOrThrow({where:{id:rv.id}})).balance)===20,'apenas um recebimento concorrente aplicado');
  await prisma.stockLocation.upsert({where:{id:'centro'},create:{id:'centro',unitId:'centro',name:'Estoque Centro',kind:'UNIT'},update:{active:true}});
  await prisma.product.upsert({where:{id:'a3-prod'},create:{id:'a3-prod',name:'Produto A3',type:'RESALE',active:true,defaultCost:9,salePrice:20},update:{active:true}});
  r=await call(owner,'centro','/stock/purchases','POST',{purchaseDate:day,supplier:'Fornecedor sintético A3',destinationLocationId:'centro',financeUnitId:'centro',freight:0,items:[{productId:'a3-prod',qty:1,unitCost:9}]},'a3-stock-purchase');ok(r.ok,'compra gera obrigação persistida');const purchase=await r.json();
  r=await call(owner,'centro','/finance/purchase-payables');ok((await r.json()).some(p=>p.id===purchase.id&&p.financeStatus==='A pagar'),'obrigação visível em segunda sessão');
  const payBody={accountId:'a3_centro_bank',date:another};
  r=await call(owner,'centro','/finance/purchase-payables/'+purchase.id+'/settle','POST',payBody,'a3-purchase-paid');ok(r.ok,'baixa obrigação da compra');const paid=await r.json();
  r=await call(owner,'centro','/finance/purchase-payables/'+purchase.id+'/settle','POST',payBody,'a3-purchase-paid');ok(r.ok&&(await r.json()).id===paid.id,'retry da compra preserva liquidação');
  r=await call(owner,'centro','/finance/purchase-payables/'+purchase.id+'/settle','POST',payBody,'a3-purchase-other-key');ok(r.status===409,'chave diferente não paga compra duas vezes');
  ok(await prisma.centralFinanceEntry.count({where:{kind:'PURCHASE_SETTLEMENT',sourceId:purchase.id}})===1,'uma obrigação liquidada uma vez');
  r=await call(owner,'centro','/cash-sessions/'+open.id+'/close','POST',{closingAmount:20});ok(r.ok,'fecha caixa com lançamento manual');
  const closed=await prisma.cashSession.findUniqueOrThrow({where:{id:open.id}});
  ok(Number(closed.legacyPayload.systemExpected)===20,'dinheiro físico apurado sem PIX de Conta Mensal');
  r=await call(owner,'centro','/finance/reports/receipt-summary?from=2026-10-07&to=2026-10-07');ok(r.ok,'relatório central disponível');const report=await r.json();
  ok(report.receipts.filter(p=>p.id===settlement.id).length===1,'recebimento mensal não duplicado no caixa');
  ok(report.receipts.filter(p=>p.id===created.id&&p.source==='manual').length===1,'receita manual persistida aparece uma vez no resumo financeiro');
  ok(Number(report.cashReceipts)>=150,'caixa consolidado soma mensal confirmado e receita manual sem competência duplicada');
  ok(Number(report.competenceRevenue)>=150&&Number(report.cashReceipts)>=130,'competência separada do caixa');
  r=await call(owner,'big','/finance/reports/receipt-summary?from=2026-10-07&to=2026-10-08');ok(r.ok&&(await r.json()).receipts.every(p=>p.unitId==='big'),'relatório Big não inclui Centro');
  r=await call(owner,'shopping-contagem','/finance/reports/receipt-summary?from=2026-10-07&to=2026-10-08');ok(r.ok&&(await r.json()).receipts.every(p=>p.unitId==='shopping-contagem'),'relatório Shopping segregado');
  ok(await prisma.auditEvent.count({where:{action:{in:['finance.monthly.received','finance.manual.created','finance.purchase.settled']}}})>=3,'trilha de auditoria persistida');
  // A3-REA-02: backend never overwrites a previously registered account without a confirmed version.
  const aBefore=await prisma.centralFinanceAccount.findUniqueOrThrow({where:{id:'a3_centro_bank'}});
  r=await call(owner,'centro','/finance/accounts','POST',{id:aBefore.id,name:'Conta alterada sem reconciliação',type:aBefore.type,metadata:{paymentMethodIds:['pm_pix']}});ok(r.status===409,'conta nao pode ser sobrescrita por cache local');
  r=await call(owner,'centro','/finance/accounts','POST',{id:aBefore.id,name:aBefore.name,type:aBefore.type,active:true,metadata:{paymentMethodIds:['pm_pix'],feeRules:{pm_pix:{percent:1.25,fixed:0,settlementDays:1}},details:{internalCode:'A3'}} ,expectedUpdatedAt:aBefore.updatedAt.toISOString()});ok(r.ok,'configuracao explicitamente reconciliada');const aSaved=await r.json();
  r=await call(owner,'centro','/finance/accounts');ok((await r.json()).find(x=>x.id===aSaved.id)?.metadata?.feeRules?.pm_pix?.percent===1.25,'regras de conta preservadas entre sessoes');
  r=await call(owner,'centro','/finance/accounts','POST',{id:aBefore.id,name:'Sobrescrita obsoleta',type:aBefore.type,expectedUpdatedAt:aBefore.updatedAt.toISOString()});ok(r.status===409,'versao obsoleta protegida');
  // A3-REA-04: historical volumes exceed both old 1000 and 1500 caps.
  const ownerUserId=(await prisma.user.findUniqueOrThrow({where:{username:process.env.ADMIN_USERNAME},select:{id:true}})).id;
  const fixtureDate=new Date('2026-10-09T00:00:00.000Z');
  const ids=Array.from({length:1555},(_,i)=>String(i).padStart(5,'0'));
  try{
   await prisma.centralFinanceEntry.createMany({data:ids.map(x=>({id:'a3-page-entry-'+x,unitId:'centro',accountId:'a3_centro_bank',kind:'MANUAL',idempotencyHash:'synthetic-a3-'+x,date:fixtureDate,competenceDate:fixtureDate,amount:1,status:'Efetivado',createdByUserId:ownerUserId}))});
   await prisma.receivableOpening.createMany({data:ids.map(x=>({id:'a3-page-recv-'+x,unitId:'centro',clientId:'a2-fin-client',sourceDate:fixtureDate,originalAmount:1,balance:1,status:'OPEN'}))});
   await prisma.stockPurchase.createMany({data:ids.map(x=>({id:'a3-page-buy-'+x,financeUnitId:'centro',destinationLocationId:'centro',purchaseDate:fixtureDate,supplier:'Fixture A3',goodsTotal:1,total:1,createdByUserId:ownerUserId,idempotencyKey:'a3-page-buy-'+x}))});
   const collect=async path=>{let found=[],cursor='';for(let i=0;i<20;i++){const uri=path+(cursor?(path.includes('?')?'&':'?')+'cursor='+encodeURIComponent(cursor):'');const response=await call(owner,'centro',uri);ok(response.ok,'pagina financeira '+path+' '+i);const items=await response.json();found.push(...items);if(items.length<500)return found;cursor=items.at(-1)?.id;if(!cursor)throw Error('Cursor perdido')}throw Error('Paginação finita não encerrou')};
   const allE=await collect('/finance/entries?from=2026-10-01&to=2026-10-31');
   const allR=await collect('/finance/receivables?clientId=a2-fin-client');
   const allP=await collect('/finance/purchase-payables');
   ok(allE.filter(x=>x.id.startsWith('a3-page-entry-')).length===1555,'todos os 1555 lançamentos');
   ok(allR.filter(x=>x.id.startsWith('a3-page-recv-')).length===1555,'todos os 1555 recebiveis');
   ok(allP.filter(x=>x.id.startsWith('a3-page-buy-')).length===1555,'todas as 1555 compras');
   ok(new Set(allE.map(x=>x.id)).size===allE.length,'sem duplicacao na paginacao financeira');
   ok(new Set(allR.map(x=>x.id)).size===allR.length,'sem duplicacao de recebiveis');
   ok(new Set(allP.map(x=>x.id)).size===allP.length,'sem duplicacao de compras');
  }finally{
   await prisma.centralFinanceEntry.deleteMany({where:{id:{startsWith:'a3-page-entry-'}}});
   await prisma.receivableOpening.deleteMany({where:{id:{startsWith:'a3-page-recv-'}}});
   await prisma.stockPurchase.deleteMany({where:{id:{startsWith:'a3-page-buy-'}}});
  }
  console.log(JSON.stringify({ok:true,checks:count,feature:'A3_FIN_REP_postgres_multi_session_three_units_REA'}));
 }finally{server.kill('SIGTERM');await Promise.race([once(server,'exit'),pause(2500)]).catch(()=>{});await prisma.$disconnect();}
}
main().catch(async e=>{console.error(e.stack||e);await prisma.$disconnect().catch(()=>{});process.exit(1)});
