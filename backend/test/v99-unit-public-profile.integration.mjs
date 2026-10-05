import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {defaultUnitPublicProfile,normalizeWhatsapp,openingStatus} from '../dist/src/core/unit-public-profile.js';

const prisma=new PrismaClient(),base='http://127.0.0.1:'+(process.env.PORT||3100),sleep=ms=>new Promise(r=>setTimeout(r,ms)),sha=v=>createHash('sha256').update(String(v)).digest('hex');
let tests=0;const ok=(v,m)=>{tests++;assert.ok(v,m)};
async function waitHealth(){for(let i=0;i<60;i++){try{const r=await fetch(base+'/api/v1/health');if(r.ok)return}catch{}await sleep(500)}throw new Error('backend não iniciou')}
async function session(userId,token,csrf){await prisma.session.create({data:{userId,tokenHash:sha(token),csrfHash:sha(csrf),status:'ACTIVE',expiresAt:new Date(Date.now()+3600000)}})}
const headers=(token,csrf,unitId)=>({'content-type':'application/json','x-csrf-token':csrf,'cookie':'imperio_session='+token,'x-unit-id':unitId});

async function main(){
 const ownerName='upp_owner_ci',managerName='upp_big_manager_ci';
 await prisma.session.deleteMany({where:{user:{username:{in:[ownerName,managerName]}}}});
 await prisma.user.deleteMany({where:{username:{in:[ownerName,managerName]}}});
 await prisma.auditEvent.deleteMany({where:{action:{in:['unit.public_profile.initialized','unit.public_profile.updated']}}});
 for(const [id,name] of [['centro','Centro de Contagem'],['big','Big Shopping'],['shopping-contagem','Shopping Contagem']])await prisma.unit.upsert({where:{id},create:{id,name,legacyPayload:{}},update:{name,active:true,timezone:'America/Sao_Paulo',legacyPayload:{}}});
 const owner=await prisma.user.create({data:{username:ownerName,displayName:'UPP Owner',active:true,passwordResetRequired:false,networkAdmin:true,systemRole:'OWNER',permissions:['*']}});
 const manager=await prisma.user.create({data:{username:managerName,displayName:'UPP Big Manager',active:true,passwordResetRequired:false,networkAdmin:false,systemRole:'OPERATOR',permissions:[],unitAccesses:{create:{unitId:'big',role:'manager',permissions:['catalog.manage','units.read'],active:true}}}});
 await session(owner.id,'upp-owner-a','upp-csrf-a');await session(owner.id,'upp-owner-b','upp-csrf-b');await session(manager.id,'upp-manager','upp-csrf-manager');
 const server=spawn(process.execPath,['dist/src/main.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,OPERATIONAL_WRITES_ENABLED:'false',OPERATIONAL_WRITES_UNITS:''},stdio:['ignore','pipe','pipe']});
 try{
  await waitHealth();
  const bigDb=await prisma.unit.findUniqueOrThrow({where:{id:'big'}}),shopDb=await prisma.unit.findUniqueOrThrow({where:{id:'shopping-contagem'}}),centroDb=await prisma.unit.findUniqueOrThrow({where:{id:'centro'}});
  ok(bigDb.legacyPayload?.publicProfile?.locationHint==='1º andar, em frente à Leitura','Big recebe perfil confirmado no PostgreSQL');
  ok(shopDb.legacyPayload?.publicProfile?.openingHours?.sunday?.open==='14:00','domingo do Shopping Contagem é 14h');
  ok(centroDb.legacyPayload?.publicProfile?.openingHours?.monday?.status==='CLOSED','Centro inicia segunda fechado');
  ok(centroDb.legacyPayload?.publicProfile?.openingHours?.sunday?.status==='CLOSED','Centro inicia domingo fechado');
  ok(centroDb.legacyPayload?.publicProfile?.openingHours?.tuesday?.status==='UNSET','Centro terça permanece não informada');
  ok(normalizeWhatsapp('(31) 98351-4216')==='5531983514216','WhatsApp é normalizado');

  let r=await fetch(base+'/api/v1/config/units/big/public-profile',{headers:headers('upp-manager','upp-csrf-manager','big')});ok(r.ok,'gestor com catalog.manage lê perfil da própria unidade');
  r=await fetch(base+'/api/v1/config/units/shopping-contagem/public-profile',{headers:headers('upp-manager','upp-csrf-manager','shopping-contagem')});ok(r.status===403,'gestor não acessa unidade sem vínculo');
  r=await fetch(base+'/api/v1/config/units/big/public-profile',{headers:headers('upp-owner-a','upp-csrf-a','big')});let before=await r.json();ok(before.profile.whatsapp==='5531983514216','perfil administrativo retorna WhatsApp normalizado');

  const changed={...before.profile,fullAddress:'Rua Teste CI, 100, Contagem - MG',mapsQuery:'Rua Teste CI 100 Contagem MG',mapsUrl:'',phone:'(31) 98351-4216',whatsapp:'31983514216',openingHours:{...before.profile.openingHours,monday:{status:'CLOSED',open:'',close:''},tuesday:{status:'OPEN',open:'09:00',close:'19:00'}}};
  r=await fetch(base+'/api/v1/config/units/big/public-profile',{method:'PATCH',headers:headers('upp-owner-a','upp-csrf-a','big'),body:JSON.stringify(changed)});ok(r.ok,'perfil e horários são editados');
  let saved=await r.json();ok(saved.profile.openingHours.monday.status==='CLOSED','dia pode ser marcado fechado');ok(saved.profile.openingHours.tuesday.close==='19:00','horário editado persiste');ok(saved.profile.whatsapp==='5531983514216','save normaliza WhatsApp');
  r=await fetch(base+'/api/v1/config/units/big/public-profile',{method:'PATCH',headers:headers('upp-owner-a','upp-csrf-a','big'),body:JSON.stringify({openingHours:{monday:{status:'OPEN',open:'10:00',close:'22:00'}}})});ok(r.ok,'dia fechado pode ser reaberto');
  saved=await r.json();ok(saved.profile.openingHours.monday.status==='OPEN','reabertura persiste');

  r=await fetch(base+'/api/v1/auth/logout',{method:'POST',headers:headers('upp-owner-a','upp-csrf-a','big'),body:JSON.stringify({})});ok(r.ok,'logout da primeira sessão é concluído');
  r=await fetch(base+'/api/v1/config/units/big/public-profile',{headers:headers('upp-owner-b','upp-csrf-b','big')});
  if(!r.ok)throw new Error('segunda sessão não conseguiu ler perfil: HTTP '+r.status+' '+await r.text());
  saved=await r.json();ok(saved.profile.fullAddress.includes('Rua Teste CI'),'outra sessão lê persistência após logout');
  ok(saved.profile.openingHours.tuesday.close==='19:00','reload/outra sessão preserva horário');

  r=await fetch(base+'/api/v1/config/units/inexistente/public-profile',{headers:headers('upp-owner-b','upp-csrf-b','big')});ok(r.status===404,'unidade inválida é rejeitada');
  r=await fetch(base+'/api/v1/config/units/big/public-profile',{headers:headers('upp-owner-b','upp-csrf-b','centro')});ok(r.status===409,'path da unidade não pode divergir do contexto autorizado');

  r=await fetch(base+'/api/v1/config/units/centro/public-profile',{method:'PATCH',headers:headers('upp-owner-b','upp-csrf-b','centro'),body:JSON.stringify({fullAddress:'',mapsQuery:'',mapsUrl:'',openingHours:{tuesday:{status:'UNSET',open:'',close:''}}})});ok(r.ok,'perfil incompleto é aceito sem inventar dados');
  const centro=await r.json();ok(centro.profile.openingHours.tuesday.status==='UNSET','ausência de horário continua não informada');

  const big=defaultUnitPublicProfile('big'),shopping=defaultUnitPublicProfile('shopping-contagem'),center=defaultUnitPublicProfile('centro');
  let st=openingStatus(big,new Date('2026-10-04T16:00:00Z'));ok(st.state==='OPEN'&&st.closesAt==='18:00','Big aberto domingo 13h até 18h');
  st=openingStatus(shopping,new Date('2026-10-04T16:00:00Z'));ok(st.state==='CLOSED'&&st.nextOpen?.time==='14:00','Shopping fechado domingo 13h e abre 14h');
  st=openingStatus(center,new Date('2026-10-05T15:00:00Z'));ok(st.state==='CLOSED'&&st.message==='Fechado hoje','Centro fechado segunda');
  st=openingStatus(center,new Date('2026-10-06T15:00:00Z'));ok(st.state==='UNINFORMED','Centro terça sem horário não é tratado como fechado');
  st=openingStatus(big,new Date('2026-10-04T02:30:00Z'));ok(st.state==='CLOSED'&&st.nextOpen?.day==='sunday'&&st.nextOpen?.time==='12:00','virada após sábado encontra domingo 12h');

  r=await fetch(base+'/api/v1/public/units');let publicUnits=await r.json();ok(r.ok&&publicUnits.length===3,'endpoint público lista as três unidades visíveis');
  const bigPublic=publicUnits.find(x=>x.id==='big'),centerPublic=publicUnits.find(x=>x.id==='centro');
  ok(bigPublic.profile.whatsappUrl==='https://wa.me/5531983514216','link público de WhatsApp é válido');
  ok(bigPublic.profile.directionsUrl.includes('google.com/maps/search'),'mapsQuery gera link de direção');
  ok(centerPublic.profile.directionsUrl==='','endereço/mapa vazio não gera link quebrado');

  r=await fetch(base+'/api/v1/config/units/big/public-profile',{method:'PATCH',headers:headers('upp-owner-b','upp-csrf-b','big'),body:JSON.stringify({showOnWebsite:false})});ok(r.ok,'visibilidade pode ser desligada');
  r=await fetch(base+'/api/v1/public/units');publicUnits=await r.json();ok(!publicUnits.some(x=>x.id==='big'),'unidade oculta não aparece publicamente');
  r=await fetch(base+'/api/v1/config/units/big/public-profile',{method:'PATCH',headers:headers('upp-owner-b','upp-csrf-b','big'),body:JSON.stringify({showOnWebsite:true})});ok(r.ok,'visibilidade pode ser reativada');

  ok(await prisma.auditEvent.count({where:{action:'unit.public_profile.updated',entityId:'big'}})>=3,'alterações do perfil são auditadas');
  console.log(JSON.stringify({ok:true,tests,feature:'unit_public_profile_central'}));
 }finally{
  server.kill('SIGTERM');
  for(const id of ['centro','big','shopping-contagem'])await prisma.unit.update({where:{id},data:{legacyPayload:{publicProfile:defaultUnitPublicProfile(id)}}}).catch(()=>{});
  await prisma.auditEvent.deleteMany({where:{action:{in:['unit.public_profile.initialized','unit.public_profile.updated']}}}).catch(()=>{});
  await prisma.session.deleteMany({where:{user:{username:{in:[ownerName,managerName]}}}}).catch(()=>{});
  await prisma.user.deleteMany({where:{username:{in:[ownerName,managerName]}}}).catch(()=>{});
  await prisma.$disconnect();
 }
}
main().catch(async e=>{console.error(e.stack||e);await prisma.$disconnect().catch(()=>{});process.exit(1)});
