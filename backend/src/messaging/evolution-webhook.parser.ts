import { Injectable } from '@nestjs/common';
import type { MessagingChannelId } from './messaging-channels';
import { EvolutionInstanceResolver } from './evolution-config';

type JsonRecord=Record<string,any>;
export type ParsedEvolutionInbound={
  provider:'EVOLUTION';channelId:MessagingChannelId|null;providerMessageId:string;providerConversationId:string|null;senderPhone:string;
  recipientInstance:string;messageType:'TEXT'|'IMAGE'|'DOCUMENT'|'UNKNOWN';textBody:string|null;
  mediaMetadata:Record<string,string|number|boolean>|null;providerTimestamp:Date|null;
  rawMetadata:Record<string,string|number|boolean|null>;unitId:null;bookingId:null;commandId:null;threadRef:string|null;
};
export type ParsedEvolutionStatus={provider:'EVOLUTION';channelId:MessagingChannelId|null;providerMessageId:string;recipientInstance:string;targetStatus:'SENT'|'DELIVERED'|'READ'|'FAILED'};
export type EvolutionWebhookParseResult={kind:'inbound';value:ParsedEvolutionInbound}|{kind:'status';value:ParsedEvolutionStatus}|{kind:'ignored';reason:string};

const obj=(value:unknown):JsonRecord=>value&&typeof value==='object'&&!Array.isArray(value)?value as JsonRecord:{};
const firstObject=(value:unknown)=>Array.isArray(value)?obj(value[0]):obj(value);
function stringValue(...values:unknown[]){for(const value of values){if(typeof value==='string'&&value.trim())return value.trim();if(typeof value==='number'&&Number.isFinite(value))return String(value)}return ''}
const eventName=(payload:JsonRecord)=>stringValue(payload.event,payload.type).toUpperCase().replace(/[.\-\s]+/g,'_');
function senderPhone(remoteJid:string){const digits=(String(remoteJid||'').split('@')[0]||'').replace(/\D/g,'');return digits?'+'+digits:''}
function providerTime(value:unknown):Date|null{
  if(typeof value==='number'&&Number.isFinite(value)){const d=new Date(value<1e12?value*1000:value);return Number.isNaN(d.getTime())?null:d}
  const text=String(value||'').trim();if(!text)return null;
  if(/^\d+(\.\d+)?$/.test(text)){const n=Number(text);if(Number.isFinite(n))return providerTime(n)}
  const d=new Date(text);return Number.isNaN(d.getTime())?null:d;
}
function mediaMeta(message:any,providerMessageId:string){
  const mime=stringValue(message?.mimetype,message?.mimeType),fileName=stringValue(message?.fileName,message?.filename),rawLength=message?.fileLength??message?.fileSize;
  const metadata:Record<string,string|number|boolean>={providerMessageId};
  if(mime)metadata.mimeType=mime;if(fileName)metadata.fileName=fileName;
  if(typeof rawLength==='number'&&Number.isFinite(rawLength))metadata.fileLength=rawLength;else if(typeof rawLength==='string'&&rawLength.trim())metadata.fileLength=rawLength.trim();
  metadata.captionPresent=Boolean(stringValue(message?.caption));return metadata;
}
function mapStatus(...values:unknown[]):ParsedEvolutionStatus['targetStatus']|null{
  for(const value of values){
    if(typeof value==='number'){if(value===2)return 'SENT';if(value===3)return 'DELIVERED';if(value>=4)return 'READ';if(value===0)return 'FAILED'}
    const normalized=String(value||'').trim().toUpperCase().replace(/[.\-\s]+/g,'_');
    if(['SENT','SERVER_ACK','ACK_SERVER'].includes(normalized))return 'SENT';
    if(['DELIVERED','DELIVERY_ACK','ACK_DEVICE'].includes(normalized))return 'DELIVERED';
    if(['READ','READ_ACK','ACK_READ','PLAYED'].includes(normalized))return 'READ';
    if(['FAILED','ERROR','SEND_FAILED'].includes(normalized))return 'FAILED';
  }
  return null;
}

@Injectable()
export class EvolutionWebhookParser {
  constructor(private readonly instances:EvolutionInstanceResolver){}
  parse(payload:unknown):EvolutionWebhookParseResult{
    const root=obj(payload),data=firstObject(root.data),key=obj(data.key),event=eventName(root);
    const instance=stringValue(root.instance,root.instanceName,data.instance,data.instanceName);
    if(!instance)return {kind:'ignored',reason:'missing_instance'};
    const channelId=this.instances.channelForInstance(instance);
    if(event.includes('MESSAGES_UPDATE')||event==='MESSAGE_UPDATE'){
      const status=mapStatus(data.status,obj(data.update).status,obj(data.messageUpdate).status,root.status);
      const providerMessageId=stringValue(key.id,data.messageId,data.id,root.messageId);
      if(!status||!providerMessageId)return {kind:'ignored',reason:'unsupported_status_event'};
      return {kind:'status',value:{provider:'EVOLUTION',channelId,providerMessageId,recipientInstance:instance,targetStatus:status}};
    }
    if(!(event.includes('MESSAGES_UPSERT')||event==='MESSAGE_RECEIVED'||event==='MESSAGES_RECEIVED'))return {kind:'ignored',reason:'unsupported_event'};
    if(Boolean(key.fromMe??data.fromMe))return {kind:'ignored',reason:'outbound_message'};
    const providerMessageId=stringValue(key.id,data.messageId,data.id,root.messageId,root.eventId),remoteJid=stringValue(key.remoteJid,data.remoteJid,data.sender,data.from),phone=senderPhone(remoteJid);
    if(!providerMessageId||!phone)return {kind:'ignored',reason:'missing_message_identity'};
    const message=obj(data.message);
    let messageType:ParsedEvolutionInbound['messageType']='UNKNOWN',textBody:string|null=null,mediaMetadata:ParsedEvolutionInbound['mediaMetadata']=null;
    if(typeof message.conversation==='string'||typeof obj(message.extendedTextMessage).text==='string'){messageType='TEXT';textBody=stringValue(message.conversation,obj(message.extendedTextMessage).text)||null}
    else if(Object.keys(obj(message.imageMessage)).length){messageType='IMAGE';mediaMetadata=mediaMeta(obj(message.imageMessage),providerMessageId)}
    else if(Object.keys(obj(message.documentMessage)).length){messageType='DOCUMENT';mediaMetadata=mediaMeta(obj(message.documentMessage),providerMessageId)}
    const providerConversationId=remoteJid||null;
    return {kind:'inbound',value:{
      provider:'EVOLUTION',channelId,providerMessageId,providerConversationId,senderPhone:phone,recipientInstance:instance,messageType,textBody,mediaMetadata,
      providerTimestamp:providerTime(data.messageTimestamp??root.messageTimestamp??root.timestamp??root.date_time),
      rawMetadata:{event:event||null,instance,fromMe:false,messageType,hasMedia:messageType==='IMAGE'||messageType==='DOCUMENT'},
      unitId:null,bookingId:null,commandId:null,threadRef:providerConversationId,
    }};
  }
}
