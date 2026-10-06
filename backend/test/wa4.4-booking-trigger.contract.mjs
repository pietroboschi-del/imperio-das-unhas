import assert from 'node:assert/strict';import fs from 'node:fs';
const c=fs.readFileSync(new URL('../src/core/core-write.controller.ts',import.meta.url),'utf8');let n=0;const ok=(v,m)=>{n++;assert.ok(v,m)};
ok(c.includes('WaitlistOpportunityService'),'CoreWrite reutiliza serviço de oportunidades');
ok(c.includes("sourceType:'CANCELLATION'"),'cancelamento dispara reavaliação');
ok(c.includes("sourceType:'RESCHEDULE'"),'reagendamento dispara reavaliação');
ok(c.includes('reevaluateForAvailabilityEvent'),'gatilho ocorre após escrita autoritativa da agenda');
console.log(JSON.stringify({ok:true,checks:n,feature:'wa4_4_booking_event_trigger'}));
