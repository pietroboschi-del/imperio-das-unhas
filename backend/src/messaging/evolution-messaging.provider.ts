import { Injectable } from '@nestjs/common';
import { EvolutionInstanceResolver, evolutionApiKey, evolutionBaseUrl, evolutionHttpTimeoutMs } from './evolution-config';
import { MessagingProvider, MessagingProviderError, ProviderOutboundMessage, ProviderSendResult } from './messaging.provider';

type EvolutionTextPayload={number?:unknown;to?:unknown;text?:unknown};

function providerMessageId(body:any):string|null{
  for(const value of [body?.key?.id,body?.data?.key?.id,body?.data?.Info?.ID,body?.data?.info?.id,body?.messageId,body?.id]){
    const normalized=String(value||'').trim();
    if(normalized)return normalized;
  }
  return null;
}

@Injectable()
export class EvolutionMessagingProvider implements MessagingProvider {
  readonly providerName='EVOLUTION';
  constructor(private readonly instances:EvolutionInstanceResolver){}
  async send(message:ProviderOutboundMessage):Promise<ProviderSendResult>{
    const payload=(message.payload||{}) as EvolutionTextPayload;
    const number=String(payload.number||payload.to||'').replace(/\D/g,'');
    const text=typeof payload.text==='string'?payload.text:'';
    if(!number||!text)throw new MessagingProviderError('EVOLUTION_PAYLOAD_INVALID','Outbound message payload is invalid',false,'DEFINITE_FAILURE');
    const baseUrl=evolutionBaseUrl(),apiKey=evolutionApiKey(),instance=this.instances.instanceForChannel(message.channelId),timeoutMs=evolutionHttpTimeoutMs();
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetch(baseUrl+'/message/sendText/'+encodeURIComponent(instance),{
        method:'POST',
        headers:{'content-type':'application/json','apikey':apiKey},
        body:JSON.stringify({number,text}),
        signal:controller.signal,
      });
      if(!response.ok){
        if(response.status>=500||response.status===429||response.status===408)throw new MessagingProviderError('EVOLUTION_HTTP_RETRYABLE','Evolution provider temporarily unavailable',true,'DELIVERY_UNKNOWN');
        throw new MessagingProviderError('EVOLUTION_HTTP_REJECTED','Evolution provider rejected the request',false,'DEFINITE_FAILURE');
      }
      let body:unknown=null;
      try{body=await response.json()}catch{throw new MessagingProviderError('EVOLUTION_RESPONSE_INVALID','Evolution provider returned an invalid response',true,'DELIVERY_UNKNOWN')}
      const id=providerMessageId(body);
      if(!id)throw new MessagingProviderError('EVOLUTION_MESSAGE_ID_MISSING','Evolution provider response did not include a message id',true,'DELIVERY_UNKNOWN');
      return {providerMessageId:id,acceptedAt:new Date()};
    }catch(error){
      if(error instanceof MessagingProviderError)throw error;
      if((error as {name?:string})?.name==='AbortError')throw new MessagingProviderError('EVOLUTION_TIMEOUT','Evolution provider request timed out',true,'DELIVERY_UNKNOWN');
      throw new MessagingProviderError('EVOLUTION_UNAVAILABLE','Evolution provider unavailable',true,'DELIVERY_UNKNOWN');
    }finally{clearTimeout(timer)}
  }
}
