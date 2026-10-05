import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ClientBatchService } from './client-batch.service';
import { normalizeCpf } from './client-batch.logic';

type ReviewDecision = 'MERGE'|'KEEP_SEPARATE'|'KEEP_CENTRAL'|'MATCH_CENTRAL'|'REVIEW_LATER';
type ReviewDecisionInput = { decision:ReviewDecision; targetClusterId?:string; targetClientId?:string; note?:string };
const json=(value:unknown)=>value as Prisma.InputJsonValue;
const clean=(value:unknown)=>String(value??'').trim();
const obj=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const legacyCpf=(value:unknown)=>{const root=obj(value),clientsOnly=obj(root.clientsOnly);return normalizeCpf(clientsOnly.cpf??root.cpf);};

@Injectable()
export class ClientDuplicateReviewService {
  constructor(private readonly prisma:PrismaService, private readonly clientBatches:ClientBatchService) {}

  async queue(batchId:string) {
    const id=clean(batchId);if(!id)throw new BadRequestException('batchId obrigatório');
    const {report}=await this.clientBatches.report(id);
    const targetClientIds=[...new Set(report.plans.flatMap(plan=>[...(plan.targetClientId?[plan.targetClientId]:[]),...plan.conflicts.filter(c=>['MULTIPLE_STRONG_MATCHES','AMBIGUOUS_WEAK_MATCH'].includes(c.type)).flatMap(c=>c.candidateClientIds||[])]))];
    const centralClients=targetClientIds.length?await this.prisma.client.findMany({where:{id:{in:targetClientIds}},select:{id:true,name:true,phone:true,email:true,registrationUnitId:true,legacyPayload:true}}):[];
    const centralById=new Map(centralClients.map(x=>[x.id,x]));
    const decisions=await this.prisma.clientDuplicateReview.findMany({where:{batchId:id},orderBy:{updatedAt:'desc'}});
    const byCluster=new Map(decisions.map(x=>[x.clusterId,x]));
    const plansById=new Map(report.plans.map(x=>[x.clusterId,x]));
    const items=report.plans.filter(x=>x.action==='REVIEW_REQUIRED').map(plan=>{
      const candidateIds=[...new Set(plan.conflicts.flatMap(c=>c.candidateClusterIds||[]))].sort();
      const candidates=candidateIds.map(clusterId=>{
        const p=plansById.get(clusterId);
        return p?{clusterId,name:p.source.name,phone:p.source.phone,email:p.source.email,cpf:p.source.cpf,sourceRows:p.sourceRows}:null;
      }).filter(Boolean);
      const centralView=(clientId:string)=>{const c=centralById.get(clientId);return c?{clientId:c.id,name:c.name,phone:c.phone,email:c.email,cpf:legacyCpf(c.legacyPayload),registrationUnitId:c.registrationUnitId}:null;};
      const strongCentralIds=[...new Set(plan.conflicts.filter(c=>c.type==='MULTIPLE_STRONG_MATCHES').flatMap(c=>c.candidateClientIds||[]))].sort();
      const weakCentralIds=[...new Set(plan.conflicts.filter(c=>c.type==='AMBIGUOUS_WEAK_MATCH').flatMap(c=>c.candidateClientIds||[]))].filter(id=>!strongCentralIds.includes(id)).sort();
      const centralCandidates=strongCentralIds.map(centralView).filter(Boolean);
      const weakCentralCandidates=weakCentralIds.map(centralView).filter(Boolean);
      const saved=byCluster.get(plan.clusterId);
      const current=saved&&saved.reportHash===report.reportHash?saved:null;
      const central=plan.targetClientId?centralById.get(plan.targetClientId):null;
      return {
        clusterId:plan.clusterId,
        source:plan.source,
        sourceRows:plan.sourceRows,
        conflicts:plan.conflicts,
        candidateClusters:candidates,
        centralCandidate:central?{clientId:central.id,name:central.name,phone:central.phone,email:central.email,cpf:legacyCpf(central.legacyPayload),registrationUnitId:central.registrationUnitId}:null,
        centralCandidates,
        weakCentralCandidates,
        decision:current?{
          decision:current.decision,
          targetClusterId:current.decision==='MERGE'?current.mergeTargetClusterId:null,
          targetClientId:current.decision==='MATCH_CENTRAL'?current.targetClientId:null,
          note:current.note,
          reviewedByUserId:current.reviewedByUserId,
          reviewedAt:current.reviewedAt,
        }:saved?{decision:'STALE',reviewedAt:saved.reviewedAt}:null,
      };
    });
    const decided=items.filter(x=>x.decision&&x.decision.decision!=='REVIEW_LATER'&&x.decision.decision!=='STALE').length;
    return {
      ok:true,
      batchId:id,
      reportHash:report.reportHash,
      totals:{reviewRequired:items.length,decided,pending:items.length-decided},
      items,
      invariants:{noClientMutation:true,decisionsBoundToReportHash:true},
    };
  }

  async decide(batchId:string,clusterId:string,input:ReviewDecisionInput,reviewedByUserId:string) {
    const id=clean(batchId),cid=clean(clusterId),actor=clean(reviewedByUserId);
    if(!id||!cid||!actor)throw new BadRequestException('batchId, clusterId e usuário são obrigatórios');
    if(!['MERGE','KEEP_SEPARATE','KEEP_CENTRAL','MATCH_CENTRAL','REVIEW_LATER'].includes(input?.decision))throw new BadRequestException('Decisão inválida');
    const {report}=await this.clientBatches.report(id);
    const plan=report.plans.find(x=>x.clusterId===cid);
    if(!plan)throw new NotFoundException('Cluster não encontrado no batch');
    if(plan.action!=='REVIEW_REQUIRED')throw new ConflictException('Apenas clusters REVIEW_REQUIRED entram na fila de duplicidades');

    const sourceFieldConflicts=plan.conflicts.filter(c=>c.type==='SOURCE_FIELD_CONFLICT');
    const missingRequiredName=plan.conflicts.some(c=>c.type==='MISSING_REQUIRED_NAME');
    if(missingRequiredName&&input.decision!=='REVIEW_LATER')throw new ConflictException('Cliente sem nome não pode ser marcado como resolvido; corrija/reexporte o cadastro ou use REVIEW_LATER');
    if(input.decision==='KEEP_SEPARATE'&&sourceFieldConflicts.length)throw new ConflictException('KEEP_SEPARATE não resolve conflito entre fontes do mesmo cluster; corrija/reexporte os dados ou escolha outra resolução segura');

    let targetClusterId:string|null=null,targetClientId:string|null=null;
    if(input.decision==='MERGE'){
      targetClusterId=clean(input.targetClusterId)||null;
      if(!targetClusterId||targetClusterId===cid)throw new BadRequestException('MERGE exige outro targetClusterId');
      const candidates=new Set(plan.conflicts.flatMap(c=>c.candidateClusterIds||[]));
      if(!candidates.has(targetClusterId))throw new ConflictException('Mesclagem permitida somente com candidato relacionado pelo relatório atual');
      if(!report.plans.some(x=>x.clusterId===targetClusterId))throw new NotFoundException('Cluster de destino não existe no relatório atual');
    } else if(input.decision==='MATCH_CENTRAL') {
      targetClientId=clean(input.targetClientId)||null;
      if(!targetClientId)throw new BadRequestException('MATCH_CENTRAL exige targetClientId');
      const candidates=new Set(plan.conflicts.filter(c=>c.type==='MULTIPLE_STRONG_MATCHES').flatMap(c=>c.candidateClientIds||[]));
      if(!candidates.has(targetClientId))throw new ConflictException('Cliente central permitido somente entre candidatos MULTIPLE_STRONG_MATCHES do relatório atual');
      if(clean(input.targetClusterId))throw new BadRequestException('targetClusterId só é aceito em MERGE');
    } else if(input.decision==='KEEP_CENTRAL') {
      if(!plan.targetClientId)throw new ConflictException('KEEP_CENTRAL exige cliente central identificado pelo relatório atual');
      if(clean(input.targetClusterId))throw new BadRequestException('targetClusterId só é aceito em MERGE');
      if(clean(input.targetClientId))throw new BadRequestException('targetClientId só é aceito em MATCH_CENTRAL');
    } else {
      if(clean(input.targetClusterId))throw new BadRequestException('targetClusterId só é aceito em MERGE');
      if(clean(input.targetClientId))throw new BadRequestException('targetClientId só é aceito em MATCH_CENTRAL');
    }

    const note=clean(input.note).slice(0,500)||null,now=new Date();
    const saved=await this.prisma.$transaction(async tx=>{
      const row=await tx.clientDuplicateReview.upsert({
        where:{batchId_clusterId:{batchId:id,clusterId:cid}},
        create:{batchId:id,clusterId:cid,reportHash:report.reportHash,decision:input.decision,mergeTargetClusterId:targetClusterId,targetClientId,note,reviewedByUserId:actor,reviewedAt:now},
        update:{reportHash:report.reportHash,decision:input.decision,mergeTargetClusterId:targetClusterId,targetClientId,note,reviewedByUserId:actor,reviewedAt:now},
      });
      await tx.auditEvent.create({data:{
        id:`audit:client-duplicate-review:${randomUUID()}`,
        userId:actor,
        action:'CLIENT_DUPLICATE_REVIEW_DECISION',
        entityType:'ClientDuplicateReview',
        entityId:row.id,
        occurredAt:now,
        legacyPayload:json({batchId:id,clusterId:cid,reportHash:report.reportHash,decision:input.decision,targetClusterId,targetClientId,note}),
      }});
      return row;
    });
    return {
      ok:true,
      batchId:id,
      clusterId:cid,
      reportHash:report.reportHash,
      decision:saved.decision,
      targetClusterId:saved.decision==='MERGE'?saved.mergeTargetClusterId:null,
      targetClientId:saved.decision==='MATCH_CENTRAL'?saved.targetClientId:null,
      reviewedAt:saved.reviewedAt,
      clientRowsMutated:false,
    };
  }
}
