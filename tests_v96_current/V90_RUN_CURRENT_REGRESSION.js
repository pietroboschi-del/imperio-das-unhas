const fs=require('fs'),path=require('path'),cp=require('child_process');
const dir=__dirname;
const files=fs.readdirSync(dir).filter(f=>f.endsWith('.js')&&!/RUN_CURRENT_REGRESSION\.js$/i.test(f)).sort();
let passed=0, failed=0, assertions=0, rows=[];
for(const f of files){
  const env={...process.env,TZ:'America/Sao_Paulo'};
  const r=cp.spawnSync(process.execPath,[path.join(dir,f)],{encoding:'utf8',env,timeout:60000});
  const lines=(r.stdout||'').trim().split(/\r?\n/).filter(Boolean); const last=lines.at(-1)||'';
  let data=null; try{data=JSON.parse(last)}catch{}
  if(r.status===0&&data?.ok){passed++;assertions+=Number(data.tests||0);rows.push({file:f,ok:true,assertions:Number(data.tests||0)});}
  else{failed++;rows.push({file:f,ok:false,timedOut:!!r.error&&r.error.code==='ETIMEDOUT',status:r.status,stderr:(r.stderr||'').trim().slice(-1200),stdout:last});}
}
const out={ok:failed===0,suites:files.length,passed,failed,assertions,rows};
console.log(JSON.stringify(out));process.exit(failed?1:0);
