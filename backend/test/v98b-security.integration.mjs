import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {PrismaClient} from '@prisma/client';
const prisma=new PrismaClient();let tests=0;const ok=(v,m)=>{tests++;assert.ok(v,m)};
const base='http://127.0.0.1:'+(process.env.PORT||3100);const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitHealth(){for(let i=0;i<60;i++){try{const r=await fetch(base+'/api/v1/health');if(r.ok)return}catch{}await sleep(500)}throw new Error('backend não iniciou')}
const cookieOf=r=>(r.headers.get('set-cookie')||'').split(';')[0];
async function main(){
  await prisma.loginRateLimit.deleteMany();await prisma.userCredentialToken.deleteMany();await prisma.session.deleteMany();await prisma.userUnitAccess.deleteMany();
  await prisma.clientUnitLink.deleteMany();await prisma.booking.deleteMany();await prisma.client.deleteMany();await prisma.unit.deleteMany();
  for(const [id,name] of [['big','Big Shopping'],['centro','Centro de Contagem'],['shopping-contagem','Shopping Contagem']])await prisma.unit.create({data:{id,name}});
  await prisma.client.create({data:{id:'c-sec',name:'Cliente Segurança',phone:'+5531999999999',legacyPayload:{secret:'nao-vazar'}}});
  const server=spawn(process.execPath,['dist/src/main.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,OPENAPI_ENABLED:'true'},stdio:['ignore','pipe','pipe']});
  try{
    await waitHealth();ok(true,'health');
    let r=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD})});ok(r.ok,'owner login');
    const ownerCookie=cookieOf(r),ownerAuth=await r.json(),ownerHeaders={'content-type':'application/json','x-csrf-token':ownerAuth.csrfToken,'cookie':ownerCookie};
    r=await fetch(base+'/api/v1/admin/users',{method:'POST',headers:ownerHeaders,body:JSON.stringify({username:'recepcao_ci',displayName:'Recepção CI',systemRole:'OPERATOR',permissions:['units.read','catalog.read','clients.duplicates.review'],units:[{unitId:'big',role:'reception',permissions:['clients.read','agenda.read']},{unitId:'centro',role:'reception',permissions:['clients.read']}]})});ok(r.ok,'owner cria usuário');const created=await r.json();ok(created.networkAdmin===false,'usuário não vira network admin');
    r=await fetch(base+`/api/v1/auth/users/${created.id}/activation-token`,{method:'POST',headers:ownerHeaders,body:'{}'});ok(r.ok,'owner emite ativação');const invite=await r.json();ok(typeof invite.token==='string'&&invite.token.length>20,'token retornado ao dono');
    r=await fetch(base+'/api/v1/auth/activate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:invite.token,newPassword:'recepcao-ci-password-123'})});ok(r.ok,'ativação pública');
    r=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'recepcao_ci',password:'recepcao-ci-password-123'})});ok(r.ok,'usuário ativado entra');const userCookie=cookieOf(r),userAuth=await r.json();ok(userAuth.user.permissions.includes('clients.duplicates.review'),'permissão de revisão chega ao principal');
    r=await fetch(base+'/api/v1/auth/csrf',{headers:{cookie:userCookie}});ok(r.ok,'csrf recuperável após sessão');const refreshed=await r.json();ok(typeof refreshed.csrfToken==='string','csrf rotacionado');r=await fetch(base+`/api/v1/admin/users/${created.id}/access`,{method:'PATCH',headers:ownerHeaders,body:JSON.stringify({username:'recepcao_ci_2',displayName:'Recepção CI',permissions:['units.read','clients.duplicates.review'],units:[{unitId:'big',role:'reception',permissions:['clients.read','agenda.read']}]})});ok(r.ok,'owner atualiza login do usuário central');const renamed=await r.json();ok(renamed.username==='recepcao_ci_2','login central atualizado');
    r=await fetch(base+'/api/v1/clients',{headers:{cookie:userCookie,'x-unit-id':'big'}});ok(r.ok,'cliente permitido em unidade autorizada');const clients=await r.json();ok(clients.length===1&&clients[0].id==='c-sec','cadastro de rede visível');ok(!JSON.stringify(clients).includes('nao-vazar')&&!JSON.stringify(clients).includes('legacyPayload'),'payload legado não vaza');
    r=await fetch(base+'/api/v1/clients',{headers:{cookie:userCookie,'x-unit-id':'shopping-contagem'}});ok(r.status===403,'terceira unidade negada');
    r=await fetch(base+'/api/v1/bookings',{headers:{cookie:userCookie,'x-unit-id':'centro'}});ok(r.status===403,'permissão funcional agenda negada no Centro');
    r=await fetch(base+'/api/v1/migrations/v94/import?mode=dry-run',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':refreshed.csrfToken,'cookie':userCookie},body:'{}'});ok(r.status===403,'operador não acessa importação');
    r=await fetch(base+'/api/openapi.json');ok(r.ok,'OpenAPI habilitado em homologação');const spec=await r.json();ok(spec.info?.version==='0.98.1','OpenAPI versão V98b');
    for(let i=0;i<Number(process.env.LOGIN_RATE_LIMIT_MAX||5);i++)await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'inexistente',password:'senha-errada-123'})});
    r=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'inexistente',password:'senha-errada-123'})});ok(r.status===429,'rate limit persiste tentativas da mesma conta/IP');
    r=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD})});ok(r.ok,'erros de outra conta no mesmo IP não bloqueiam toda a loja');
    console.log(JSON.stringify({ok:true,tests,feature:'v98b_security_integration'}));
  }finally{server.kill('SIGTERM');await prisma.$disconnect();}
}
main().catch(async e=>{console.error(e.stack||e);await prisma.$disconnect().catch(()=>{});process.exit(1)});
