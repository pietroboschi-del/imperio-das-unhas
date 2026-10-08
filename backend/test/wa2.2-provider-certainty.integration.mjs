import assert from 'node:assert/strict';
import {EvolutionMessagingProvider} from '../dist/src/messaging/evolution-messaging.provider.js';
import {EvolutionInstanceResolver} from '../dist/src/messaging/evolution-config.js';
import {MessagingProviderError} from '../dist/src/messaging/messaging.provider.js';

const before={fetch:globalThis.fetch,url:process.env.EVOLUTION_API_BASE_URL,key:process.env.EVOLUTION_API_KEY,instance:process.env.EVOLUTION_INSTANCE_BIG_CENTRO};
let checks=0;
const eq=(a,b,msg)=>{checks++;assert.equal(a,b,msg)};
const provider=new EvolutionMessagingProvider(new EvolutionInstanceResolver());
const input={outboxId:'safe-test',channelId:'BIG_CENTRO',unitId:'big',idempotencyKey:'provider-test-key',payload:{number:'5531999000000',text:'hello'}};
async function failWith(stub,certainty,retryable){
  globalThis.fetch=stub;
  try{await provider.send(input);assert.fail('send should fail')}catch(e){
    assert.ok(e instanceof MessagingProviderError);checks++;
    eq(e.certainty,certainty,'certainty classification');
    eq(e.retryable,retryable,'retryability classification');
  }
}
try{
 process.env.EVOLUTION_API_BASE_URL='http://127.0.0.1:39999';
 process.env.EVOLUTION_API_KEY='TEST_SECRET_NOT_TO_LEAK';
 process.env.EVOLUTION_INSTANCE_BIG_CENTRO='unit-test-instance';
 await failWith(async()=>{throw new Error('connection reset TEST_SECRET_NOT_TO_LEAK')},'DELIVERY_UNKNOWN',true);
 await failWith(async()=>{throw Object.assign(new Error('aborted'),{name:'AbortError'})},'DELIVERY_UNKNOWN',true);
 await failWith(async()=>({ok:false,status:500}),'DELIVERY_UNKNOWN',true);
 await failWith(async()=>({ok:false,status:429}),'DELIVERY_UNKNOWN',true);
 await failWith(async()=>({ok:false,status:400}),'DEFINITE_FAILURE',false);
 await failWith(async()=>({ok:true,json:async()=>{throw new Error('broken response')}}),'DELIVERY_UNKNOWN',true);
 await failWith(async()=>({ok:true,json:async()=>({})}),'DELIVERY_UNKNOWN',true);
 globalThis.fetch=async(_url,request)=>{
   const body=JSON.parse(request.body);
   eq(Object.keys(body).sort().join(','),'number,text','HTTP payload does not claim unsupported dedupe');
   eq(Boolean(request.headers.apikey),true,'provider key sent only in header');
   return {ok:true,json:async()=>({key:{id:'provider123'}})};
 };
 const sent=await provider.send(input);
 eq(sent.providerMessageId,'provider123','successful response persists real provider id');
 await assert.rejects(provider.send({...input,payload:{number:'',text:''}}),e=>e.certainty==='DEFINITE_FAILURE'&&!e.retryable);checks++;
 console.log(JSON.stringify({ok:true,checks,feature:'wa2_2_provider_certainty',externalCalls:false}));
}finally{
 globalThis.fetch=before.fetch;
 for(const [key,value] of [['EVOLUTION_API_BASE_URL',before.url],['EVOLUTION_API_KEY',before.key],['EVOLUTION_INSTANCE_BIG_CENTRO',before.instance]]){
  if(value===undefined)delete process.env[key];else process.env[key]=value;
 }
}
