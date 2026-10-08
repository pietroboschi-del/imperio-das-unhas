import {MessagingProviderError} from '../../dist/src/messaging/messaging.provider.js';
export class FakeMessagingProvider {
  providerName='FAKE';
  calls=[];
  failuresRemaining=0;
  failureCertainty='DEFINITE_FAILURE';
  failureRetryable=true;
  delayMs=0;
  errorDetail='TEST_PROVIDER_SECRET_MUST_NOT_LEAK';
  nextProviderMessageId='fake-provider-message';
  async send(message){
    this.calls.push(message);
    if(this.delayMs)await new Promise(resolve=>setTimeout(resolve,this.delayMs));
    if(this.failuresRemaining>0){this.failuresRemaining--;throw new MessagingProviderError('FAKE_FAILURE','temporary provider failure',this.failureRetryable,this.failureCertainty)}
    return {providerMessageId:this.nextProviderMessageId+'-'+this.calls.length,acceptedAt:new Date()};
  }
}
