const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
const code=scripts.find(s=>s.includes('const V82_SCHEMA=82'));if(!code)throw new Error('V82 missing');
let tests=0;const ok=(v,m)=>{tests++;if(!v)throw new Error(m)};let saves=0;
const db={schemaVersion:81,migrationHistory:[],units:[{id:'u1',name:'Big'},{id:'u2',name:'Centro'}],services:[{id:'s1',name:'Mani',category:'c1'},{id:'s2',name:'Pedi',category:'c2'}],bookings:[
{id:'b1',unit:'u1',date:'2026-09-10',status:'Agendado',clientId:'c1',items:[{serviceId:'s1',pro:'p1'},{serviceId:'s2',pro:'p1'}]},
{id:'b2',unit:'u1',date:'2026-09-11',status:'Cancelado',clientId:'c2',items:[{serviceId:'s1',pro:'p1'}]},
{id:'b3',unit:'u1',date:'2026-09-12',status:'Faltou',clientId:'c3',items:[{serviceId:'s1',pro:'p1'}]},
{id:'blk',unit:'u1',date:'2026-09-12',status:'Bloqueado',items:[{serviceId:'s1',pro:'p1'}]},
{id:'other',unit:'u2',date:'2026-09-12',status:'Agendado',items:[{serviceId:'s1',pro:'p2'}]}
],waitlistRequests:[{id:'w1',unitId:'u1',serviceId:'s1',availabilityDate:'2026-09-10',status:'WAITING'},{id:'w2',unitId:'u2',serviceId:'s1',availabilityDate:'2026-09-10',status:'WAITING'}]};
const f={from:'2026-09-01',to:'2026-09-30',unit:'u1',professional:'all',service:'all',category:'all'};
const ctx={console,db,window:null,Date,save:()=>saves++,normalizeBooking:x=>x,reportService:(id)=>db.services.find(s=>s.id===id),v52AgendaClientMatch:()=>true,v52AgendaMetrics:()=>({capacityMeasured:true,occupancy:55,productiveMin:600,appointments:2}),reportPctText:v=>`${v}%`,formatDateBR:s=>s,renderReportAgendaV52:()=>'<div>base</div>',renderAdmin:()=>{},reportFilters:f,document:{}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(code,ctx);let api=ctx.__imperioV82;
ok(api.schema===82,'schema 82');ok(db.migrationHistory.filter(x=>x.id==='v82-historical-fill-demand-trend').length===1,'migration canonical');let rows=api.bookingDemand(f,f.from,f.to);ok(rows.length===3,'three booking intentions including cancelled/no-show');ok(new Set(rows.map(x=>x.id)).size===3,'booking with multiple services not duplicated');ok(!rows.some(x=>x.id==='blk'||x.id==='other'),'block and other unit excluded');let w=api.waitlistDemand(f,f.from,f.to);ok(w.length===1&&w[0].id==='w1','waitlist scoped and separate');let t=api.trend({agendaCurrent:{f},current:{f},data:{}});ok(t.rows.reduce((s,x)=>s+x.registered,0)===3,'trend registered bookings once');ok(t.rows.reduce((s,x)=>s+x.waitlist,0)===1,'trend queue separately');let rendered=api.render({agendaCurrent:{f},current:{f},data:{}});ok(/Demanda observada/.test(rendered)&&/não é uma estimativa/.test(rendered),'honest observed-demand nomenclature');ok(/não cria previsão/i.test(rendered),'does not claim forecast');let before=saves;vm.runInContext(code,ctx);ok(db.migrationHistory.filter(x=>x.id==='v82-historical-fill-demand-trend').length===1&&saves===before,'reload migration idempotent');
console.log(JSON.stringify({ok:true,tests,registered:3,waitlist:1}));
