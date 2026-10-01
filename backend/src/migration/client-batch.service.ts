import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { ImportStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertClientBatchSet,
  ClientBatchReport,
  ClientBatchSetInput,
  ClientClusterPlan,
  ClientField,
  CentralClientSnapshot,
  normalizeBatchSet,
  normalizeCpf,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  PreviousSnapshots,
  reconcileClientBatch,
  sha256Json,
} from './client-batch.logic';
import { buildClientBatchFromExcel, type UploadedClientWorkbook } from './client-excel';

type Db = PrismaService | Prisma.TransactionClient;
type Resolution = {
  mode: 'KEEP_CENTRAL' | 'CREATE_NEW' | 'MATCH_CLIENT';
  clientId?: string;
  useSourceFields?: ClientField[];
};
type CommitInput = {
  batchId: string;
  approvalReportHash: string;
  resolutions?: Record<string, Resolution>;
};

type StoredSummary = {
  mode?: string;
  batchId?: string;
  phase?: string;
  unitId?: string;
  exportedAt?: string;
  fileName?: string;
  fileHash?: string;
  sourceUpdatedAtReliable?: boolean;
  canonicalRowsHash?: string;
  rowCount?: number;
  committedReportHash?: string;
};

const json=(value:unknown)=>value as Prisma.InputJsonValue;
const obj=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const asText=(value:unknown)=>value==null?'':String(value).trim();

@Injectable()
export class ClientBatchService {
  constructor(private readonly prisma: PrismaService) {}

  async dryRunExcel(files: UploadedClientWorkbook[], body: unknown) {
    let built: ReturnType<typeof buildClientBatchFromExcel>;
    try { built=buildClientBatchFromExcel(files,body); }
    catch (error:any) { throw new BadRequestException(String(error?.message||error)); }
    const result=await this.dryRun(built.set);
    return {...result,excel:built.inspections};
  }

  async dryRun(input: unknown) {
    try { assertClientBatchSet(input); } catch (error:any) { throw new BadRequestException(String(error?.message||error)); }
    const set=input as ClientBatchSetInput;
    const staged=await this.prisma.$transaction(async tx=>{const out=[] as Array<{unitId:string;envelopeId:string;revision:number;reused:boolean;fileHash:string}>;for(const file of set.files)out.push(await this.stageFile(set,file,tx));return out;},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:60000,maxWait:30000});
    const report=await this.analyzeSet(set,this.prisma);
    return {ok:true,mode:'dry-run',staged,report,commitEnabled:this.commitEnabled(),realClientRowsMutated:false};
  }

  async report(batchId: string) {
    const set=await this.loadBatchSet(batchId,this.prisma);
    return {ok:true,mode:'report',report:await this.analyzeSet(set,this.prisma)};
  }

  async commit(input: unknown) {
    const body=input as CommitInput;
    if(!body||!asText(body.batchId)||!/^sha256:[0-9a-f]{64}$/i.test(asText(body.approvalReportHash)))throw new BadRequestException('batchId e approvalReportHash são obrigatórios');
    if(!this.commitEnabled())throw new ForbiddenException('Commit CLIENTS_ONLY desabilitado: exige MIGRATION_IMPORT_ENABLED=true e CLIENT_BATCH_COMMIT_ENABLED=true');
    const all=await this.batchEnvelopes(body.batchId,this.prisma);
    if(all.length===0)throw new ConflictException('Batch não encontrado');
    const pending=all.filter(e=>e.status!==ImportStatus.IMPORTED);
    if(!pending.length){
      const hashes=all.map(e=>asText((obj(e.summary) as StoredSummary).committedReportHash)).filter(Boolean);
      if(hashes.includes(body.approvalReportHash))return {ok:true,mode:'commit',duplicate:true,batchId:body.batchId,reportHash:body.approvalReportHash};
      throw new ConflictException('Batch já importado; o hash de aprovação não corresponde a uma onda de commit registrada');
    }
    const previewSet=await this.loadBatchSet(body.batchId,this.prisma,true);
    if(previewSet.phase!=='FINAL')throw new ConflictException('Somente batch FINAL pode ser promovido para clientes centrais');

    const resolutions=body.resolutions||{};
    const result=await this.prisma.$transaction(async tx=>{
      const active=(await this.batchEnvelopes(body.batchId,tx)).filter(e=>e.status!==ImportStatus.IMPORTED);
      if(!active.length)throw new ConflictException('Nenhuma unidade pendente neste batch');
      const set=await this.loadBatchSet(body.batchId,tx,true);
      const report=await this.analyzeSet(set,tx);
      if(report.reportHash!==body.approvalReportHash)throw new ConflictException('Relatório ficou desatualizado em relação ao PostgreSQL; execute novo dry-run e aprove o novo hash');
      for(const plan of report.plans)if(plan.action==='REVIEW_REQUIRED'&&!resolutions[plan.clusterId])throw new ConflictException(`Conflito sem resolução aprovada: ${plan.clusterId}`);
      let created=0,updated=0,linksAdded=0;
      for(const plan of report.plans){
        const applied=await this.applyPlan(tx,plan,resolutions[plan.clusterId]);
        created+=applied.created;updated+=applied.updated;linksAdded+=applied.linksAdded;
      }
      const now=new Date();
      for(const env of active){
        const summary={...obj(env.summary),committedReportHash:report.reportHash,committedAt:now.toISOString()};
        await tx.migrationEnvelope.update({where:{id:env.id},data:{status:ImportStatus.IMPORTED,importedAt:now,reconciledAt:now,summary:json(summary)}});
      }
      return {report,created,updated,linksAdded};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:180000,maxWait:30000});
    return {ok:true,mode:'commit',duplicate:false,batchId:body.batchId,reportHash:result.report.reportHash,created:result.created,updated:result.updated,linksAdded:result.linksAdded,conflictsResolved:Object.keys(resolutions).length};
  }

  private commitEnabled(){return String(process.env.MIGRATION_IMPORT_ENABLED||'false')==='true'&&String(process.env.CLIENT_BATCH_COMMIT_ENABLED||'false')==='true';}

  private async stageFile(set:ClientBatchSetInput,file:ClientBatchSetInput['files'][number],db:Db){
    const instanceId=`clients:${file.unitId}`;
    const sameBatch=await db.migrationEnvelope.findFirst({where:{instanceId,sourceKind:'CLIENTS_ONLY_BATCH',reconciliationId:set.batchId},orderBy:{createdAt:'desc'}});
    if(sameBatch&&sameBatch.dataHash!==file.fileHash.toLowerCase())throw new ConflictException(`Batch ${set.batchId} já possui outro arquivo para ${file.unitId}; use novo batchId para uma nova exportação`);
    const duplicate=await db.migrationEnvelope.findFirst({where:{instanceId,sourceKind:'CLIENTS_ONLY_BATCH',dataHash:file.fileHash.toLowerCase()},orderBy:{createdAt:'desc'}});
    if(duplicate){if(duplicate.reconciliationId!==set.batchId)throw new ConflictException(`Arquivo já registrado no batch ${duplicate.reconciliationId||'sem-id'} para ${file.unitId}; reprocessamento deve reutilizar o mesmo batchId`);return {unitId:file.unitId,envelopeId:duplicate.id,revision:duplicate.revision,reused:true,fileHash:file.fileHash.toLowerCase()};}
    const rows=normalizeBatchSet({...set,files:[file]});
    const latest=await db.migrationEnvelope.findFirst({where:{instanceId},orderBy:{revision:'desc'},select:{revision:true}});
    const revision=(latest?.revision||0)+1;
    const summary:StoredSummary={mode:'CLIENTS_ONLY',batchId:set.batchId,phase:set.phase,unitId:file.unitId,exportedAt:new Date(file.exportedAt).toISOString(),fileName:file.fileName,fileHash:file.fileHash.toLowerCase(),sourceUpdatedAtReliable:file.sourceUpdatedAtReliable===true,canonicalRowsHash:sha256Json(rows.map(r=>({sourceId:r.source.sourceId,sourceRow:r.source.sourceRow,name:r.name,phone:r.phone,email:r.email,cpf:r.cpf,registrationUnitId:r.registrationUnitProven?r.registrationUnitId:null,sourceUpdatedAt:r.sourceUpdatedAt,legacyProfile:r.legacyProfile}))),rowCount:rows.length};
    const envelope=await db.migrationEnvelope.create({data:{instanceId,revision,schemaVersion:1,contractVersion:1,dataHash:file.fileHash.toLowerCase(),canonicalDataHash:summary.canonicalRowsHash,sourceKind:'CLIENTS_ONLY_BATCH',reconciliationId:set.batchId,sourceGeneratedAt:new Date(file.exportedAt),status:ImportStatus.VALIDATED,summary:json(summary)}});
    if(rows.length)await db.migrationEntity.createMany({data:rows.map(row=>({envelopeId:envelope.id,sourceCollection:'clients',sourceId:row.source.sourceId||`row:${row.source.sourceRow}`,unitId:file.unitId,payloadHash:row.fingerprint,payload:json(row)})),skipDuplicates:true});
    return {unitId:file.unitId,envelopeId:envelope.id,revision,reused:false,fileHash:file.fileHash.toLowerCase()};
  }

  private async batchEnvelopes(batchId:string,db:Db){
    return db.migrationEnvelope.findMany({where:{sourceKind:'CLIENTS_ONLY_BATCH',reconciliationId:batchId},orderBy:[{sourceGeneratedAt:'asc'},{createdAt:'asc'}]});
  }

  private async loadBatchSet(batchId:string,db:Db,pendingOnly=true):Promise<ClientBatchSetInput>{
    const all=await this.batchEnvelopes(batchId,db);if(!all.length)throw new ConflictException('Batch CLIENTS_ONLY não encontrado');
    const pending=all.filter(e=>e.status!==ImportStatus.IMPORTED);const envelopes=pendingOnly&&pending.length?pending:all;
    const units=new Set<string>();let phase:string|null=null;const files:ClientBatchSetInput['files']=[];
    for(const env of envelopes){
      const s=obj(env.summary) as StoredSummary;const unitId=asText(s.unitId);if(!unitId)throw new ConflictException(`Envelope ${env.id} sem unitId`);if(units.has(unitId))throw new ConflictException(`Mais de um snapshot encontrado para ${unitId} no batch ${batchId}`);units.add(unitId);
      const p=asText(s.phase);if(!phase)phase=p;else if(phase!==p)throw new ConflictException('Batch possui fases inconsistentes');
      const entities=await db.migrationEntity.findMany({where:{envelopeId:env.id,sourceCollection:'clients'},orderBy:{createdAt:'asc'}});
      const rows=entities.map(e=>{const payload=obj(e.payload);return obj(payload.raw);});
      files.push({unitId,exportedAt:asText(s.exportedAt||env.sourceGeneratedAt?.toISOString()),fileName:asText(s.fileName),fileHash:asText(s.fileHash||env.dataHash),sourceUpdatedAtReliable:s.sourceUpdatedAtReliable===true,rows});
    }
    const set={mode:'CLIENTS_ONLY' as const,batchId,phase:phase as ClientBatchSetInput['phase'],files};
    try{assertClientBatchSet(set);}catch(error:any){throw new ConflictException(`Batch persistido inválido: ${String(error?.message||error)}`);}return set;
  }

  private async loadPreviousSnapshot(unitId:string,batchId:string,db:Db){
    const env=await db.migrationEnvelope.findFirst({where:{instanceId:`clients:${unitId}`,sourceKind:'CLIENTS_ONLY_BATCH',reconciliationId:{not:batchId}},orderBy:[{sourceGeneratedAt:'desc'},{createdAt:'desc'}]});
    if(!env)return {batchId:null,rows:[]};
    const entities=await db.migrationEntity.findMany({where:{envelopeId:env.id,sourceCollection:'clients'},orderBy:{createdAt:'asc'}});
    const rows=entities.map(e=>e.payload as unknown as ReturnType<typeof normalizeBatchSet>[number]);
    return {batchId:env.reconciliationId||null,rows};
  }

  private async centralSnapshot(db:Db):Promise<CentralClientSnapshot[]>{
    const clients=await db.client.findMany({select:{id:true,name:true,phone:true,email:true,registrationUnitId:true,updatedAt:true,legacyPayload:true,unitLinks:{where:{active:true},select:{unitId:true}}}});
    return clients.map(c=>({id:c.id,name:c.name,phone:c.phone,email:c.email,registrationUnitId:c.registrationUnitId,updatedAt:c.updatedAt.toISOString(),legacyPayload:c.legacyPayload,unitIds:c.unitLinks.map(x=>x.unitId).sort()}));
  }

  private async analyzeSet(set:ClientBatchSetInput,db:Db):Promise<ClientBatchReport>{
    const previous:PreviousSnapshots={};for(const file of set.files)previous[file.unitId]=await this.loadPreviousSnapshot(file.unitId,set.batchId,db);
    return reconcileClientBatch(set,previous,await this.centralSnapshot(db));
  }

  private async applyPlan(tx:Prisma.TransactionClient,plan:ClientClusterPlan,resolution?:Resolution){
    if(plan.conflicts.some(c=>c.type==='MISSING_REQUIRED_NAME'))throw new ConflictException(`Cliente sem nome não pode ser promovido: ${plan.clusterId}`);
    const sourceConflictFields=new Set(plan.conflicts.filter(c=>c.type==='SOURCE_FIELD_CONFLICT'&&c.field).map(c=>c.field as ClientField));
    let targetId=plan.targetClientId;let create=plan.action==='CREATE';
    if(plan.action==='REVIEW_REQUIRED'){
      if(!resolution)throw new ConflictException(`Resolução ausente: ${plan.clusterId}`);
      if(resolution.mode==='CREATE_NEW'){if(sourceConflictFields.size)throw new ConflictException(`CREATE_NEW bloqueado por conflito entre fontes: ${plan.clusterId}`);create=true;targetId=null;}
      if(resolution.mode==='MATCH_CLIENT'){if(!asText(resolution.clientId))throw new ConflictException(`MATCH_CLIENT exige clientId: ${plan.clusterId}`);targetId=asText(resolution.clientId);create=false;}
      if(resolution.mode==='KEEP_CENTRAL'){if(!targetId)throw new ConflictException(`KEEP_CENTRAL exige cliente central já identificado: ${plan.clusterId}`);create=false;}
    }
    if(create){const id=`client:import:${plan.clusterId.replace('cluster:','')}`;const legacy=this.mergeProvenance({},plan,plan.source.cpf);await tx.client.upsert({where:{id},create:{id,name:plan.source.name as string,phone:plan.source.phone,email:plan.source.email,registrationUnitId:plan.source.registrationUnitProven?plan.source.registrationUnitId:null,active:true,legacyPayload:json(legacy)},update:{}});const links=await this.upsertLinks(tx,id,plan);return {created:1,updated:0,linksAdded:links};}
    if(!targetId)throw new ConflictException(`Plano sem destino: ${plan.clusterId}`);
    const existing=await tx.client.findUnique({where:{id:targetId},select:{id:true,name:true,phone:true,email:true,registrationUnitId:true,legacyPayload:true}});if(!existing)throw new ConflictException(`Cliente central não existe: ${targetId}`);
    const use=new Set(resolution?.useSourceFields||[]);for(const field of use)if(sourceConflictFields.has(field))throw new ConflictException(`Campo ${field} tem conflito entre fontes e não pode ser escolhido automaticamente: ${plan.clusterId}`);
    if(use.has('registrationUnitId')&&!plan.source.registrationUnitProven)throw new ConflictException(`registrationUnitId não comprovado na origem: ${plan.clusterId}`);
    const data:Prisma.ClientUpdateInput={};
    const choose=(field:ClientField,current:string|null,source:string|null)=>{if(!source)return current;if(!current)return source;if(use.has(field))return source;return current;};
    const name=choose('name',normalizeName(existing.name),plan.source.name);if(name&&name!==existing.name)data.name=name;
    const phone=choose('phone',normalizePhone(existing.phone),plan.source.phone);if(phone!==normalizePhone(existing.phone))data.phone=phone;
    const email=choose('email',normalizeEmail(existing.email),plan.source.email);if(email!==normalizeEmail(existing.email))data.email=email;
    const reg=plan.source.registrationUnitProven?choose('registrationUnitId',existing.registrationUnitId,plan.source.registrationUnitId):existing.registrationUnitId;if(reg!==existing.registrationUnitId)data.registrationUnit=reg?{connect:{id:reg}}:{disconnect:true};
    const existingCpf=normalizeCpf(obj(obj(existing.legacyPayload).clientsOnly).cpf??obj(existing.legacyPayload).cpf);const cpf=choose('cpf',existingCpf,plan.source.cpf);
    data.legacyPayload=json(this.mergeProvenance(existing.legacyPayload,plan,cpf));data.version={increment:1};
    await tx.client.update({where:{id:targetId},data});const links=await this.upsertLinks(tx,targetId,plan);return {created:0,updated:1,linksAdded:links};
  }

  private mergeProvenance(existingPayload:unknown,plan:ClientClusterPlan,cpf:string|null){
    const root={...obj(existingPayload)},current=obj(root.clientsOnly);const old=Array.isArray(current.sources)?current.sources.map(x=>obj(x)):[];const seen=new Map<string,Record<string,unknown>>();
    for(const s of old){const key=`${asText(s.unitId)}|${asText(s.fileHash)}|${asText(s.sourceRow)}`;seen.set(key,s);}
    for(const s of plan.sourceRows){const key=`${s.unitId}|${s.fileHash}|${s.sourceRow}`;seen.set(key,{batchId:s.batchId,phase:s.phase,unitId:s.unitId,exportedAt:s.exportedAt,fileName:s.fileName,fileHash:s.fileHash,sourceRow:s.sourceRow,sourceId:s.sourceId});}
    root.clientsOnly={...current,cpf:cpf||current.cpf||null,sources:[...seen.values()].sort((a,b)=>`${asText(a.unitId)}|${asText(a.exportedAt)}|${asText(a.sourceRow)}`.localeCompare(`${asText(b.unitId)}|${asText(b.exportedAt)}|${asText(b.sourceRow)}`))};return root;
  }

  private async upsertLinks(tx:Prisma.TransactionClient,clientId:string,plan:ClientClusterPlan){
    let added=0;for(const unitId of [...new Set(plan.sourceRows.map(s=>s.unitId))]){const existing=await tx.clientUnitLink.findUnique({where:{clientId_unitId:{clientId,unitId}}});await tx.clientUnitLink.upsert({where:{clientId_unitId:{clientId,unitId}},create:{clientId,unitId,source:'clients_only_batch',active:true},update:{active:true}});if(!existing)added++;}return added;
  }
}
