import { Injectable } from '@nestjs/common';
import type { MessagingChannelId } from './messaging-channels';
import { CANONICAL_MESSAGING_CHANNEL_IDS } from './messaging-channels';
import { MessagingProviderError } from './messaging.provider';

const INSTANCE_ENV_BY_CHANNEL:Readonly<Record<MessagingChannelId,string>>=Object.freeze({
  CENTRAL:'EVOLUTION_INSTANCE_CENTRAL',
  BIG_CENTRO:'EVOLUTION_INSTANCE_BIG_CENTRO',
  SHOPPING_CONTAGEM:'EVOLUTION_INSTANCE_SHOPPING_CONTAGEM',
});

export function evolutionWebhookEnabled(env:NodeJS.ProcessEnv=process.env){
  return String(env.EVOLUTION_WEBHOOK_ENABLED||'false').trim().toLowerCase()==='true';
}
export function evolutionHttpTimeoutMs(env:NodeJS.ProcessEnv=process.env){
  const parsed=Number(env.EVOLUTION_HTTP_TIMEOUT_MS||10000);
  if(!Number.isFinite(parsed))return 10000;
  return Math.min(30000,Math.max(1000,Math.trunc(parsed)));
}
export function evolutionBaseUrl(env:NodeJS.ProcessEnv=process.env){
  const raw=String(env.EVOLUTION_API_BASE_URL||'').trim();
  if(!raw)throw new MessagingProviderError('EVOLUTION_BASE_URL_MISSING','Evolution provider is not configured',false);
  let url:URL;
  try{url=new URL(raw)}catch{throw new MessagingProviderError('EVOLUTION_BASE_URL_INVALID','Evolution provider configuration is invalid',false)}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash){
    throw new MessagingProviderError('EVOLUTION_BASE_URL_INVALID','Evolution provider configuration is invalid',false);
  }
  return url.toString().replace(/\/+$/,'');
}
export function evolutionApiKey(env:NodeJS.ProcessEnv=process.env){
  const value=String(env.EVOLUTION_API_KEY||'').trim();
  if(!value)throw new MessagingProviderError('EVOLUTION_API_KEY_MISSING','Evolution provider is not configured',false);
  return value;
}

@Injectable()
export class EvolutionInstanceResolver {
  instanceForChannel(channelId:MessagingChannelId,env:NodeJS.ProcessEnv=process.env){
    const instance=String(env[INSTANCE_ENV_BY_CHANNEL[channelId]]||'').trim();
    if(!instance)throw new MessagingProviderError('EVOLUTION_INSTANCE_MISSING','Messaging channel is not configured',false);
    return instance;
  }
  channelForInstance(instance:string,env:NodeJS.ProcessEnv=process.env):MessagingChannelId|null{
    const needle=String(instance||'').trim();
    if(!needle)return null;
    for(const channelId of CANONICAL_MESSAGING_CHANNEL_IDS){
      const configured=String(env[INSTANCE_ENV_BY_CHANNEL[channelId]]||'').trim();
      if(configured&&configured===needle)return channelId;
    }
    return null;
  }
  configuredMappings(env:NodeJS.ProcessEnv=process.env){
    return CANONICAL_MESSAGING_CHANNEL_IDS.map(channelId=>({
      channelId,
      configured:Boolean(String(env[INSTANCE_ENV_BY_CHANNEL[channelId]]||'').trim()),
    }));
  }
}
