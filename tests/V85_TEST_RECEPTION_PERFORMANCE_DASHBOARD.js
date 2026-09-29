const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
const code=scripts.find(s=>s.includes("const V85_SCHEMA=85"));
if(!code)throw new Error('Bloco V85 não encontrado');
let tests=0;function ok(v,m){tests++;if(!v)throw new Error(m)}
const rows=[
 {bookingId:'b1',createdDate:'2026-09-02',createdAt:'2026-09-02T10:00:00Z',creatorId:'u1',creatorName:'Ana',clientId:'c1',clientName:'Cliente 1',commercialPrice:40,price:40,serviceName:'Manicure',professionalName:'P1',unitId:'A',unitName:'Big',appointmentDate:'2026-10-01',appointmentTime:'10:00',status:'Agendado'},
 {bookingId:'b1',createdDate:'2026-09-02',createdAt:'2026-09-02T10:00:00Z',creatorId:'u1',creatorName:'Ana',clientId:'c1',clientName:'Cliente 1',commercialPrice:25,price:40,listPrice:40,comboDiscount:15,serviceName:'Pedicure',professionalName:'P2',unitId:'A',unitName:'Big',appointmentDate:'2026-10-01',appointmentTime:'10:00',status:'Agendado'},
 {bookingId:'b2',createdDate:'2026-09-10',createdAt:'2026-09-10T10:00:00Z',creatorId:'u1',creatorName:'Ana',clientId:'c2',clientName:'Cliente 2',commercialPrice:50,price:50,serviceName:'Alongamento',professionalName:'P1',unitId:'A',unitName:'Big',appointmentDate:'2026-10-02',appointmentTime:'11:00',status:'Confirmado'},
 {bookingId:'b3',createdDate:'2026-09-15',createdAt:'2026-09-15T10:00:00Z',creatorId:'u1',creatorName:'Ana',clientId:'c3',clientName:'Cliente 3',commercialPrice:40,price:40,serviceName:'Manicure',professionalName:'P1',unitId:'A',unitName:'Big',appointmentDate:'2026-10-03',appointmentTime:'12:00',status:'Cancelado'},
 {bookingId:'b4',createdDate:'2026-09-20',createdAt:'2026-09-20T10:00:00Z',creatorId:'u1',creatorName:'Ana',clientId:'c4',clientName:'Cliente 4',commercialPrice:30,price:30,serviceName:'Spa',professionalName:'P1',unitId:'A',unitName:'Big',appointmentDate:'2026-10-04',appointmentTime:'13:00',status:'Faltou'},
 {bookingId:'b5',createdDate:'2026-09-05',createdAt:'2026-09-05T10:00:00Z',creatorId:'u2',creatorName:'Bia',clientId:'c5',clientName:'Cliente 5',commercialPrice:90,price:90,serviceName:'Gel',professionalName:'P3',unitId:'A',unitName:'Big',appointmentDate:'2026-10-05',appointmentTime:'14:00',status:'Agendado'},
 {bookingId:'b6',createdDate:'2026-09-08',createdAt:'2026-09-08T10:00:00Z',creatorId:'u1',creatorName:'Ana',clientId:'c6',clientName:'Cliente 6',commercialPrice:999,price:999,serviceName:'Outro',professionalName:'P1',unitId:'B',unitName:'Centro',appointmentDate:'2026-10-06',appointmentTime:'15:00',status:'Agendado'}
];
const goals=[
 {id:'g2',receptionUserId:'u2',receptionUserNameSnapshot:'Bia',unitIds:['A'],unitNamesSnapshot:['Big'],periodFrom:'2026-09-01',periodTo:'2026-09-30',targetValue:100,targetServices:5,targetClients:5,status:'ACTIVE'},
 {id:'g1',receptionUserId:'u1',receptionUserNameSnapshot:'Ana',unitIds:['A'],unitNamesSnapshot:['Big'],periodFrom:'2026-09-01',periodTo:'2026-09-30',targetValue:200,targetServices:5,targetClients:4,status:'ACTIVE'},
 {id:'future',receptionUserId:'u1',receptionUserNameSnapshot:'Ana',unitIds:['A'],unitNamesSnapshot:['Big'],periodFrom:'2026-10-01',periodTo:'2026-10-31',targetValue:200,status:'ACTIVE'},
 {id:'arch',receptionUserId:'u1',receptionUserNameSnapshot:'Ana',unitIds:['A'],unitNamesSnapshot:['Big'],periodFrom:'2026-09-01',periodTo:'2026-09-30',targetValue:200,status:'ARCHIVED'}
];
function metrics(r){return {bookings:new Set(r.map(x=>x.bookingId)).size,services:r.length,clients:new Set(r.map(x=>x.clientId||`name:${x.clientName}`)).size,value:r.reduce((s,x)=>s+Number(x.commercialPrice||0),0)}}
const ctx={console,setTimeout:()=>{},structuredClone:global.structuredClone};ctx.window=ctx;ctx.document={getElementById:()=>null};
ctx.db={schemaVersion:84,migrationHistory:[],receptionBookingGoals:goals};ctx.localDateISO=()=> '2026-09-28';ctx.formatDateBR=s=>s;ctx.money=n=>'R$ '+Number(n).toFixed(2);ctx.save=()=>{};
ctx.__imperioV83={allRows:()=>rows,metrics};ctx.__imperioV84={validRow:r=>!['Cancelado','Faltou'].includes(r.status),goalVisible:g=>g.status!=='ARCHIVED'};ctx.renderAdmin=()=>{};
vm.createContext(ctx);vm.runInContext(code,ctx);const api=ctx.__imperioV85;
ok(api.schema===85,'schema export');ok(ctx.db.schemaVersion===85,'schema migrado');ok(ctx.db.migrationHistory.some(x=>x.id==='v85-reception-performance-dashboard'),'migration registrada');api.migrate();ok(ctx.db.migrationHistory.filter(x=>x.id==='v85-reception-performance-dashboard').length===1,'migration idempotente');
let current=api.currentGoals();ok(current.length===2,'somente metas atuais ativas');ok(current[0].id==='g1'&&current[1].id==='g2','ordem alfabética sem ranking de performance');
let op=api.operational(goals[1]);ok(op.bookings===4,'reservas criadas inclui válidas/canceladas/faltas');ok(op.validBookings===2,'reservas válidas distintas');ok(op.cancelled===1,'canceladas distintas');ok(op.missed===1,'faltas distintas');ok(op.metrics.services===3,'serviços válidos');ok(op.metrics.clients===2,'clientes únicos válidos');ok(op.metrics.value===115,'valor comercial válido');ok(api.allRowsForGoal(goals[1]).every(r=>r.unitId==='A'),'unidades exatas da meta');ok(!api.allRowsForGoal(goals[1]).some(r=>r.bookingId==='b6'),'unidade fora da meta excluída');
let weeks=api.weekBuckets(goals[1]);ok(weeks.length===5,'semanas até hoje');ok(weeks[0].start==='2026-09-01'&&weeks[0].end==='2026-09-06','primeira semana parcial');ok(weeks[4].start==='2026-09-28'&&weeks[4].end==='2026-09-28','semana atual parcial');let cum=api.cumulativeAt(goals[1],'2026-09-13');ok(cum.bookings===2,'reservas acumuladas');ok(cum.services===3,'serviços acumulados');ok(cum.clients===2,'clientes únicos acumulados sem soma semanal');ok(cum.value===115,'valor acumulado');
console.log(JSON.stringify({ok:true,tests,schema:ctx.db.schemaVersion,currentGoals:2,createdBookings:4,validBookings:2,cancelled:1,missed:1,value:115,services:3,clients:2,weeks:5}));
