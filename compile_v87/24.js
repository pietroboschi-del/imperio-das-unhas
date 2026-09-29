
/* ===== V60 · MIGRAÇÃO DE RELATÓRIOS FINANCEIRO + DRE ===== */
(function(){
 const V60_SCHEMA=60,MIGRATION_ID='v60-reports-finance-dre';
 let changed=false;db.migrationHistory=Array.isArray(db.migrationHistory)?db.migrationHistory:[];
 if(!db.migrationHistory.some(x=>(typeof x==='string'?x:x?.id)===MIGRATION_ID)){db.migrationHistory.push({id:MIGRATION_ID,version:V60_SCHEMA,status:'applied',appliedAt:new Date().toISOString(),note:'Relatório Financeiro + DRE; sem reinterpretação de fatos históricos.'});changed=true}
 if(Number(db.schemaVersion||0)<V60_SCHEMA){db.schemaVersion=V60_SCHEMA;db.schemaMigratedAt=new Date().toISOString();changed=true}
 if(changed)save({render:false});
})();
