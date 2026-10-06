export class FakeMessagingProvider {
  providerName='FAKE';
  calls=[];
  failuresRemaining=0;
  delayMs=0;
  errorDetail='TEST_PROVIDER_SECRET_MUST_NOT_LEAK';
  nextProviderMessageId='fake-provider-message';
  async send(message){
    this.calls.push(message);
    if(this.delayMs)await new Promise(resolve=>setTimeout(resolve,this.delayMs));
    if(this.failuresRemaining>0){this.failuresRemaining--;throw new Error('temporary provider failure '+this.errorDetail)}
    return {providerMessageId:this.nextProviderMessageId+'-'+this.calls.length,acceptedAt:new Date()};
  }
}
