import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockLocationKind } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { ImperioPrincipal } from '../common/request-context';
import { assertOperationalWriteEnabled } from '../common/operational-write-gate';
import { evaluateAccess, hasPermissions, permissionSet } from '../auth/permission-policy';

const CANONICAL_UNITS=['centro','big','shopping-contagem'] as const;
const LEGACY_LOCATION_MAP:Record<string,string>={central:'central',centro:'centro',big:'big','shopping-contagem':'shopping-contagem',u1:'big',u2:'shopping-contagem',u3:'centro'};
const D=(v:unknown,scale=4)=>new Prisma.Decimal(Number(v||0).toFixed(scale));
const n=(v:any)=>Number(v||0);
const dateOnly=(v?:string)=>new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?String(v)+'T00:00:00.000Z':new Date().toISOString().slice(0,10)+'T00:00:00.000Z');

@Injectable()
export class StockService {
  constructor(private readonly prisma:PrismaService){}

  private key(scope:string,key?:string){
    const raw=String(key||'').trim();
    if(!raw||raw.length>200)throw new ConflictException('Idempotency-Key é obrigatória para movimentações de estoque');
    return scope+':'+createHash('sha256').update(raw).digest('hex');
  }
  private fingerprint(body:any):string{
    const stable=(v:any):any=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
    return createHash('sha256').update(JSON.stringify(stable(body))).digest('hex');
  }
  private async operationLock(tx:Prisma.TransactionClient,idem:string,body:any){
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'stock-operation'}),hashtext(${idem}))`;
    const fingerprint=this.fingerprint(body);
    const previous=await tx.auditEvent.findFirst({where:{entityType:'StockOperation',entityId:idem}});
    if(previous&&(previous.legacyPayload as any)?.fingerprint!==fingerprint)throw new ConflictException('Idempotency-Key já utilizada para outra operação de estoque');
    return {fingerprint,previous};
  }
  private async recordOperation(tx:Prisma.TransactionClient,idem:string,fingerprint:string,userId:string){
    await tx.auditEvent.create({data:{id:randomUUID(),userId,action:'stock.operation.accepted',entityType:'StockOperation',entityId:idem,legacyPayload:{fingerprint},occurredAt:new Date()}});
  }
  private async assertWriteLocations(p:ImperioPrincipal,ids:string[]){
    this.assertAny(p,'stock.manage');
    const unitIds:string[]=[];
    for(const id of ids){
      if(CANONICAL_UNITS.includes(id as any)){
        if(!this.unitAccess(p,id,'stock.manage'))throw new ForbiddenException('Usuário sem acesso ao estoque desta localização');
        unitIds.push(id);
      }else if(id==='central'){
        if(!this.centralAccess(p,'stock.manage'))throw new ForbiddenException('Usuário sem acesso ao estoque central');
      }else{
        const location=await this.location(id);this.assertLocation(p,location,'stock.manage');
        if(location.unitId)unitIds.push(location.unitId);
      }
    }
    assertOperationalWriteEnabled();
    for(const unitId of unitIds)assertOperationalWriteEnabled(unitId);
    return this.assertLocations(p,ids,'stock.manage');
  }
  private globalPerm(p:ImperioPrincipal,perm:'stock.read'|'stock.manage'){
    return p.networkAdmin||hasPermissions(permissionSet(p.permissions),[perm]);
  }
  private unitAccess(p:ImperioPrincipal,unitId:string,perm:'stock.read'|'stock.manage'){
    if(p.networkAdmin)return true;
    const a=p.unitAccesses.find(x=>x.unitId===unitId);
    return !!a&&hasPermissions(permissionSet(p.permissions,a.permissions),[perm]);
  }
  private centralAccess(p:ImperioPrincipal,perm:'stock.read'|'stock.manage'){
    if(p.networkAdmin||this.globalPerm(p,perm))return true;
    return p.unitAccesses.some(a=>hasPermissions(permissionSet(a.permissions),[perm]));
  }
  private async lockOperation(tx:Prisma.TransactionClient,key:string){await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('stock-operation'), hashtext(${key}))`;}
  async ensureLocations(db:any=this.prisma){
    const units=await db.unit.findMany({where:{id:{in:[...CANONICAL_UNITS]}},select:{id:true,name:true,active:true}});
    await db.stockLocation.upsert({where:{id:'central'},create:{id:'central',kind:StockLocationKind.CENTRAL,unitId:null,name:'Estoque Central',active:true},update:{kind:StockLocationKind.CENTRAL,unitId:null,name:'Estoque Central',active:true}});
    for(const u of units)await db.stockLocation.upsert({where:{id:u.id},create:{id:u.id,kind:StockLocationKind.UNIT,unitId:u.id,name:u.name,active:u.active},update:{kind:StockLocationKind.UNIT,unitId:u.id,name:u.name,active:u.active}});
  }
  private async location(id:string,db:any=this.prisma){
    const x=await db.stockLocation.findUnique({where:{id},include:{unit:true}});
    if(!x?.active)throw new NotFoundException('Localização de estoque inválida ou inativa');
    if(x.kind===StockLocationKind.UNIT&&(!x.unitId||!x.unit?.active))throw new NotFoundException('Unidade da localização está inativa');
    return x;
  }
  private assertLocation(p:ImperioPrincipal,loc:any,perm:'stock.read'|'stock.manage'){
    const allowed=loc.kind===StockLocationKind.CENTRAL?this.centralAccess(p,perm):this.unitAccess(p,loc.unitId,perm);
    if(!allowed)throw new ForbiddenException('Usuário sem acesso ao estoque desta localização');
  }
  private assertAny(p:ImperioPrincipal,perm:'stock.read'|'stock.manage'){
    if(this.centralAccess(p,perm))return;
    throw new ForbiddenException('Permissão funcional insuficiente');
  }
  private async assertLocations(p:ImperioPrincipal,ids:string[],perm:'stock.read'|'stock.manage',db:any=this.prisma){
    // Denied requests must not trigger location creation/updates, including when
    // an unauthorized destination is mixed with an authorized source.
    this.assertAny(p,perm);
    const unique=[...new Set(ids)];
    for(const id of unique){
      if(CANONICAL_UNITS.includes(id as any)){
        if(!this.unitAccess(p,id,perm))throw new ForbiddenException('Usuário sem acesso ao estoque desta localização');
      }else if(id==='central'){
        if(!this.centralAccess(p,perm))throw new ForbiddenException('Usuário sem acesso ao estoque central');
      }else{
        const existing=await db.stockLocation.findUnique({where:{id}});
        if(!existing)throw new NotFoundException('Localização de estoque inválida ou inativa');
        this.assertLocation(p,existing,perm);
      }
    }
    if(perm==='stock.manage')for(const id of unique)assertOperationalWriteEnabled(CANONICAL_UNITS.includes(id as any)?id:undefined);
    if(perm==='stock.manage')await this.ensureLocations(db);
    const out=[];
    for(const id of unique){const x=await this.location(id,db);this.assertLocation(p,x,perm);out.push(x)}
    return out;
  }
  async locations(p:ImperioPrincipal){
    this.assertAny(p,'stock.read');
    const rows=await this.prisma.stockLocation.findMany({where:{active:true},include:{unit:true},orderBy:{id:'asc'}});
    return rows.filter(x=>{try{this.assertLocation(p,x,'stock.read');return true}catch{return false}}).map(x=>({id:x.id,kind:x.kind,unitId:x.unitId,name:x.name,active:x.active}));
  }
  async products(p:ImperioPrincipal){this.assertAny(p,'stock.read');return this.prisma.product.findMany({orderBy:[{active:'desc'},{name:'asc'}]})}
  async upsertProduct(p:ImperioPrincipal,body:any,id?:string){
    this.assertAny(p,'stock.manage');assertOperationalWriteEnabled();
    const productId=String(id||body.id||randomUUID()).trim(),name=String(body.name||'').trim(),type=String(body.type||'').trim().toUpperCase();
    if(!name)throw new ConflictException('Nome do produto é obrigatório');
    if(!['INPUT','RESALE'].includes(type))throw new ConflictException('Tipo de produto inválido');
    const allocations=body.allocations&&typeof body.allocations==='object'&&!Array.isArray(body.allocations)?body.allocations:{};
    if(type==='INPUT'){
      const total=Object.values(allocations).reduce((s:any,v:any)=>s+Number(v||0),0);
      if(Object.keys(allocations).length&&Math.abs(Number(total)-100)>.0001)throw new ConflictException('A apropriação do insumo precisa somar 100%');
    }
    const data={sku:String(body.sku||'').trim()||null,name,type,groupName:String(body.groupName||body.group||'').trim()||null,familyId:String(body.familyId||'').trim()||null,brand:String(body.brand||'').trim()||null,unit:String(body.unit||'un').trim()||'un',packageQty:body.packageQty===null||body.packageQty===undefined?null:D(body.packageQty),baseUnit:String(body.baseUnit||'').trim()||null,defaultCost:D(body.defaultCost||0),salePrice:D(body.salePrice||0,2),minStock:D(body.minStock||0),supplier:String(body.supplier||'').trim()||null,allocations:allocations as Prisma.InputJsonValue,active:body.active!==false};
    return this.prisma.$transaction(async tx=>{
      const existing=await tx.product.findUnique({where:{id:productId}});
      if(id&&!existing)throw new NotFoundException('Produto não encontrado');
      if(!id&&existing)throw new ConflictException('Produto já existe');
      const row=existing?await tx.product.update({where:{id:productId},data:{...data,version:{increment:1}}}):await tx.product.create({data:{id:productId,...data}});
      await this.ensureLocations(tx);
      await tx.auditEvent.create({data:{id:randomUUID(),userId:p.userId,action:existing?'stock.product.updated':'stock.product.created',entityType:'Product',entityId:productId,legacyPayload:{stock:true},occurredAt:new Date()}});
      return row;
    });
  }
  async balances(p:ImperioPrincipal,locationId?:string){
    this.assertAny(p,'stock.read');
    const ids=locationId?[locationId]:(await this.locations(p)).map(x=>x.id);
    await this.assertLocations(p,ids,'stock.read');
    return this.prisma.stockBalance.findMany({where:{locationId:{in:ids}},include:{product:true,location:true},orderBy:[{locationId:'asc'},{product:{name:'asc'}}]});
  }
  async movements(p:ImperioPrincipal,locationId?:string){
    this.assertAny(p,'stock.read');
    const ids=locationId?[locationId]:(await this.locations(p)).map(x=>x.id);
    await this.assertLocations(p,ids,'stock.read');
    return this.prisma.stockMovement.findMany({where:{locationId:{in:ids}},include:{product:true},orderBy:{createdAt:'desc'},take:1000});
  }
  private async balanceLocked(tx:Prisma.TransactionClient,productId:string,locationId:string){
    await tx.stockBalance.upsert({where:{productId_locationId:{productId,locationId}},create:{productId,locationId,qty:D(0),avgCost:D(0)},update:{}});
    await tx.$queryRaw`SELECT "id" FROM "StockBalance" WHERE "productId"=${productId} AND "locationId"=${locationId} FOR UPDATE`;
    return tx.stockBalance.findUniqueOrThrow({where:{productId_locationId:{productId,locationId}}});
  }
  private movementData(args:{type:string;productId:string;locationId:string;sourceLocationId?:string|null;destinationLocationId?:string|null;quantity:number;unitCost:number;beforeQty:number;afterQty:number;userId:string;referenceType:string;referenceId:string;operationKey:string;reason?:string|null}){
    return {type:args.type,productId:args.productId,locationId:args.locationId,sourceLocationId:args.sourceLocationId||null,destinationLocationId:args.destinationLocationId||null,quantity:D(args.quantity),unitCost:D(args.unitCost),beforeQty:D(args.beforeQty),afterQty:D(args.afterQty),performedByUserId:args.userId,referenceType:args.referenceType,referenceId:args.referenceId,operationKey:args.operationKey,reason:args.reason||null};
  }
  private async productsByIds(tx:Prisma.TransactionClient,ids:string[]){
    const unique=[...new Set(ids)];const rows=await tx.product.findMany({where:{id:{in:unique},active:true}});if(rows.length!==unique.length)throw new NotFoundException('Um ou mais produtos não existem ou estão inativos');return new Map(rows.map(x=>[x.id,x]));
  }
  async purchase(p:ImperioPrincipal,body:any,key?:string){
    const idem=this.key('stock.purchase',key),locationId=String(body.destinationLocationId||'');
    const financeUnitId=String(body.financeUnitId||(CANONICAL_UNITS.includes(locationId as any)?locationId:''));
    if(!CANONICAL_UNITS.includes(financeUnitId as any))throw new ConflictException('Unidade financeira da compra obrigatória');
    if(financeUnitId!==locationId&&!evaluateAccess({networkAdmin:p.networkAdmin,globalPermissions:p.permissions,unitAccesses:p.unitAccesses,unitScoped:true,unitId:financeUnitId,requiredPermissions:['finance.manage']}).allowed)throw new ForbiddenException('Sem permissão financeira na unidade da obrigação');
    await this.assertWriteLocations(p,[locationId]);
    const raw=Array.isArray(body.items)?body.items:[];if(!raw.length)throw new ConflictException('Compra precisa de ao menos um item');
    return this.prisma.$transaction(async tx=>{
      const operation=await this.operationLock(tx,idem,body);const prior=await tx.stockPurchase.findUnique({where:{idempotencyKey:idem},include:{items:true}});if(prior){if(!operation.previous)throw new ConflictException('Replay histórico sem fingerprint precisa de revisão');return prior;}
      const products=await this.productsByIds(tx,raw.map((x:any)=>String(x.productId)));
      const lines:{productId:string;qty:number;unitCost:number;sortOrder:number}[]=raw.map((x:any,i:number)=>({productId:String(x.productId),qty:Number(x.qty),unitCost:Number(x.unitCost),sortOrder:i}));if(lines.some((x:{productId:string;qty:number;unitCost:number;sortOrder:number})=>!Number.isFinite(x.qty)||!(n(D(x.qty))>0)||x.unitCost<0||!Number.isFinite(x.unitCost)))throw new ConflictException('Quantidade/custo inválido na compra');
      const goods=lines.reduce((s:number,x:{productId:string;qty:number;unitCost:number;sortOrder:number})=>s+x.qty*x.unitCost,0),freightInput=Number(body.freight||0),freight=n(D(freightInput,2)),total=goods+freight,purchaseId=randomUUID();
      const row=await tx.stockPurchase.create({data:{id:purchaseId,destinationLocationId:locationId,financeUnitId,purchaseDate:dateOnly(body.purchaseDate),supplier:String(body.supplier||'').trim()||'Não informado',freight:D(freight,2),goodsTotal:D(goods,2),total:D(total,2),note:String(body.note||'').trim()||null,createdByUserId:p.userId,idempotencyKey:idem}});
      if(!Number.isFinite(freightInput)||freightInput<0)throw new ConflictException('Frete inválido');
      let allocatedFreight=D(0);
      for(const line of lines){
        products.get(line.productId);
        const proportionalShare=goods>0?freight*(line.qty*line.unitCost/goods):freight/lines.length;
        const shareDecimal=line.sortOrder===lines.length-1?D(freight).minus(allocatedFreight):D(proportionalShare);
        allocatedFreight=allocatedFreight.plus(shareDecimal);
        const share=n(shareDecimal),landedDecimal=D(line.unitCost+share/line.qty),landed=n(landedDecimal);
        await tx.stockPurchaseItem.create({data:{purchaseId,productId:line.productId,qty:D(line.qty),unitCost:D(line.unitCost),freightShare:shareDecimal,landedUnitCost:landedDecimal,sortOrder:line.sortOrder}});
        const bal=await this.balanceLocked(tx,line.productId,locationId),before=n(bal.qty),oldCost=n(bal.avgCost),after=before+line.qty,avg=after?((before*oldCost)+(line.qty*landed))/after:landed;
        await tx.stockBalance.update({where:{id:bal.id},data:{qty:D(after),avgCost:D(avg),version:{increment:1}}});
        await tx.stockMovement.create({data:this.movementData({type:'PURCHASE',productId:line.productId,locationId,quantity:line.qty,unitCost:landed,beforeQty:before,afterQty:after,userId:p.userId,referenceType:'PURCHASE',referenceId:purchaseId,operationKey:idem+':'+line.sortOrder,reason:'Compra recebida'})});
      }
      await tx.auditEvent.create({data:{id:randomUUID(),userId:p.userId,action:'stock.purchase.received',entityType:'StockPurchase',entityId:purchaseId,legacyPayload:{stock:true,locationId,itemCount:lines.length,total},occurredAt:new Date()}});
      await this.recordOperation(tx,idem,operation.fingerprint,p.userId);
      return tx.stockPurchase.findUniqueOrThrow({where:{id:row.id},include:{items:true}});
    });
  }
  async purchases(p:ImperioPrincipal,locationId?:string){
    this.assertAny(p,'stock.read');const ids=locationId?[locationId]:(await this.locations(p)).map(x=>x.id);await this.assertLocations(p,ids,'stock.read');
    return this.prisma.stockPurchase.findMany({where:{destinationLocationId:{in:ids}},include:{items:{include:{product:true},orderBy:{sortOrder:'asc'}},destinationLocation:true},orderBy:{createdAt:'desc'},take:500});
  }
  async consume(p:ImperioPrincipal,body:any,key?:string){
    const idem=this.key('stock.consume',key),locationId=String(body.locationId||'');await this.assertWriteLocations(p,[locationId]);
    const raw=Array.isArray(body.items)?body.items:[];if(!raw.length)throw new ConflictException('Consumo precisa de ao menos um item');
    return this.prisma.$transaction(async tx=>{
      const operation=await this.operationLock(tx,idem,body);const prior=await tx.auditEvent.findFirst({where:{action:'stock.consumption.applied',entityId:idem}});if(prior){if(!operation.previous)throw new ConflictException('Replay histórico sem fingerprint precisa de revisão');return {idempotent:true,operationId:idem};}
      await this.productsByIds(tx,raw.map((x:any)=>String(x.productId)));const seen=new Set<string>();
      for(let i=0;i<raw.length;i++){const productId=String(raw[i].productId),qty=Number(raw[i].qty);if(seen.has(productId))throw new ConflictException('Produto repetido no mesmo consumo');seen.add(productId);if(!Number.isFinite(qty)||!(n(D(qty))>0))throw new ConflictException('Quantidade de consumo inválida');
        const bal=await this.balanceLocked(tx,productId,locationId),before=n(bal.qty);if(qty>before+.0000001)throw new ConflictException('Saldo insuficiente para consumo');const after=before-qty,cost=n(bal.avgCost);
        await tx.stockBalance.update({where:{id:bal.id},data:{qty:D(after),version:{increment:1}}});
        await tx.stockMovement.create({data:this.movementData({type:'CONSUMPTION',productId,locationId,quantity:-qty,unitCost:cost,beforeQty:before,afterQty:after,userId:p.userId,referenceType:'CONSUMPTION',referenceId:idem,operationKey:idem+':'+i,reason:String(body.note||'').trim()||'Consumo operacional'})});
      }
      await tx.auditEvent.create({data:{id:randomUUID(),userId:p.userId,action:'stock.consumption.applied',entityType:'StockConsumption',entityId:idem,legacyPayload:{stock:true,locationId,itemCount:raw.length},occurredAt:new Date()}});
      await this.recordOperation(tx,idem,operation.fingerprint,p.userId);
      return {ok:true,operationId:idem};
    });
  }
  async inventory(p:ImperioPrincipal,body:any,key?:string){
    const idem=this.key('stock.inventory',key),locationId=String(body.locationId||''),reason=String(body.reason||'').trim();await this.assertWriteLocations(p,[locationId]);
    if(!reason)throw new ConflictException('Motivo do inventário é obrigatório');
    const counts=Array.isArray(body.counts)?body.counts:[];if(!counts.length)throw new ConflictException('Inventário precisa de contagens');
    return this.prisma.$transaction(async tx=>{
      const operation=await this.operationLock(tx,idem,body);const prior=await tx.auditEvent.findFirst({where:{action:'stock.inventory.applied',entityId:idem}});if(prior){if(!operation.previous)throw new ConflictException('Replay histórico sem fingerprint precisa de revisão');return {idempotent:true,operationId:idem};}
      await this.productsByIds(tx,counts.map((x:any)=>String(x.productId)));const seen=new Set<string>();let changed=0;
      for(let i=0;i<counts.length;i++){const productId=String(counts[i].productId),counted=Number(counts[i].countedQty);if(seen.has(productId))throw new ConflictException('Produto repetido no inventário');seen.add(productId);if(counted<0||!Number.isFinite(counted))throw new ConflictException('Contagem inválida');
        const bal=await this.balanceLocked(tx,productId,locationId),before=n(bal.qty),diff=counted-before,cost=n(bal.avgCost);if(Math.abs(diff)<.0000001)continue;changed++;
        await tx.stockBalance.update({where:{id:bal.id},data:{qty:D(counted),version:{increment:1}}});
        await tx.stockMovement.create({data:this.movementData({type:'INVENTORY_ADJUSTMENT',productId,locationId,quantity:diff,unitCost:cost,beforeQty:before,afterQty:counted,userId:p.userId,referenceType:'INVENTORY',referenceId:idem,operationKey:idem+':'+i,reason})});
      }
      await tx.auditEvent.create({data:{id:randomUUID(),userId:p.userId,action:'stock.inventory.applied',entityType:'StockInventory',entityId:idem,legacyPayload:{stock:true,locationId,changed,reason},occurredAt:new Date()}});
      await this.recordOperation(tx,idem,operation.fingerprint,p.userId);
      return {ok:true,operationId:idem,changed};
    });
  }
  private async transferWithAccess(p:ImperioPrincipal,id:string,perm:'stock.read'|'stock.manage',tx:any=this.prisma){
    const row=await tx.stockTransfer.findUnique({where:{id},include:{items:{orderBy:{sortOrder:'asc'}},sourceLocation:true,destinationLocation:true}});if(!row)throw new NotFoundException('Transferência não encontrada');
    this.assertLocation(p,row.sourceLocation,perm);this.assertLocation(p,row.destinationLocation,perm);if(perm==='stock.manage'){assertOperationalWriteEnabled(row.sourceLocation.unitId||undefined);assertOperationalWriteEnabled(row.destinationLocation.unitId||undefined);}return row;
  }
  async createTransfer(p:ImperioPrincipal,body:any,key?:string){
    const idem=this.key('stock.transfer',key),sourceLocationId=String(body.sourceLocationId||''),destinationLocationId=String(body.destinationLocationId||'');if(!sourceLocationId||sourceLocationId===destinationLocationId)throw new ConflictException('Origem e destino devem ser diferentes');
    await this.assertWriteLocations(p,[sourceLocationId,destinationLocationId]);const raw=Array.isArray(body.items)?body.items:[];if(!raw.length)throw new ConflictException('Transferência precisa de itens');
    return this.prisma.$transaction(async tx=>{
      const operation=await this.operationLock(tx,idem,body);const prior=await tx.stockTransfer.findUnique({where:{idempotencyKey:idem},include:{items:true}});if(prior){if(!operation.previous)throw new ConflictException('Replay histórico sem fingerprint precisa de revisão');return prior;}
      await this.productsByIds(tx,raw.map((x:any)=>String(x.productId)));const seen=new Set<string>(),items=raw.map((x:any,i:number)=>{const productId=String(x.productId),qty=Number(x.qty);if(seen.has(productId))throw new ConflictException('Produto repetido na transferência');seen.add(productId);if(!Number.isFinite(qty)||!(n(D(qty))>0))throw new ConflictException('Quantidade inválida');return {productId,qty,sortOrder:i}});
      const id=randomUUID();await tx.stockTransfer.create({data:{id,sourceLocationId,destinationLocationId,transferDate:dateOnly(body.transferDate),status:'SEPARATED',note:String(body.note||'').trim()||null,createdByUserId:p.userId,idempotencyKey:idem,items:{create:items.map((x:{productId:string;qty:number;sortOrder:number})=>({productId:x.productId,qty:D(x.qty),sortOrder:x.sortOrder}))}}});
      await tx.auditEvent.create({data:{id:randomUUID(),userId:p.userId,action:'stock.transfer.separated',entityType:'StockTransfer',entityId:id,legacyPayload:{stock:true,sourceLocationId,destinationLocationId},occurredAt:new Date()}});
      await this.recordOperation(tx,idem,operation.fingerprint,p.userId);
      return tx.stockTransfer.findUniqueOrThrow({where:{id},include:{items:true}});
    });
  }
  async sendTransfer(p:ImperioPrincipal,id:string){
    return this.prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'stock-transfer'}),hashtext(${id}))`;const row=await this.transferWithAccess(p,id,'stock.manage',tx);await this.assertWriteLocations(p,[row.sourceLocationId,row.destinationLocationId]);if(row.status==='IN_TRANSIT'||row.status==='RECEIVED')return row;if(row.status!=='SEPARATED')throw new ConflictException('Transferência não pode ser enviada neste estado');
      for(const item of row.items){const bal=await this.balanceLocked(tx,item.productId,row.sourceLocationId),before=n(bal.qty),qty=n(item.qty);if(qty>before+.0000001)throw new ConflictException('Saldo insuficiente na origem da transferência');const after=before-qty,cost=n(bal.avgCost);
        await tx.stockBalance.update({where:{id:bal.id},data:{qty:D(after),version:{increment:1}}});
        await tx.stockTransferItem.update({where:{id:item.id},data:{unitCost:D(cost)}});
        await tx.stockMovement.create({data:this.movementData({type:'TRANSFER_OUT',productId:item.productId,locationId:row.sourceLocationId,sourceLocationId:row.sourceLocationId,destinationLocationId:row.destinationLocationId,quantity:-qty,unitCost:cost,beforeQty:before,afterQty:after,userId:p.userId,referenceType:'TRANSFER',referenceId:id,operationKey:'transfer-out:'+item.id,reason:'Transferência enviada'})});
      }
      const updated=await tx.stockTransfer.update({where:{id},data:{status:'IN_TRANSIT',sentByUserId:p.userId,sentAt:new Date()}});
      await tx.auditEvent.create({data:{id:randomUUID(),userId:p.userId,action:'stock.transfer.sent',entityType:'StockTransfer',entityId:id,legacyPayload:{stock:true},occurredAt:new Date()}});
      return updated;
    });
  }
  async receiveTransfer(p:ImperioPrincipal,id:string){
    return this.prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'stock-transfer'}),hashtext(${id}))`;const row=await this.transferWithAccess(p,id,'stock.manage',tx);await this.assertWriteLocations(p,[row.sourceLocationId,row.destinationLocationId]);if(row.status==='RECEIVED')return row;if(row.status!=='IN_TRANSIT')throw new ConflictException('Transferência precisa estar em trânsito');
      for(const item of row.items){if(item.unitCost===null)throw new ConflictException('Transferência sem custo congelado no envio');const bal=await this.balanceLocked(tx,item.productId,row.destinationLocationId),before=n(bal.qty),oldCost=n(bal.avgCost),qty=n(item.qty),cost=n(item.unitCost),after=before+qty,avg=after?((before*oldCost)+(qty*cost))/after:cost;
        await tx.stockBalance.update({where:{id:bal.id},data:{qty:D(after),avgCost:D(avg),version:{increment:1}}});
        await tx.stockMovement.create({data:this.movementData({type:'TRANSFER_IN',productId:item.productId,locationId:row.destinationLocationId,sourceLocationId:row.sourceLocationId,destinationLocationId:row.destinationLocationId,quantity:qty,unitCost:cost,beforeQty:before,afterQty:after,userId:p.userId,referenceType:'TRANSFER',referenceId:id,operationKey:'transfer-in:'+item.id,reason:'Transferência recebida'})});
      }
      const updated=await tx.stockTransfer.update({where:{id},data:{status:'RECEIVED',receivedByUserId:p.userId,receivedAt:new Date()}});
      await tx.auditEvent.create({data:{id:randomUUID(),userId:p.userId,action:'stock.transfer.received',entityType:'StockTransfer',entityId:id,legacyPayload:{stock:true},occurredAt:new Date()}});
      return updated;
    });
  }
  async transfers(p:ImperioPrincipal){
    this.assertAny(p,'stock.read');
    const rows=await this.prisma.stockTransfer.findMany({include:{sourceLocation:true,destinationLocation:true,items:{include:{product:true},orderBy:{sortOrder:'asc'}}},orderBy:{createdAt:'desc'},take:500});
    return rows.filter(x=>{try{this.assertLocation(p,x.sourceLocation,'stock.read');this.assertLocation(p,x.destinationLocation,'stock.read');return true}catch{return false}});
  }
  async applyOpeningBalances(p:ImperioPrincipal){
    if(!p.networkAdmin)throw new ForbiddenException('Apenas administrador da rede pode aplicar saldos de abertura');
    assertOperationalWriteEnabled();await this.ensureLocations();const rows=await this.prisma.stockBalanceOpening.findMany({orderBy:{createdAt:'asc'}}),review:any[]=[];let applied=0,skipped=0;
    for(const opening of rows){const locationId=LEGACY_LOCATION_MAP[opening.locationId];if(!locationId){review.push({id:opening.id,reason:'unknown_location',locationId:opening.locationId});continue}
      const product=await this.prisma.product.findUnique({where:{id:opening.productId}});if(!product){review.push({id:opening.id,reason:'missing_product',productId:opening.productId});continue}
      assertOperationalWriteEnabled(locationId==='central'?undefined:locationId);const op='opening:'+opening.id;const done=await this.prisma.stockMovement.findUnique({where:{operationKey:op}});if(done){skipped++;continue}
      await this.prisma.$transaction(async tx=>{await this.location(locationId,tx);const bal=await this.balanceLocked(tx,opening.productId,locationId),before=n(bal.qty);if(Math.abs(before)>.0000001)throw new ConflictException('Saldo operacional já existe para um saldo de abertura ainda não aplicado');
        const qty=n(opening.qty),cost=n(opening.avgCost);await tx.stockBalance.update({where:{id:bal.id},data:{qty:D(qty),avgCost:D(cost),version:{increment:1}}});
        await tx.stockMovement.create({data:this.movementData({type:'OPENING_BALANCE',productId:opening.productId,locationId,quantity:qty,unitCost:cost,beforeQty:0,afterQty:qty,userId:p.userId,referenceType:'STOCK_BALANCE_OPENING',referenceId:opening.id,operationKey:op,reason:'Saldo de abertura/migração'})});
      });applied++;
    }
    return {ok:review.length===0,applied,skipped,review};
  }
}
