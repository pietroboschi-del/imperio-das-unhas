
/* ===== V62 · integração final + migração ===== */
(function(){
 const api=window.__imperioV62;if(!api)return;
 const _v62SaveClientFinal=saveClient;saveClient=function(id=''){let prep=api.v62PrepareClientEdit(id),out=_v62SaveClientFinal(id);api.v62AfterClientEdit(prep);return out};window.saveClient=saveClient;
 const _v62FinalizeFinal=finalizeCommandPayment;finalizeCommandPayment=function(cmdId){let out=_v62FinalizeFinal(cmdId);api.v62AfterFinalization(cmdId);return out};window.finalizeCommandPayment=finalizeCommandPayment;
 api.v62Migrate();
})();
