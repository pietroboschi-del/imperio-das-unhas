import {createHash} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {PrismaClient} from '@prisma/client';

const UNITS=['centro','big','shopping-contagem'];
const UNIT_ALIASES=['big-shopping','central'];
const TERMINAL_BOOKING=['CANCELLED','CANCELED','CANCELADO','Cancelado','Faltou'];
const STOCK_TABLES=['Product','StockLocation','StockBalance','StockMovement','StockPurchase','StockTransfer','StockBalanceOpening'];
const DEFAULT_MIGRATIONS_DIR=fileURLToPath(new URL('../prisma/migrations/',import.meta.url));

function obj(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}
function list(value){return Array.isArray(value)?value:[]}
function iso(value){return value instanceof Date?value.toISOString():value?new Date(value).toISOString():null}
function permissions(value){
  if(Array.isArray(value))return new Set(value.map(String));
  return new Set(Object.entries(obj(value)).filter(([,enabled])=>enabled===true).map(([name])=>name));
}
function canOperate(user,access){
  if(user.networkAdmin)return true;
  const granted=new Set([...permissions(user.permissions),...permissions(access.permissions)]);
  return granted.has('*')||(granted.has('agenda.manage')&&granted.has('clients.manage'));
}
function validClock(value){
  const match=String(value||'').match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if(!match)return Number.NaN;
  const hour=Number(match[1]),minute=Number(match[2]);
  return hour<=23&&minute<=59?hour*60+minute:Number.NaN;
}
function hasValidSchedule(config,unitId){
  return Object.entries(obj(config.schedule)).some(([key,value])=>{
    if(!key.startsWith(unitId+'-'))return false;
    const row=obj(value),start=validClock(row.start),end=validClock(row.end);
    return row.work===true&&Number.isFinite(start)&&Number.isFinite(end)&&end>start;
  });
}
function published(config){return config.show!==false&&config.online!==false}
function serviceOnline(row){const config=obj(row.legacyPayload);return row.active&&config.show!==false&&config.online!==false}
function serviceRule(service,professionalId){return obj(obj(obj(service.legacyPayload).proRules)[professionalId])}
function eligibleServices(professional,services){
  const config=obj(professional.legacyPayload),ownServices=new Set(list(config.services).map(String));
  return services.filter(service=>{
    if(!serviceOnline(service))return false;
    const rule=serviceRule(service,professional.id);
    const enabled=Object.prototype.hasOwnProperty.call(rule,'enabled')?rule.enabled===true:ownServices.has(service.id);
    return enabled&&rule.online!==false&&Number(rule.duration??service.durationMin)>0&&Number(rule.price??service.price)>=0;
  });
}
function coveredByResource(service,activeWorkstations){
  if(!service.categoryId)return false;
  return activeWorkstations.some(station=>list(station.allowedCategoryIds).map(String).includes(service.categoryId));
}
async function localMigrations(migrationsDir){
  const entries=await readdir(migrationsDir,{withFileTypes:true});
  const rows=[];
  for(const entry of entries.filter(item=>item.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))){
    const sql=await readFile(path.join(migrationsDir,entry.name,'migration.sql'));
    rows.push({migrationName:entry.name,checksum:createHash('sha256').update(sql).digest('hex')});
  }
  return rows;
}
async function migrationReport(prisma,migrationsDir,tables){
  const local=await localMigrations(migrationsDir),localByName=new Map(local.map(row=>[row.migrationName,row]));
  if(!tables.has('_prisma_migrations')){
    return {tableExists:false,applied:[],pending:local,unexpected:[],incomplete:[],rolledBack:[],checksumStateIssues:[]};
  }
  const databaseRows=await prisma.$queryRaw`
    SELECT migration_name,checksum,started_at,finished_at,rolled_back_at,logs,applied_steps_count
    FROM "_prisma_migrations"
    ORDER BY started_at,migration_name
  `;
  const normalized=databaseRows.map(row=>({
    migrationName:row.migration_name,checksum:row.checksum,startedAt:iso(row.started_at),finishedAt:iso(row.finished_at),
    rolledBackAt:iso(row.rolled_back_at),appliedStepsCount:Number(row.applied_steps_count||0),
    errorLogPresent:row.finished_at===null&&row.rolled_back_at===null&&Boolean(String(row.logs||'').trim()),
  }));
  const applied=normalized.filter(row=>row.finishedAt&&row.rolledBackAt===null);
  const incomplete=normalized.filter(row=>row.finishedAt===null&&row.rolledBackAt===null);
  const rolledBack=normalized.filter(row=>row.rolledBackAt!==null);
  const unexpected=normalized.filter(row=>!localByName.has(row.migrationName));
  const pending=local.filter(row=>!applied.some(db=>db.migrationName===row.migrationName));
  const checksumStateIssues=applied
    .filter(row=>localByName.has(row.migrationName)&&localByName.get(row.migrationName).checksum!==row.checksum)
    .map(row=>({migrationName:row.migrationName,databaseChecksum:row.checksum,localChecksum:localByName.get(row.migrationName).checksum,issue:'CHECKSUM_MISMATCH'}));
  return {tableExists:true,applied,pending,unexpected,incomplete,rolledBack,checksumStateIssues};
}
async function countIf(tableExists,read){return tableExists?read():null}

export async function buildReadinessReport(prisma,{migrationsDir=DEFAULT_MIGRATIONS_DIR,now=new Date()}={}){
  const [databaseIdentity,tableRows,unitRows,users,professionals,services,workstations]=await Promise.all([
    prisma.$queryRaw`SELECT current_database() AS database_name,current_schema() AS schema_name,current_setting('server_version') AS server_version`,
    prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() ORDER BY table_name`,
    prisma.unit.findMany({where:{id:{in:[...UNITS,...UNIT_ALIASES]}},select:{id:true,active:true,timezone:true}}),
    prisma.user.findMany({select:{active:true,networkAdmin:true,permissions:true,unitAccesses:{select:{unitId:true,role:true,permissions:true,active:true}}}}),
    prisma.professional.findMany({select:{id:true,active:true,legacyPayload:true,units:{select:{unitId:true,active:true}}}}),
    prisma.service.findMany({select:{id:true,categoryId:true,price:true,durationMin:true,active:true,legacyPayload:true}}),
    prisma.workstation.findMany({select:{unitId:true,active:true,allowedCategoryIds:true,legacyPayload:true}}),
  ]);
  const tables=new Set(tableRows.map(row=>row.table_name)),identity=databaseIdentity[0]||{};
  const databaseFingerprint=createHash('sha256').update(String(identity.database_name||'unknown')).digest('hex').slice(0,16);
  const networkAdmins=users.filter(user=>user.active&&user.networkAdmin).length;
  const orphanRows=tables.has('UserUnitAccess')?await prisma.$queryRaw`
    SELECT a."unitId",COUNT(*)::int AS count
    FROM "UserUnitAccess" a
    LEFT JOIN "User" u ON u.id=a."userId"
    LEFT JOIN "Unit" n ON n.id=a."unitId"
    WHERE u.id IS NULL OR n.id IS NULL
    GROUP BY a."unitId"
  `:[];
  const orphanByUnit=new Map(orphanRows.map(row=>[row.unitId,Number(row.count)]));
  const activeServices=services.filter(service=>service.active),onlineServices=activeServices.filter(serviceOnline);
  const centralClients=await countIf(tables.has('Client'),()=>prisma.client.count({where:{active:true}}));
  const stagingTotal=await countIf(tables.has('MigrationEntity'),()=>prisma.migrationEntity.count());
  const batchesTotal=await countIf(tables.has('MigrationEnvelope'),()=>prisma.migrationEnvelope.count());
  const duplicateReviewTotal=await countIf(tables.has('ClientDuplicateReview'),()=>prisma.clientDuplicateReview.count());
  const stockCounts={};
  const stockReaders={
    Product:()=>prisma.product.count(),StockLocation:()=>prisma.stockLocation.count(),StockBalance:()=>prisma.stockBalance.count(),
    StockMovement:()=>prisma.stockMovement.count(),StockPurchase:()=>prisma.stockPurchase.count(),StockTransfer:()=>prisma.stockTransfer.count(),
    StockBalanceOpening:()=>prisma.stockBalanceOpening.count(),
  };
  for(const table of STOCK_TABLES)stockCounts[table]=await countIf(tables.has(table),stockReaders[table]);
  const stockLocations=tables.has('StockLocation')?await prisma.stockLocation.findMany({select:{id:true,unitId:true,kind:true,active:true}}):[];
  const migrationData=await migrationReport(prisma,migrationsDir,tables);

  const units={};
  const usersByUnit={},professionalsByUnit={},servicesByUnit={},schedulesByUnit={},workstationsByUnit={},bookingByUnit={},clientsByUnit={},stockByUnit={},readinessByUnit={};
  for(const unitId of UNITS){
    const unit=unitRows.find(row=>row.id===unitId),activeWorkstations=workstations.filter(row=>row.unitId===unitId&&row.active);
    const accesses=users.flatMap(user=>user.unitAccesses.filter(access=>access.unitId===unitId).map(access=>({user,access})));
    const activeAccesses=accesses.filter(({user,access})=>user.active&&access.active);
    const linked=professionals.filter(pro=>pro.units.some(link=>link.unitId===unitId));
    const activeLinked=professionals.filter(pro=>pro.active&&pro.units.some(link=>link.unitId===unitId&&link.active));
    const reason={NO_PROFESSIONALUNIT:0,INACTIVE:0,NOT_PUBLISHED:0,NO_ELIGIBLE_SERVICE:0,NO_VALID_SCHEDULE:0,NO_RESOURCE:0};
    let publishedCount=0,serviceCount=0,scheduleCount=0,resourceCount=0,catalogCount=0,overrides=0;
    for(const professional of professionals){
      const activeLink=professional.units.some(link=>link.unitId===unitId&&link.active);
      if(!professional.active){reason.INACTIVE++;continue}
      if(!activeLink){reason.NO_PROFESSIONALUNIT++;continue}
      const config=obj(professional.legacyPayload);
      if(!published(config)){reason.NOT_PUBLISHED++;continue}
      publishedCount++;
      const eligible=eligibleServices(professional,services);
      overrides+=eligible.filter(service=>Object.keys(serviceRule(service,professional.id)).length>0).length;
      if(!eligible.length){reason.NO_ELIGIBLE_SERVICE++;continue}
      serviceCount++;
      if(!hasValidSchedule(config,unitId)){reason.NO_VALID_SCHEDULE++;continue}
      scheduleCount++;
      if(!eligible.some(service=>coveredByResource(service,activeWorkstations))){reason.NO_RESOURCE++;continue}
      resourceCount++;catalogCount++;
    }
    const futureNonTerminalBookings=await prisma.booking.count({where:{unitId,startAt:{gte:now},status:{notIn:TERMINAL_BOOKING}}});
    const clientLinks=await prisma.clientUnitLink.count({where:{unitId,active:true,client:{active:true}}});
    const staging=await countIf(tables.has('MigrationEntity'),()=>prisma.migrationEntity.count({where:{unitId}}));
    const unitStockLocation=stockLocations.find(location=>location.unitId===unitId&&location.kind==='UNIT'&&location.active);
    const balanceCount=unitStockLocation&&tables.has('StockBalance')?await prisma.stockBalance.count({where:{locationId:unitStockLocation.id}}):stockCounts.StockBalance===null?null:0;
    const openingCount=unitStockLocation&&tables.has('StockBalanceOpening')?await prisma.stockBalanceOpening.count({where:{locationId:unitStockLocation.id}}):stockCounts.StockBalanceOpening===null?null:0;
    const workstationCategories=new Set(activeWorkstations.flatMap(row=>list(row.allowedCategoryIds).map(String)));
    units[unitId]={exists:Boolean(unit),active:unit?.active??false,timezone:unit?.timezone??null};
    usersByUnit[unitId]={activeUserAccesses:activeAccesses.length,operableProfiles:activeAccesses.filter(({user,access})=>canOperate(user,access)).length,networkAdminsTotal:networkAdmins,orphanAccesses:orphanByUnit.get(unitId)||0};
    professionalsByUnit[unitId]={totalProfessionals:professionals.length,activeProfessionals:professionals.filter(pro=>pro.active).length,professionalUnitLinks:linked.length,activeLinks:activeLinked.length,publishedOnline:publishedCount,withEligibleService:serviceCount,withValidSchedule:scheduleCount,withRequiredResource:resourceCount,publicCatalogEligible:catalogCount,exclusionReasons:reason};
    servicesByUnit[unitId]={active:activeServices.length,onlineEligible:onlineServices.length,withoutPrice:onlineServices.filter(service=>!Number.isFinite(Number(service.price))||Number(service.price)<0).length,withoutDuration:onlineServices.filter(service=>!Number.isFinite(Number(service.durationMin))||Number(service.durationMin)<=0).length,overridesApplicable:overrides};
    schedulesByUnit[unitId]={professionalsWithSchedule:scheduleCount,professionalsWithoutSchedule:Math.max(0,serviceCount-scheduleCount),coverage:activeLinked.length?Number((scheduleCount/activeLinked.length).toFixed(4)):0};
    workstationsByUnit[unitId]={total:workstations.filter(row=>row.unitId===unitId).length,active:activeWorkstations.length,capacity:activeWorkstations.reduce((sum,row)=>sum+Math.max(1,Number(obj(row.legacyPayload).capacity||1)),0),categoriesCovered:[...workstationCategories].sort()};
    bookingByUnit[unitId]={futureNonTerminal:futureNonTerminalBookings,minimumOperationalChain:catalogCount>0};
    clientsByUnit[unitId]={centralClients,clientUnitLinks:clientLinks,staging,batches:batchesTotal,duplicateReview:duplicateReviewTotal};
    stockByUnit[unitId]={locationExists:Boolean(unitStockLocation),balances:balanceCount,openings:openingCount};
    const usersReady=usersByUnit[unitId].operableProfiles>0||networkAdmins>0;
    const professionalsReady=catalogCount>0,servicesReady=onlineServices.some(service=>Number(service.durationMin)>0&&Number(service.price)>=0);
    const schedulesReady=scheduleCount>0,resourcesReady=resourceCount>0,clientsReady=clientLinks>0;
    const centralLocation=stockLocations.some(location=>location.kind==='CENTRAL'&&location.active);
    const hasStockData=Number(stockCounts.Product||0)>0&&(Number(balanceCount||0)>0||Number(openingCount||0)>0);
    const stockReady=STOCK_TABLES.every(table=>tables.has(table))&&centralLocation&&Boolean(unitStockLocation)&&hasStockData;
    const unitReady=Boolean(unit?.active);
    readinessByUnit[unitId]={unitReady,usersReady,professionalsReady,servicesReady,schedulesReady,resourcesReady,clientsReady,stockReady,operationalChainReady:unitReady&&usersReady&&professionalsReady&&servicesReady&&schedulesReady&&resourcesReady};
  }
  units.aliases=Object.fromEntries(UNIT_ALIASES.map(id=>{const row=unitRows.find(unit=>unit.id===id);return [id,{exists:Boolean(row),active:row?.active??false,timezone:row?.timezone??null}]}));
  const centralLocation=stockLocations.find(location=>location.kind==='CENTRAL'&&location.active);
  const stock={tables:Object.fromEntries(STOCK_TABLES.map(table=>[table,{exists:tables.has(table),count:stockCounts[table]}])),locations:{central:{exists:Boolean(centralLocation)},...Object.fromEntries(UNITS.map(unitId=>[unitId,{exists:stockByUnit[unitId].locationExists}]))}};
  const migrationBlocked=!migrationData.tableExists||migrationData.pending.length>0||migrationData.incomplete.length>0||migrationData.checksumStateIssues.length>0||migrationData.unexpected.length>0;
  const approved=UNITS.every(unitId=>Object.values(readinessByUnit[unitId]).every(Boolean))&&!migrationBlocked;
  return {
    ok:true,readOnly:true,
    metadata:{timestamp:now.toISOString(),readOnly:true,database:{provider:'postgresql',schema:String(identity.schema_name||'public'),serverVersion:String(identity.server_version||''),databaseFingerprint},transactionReadOnly:false,enforcement:'Prisma read APIs and SELECT-only raw SQL'},
    units,users:{networkAdminsTotal:networkAdmins,byUnit:usersByUnit},professionals:professionalsByUnit,services:servicesByUnit,schedules:schedulesByUnit,
    workstations:workstationsByUnit,booking:bookingByUnit,clients:{centralClients,staging:stagingTotal,batches:batchesTotal,duplicateReview:duplicateReviewTotal,byUnit:clientsByUnit},
    stock:{...stock,byUnit:stockByUnit},migrations:{...migrationData,ready:!migrationBlocked},readiness:{migrationsReady:!migrationBlocked,units:readinessByUnit,result:approved?'APPROVED':'BLOCKED'},
  };
}

async function main(){
  const prisma=new PrismaClient();
  try{console.log(JSON.stringify(await buildReadinessReport(prisma),null,2))}
  finally{await prisma.$disconnect()}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  main().catch(error=>{console.error(error?.stack||String(error));process.exitCode=1});
}
