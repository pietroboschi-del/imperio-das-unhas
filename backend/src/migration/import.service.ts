import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { ImportStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ENTITY_CONTRACTS, MigrationEnvelope } from './contracts';
import { assertValidEnvelope, validateEnvelope } from './envelope-validator';
import { payloadHash } from './hash';
import { legacySystemRole, mapLegacyPermissions } from './legacy-permission-mapper';

const positiveInt=(value:unknown,fallback:number,max=1_000_000)=>{const n=Number(value);return Number.isInteger(n)&&n>0?Math.min(n,max):fallback};
const dateOnly=(value:unknown)=>new Date(`${String(value)}T00:00:00.000Z`);
const phoneDigits=(value:unknown)=>{const d=String(value||'').replace(/\D/g,'');if(!d)return null;if(d.startsWith('55')&&d.length>=12)return `+${d}`;if(d.length===10||d.length===11)return `+55${d}`;return `+${d}`};
const bookingStart=(date:unknown,time:unknown)=>{const d=String(date||''),t=String(time||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!/^\d{2}:\d{2}(:\d{2})?$/.test(t))return null;const x=new Date(`${d}T${t.length===5?t+':00':t}-03:00`);return Number.isNaN(x.getTime())?null:x};
const decimal=(value:unknown)=>new Prisma.Decimal(String(value==null||value===''?'0':value));
const json=(value:unknown)=>value as Prisma.InputJsonValue;
const ids=(rows:any[])=>rows.map(r=>String(r?.id||'')).filter(Boolean);

@Injectable()
export class ImportService {
  constructor(private readonly prisma: PrismaService) {}

  validate(input: unknown) { return validateEnvelope(input); }

  async importEnvelope(input: unknown, mode: 'dry-run' | 'commit' = 'dry-run') {
    const validation = assertValidEnvelope(input);
    const env = input as MigrationEnvelope;
    const canonicalDataHash=validation.canonicalDataHash!;
    if (mode === 'dry-run') return { ok:true, mode, validation, sourceKind:env.sourceKind||'INSTANCE_EXPORT', canonicalDataHash, normalization:this.normalizationPlan(env) };
    if (String(process.env.MIGRATION_IMPORT_ENABLED || 'false') !== 'true') throw new ForbiddenException('ImportaÃ§Ã£o commit desabilitada no ambiente');
    if (String(process.env.MIGRATION_REQUIRE_CANONICAL || 'true') === 'true' && env.sourceKind !== 'CANONICAL_RECONCILED') throw new ConflictException('Commit exige snapshot CANONICAL_RECONCILED');

    const previous=await this.prisma.migrationEnvelope.findUnique({where:{instanceId_revision:{instanceId:env.instanceId,revision:env.revision}}});
    if(previous){
      if(previous.status===ImportStatus.IMPORTED && previous.canonicalDataHash===canonicalDataHash) return {ok:true,mode,duplicate:true,envelopeId:previous.id,validation};
      if(previous.status===ImportStatus.FAILED && previous.canonicalDataHash===canonicalDataHash) await this.prisma.migrationEnvelope.delete({where:{id:previous.id}});
      else throw new ConflictException('A revisÃ£o jÃ¡ existe com outro conteÃºdo/estado');
    }
    const latest=await this.prisma.migrationEnvelope.findFirst({where:{instanceId:env.instanceId,status:ImportStatus.IMPORTED},orderBy:{revision:'desc'}});
    if(latest && env.revision<=latest.revision) throw new ConflictException(`RevisÃ£o regressiva: atual=${latest.revision}, recebida=${env.revision}`);

    const retentionDays=positiveInt(process.env.MIGRATION_STAGE_RETENTION_DAYS,30,3650);
    const purgeAfter=new Date(Date.now()+retentionDays*86400000);
    const manifest=(env.data as any)?.cutoverManifest ?? null;
    const envelope=await this.prisma.migrationEnvelope.create({data:{
      instanceId:env.instanceId,revision:env.revision,schemaVersion:env.schemaVersion,contractVersion:env.contractVersion,dataHash:env.dataHash,
      canonicalDataHash,sourceKind:env.sourceKind||'INSTANCE_EXPORT',reconciliationId:env.reconciliationId||null,
      sourceGeneratedAt:env.generatedAt?new Date(env.generatedAt):null,status:ImportStatus.VALIDATED,summary:json(validation.counts),cutoverManifest:manifest?json(manifest):Prisma.JsonNull,purgeAfter,
    }});

    try{
      await this.stageAll(envelope.id,env);
      const promotionTimeout=positiveInt(process.env.MIGRATION_PROMOTION_TX_TIMEOUT_MS,180000,900000);
      const promoted=await this.prisma.$transaction(async tx=>{
        const normalization=await this.normalizeCore(env,tx);
        const cutoverVerification=await this.verifyCutoverState(manifest,tx);
        await tx.migrationEnvelope.update({where:{id:envelope.id},data:{status:ImportStatus.IMPORTED,importedAt:new Date(),reconciledAt:new Date(),cutoverVerification:json(cutoverVerification),cutoverVerifiedAt:cutoverVerification.required?new Date():null,errorSummary:Prisma.JsonNull}});
        return {normalization,cutoverVerification};
      },{timeout:promotionTimeout,maxWait:Math.min(promotionTimeout,30000),isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted});
      return {ok:true,mode,duplicate:false,envelopeId:envelope.id,validation,normalization:promoted.normalization,cutoverVerification:promoted.cutoverVerification};
    }catch(error:any){
      await this.prisma.migrationEnvelope.update({where:{id:envelope.id},data:{status:ImportStatus.FAILED,errorSummary:json({message:String(error?.message||error),name:String(error?.name||'Error')})}}).catch(()=>undefined);
      throw error;
    }
  }

  async purgeExpiredStaging(now=new Date()){
    const rows=await this.prisma.migrationEnvelope.findMany({where:{status:ImportStatus.IMPORTED,purgeAfter:{lte:now}},select:{id:true}});
    if(!rows.length)return {ok:true,envelopes:0,entities:0};
    const deleted=await this.prisma.migrationEntity.deleteMany({where:{envelopeId:{in:rows.map(x=>x.id)}}});
    return {ok:true,envelopes:rows.length,entities:deleted.count};
  }

  async listImports(){return this.prisma.migrationEnvelope.findMany({orderBy:{createdAt:'desc'},take:50,select:{id:true,instanceId:true,revision:true,schemaVersion:true,sourceKind:true,reconciliationId:true,status:true,canonicalDataHash:true,sourceGeneratedAt:true,importedAt:true,reconciledAt:true,purgeAfter:true,cutoverVerifiedAt:true,createdAt:true}});}

  async cutoverReport(id:string){
    const row=await this.prisma.migrationEnvelope.findUnique({where:{id},select:{id:true,instanceId:true,revision:true,status:true,sourceKind:true,reconciliationId:true,canonicalDataHash:true,cutoverManifest:true,cutoverVerification:true,cutoverVerifiedAt:true,importedAt:true,reconciledAt:true,purgeAfter:true,errorSummary:true}});
    if(!row)throw new ConflictException('ImportaÃ§Ã£o nÃ£o encontrada');
    return {...row,releaseGate:{automatedVerificationRequired:!!row.cutoverManifest,automatedVerificationPassed:!!row.cutoverManifest&&!!row.cutoverVerifiedAt&&row.status===ImportStatus.IMPORTED,manualApprovalRequired:true}};
  }

  private normalizationPlan(env:MigrationEnvelope){const d=env.data as Record<string,unknown>;const normalizedNow=['units','categories','services','pros','clients','bookings','userAccounts','waitlistRequests','waitlistOpportunities','openingCommands','openingClientCredits','openingClientPackages','openingReceivables','openingStockBalances','openingProfessionalPayables','fiscalDocuments'];return {normalizedNow,stagedOnly:Object.keys(ENTITY_CONTRACTS).filter(k=>!normalizedNow.includes(k)),counts:Object.fromEntries(Object.keys(ENTITY_CONTRACTS).map(k=>[k,Array.isArray(d[k])?(d[k] as unknown[]).length:0])),credentialPolicy:'user_accounts_imported_without_password_hash_reset_required'};}

  private async stageAll(envelopeId:string,env:MigrationEnvelope){
    const data=env.data as Record<string,unknown>,batchSize=positiveInt(process.env.MIGRATION_BATCH_SIZE,500,5000);const items:any[]=[];
    for(const [collection,contract] of Object.entries(ENTITY_CONTRACTS)){const rows=Array.isArray(data[collection])?data[collection] as Record<string,unknown>[]:[];rows.forEach((row,i)=>{const sourceId=String(row?.[contract.idField]||`__index_${i}`),uv=contract.unitField?row?.[contract.unitField]:null,unitId=typeof uv==='string'?uv:null;items.push({envelopeId,sourceCollection:collection,sourceId,unitId,payloadHash:payloadHash(row),payload:json(row)});});}
    for(let i=0;i<items.length;i+=batchSize)await this.prisma.migrationEntity.createMany({data:items.slice(i,i+batchSize),skipDuplicates:true});
  }

  private async normalizeCore(env:MigrationEnvelope,tx:Prisma.TransactionClient){
    const d=env.data as any,batchSize=positiveInt(process.env.MIGRATION_BATCH_SIZE,500,5000);const each=async(rows:any[],fn:(r:any)=>Promise<any>)=>{for(let i=0;i<rows.length;i+=batchSize)for(const r of rows.slice(i,i+batchSize))await fn(r)};
    const unitRows=d.units||[],catRows=d.categories||[],serviceRows=d.services||[],proRows=d.pros||[],clientRows=d.clients||[],bookingRows=d.bookings||[],userRows=d.userAccounts||[];
    await tx.unit.updateMany({where:{id:{notIn:ids(unitRows)}},data:{active:false}});
    await each(unitRows,async u=>{const timezone=String(u.timezone||process.env.BUSINESS_TIMEZONE||'America/Sao_Paulo');await tx.unit.upsert({where:{id:String(u.id)},create:{id:String(u.id),name:String(u.name||u.id),timezone,active:u.active!==false,legacyPayload:json(u)},update:{name:String(u.name||u.id),timezone,active:u.active!==false,legacyPayload:json(u),version:{increment:1}}})});
    await tx.serviceCategory.updateMany({where:{id:{notIn:ids(catRows)}},data:{active:false}});await each(catRows,async c=>tx.serviceCategory.upsert({where:{id:String(c.id)},create:{id:String(c.id),name:String(c.name||c.id),description:c.description||null,sortOrder:Number(c.order||0),active:c.active!==false,legacyPayload:json(c)},update:{name:String(c.name||c.id),description:c.description||null,sortOrder:Number(c.order||0),active:c.active!==false,legacyPayload:json(c),version:{increment:1}}}));
    await tx.service.updateMany({where:{id:{notIn:ids(serviceRows)}},data:{active:false}});await each(serviceRows,async s=>tx.service.upsert({where:{id:String(s.id)},create:{id:String(s.id),categoryId:s.category?String(s.category):null,name:String(s.name||s.id),price:decimal(s.price),durationMin:Math.max(0,Number(s.duration||0)),active:s.active!==false,legacyPayload:json(s)},update:{categoryId:s.category?String(s.category):null,name:String(s.name||s.id),price:decimal(s.price),durationMin:Math.max(0,Number(s.duration||0)),active:s.active!==false,legacyPayload:json(s),version:{increment:1}}}));
    await tx.professional.updateMany({where:{id:{notIn:ids(proRows)}},data:{active:false}});await each(proRows,async p=>{await tx.professional.upsert({where:{id:String(p.id)},create:{id:String(p.id),name:String(p.name||p.id),publicName:p.publicName||null,active:p.active!==false,legacyPayload:json(p)},update:{name:String(p.name||p.id),publicName:p.publicName||null,active:p.active!==false,legacyPayload:json(p),version:{increment:1}}});await tx.professionalUnit.deleteMany({where:{professionalId:String(p.id)}});if(Array.isArray(p.units)&&p.units.length)await tx.professionalUnit.createMany({data:p.units.map((unitId:any)=>({professionalId:String(p.id),unitId:String(unitId),active:true}))});});
    await tx.client.updateMany({where:{id:{notIn:ids(clientRows)}},data:{active:false}});await tx.clientUnitLink.deleteMany({});await each(clientRows,async c=>{await tx.client.upsert({where:{id:String(c.id)},create:{id:String(c.id),name:String(c.name||c.id),active:true,phone:phoneDigits(c.phone),email:c.email||null,registrationUnitId:c.registrationUnit||null,legacyPayload:json(c)},update:{name:String(c.name||c.id),active:true,phone:phoneDigits(c.phone),email:c.email||null,registrationUnitId:c.registrationUnit||null,legacyPayload:json(c),version:{increment:1}}});if(c.registrationUnit)await tx.clientUnitLink.upsert({where:{clientId_unitId:{clientId:String(c.id),unitId:String(c.registrationUnit)}},create:{clientId:String(c.id),unitId:String(c.registrationUnit),source:'registration'},update:{active:true,source:'registration'}});});
    const bookingIds=ids(bookingRows);if(bookingIds.length)await tx.booking.deleteMany({where:{id:{notIn:bookingIds}}});else await tx.booking.deleteMany({});
    const serviceById=new Map(serviceRows.map((s:any)=>[String(s.id),s]));
    await each(bookingRows,async b=>{
      const rawItems=Array.isArray(b.items)?b.items:[];
      const isBlock=String(b.status||'').toLowerCase()==='bloqueado';
      const projectedItems=rawItems.map((it:any,i:number)=>{const serviceId=String(it.serviceId||''),professionalId=String(it.pro||it.professionalId||''),startAt=bookingStart(b.date||b.serviceDate,it.time||it.startTime),service=serviceById.get(serviceId);if(!professionalId||!startAt||(!serviceId&&!isBlock))return null;return {id:`bi:${String(b.id)}:${i}`,bookingId:String(b.id),unitId:String(b.unit||b.unitId||''),serviceId:serviceId||null,professionalId,startAt,durationMin:Math.max(1,Number(it.duration||service?.duration||service?.durationMin||30)),unitPrice:decimal(it.price??service?.price??0),preference:!!it.preference,forceFit:!!it.forceFit,sortOrder:i,legacyPayload:json(it)}}).filter(Boolean) as any[];
      const first=projectedItems[0]||null;
      await tx.booking.upsert({where:{id:String(b.id)},create:{id:String(b.id),unitId:String(b.unit||b.unitId||''),clientId:b.clientId?String(b.clientId):null,serviceDate:dateOnly(b.date||b.serviceDate),startAt:first?.startAt||null,serviceId:first?.serviceId||null,professionalId:first?.professionalId||null,notes:b.notes?String(b.notes):null,status:String(b.status||''),blockAllDay:!!b.blockAllDay,blockSeriesId:b.blockSeriesId?String(b.blockSeriesId):null,blockRecurrence:b.blockRecurrence?json(b.blockRecurrence):Prisma.JsonNull,blockException:!!b.blockException,legacyPayload:json(b)},update:{unitId:String(b.unit||b.unitId||''),clientId:b.clientId?String(b.clientId):null,serviceDate:dateOnly(b.date||b.serviceDate),startAt:first?.startAt||null,serviceId:first?.serviceId||null,professionalId:first?.professionalId||null,notes:b.notes?String(b.notes):null,status:String(b.status||''),blockAllDay:!!b.blockAllDay,blockSeriesId:b.blockSeriesId?String(b.blockSeriesId):null,blockRecurrence:b.blockRecurrence?json(b.blockRecurrence):Prisma.JsonNull,blockException:!!b.blockException,legacyPayload:json(b),version:{increment:1}}});
      await tx.bookingItem.deleteMany({where:{bookingId:String(b.id)}});if(projectedItems.length)await tx.bookingItem.createMany({data:projectedItems});
      if(b.clientId)await tx.clientUnitLink.upsert({where:{clientId_unitId:{clientId:String(b.clientId),unitId:String(b.unit||b.unitId||'')}},create:{clientId:String(b.clientId),unitId:String(b.unit||b.unitId||''),source:'booking'},update:{active:true,source:'booking'}});
    });
    const wait=d.waitlistRequests||[];await tx.waitlistRequest.deleteMany({});if(wait.length)await tx.waitlistRequest.createMany({data:wait.map((w:any)=>({id:String(w.id),unitId:String(w.unitId||w.unit||''),clientId:w.clientId?String(w.clientId):null,status:String(w.status||''),legacyPayload:json(w)}))});
    const opp=d.waitlistOpportunities||[];await tx.waitlistOpportunity.deleteMany({});if(opp.length)await tx.waitlistOpportunity.createMany({data:opp.map((o:any)=>({id:String(o.id),unitId:String(o.unitId||o.unit||''),requestId:o.requestId?String(o.requestId):null,status:String(o.status||''),bookingId:o.bookingId?String(o.bookingId):null,legacyPayload:json(o)}))});
    await each(userRows,async u=>{
      const username=String(u.username||u.email||u.id||'').trim();if(!username)return;
      const mappedPermissions=mapLegacyPermissions(u);
      const explicitUnits=Array.isArray(u.unitIds)?u.unitIds:[u.unitId||u.unit].filter(Boolean);
      const assignedUnits=(u.allUnits?unitRows.map((x:any)=>x.id):explicitUnits).map(String).filter(Boolean);
      const user=await tx.user.upsert({
        where:{username},
        create:{legacyId:String(u.id||''),username,displayName:String(u.name||username),passwordHash:null,passwordResetRequired:true,active:u.active!==false,networkAdmin:false,systemRole:legacySystemRole(u),permissions:json(mappedPermissions)},
        update:{legacyId:String(u.id||''),displayName:String(u.name||username),active:u.active!==false,networkAdmin:false,systemRole:legacySystemRole(u),permissions:json(mappedPermissions),version:{increment:1}},
      });
      await tx.userUnitAccess.deleteMany({where:{userId:user.id}});
      if(assignedUnits.length)await tx.userUnitAccess.createMany({data:[...new Set<string>(assignedUnits)].map((unitId:string)=>({userId:user.id,unitId,role:String(u.role||'operator'),permissions:json(mappedPermissions),active:true}))});
    });
    if(userRows.length){const legacyIds=ids(userRows);await tx.user.updateMany({where:{legacyId:{notIn:legacyIds},networkAdmin:false},data:{active:false}})}
    await tx.openCommand.deleteMany({});if((d.openingCommands||[]).length)await tx.openCommand.createMany({data:d.openingCommands.map((r:any)=>({id:String(r.id),unitId:String(r.unitId),clientId:r.clientId?String(r.clientId):null,serviceDate:dateOnly(r.serviceDate),status:String(r.status||'open'),grossAmount:decimal(r.grossAmount),discountAmount:decimal(r.discountAmount),appliedSignalAmount:decimal(r.appliedSignalAmount),appliedCreditAmount:decimal(r.appliedCreditAmount),customerFeeAmount:decimal(r.customerFeeAmount),remainingAmount:decimal(r.remainingAmount),legacyPayload:r.legacyPayload?json(r.legacyPayload):Prisma.JsonNull}))});
    await tx.clientCreditOpening.deleteMany({});if((d.openingClientCredits||[]).length)await tx.clientCreditOpening.createMany({data:d.openingClientCredits.map((r:any)=>({id:String(r.id),clientId:String(r.clientId),amount:decimal(r.amount),currency:String(r.currency||'BRL'),source:String(r.source||'migration')}))});
    await tx.clientPackageOpening.deleteMany({});if((d.openingClientPackages||[]).length)await tx.clientPackageOpening.createMany({data:d.openingClientPackages.map((r:any)=>({id:String(r.id),clientId:String(r.clientId),name:String(r.name||r.id),remainingUnits:decimal(r.remainingUnits),totalUnits:decimal(r.totalUnits),expiresAt:r.expiresAt?dateOnly(r.expiresAt):null,status:String(r.status||'active'),legacyPayload:r.legacyPayload?json(r.legacyPayload):Prisma.JsonNull}))});
    await tx.receivableOpening.deleteMany({});if((d.openingReceivables||[]).length)await tx.receivableOpening.createMany({data:d.openingReceivables.map((r:any)=>({id:String(r.id),clientId:r.clientId?String(r.clientId):null,unitId:r.unitId?String(r.unitId):null,sourceDate:r.sourceDate?dateOnly(r.sourceDate):null,dueDate:r.dueDate?dateOnly(r.dueDate):null,originalAmount:decimal(r.originalAmount),balance:decimal(r.balance),status:String(r.status||'open'),legacyPayload:r.legacyPayload?json(r.legacyPayload):Prisma.JsonNull}))});
    await tx.stockBalanceOpening.deleteMany({});if((d.openingStockBalances||[]).length)await tx.stockBalanceOpening.createMany({data:d.openingStockBalances.map((r:any)=>({id:String(r.id),productId:String(r.productId),locationId:String(r.locationId),qty:decimal(r.qty),avgCost:decimal(r.avgCost),legacyPayload:r.legacyPayload?json(r.legacyPayload):Prisma.JsonNull}))});
    await tx.professionalPayableOpening.deleteMany({});if((d.openingProfessionalPayables||[]).length)await tx.professionalPayableOpening.createMany({data:d.openingProfessionalPayables.map((r:any)=>({id:String(r.id),kind:String(r.kind),professionalId:String(r.professionalId),unitId:r.unitId?String(r.unitId):null,amount:decimal(r.amount),sourceId:r.sourceId?String(r.sourceId):null,legacyPayload:r.legacyPayload?json(r.legacyPayload):Prisma.JsonNull}))});
    await tx.fiscalPendingDocument.deleteMany({});if((d.fiscalDocuments||[]).length)await tx.fiscalPendingDocument.createMany({data:d.fiscalDocuments.map((r:any)=>({id:String(r.id),unitId:String(r.unitId),commandId:r.commandId?String(r.commandId):null,clientId:r.clientId?String(r.clientId):null,documentType:r.documentType?String(r.documentType):null,status:String(r.status||''),amount:decimal(r.amount||r.total||0),referenceDate:r.referenceDate||r.date?dateOnly(r.referenceDate||r.date):null,transmissionState:r.transmissionState?String(r.transmissionState):null,legacyPayload:json(r)}))});
    return {normalizedAt:new Date().toISOString(),counts:{units:unitRows.length,categories:catRows.length,services:serviceRows.length,professionals:proRows.length,clients:clientRows.length,bookings:bookingRows.length,waitlist:wait.length,openingCommands:(d.openingCommands||[]).length,openingCredits:(d.openingClientCredits||[]).length,openingPackages:(d.openingClientPackages||[]).length,openingReceivables:(d.openingReceivables||[]).length,openingStock:(d.openingStockBalances||[]).length,openingProfessionalPayables:(d.openingProfessionalPayables||[]).length,pendingFiscal:(d.fiscalDocuments||[]).length}};
  }

  private async verifyCutoverState(manifest:any,db:any=this.prisma){
    if(!manifest?.verification)return {required:false,passed:true,checks:[]};
    if(Array.isArray(manifest.blockers)&&manifest.blockers.length)throw new ConflictException(`Cutover bloqueado: ${manifest.blockers.join(', ')}`);
    const exp=manifest.verification,checks:any[]=[];const comparable=(value:any)=>{const s=String(value);if(/^-?\d+(?:\.\d+)?$/.test(s)){const n=Number(s);if(Number.isFinite(n))return n}return s};const add=(name:string,expected:any,actual:any)=>{const pass=comparable(expected)===comparable(actual);checks.push({name,expected:String(expected),actual:String(actual),pass});if(!pass)throw new ConflictException(`DivergÃªncia de cutover em ${name}: esperado=${expected}, atual=${actual}`)};
    const moneySum=async(model:any,field:string,where?:any)=>{const x=await model.aggregate({_sum:{[field]:true},where});return String(x?._sum?.[field]??'0.00')};
    const n=exp.network||{};add('network.futureBookings',n.futureBookings,await db.booking.count());add('network.activeWaitlist',n.activeWaitlist,await db.waitlistRequest.count());add('network.openCommands',n.openCommands,await db.openCommand.count());add('network.openCommandBalanceTotal',n.openCommandBalanceTotal,await moneySum(db.openCommand,'remainingAmount'));add('network.creditClients',n.creditClients,await db.clientCreditOpening.count());add('network.creditTotal',n.creditTotal,await moneySum(db.clientCreditOpening,'amount'));add('network.activePackages',n.activePackages,await db.clientPackageOpening.count());add('network.receivables',n.receivables,await db.receivableOpening.count());add('network.receivableTotal',n.receivableTotal,await moneySum(db.receivableOpening,'balance'));add('network.stockRows',n.stockRows,await db.stockBalanceOpening.count());add('network.professionalPayables',n.professionalPayables,await db.professionalPayableOpening.count());add('network.professionalPayableTotal',n.professionalPayableTotal,await moneySum(db.professionalPayableOpening,'amount'));add('network.pendingFiscal',n.pendingFiscal,await db.fiscalPendingDocument.count());
    for(const [unitId,u] of Object.entries<any>(exp.byUnit||{})){add(`unit.${unitId}.futureBookings`,u.futureBookings,await db.booking.count({where:{unitId}}));add(`unit.${unitId}.activeWaitlist`,u.activeWaitlist,await db.waitlistRequest.count({where:{unitId}}));add(`unit.${unitId}.openCommands`,u.openCommands,await db.openCommand.count({where:{unitId}}));add(`unit.${unitId}.openCommandBalanceTotal`,u.openCommandBalanceTotal,await moneySum(db.openCommand,'remainingAmount',{unitId}));add(`unit.${unitId}.receivables`,u.receivables,await db.receivableOpening.count({where:{unitId}}));add(`unit.${unitId}.receivableTotal`,u.receivableTotal,await moneySum(db.receivableOpening,'balance',{unitId}));add(`unit.${unitId}.professionalPayables`,u.professionalPayables,await db.professionalPayableOpening.count({where:{unitId}}));add(`unit.${unitId}.professionalPayableTotal`,u.professionalPayableTotal,await moneySum(db.professionalPayableOpening,'amount',{unitId}));add(`unit.${unitId}.pendingFiscal`,u.pendingFiscal,await db.fiscalPendingDocument.count({where:{unitId}}));}
    for(const [locationId,products] of Object.entries<any>(exp.stockByLocation||{}))for(const [productId,x] of Object.entries<any>(products)){const row=await db.stockBalanceOpening.findFirst({where:{locationId,productId}});add(`stock.${locationId}.${productId}.qty`,x.qty,row?.qty??'missing');add(`stock.${locationId}.${productId}.avgCost`,x.avgCost,row?.avgCost??'missing');}
    return {required:true,passed:true,checkedAt:new Date().toISOString(),checks};
  }
}

