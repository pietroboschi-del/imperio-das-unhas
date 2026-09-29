import test from 'node:test';
import assert from 'node:assert/strict';
import {createGateway, loadConfig, sefinBase} from '../server.mjs';

function listen(server){return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)))}
function close(server){return new Promise(resolve=>server.close(resolve))}

test('configuração padrão é restrita e produção bloqueada',()=>{
 const c=loadConfig({});
 assert.equal(c.environment,'restrita');assert.equal(c.allowProduction,false);
 assert.match(sefinBase('restrita'),/producaorestrita/);assert.match(sefinBase('producao'),/sefin\.nfse\.gov\.br/);
});

test('gateway mock valida, emite e mantém produção restrita',async()=>{
 const cfg=loadConfig({HOST:'127.0.0.1',PORT:'0',NFSE_ENV:'restrita',FISCAL_GATEWAY_MOCK:'true',FISCAL_STORAGE_DIR:'./test-storage'});
 const server=createGateway(cfg); const port=await listen(server); const base=`http://127.0.0.1:${port}`;
 try{
  let h=await fetch(base+'/api/v1/health').then(r=>r.json()); assert.equal(h.ok,true);assert.equal(h.environment,'restrita');assert.equal(h.mock,true);
  const invoice={ambiente:'restrita',prestador:{cnpj:'12345678000195'},emissao:{nDPS:'7'}};
  let v=await fetch(base+'/api/v1/validate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({invoice})}).then(r=>r.json());assert.equal(v.ok,true);assert.match(v.dpsId,/DPSMOCK/);
  let e=await fetch(base+'/api/v1/nfse/issue',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({invoice,fiscalDocumentId:'f1'})}).then(r=>r.json());assert.equal(e.ok,true);assert.equal(e.number,'7');assert.ok(e.xmlRef);
  let d=await fetch(base+'/api/v1/dps/'+encodeURIComponent(v.dpsId)).then(r=>r.json());assert.equal(d.exists,false);
 }finally{await close(server)}
});

test('divergência de ambiente é bloqueada no servidor',async()=>{
 const cfg=loadConfig({HOST:'127.0.0.1',PORT:'0',NFSE_ENV:'restrita',FISCAL_GATEWAY_MOCK:'true'}); const server=createGateway(cfg);const port=await listen(server);
 try{let r=await fetch(`http://127.0.0.1:${port}/api/v1/validate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({invoice:{ambiente:'producao',prestador:{cnpj:'1'},emissao:{nDPS:'1'}}})});assert.equal(r.status,409)}finally{await close(server)}
});
