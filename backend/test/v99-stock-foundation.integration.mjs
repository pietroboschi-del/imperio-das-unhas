import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {PrismaClient} from '@prisma/client';

const prisma=new PrismaClient(),port=3141,base='http://127.0.0.1:'+port,sleep=ms=>new Promise(r=>setTimeout(r,ms)),sha=v=>createHash('sha256').update(String(v)).digest('hex');
let tests=0;const ok=(v,m)=>{tests++;assert.ok(v,m)},eq=(a,b,m)=>{tests++;assert.equal(a,b,m)};
async function wait(){for(let i=0;i<80;i++){try{if((await fetch(base+'/api/v1/health')).ok)return}catch{}await sleep(250)}throw Error('backend start timeout')}
async function req(path,{method='GET',headers={},body}={}){return fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)})}
async function makeUser(id,username,unitIds,permissions=['stock.read','stock.manage'],networkAdmin=false){
  const user=await prisma.user.create({data:{id,username,displayName:username,passwordResetRequired:false,active:true,networkAdmin,systemRole:networkAdmin?'OWNER':'OPERATOR',permissions}});
  if(unitIds.length)await prisma.userUnitAccess.createMany({data:unitIds.map(unitId=>({userId:id,unitId,role:'OPERATOR',permissions:[],active:true}))});
  const token=username+'-session',csrf=username+'-csrf';
  await prisma.session.create({data:{userId:id,tokenHash:sha(token),csrfHash:sha(csrf),status:'ACTIVE',expiresAt:new Date(Date.now()+3600000)}});
  return {'content-type':'application/json','cookie':'imperio_session='+token,'x-csrf-token':csrf};
}
async function clean(){
 await prisma.stockMovement.deleteMany();await prisma.stockTransferItem.deleteMany();await prisma.stockTransfer.deleteMany();await prisma.stockPurchaseItem.deleteMany();await prisma.stockPurchase.deleteMany();await prisma.stockBalance.deleteMany();await prisma.stockLocation.deleteMany();await prisma.product.deleteMany();
 await prisma.stockBalanceOpening.deleteMany({where:{id:{startsWith:'stock-ci-'}}});await prisma.auditEvent.deleteMany({where:{OR:[{action:{startsWith:'stock.'}},{entityId:{startsWith:'stock-ci-'}}]}});
 await prisma.session.deleteMany({where:{userId:{in:['stock-multi','stock-centro','stock-read','stock-owner']}}});await prisma.userUnitAccess.deleteMany({where:{userId:{in:['stock-multi','stock-centro','stock-read','stock-owner']}}});await prisma.user.deleteMany({where:{id:{in:['stock-multi','stock-centro','stock-read','stock-owner']}}});
}
const idem=(x)=>({'idempotency-key':'stock-ci-'+x});

async function main(){
 await clean();
 for(const [id,name] of [['centro','Centro de Contagem'],['big','Big Shopping'],['shopping-contagem','Shopping Contagem']])await prisma.unit.upsert({where:{id},create:{id,name,active:true},update:{name,active:true}});
 const mh=await makeUser('stock-multi','stock_multi_ci',['centro','big','shopping-contagem']);
 const ch=await makeUser('stock-centro','stock_centro_ci',['centro']);
 const rh=await makeUser('stock-read','stock_read_ci',['centro'],['stock.read']);
 const oh=await makeUser('stock-owner','stock_owner_ci',['centro','big','shopping-contagem'],['*'],true);
 const server=spawn(process.execPath,['dist/src/main.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
 try{
  await wait();
  let r=await req('/api/v1/stock/locations',{headers:mh});ok(r.ok,'locations available');let locs=await r.json();eq(locs.length,4,'four stock locations');
  let central=locs.find(x=>x.id==='central');ok(central&&central.kind==='CENTRAL'&&central.unitId===null,'central is technical stock location');
  for(const id of ['centro','big','shopping-contagem']){const x=locs.find(v=>v.id===id);ok(x&&x.kind==='UNIT'&&x.unitId===id,'unit stock location '+id)}
  eq(await prisma.unit.count({where:{id:'central'}}),0,'central was never created as Unit');

  for(const body of [
    {id:'stock-ci-a',sku:'A-CI',name:'Produto A',type:'INPUT',unit:'un',defaultCost:10,minStock:1,allocations:{cat:100},active:true},
    {id:'stock-ci-b',sku:'B-CI',name:'Produto B',type:'RESALE',unit:'un',defaultCost:20,salePrice:40,active:true},
    {id:'stock-ci-open',sku:'OPEN-CI',name:'Produto Opening',type:'INPUT',unit:'un',defaultCost:5,allocations:{cat:100},active:true},
  ]){r=await req('/api/v1/stock/products',{method:'POST',headers:mh,body});ok(r.ok,'global product '+body.id)}
  r=await req('/api/v1/stock/products',{headers:ch});ok(r.ok,'restricted user reads global products');eq((await r.json()).filter(x=>x.id.startsWith('stock-ci-')).length,3,'product catalog is global, not duplicated per unit');
  r=await req('/api/v1/stock/products',{method:'POST',headers:rh,body:{id:'forbidden',name:'No',type:'INPUT'}});eq(r.status,403,'stock.read cannot manage product');

  // Freight rounding regression: three equal-value lines must close exactly to the persisted header freight.
  for(const body of [
    {id:'stock-ci-freight-a',sku:'FREIGHT-A-CI',name:'Frete A',type:'INPUT',unit:'un',defaultCost:1,allocations:{cat:100},active:true},
    {id:'stock-ci-freight-b',sku:'FREIGHT-B-CI',name:'Frete B',type:'INPUT',unit:'un',defaultCost:1,allocations:{cat:100},active:true},
    {id:'stock-ci-freight-c',sku:'FREIGHT-C-CI',name:'Frete C',type:'INPUT',unit:'un',defaultCost:1,allocations:{cat:100},active:true},
  ]){r=await req('/api/v1/stock/products',{method:'POST',headers:mh,body});ok(r.ok,'freight regression product '+body.id)}
  r=await req('/api/v1/stock/purchases',{method:'POST',headers:{...mh,...idem('purchase-freight-residual')},body:{purchaseDate:'2026-10-06',supplier:'Fornecedor Frete',destinationLocationId:'central',freight:1,items:[
    {productId:'stock-ci-freight-a',qty:1,unitCost:1},
    {productId:'stock-ci-freight-b',qty:1,unitCost:1},
    {productId:'stock-ci-freight-c',qty:1,unitCost:1},
  ]}});ok(r.ok,'freight residual purchase');let freightPurchase=await r.json();
  eq(Number(freightPurchase.goodsTotal),3,'freight regression preserves goodsTotal');
  eq(Number(freightPurchase.freight),1,'freight regression persists header freight');
  eq(Number(freightPurchase.total),4,'freight regression total equals goods plus freight');
  eq(Number(freightPurchase.items[0].freightShare),.3333,'first freight share rounds normally');
  eq(Number(freightPurchase.items[1].freightShare),.3333,'second freight share rounds normally');
  eq(Number(freightPurchase.items[2].freightShare),.3334,'last freight share receives rounding residual');
  eq(freightPurchase.items.reduce((s,x)=>s+Number(x.freightShare),0).toFixed(4),'1.0000','persisted freight shares close exactly to header freight');
  for(const item of freightPurchase.items){
    const freightBal=await prisma.stockBalance.findUniqueOrThrow({where:{productId_locationId:{productId:item.productId,locationId:'central'}}});
    eq(Number(freightBal.avgCost),Number(item.landedUnitCost),'average cost uses persisted landed cost '+item.productId);
  }

  // Purchase with proportional freight: goods 200; each line receives 10 freight.
  r=await req('/api/v1/stock/purchases',{method:'POST',headers:{...mh,...idem('purchase-central-1')},body:{purchaseDate:'2026-10-06',supplier:'Fornecedor CI',destinationLocationId:'central',freight:20,items:[{productId:'stock-ci-a',qty:10,unitCost:10},{productId:'stock-ci-b',qty:5,unitCost:20}]}});ok(r.ok,'central purchase');let purchase=await r.json();
  eq(Number(purchase.items[0].freightShare),10,'freight proportional item A');eq(Number(purchase.items[0].landedUnitCost),11,'landed cost A');
  eq(Number(purchase.items[1].freightShare),10,'freight proportional item B');eq(Number(purchase.items[1].landedUnitCost),22,'landed cost B');
  // Replay same idempotency key cannot double stock.
  r=await req('/api/v1/stock/purchases',{method:'POST',headers:{...mh,...idem('purchase-central-1')},body:{purchaseDate:'2026-10-06',supplier:'Fornecedor CI',destinationLocationId:'central',freight:20,items:[{productId:'stock-ci-a',qty:10,unitCost:10},{productId:'stock-ci-b',qty:5,unitCost:20}]}});ok(r.ok,'purchase replay accepted idempotently');
  let bal=await prisma.stockBalance.findUniqueOrThrow({where:{productId_locationId:{productId:'stock-ci-a',locationId:'central'}}});eq(Number(bal.qty),10,'purchase replay did not duplicate qty');eq(Number(bal.avgCost),11,'purchase sets avg cost');

  r=await req('/api/v1/stock/purchases',{method:'POST',headers:{...mh,...idem('purchase-central-2')},body:{purchaseDate:'2026-10-06',supplier:'Fornecedor CI 2',destinationLocationId:'central',freight:0,items:[{productId:'stock-ci-a',qty:10,unitCost:13}]}});ok(r.ok,'second purchase');
  bal=await prisma.stockBalance.findUniqueOrThrow({where:{productId_locationId:{productId:'stock-ci-a',locationId:'central'}}});eq(Number(bal.qty),20,'second purchase qty');eq(Number(bal.avgCost),12,'weighted average cost');

  // Independent balances at each store.
  for(const [i,locationId] of ['centro','big','shopping-contagem'].entries()){r=await req('/api/v1/stock/purchases',{method:'POST',headers:{...mh,...idem('purchase-'+locationId)},body:{purchaseDate:'2026-10-06',supplier:'Loja',destinationLocationId:locationId,freight:0,items:[{productId:'stock-ci-a',qty:8+i*2,unitCost:12+i}]}});ok(r.ok,'purchase '+locationId)}
  const balances=await prisma.stockBalance.findMany({where:{productId:'stock-ci-a'}});eq(balances.length,4,'same global product has four location balances');
  eq(Number(balances.find(x=>x.locationId==='centro').qty),8,'Centro independent balance');eq(Number(balances.find(x=>x.locationId==='big').qty),10,'Big independent balance');eq(Number(balances.find(x=>x.locationId==='shopping-contagem').qty),12,'Shopping independent balance');

  // Consumption and insufficient balance.
  r=await req('/api/v1/stock/consumptions',{method:'POST',headers:{...ch,...idem('consume-centro')},body:{locationId:'centro',note:'Consumo CI',items:[{productId:'stock-ci-a',qty:2}]}});ok(r.ok,'Centro restricted user consumes own stock');
  bal=await prisma.stockBalance.findUniqueOrThrow({where:{productId_locationId:{productId:'stock-ci-a',locationId:'centro'}}});eq(Number(bal.qty),6,'consumption decreases balance');
  let movement=await prisma.stockMovement.findFirstOrThrow({where:{type:'CONSUMPTION',locationId:'centro'}});eq(Number(movement.unitCost),12,'consumption appropriates current average cost');
  r=await req('/api/v1/stock/consumptions',{method:'POST',headers:{...ch,...idem('consume-too-much')},body:{locationId:'centro',items:[{productId:'stock-ci-a',qty:999}]}});eq(r.status,409,'insufficient consumption blocked');
  bal=await prisma.stockBalance.findUniqueOrThrow({where:{productId_locationId:{productId:'stock-ci-a',locationId:'centro'}}});eq(Number(bal.qty),6,'failed consumption leaves balance intact');

  // Inventory positive and negative.
  r=await req('/api/v1/stock/inventory',{method:'POST',headers:{...ch,...idem('inv-plus')},body:{locationId:'centro',reason:'Contagem positiva',counts:[{productId:'stock-ci-a',countedQty:9}]}});ok(r.ok,'positive inventory');
  movement=await prisma.stockMovement.findFirstOrThrow({where:{type:'INVENTORY_ADJUSTMENT',locationId:'centro'},orderBy:{createdAt:'desc'}});eq(Number(movement.beforeQty),6,'inventory records previous qty');eq(Number(movement.afterQty),9,'inventory records counted qty');eq(Number(movement.quantity),3,'inventory positive difference');
  r=await req('/api/v1/stock/inventory',{method:'POST',headers:{...mh,...idem('inv-minus')},body:{locationId:'big',reason:'Contagem negativa',counts:[{productId:'stock-ci-a',countedQty:7}]}});ok(r.ok,'negative inventory');
  movement=await prisma.stockMovement.findFirstOrThrow({where:{type:'INVENTORY_ADJUSTMENT',locationId:'big'},orderBy:{createdAt:'desc'}});eq(Number(movement.quantity),-3,'inventory negative difference');

  // Access boundaries.
  r=await req('/api/v1/stock/balances?locationId=big',{headers:ch});eq(r.status,403,'Centro user cannot read Big');
  r=await req('/api/v1/stock/consumptions',{method:'POST',headers:{...ch,...idem('arbitrary')},body:{locationId:'evil-location',items:[{productId:'stock-ci-a',qty:1}]}});eq(r.status,404,'arbitrary locationId blocked');

  async function transfer(label,headers,source,destination,qty){
    let rr=await req('/api/v1/stock/transfers',{method:'POST',headers:{...headers,...idem('transfer-'+label)},body:{transferDate:'2026-10-06',sourceLocationId:source,destinationLocationId:destination,items:[{productId:'stock-ci-a',qty}]}});ok(rr.ok,'transfer separated '+label);let t=await rr.json();eq(t.status,'SEPARATED','state SEPARATED '+label);
    const srcBefore=Number((await prisma.stockBalance.findUniqueOrThrow({where:{productId_locationId:{productId:'stock-ci-a',locationId:source}}})).qty);
    const dstBefore=Number((await prisma.stockBalance.findUniqueOrThrow({where:{productId_locationId:{productId:'stock-ci-a',locationId:destination}}})).qty);
    rr=await req('/api/v1/stock/transfers/'+t.id+'/send',{method:'POST',headers});ok(rr.ok,'send '+label);eq((await rr.json()).status,'IN_TRANSIT','state IN_TRANSIT '+label);
    eq(Number((await prisma.stockBalance.findUniqueOrThrow({where:{productId_locationId:{productId:'stock-ci-a',locationId:source}}})).qty),srcBefore-qty,'source debited on send '+label);
    eq(Number((await prisma.stockBalance.findUniqueOrThrow({where:{productId_locationId:{productId:'stock-ci-a',locationId:destination}}})).qty),dstBefore,'destination unchanged before receive '+label);
    rr=await req('/api/v1/stock/transfers/'+t.id+'/receive',{method:'POST',headers});ok(rr.ok,'receive '+label);eq((await rr.json()).status,'RECEIVED','state RECEIVED '+label);
    eq(Number((await prisma.stockBalance.findUniqueOrThrow({where:{productId_locationId:{productId:'stock-ci-a',locationId:destination}}})).qty),dstBefore+qty,'destination credited only on receive '+label);
    const movementCount=await prisma.stockMovement.count({where:{referenceType:'TRANSFER',referenceId:t.id}});eq(movementCount,2,'transfer creates only out/in movements '+label);
    eq(await prisma.stockMovement.count({where:{referenceType:'TRANSFER',referenceId:t.id,type:'CONSUMPTION'}}),0,'transfer creates no consumption/CMV '+label);
    rr=await req('/api/v1/stock/transfers/'+t.id+'/receive',{method:'POST',headers});ok(rr.ok,'duplicate receive is idempotent '+label);
    eq(await prisma.stockMovement.count({where:{referenceType:'TRANSFER',referenceId:t.id}}),2,'duplicate receive creates no movement '+label);
    return t;
  }
  await transfer('central-centro',ch,'central','centro',2);
  await transfer('centro-central',ch,'centro','central',1);
  r=await req('/api/v1/stock/transfers',{method:'POST',headers:{...ch,...idem('restricted-centro-big')},body:{sourceLocationId:'centro',destinationLocationId:'big',items:[{productId:'stock-ci-a',qty:1}]}});eq(r.status,403,'store-to-store requires access to both stores');
  await transfer('centro-big',mh,'centro','big',1);
  await transfer('big-shopping',mh,'big','shopping-contagem',1);

  // stock.read can consult own scope and cannot manage.
  r=await req('/api/v1/stock/balances?locationId=centro',{headers:rh});ok(r.ok,'stock.read reads own balance');
  r=await req('/api/v1/stock/inventory',{method:'POST',headers:{...rh,...idem('read-cannot-write')},body:{locationId:'centro',reason:'No',counts:[{productId:'stock-ci-a',countedQty:1}]}});eq(r.status,403,'stock.read cannot perform stock.manage action');

  // Opening balance mechanism: migration source remains separate and application is idempotent/audited.
  await prisma.stockBalanceOpening.create({data:{id:'stock-ci-opening-1',productId:'stock-ci-open',locationId:'u2',qty:'4',avgCost:'5',legacyPayload:{source:'ci'}}});
  r=await req('/api/v1/stock/opening-balances/apply',{method:'POST',headers:oh,body:{}});ok(r.ok,'network admin applies opening balance mechanism');let opening=await r.json();eq(opening.applied,1,'opening applied once');
  bal=await prisma.stockBalance.findUniqueOrThrow({where:{productId_locationId:{productId:'stock-ci-open',locationId:'shopping-contagem'}}});eq(Number(bal.qty),4,'legacy u2 maps to Shopping location');
  eq(await prisma.stockMovement.count({where:{type:'OPENING_BALANCE',referenceId:'stock-ci-opening-1'}}),1,'opening is traceable movement');
  r=await req('/api/v1/stock/opening-balances/apply',{method:'POST',headers:oh,body:{}});ok(r.ok,'opening replay');opening=await r.json();eq(opening.skipped,1,'opening replay idempotently skipped');
  eq(await prisma.stockMovement.count({where:{type:'OPENING_BALANCE',referenceId:'stock-ci-opening-1'}}),1,'opening not duplicated');

  console.log(JSON.stringify({ok:true,tests,feature:'three_unit_stock_foundation',locations:['central','centro','big','shopping-contagem']}));
 }finally{server.kill('SIGTERM');await clean().catch(()=>{});await prisma.$disconnect()}
}
main().catch(async e=>{console.error(e.stack||e);await prisma.$disconnect().catch(()=>{});process.exit(1)});
