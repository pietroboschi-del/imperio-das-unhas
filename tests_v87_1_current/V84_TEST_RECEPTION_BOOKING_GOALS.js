const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
const code=scripts.find(s=>s.includes("const V84_SCHEMA=84"));
if(!code)throw new Error('Bloco V84 não encontrado');
let tests=0;function ok(v,m){tests++;if(!v)throw new Error(m)}
let allowedMode='all';
const ctx={console,setTimeout:()=>{},structuredClone:global.structuredClone,confirm:()=>true};ctx.window=ctx;ctx.document={getElementById:()=>null,querySelectorAll:()=>[]};
ctx.IMPERIO_ARRAY_COLLECTIONS=['units','bookings','migrationHistory'];
ctx.db={schemaVersion:83,migrationHistory:[],units:[{id:'u1',name:'Big',active:true},{id:'u2',name:'Centro',active:true}],userAccounts:[{id:'adm',name:'Admin',role:'admin',active:true,allUnits:true},{id:'r1',name:'Recepção A',role:'reception',active:true,unitIds:['u1','u2']},{id:'r2',name:'Recepção B',role:'reception',active:true,unitIds:['u1']},{id:'fin',name:'Financeiro',role:'finance',active:true,unitIds:['u1']}],receptionBookingGoals:undefined};
const rows=[
 {bookingId:'b1',creatorId:'r1',createdDate:'2026-10-02',unitId:'u1',status:'Agendado',clientId:'c1',commercialPrice:65},
 {bookingId:'b2',creatorId:'r1',createdDate:'2026-10-03',unitId:'u1',status:'Cancelado',clientId:'c2',commercialPrice:100},
 {bookingId:'b3',creatorId:'r1',createdDate:'2026-10-04',unitId:'u2',status:'Agendado',clientId:'c1',commercialPrice:40},
 {bookingId:'b4',creatorId:'r2',createdDate:'2026-10-04',unitId:'u1',status:'Agendado',clientId:'c3',commercialPrice:70},
 {bookingId:'b5',creatorId:'r1',createdDate:'2026-11-01',unitId:'u1',status:'Agendado',clientId:'c4',commercialPrice:80},
 {bookingId:'b6',creatorId:'r1',createdDate:'2026-10-05',unitId:'u1',status:'Faltou',clientId:'c5',commercialPrice:90}
];
ctx.save=()=>{};ctx.escapeHtml=s=>String(s);ctx.money=n=>`R$ ${Number(n).toFixed(2)}`;ctx.formatDateBR=s=>s;ctx.localDateISO=()=> '2026-09-28';
ctx.__imperioV63={currentUser:()=>ctx.db.userAccounts[0],canManageSettings:()=>true,allowedUnits:()=>allowedMode==='all'?ctx.db.units:ctx.db.units.filter(u=>u.id==='u1')};
ctx.__imperioV83={allowedUnitsV83:()=>allowedMode==='all'?ctx.db.units:ctx.db.units.filter(u=>u.id==='u1'),allRows:()=>rows,metrics:rs=>({services:rs.length,clients:new Set(rs.map(r=>r.clientId)).size,value:rs.reduce((s,r)=>s+r.commercialPrice,0),bookings:new Set(rs.map(r=>r.bookingId)).size})};
ctx.__imperioV64={persistEvent:()=>{}};
vm.createContext(ctx);vm.runInContext(code,ctx);const api=ctx.__imperioV84;
ok(api.schema===84,'schema 84');ok(ctx.db.schemaVersion===84,'db migrado');ok(Array.isArray(ctx.db.receptionBookingGoals),'coleção criada');ok(ctx.IMPERIO_ARRAY_COLLECTIONS.includes('receptionBookingGoals'),'coleção registrada');ok(ctx.db.migrationHistory.filter(x=>x.id==='v84-reception-booking-goals').length===1,'migration registrada');
api.migrate();ok(ctx.db.migrationHistory.filter(x=>x.id==='v84-reception-booking-goals').length===1,'migration idempotente');ok(ctx.IMPERIO_ARRAY_COLLECTIONS.filter(x=>x==='receptionBookingGoals').length===1,'registro da coleção idempotente');
ok(api.receptionUsers().length===2,'somente recepção ativa');
const g={id:'g1',receptionUserId:'r1',receptionUserNameSnapshot:'Recepção A',unitIds:['u1','u2'],unitNamesSnapshot:['Big','Centro'],periodFrom:'2026-10-01',periodTo:'2026-10-31',targetValue:200,targetServices:4,targetClients:3,status:'ACTIVE'};
let m=api.goalMetrics(g);ok(m.services===2,'serviços válidos no período');ok(m.clients===1,'clientes únicos');ok(m.value===105,'valor operacional válido');ok(m.bookings===2,'reservas válidas');ok(api.validRow({status:'Cancelado'})===false,'cancelado excluído');ok(api.validRow({status:'Faltou'})===false,'falta excluída');ok(api.validRow({status:'Agendado'})===true,'status válido incluído');ok(api.pct(105,200)===52.5,'percentual');
ctx.db.receptionBookingGoals=[g];ok(!!api.overlapGoal({receptionUserId:'r1',unitIds:['u1'],periodFrom:'2026-10-15',periodTo:'2026-11-15'},'x'),'sobreposição detectada');ok(!api.overlapGoal({receptionUserId:'r1',unitIds:['x'],periodFrom:'2026-10-15',periodTo:'2026-11-15'},'x'),'unidade distinta permitida');ok(!api.overlapGoal({receptionUserId:'r2',unitIds:['u1'],periodFrom:'2026-10-15',periodTo:'2026-11-15'},'x'),'recepcionista distinta permitida');
allowedMode='all';ok(api.goalVisible(g)===true,'meta visível com acesso integral');allowedMode='u1';ok(api.goalVisible(g)===false,'meta multiunidade não expõe progresso parcial');allowedMode='all';g.status='ARCHIVED';ok(api.overlapGoal({receptionUserId:'r1',unitIds:['u1'],periodFrom:'2026-10-15',periodTo:'2026-11-15'},'x')===null,'arquivada não conflita');ok(api.goalVisible(g)===false,'arquivada não aparece no painel');
console.log(JSON.stringify({ok:true,tests,schema:ctx.db.schemaVersion,goalValue:105,goalServices:2,goalClients:1,overlapProtected:true,partialUnitHidden:true}));
