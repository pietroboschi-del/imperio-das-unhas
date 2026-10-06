import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { isMessagingChannelId } from '../messaging/messaging-channels';
import { WhatsappAgentWaitlistDto } from './whatsapp-agent.dto';
import { hasPermissions, permissionSet } from '../auth/permission-policy';

export const WHATSAPP_WAITLIST_SOURCE='WHATSAPP_AGENT';

function obj(v:any){return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}
function normName(value:string){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function normalizePhone(value:string){
 const d=String(value||'').replace(/\D/g,'');if(!d)throw new ConflictException('Celular inválido');
 if(d.startsWith('55')&&d.length>=12)return '+'+d;if(d.length===10||d.length===11)return '+55'+d;return '+'+d;
}
function keyId(key?:string){
 const k=String(key||'').trim();if(!k||k.length>200)throw new ConflictException('Idempotency-Key obrigatória e deve ter até 200 caracteres');
 return {key:k,id:'wr_'+createHash('sha256').update('whatsapp-agent-waitlist|'+k).digest('hex').slice(0,40)};
}
function stableServices(rows:WhatsappAgentWaitlistDto['services']){
 return rows.map(x=>({serviceId:String(x.serviceId),professionalId:String(x.professionalId||'')||null,preferenceMode:x.preferenceMode||'preferred'}));
}
function requestHash(body:WhatsappAgentWaitlistDto,channelId:string){
 const canonical={
  unitId:body.unitId,clientId:body.clientId||null,clientName:body.clientName?.trim()||null,
  clientPhone:body.clientPhone?normalizePhone(body.clientPhone):null,clientEmail:body.clientEmail?.trim().toLowerCase()||null,
  services:stableServices(body.services),desiredDate:body.desiredDate||null,desiredDateFrom:body.desiredDateFrom||null,desiredDateTo:body.desiredDateTo||null,
  timeFrom:body.timeFrom||null,timeTo:body.timeTo||null,acceptsOtherProfessional:body.acceptsOtherProfessional,acceptsOtherUnits:body.acceptsOtherUnits,
  note:body.note?.trim()||null,channelId,conversationRef:body.conversationRef||null,messageRef:body.messageRef||null,
 };
 return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

@Injectable()
export class WaitlistService {
 constructor(private readonly prisma:PrismaService){}

 async createFromWhatsapp(body:WhatsappAgentWaitlistDto,key?:string){
  const channelId=String(body.channelId||'CENTRAL').trim();
  if(!isMessagingChannelId(channelId))throw new ConflictException('Canal de mensageria inválido');
  if(channelId!=='CENTRAL')throw new ConflictException('WA4 aceita criação pela CENTRAL nesta fase');
  if(body.desiredDate&&((body.desiredDateFrom&&body.desiredDateFrom!==body.desiredDate)||(body.desiredDateTo&&body.desiredDateTo!==body.desiredDate)))throw new ConflictException('desiredDate não pode contradizer o intervalo de datas');
  const from=body.desiredDate||body.desiredDateFrom||null,to=body.desiredDate||body.desiredDateTo||null;
  if(from&&to&&from>to)throw new ConflictException('Intervalo de datas inválido');
  if(body.timeFrom&&body.timeTo&&body.timeFrom>=body.timeTo)throw new ConflictException('Intervalo de horário inválido');
  const uniqueServices=new Set(body.services.map(x=>x.serviceId));
  if(uniqueServices.size!==body.services.length)throw new ConflictException('Não repita o mesmo serviço no pedido de encaixe');
  const {id}=keyId(key),hash=requestHash(body,channelId);
  const existing=await this.prisma.waitlistRequest.findUnique({where:{id}});
  if(existing)return this.verify(existing,hash);

  const unit=await this.prisma.unit.findFirst({where:{id:body.unitId,active:true},select:{id:true}});
  if(!unit)throw new NotFoundException('Unidade não encontrada ou inativa');
  const services=await this.prisma.service.findMany({where:{id:{in:[...uniqueServices]},active:true},select:{id:true,name:true,legacyPayload:true}});
  if(services.length!==uniqueServices.size)throw new NotFoundException('Um ou mais serviços não existem ou estão inativos');
  for(const spec of body.services){
   const srv=services.find(x=>x.id===spec.serviceId)!;const cfg=obj(srv.legacyPayload);
   if(cfg.show===false||cfg.online===false)throw new ConflictException('Serviço indisponível para solicitação online: '+srv.name);
   if(spec.professionalId){
    const link=await this.prisma.professionalUnit.findFirst({where:{unitId:body.unitId,professionalId:spec.professionalId,active:true,professional:{active:true}},select:{professional:{select:{id:true,legacyPayload:true}}}});
    if(!link)throw new NotFoundException('Profissional indisponível nesta unidade');
    const pcfg=obj(link.professional.legacyPayload),rule=obj(obj(cfg.proRules)[spec.professionalId]),own=Array.isArray(pcfg.services)?pcfg.services.map(String):[];
    const enabled=Object.prototype.hasOwnProperty.call(rule,'enabled')?rule.enabled===true:own.includes(spec.serviceId);
    if(!enabled||rule.online===false)throw new ConflictException('Profissional não executa este serviço online');
   }
   if(spec.preferenceMode==='required'&&!spec.professionalId)throw new ConflictException('Preferência required exige professionalId');
  }

  const client=await this.resolveClient(body);
  const serviceRows=body.services.map(x=>{const s=services.find(v=>v.id===x.serviceId)!;return {serviceId:x.serviceId,serviceName:s.name,professionalId:x.professionalId||null,preferenceMode:x.preferenceMode||'preferred'}});

  try{
   return await this.prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('waitlist-idempotency'), hashtext(${id}))`;
    const raced=await tx.waitlistRequest.findUnique({where:{id}});if(raced)return this.verify(raced,hash);
    if(client)await tx.clientUnitLink.upsert({where:{clientId_unitId:{clientId:client.id,unitId:body.unitId}},create:{clientId:client.id,unitId:body.unitId,source:'waitlist_whatsapp'},update:{active:true}});
    const legacy:any={
     source:WHATSAPP_WAITLIST_SOURCE,idempotencyHash:hash,channelId,services:serviceRows,
     serviceIds:serviceRows.map(x=>x.serviceId),desiredDate:body.desiredDate||null,desiredDateFrom:from,desiredDateTo:to,
     timeFrom:body.timeFrom||null,timeTo:body.timeTo||null,acceptsOtherProfessional:body.acceptsOtherProfessional,acceptsOtherUnits:body.acceptsOtherUnits,
     note:body.note?.trim()||'',conversationRef:body.conversationRef||null,messageRef:body.messageRef||null,
     clientNameSnapshot:client?.name||body.clientName?.trim()||'',createdBy:'whatsapp_agent',
     // compatibility projection for V79/V80 single-service readers; full intent remains services[].
     serviceId:serviceRows[0].serviceId,serviceNameSnapshot:serviceRows[0].serviceName,
     availabilityDate:body.desiredDate||from||'',availabilityStartTime:body.timeFrom||'',availabilityEndTime:body.timeTo||'',
     professionalPreferenceMode:serviceRows[0].professionalId?serviceRows[0].preferenceMode:'any',
     preferredProfessionalId:serviceRows[0].professionalId||'',unitPreferenceMode:body.acceptsOtherUnits?'preferred':'required',
     acceptedUnitIds:[body.unitId],
    };
    const row=await tx.waitlistRequest.create({data:{id,unitId:body.unitId,clientId:client?.id||null,status:'WAITING',legacyPayload:legacy}});
    const recipients=await tx.user.findMany({
     where:{active:true,OR:[{networkAdmin:true},{unitAccesses:{some:{unitId:body.unitId,active:true}}}]},
     select:{id:true,networkAdmin:true,permissions:true,unitAccesses:{where:{unitId:body.unitId,active:true},select:{permissions:true}}},
    });
    const allowedRecipients=recipients.filter(u=>u.networkAdmin||hasPermissions(permissionSet(u.permissions,u.unitAccesses[0]?.permissions),['tasks.read'])||hasPermissions(permissionSet(u.permissions,u.unitAccesses[0]?.permissions),['agenda.read']));
    if(allowedRecipients.length){
     const serviceNames=serviceRows.map(x=>x.serviceName).join(' + ');
     await tx.managementTask.createMany({data:allowedRecipients.map(u=>({
      id:'task_waitlist_'+createHash('sha256').update(id+'|'+u.id).digest('hex').slice(0,32),
      title:'Novo pedido de encaixe',priority:'high',category:'general',unitId:body.unitId,assignedUserId:u.id,status:'OPEN',
      note:(client?.name||body.clientName?.trim()||'Cliente')+' · '+serviceNames,
      sourceType:'waitlist',sourceId:id,
      legacyPayload:{source:WHATSAPP_WAITLIST_SOURCE,requestId:id,clientId:client?.id||null,unitId:body.unitId,serviceIds:legacy.serviceIds,channelId,openAction:'waitlist_request'} as Prisma.InputJsonValue,
     })),skipDuplicates:true});
    }
    await tx.auditEvent.create({data:{id:randomUUID(),unitId:body.unitId,action:'waitlist.created_from_whatsapp',entityType:'WaitlistRequest',entityId:id,legacyPayload:{requestId:id,clientId:client?.id||null,unitId:body.unitId,serviceIds:legacy.serviceIds,source:WHATSAPP_WAITLIST_SOURCE,channelId},occurredAt:new Date()}});
    return row;
   });
  }catch(e){if((e as {code?:string})?.code==='P2002'){const raced=await this.prisma.waitlistRequest.findUnique({where:{id}});if(raced)return this.verify(raced,hash)}throw e}
 }

 private verify(row:any,hash:string){
  const legacy=obj(row.legacyPayload);if(legacy.idempotencyHash!==hash)throw new ConflictException('Idempotency-Key já utilizada para outro pedido de encaixe');
  return row;
 }

 private async resolveClient(body:WhatsappAgentWaitlistDto){
  if(body.clientId){
   const c=await this.prisma.client.findFirst({where:{id:body.clientId,active:true}});if(!c)throw new NotFoundException('Cliente não encontrado ou inativo');return c;
  }
  const name=String(body.clientName||'').trim(),phone=String(body.clientPhone||'').trim();
  if(!name||!phone)throw new ConflictException('Informe clientId ou nome e telefone da cliente');
  const normalized=normalizePhone(phone);
  const rows=await this.prisma.client.findMany({where:{phone:normalized,active:true},orderBy:{createdAt:'asc'},take:30});
  const matches=rows.filter(x=>normName(x.name)===normName(name));
  if(matches.length>1)throw new ConflictException('Mais de um cadastro ativo corresponde ao nome e telefone informados');
  if(matches[0])return matches[0];
  // A fila existente é associada a cliente. Criamos apenas após busca exata sem ambiguidade, igual ao fluxo de booking.
  return this.prisma.client.create({data:{id:randomUUID(),name,phone:normalized,email:body.clientEmail?.trim().toLowerCase()||null,registrationUnitId:body.unitId,active:true,legacyPayload:{source:WHATSAPP_WAITLIST_SOURCE}}});
 }
}
