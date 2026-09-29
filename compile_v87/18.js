
/* ===== V53 · ETAPA 1: controle de schema e migrações idempotentes ===== */
(function(){
 const id='v53-data-safety';
 function hasMigration(mid){return (db.migrationHistory||[]).some(x=>x&&x.id===mid)}
 function recordLegacySchemas(){
  let changed=false,known=[49,50,51,52],current=Number(db.schemaVersion||0);
  for(const v of known){let mid=`legacy-v${v}`;if(current>=v&&!hasMigration(mid)){db.migrationHistory.push({id:mid,version:v,status:'assumed-applied',recordedAt:new Date().toISOString()});changed=true}}
  return changed
 }
 function migrateV53(){
  let changed=recordLegacySchemas();
  if(!hasMigration(id)){
   if(!db.storageMeta||typeof db.storageMeta!=='object'||Array.isArray(db.storageMeta)){db.storageMeta={dataMode:'real'};changed=true}
   if(db.storageMeta.storageSafetyVersion!==1){db.storageMeta.storageSafetyVersion=1;changed=true}
   db.migrationHistory.push({id,version:53,status:'applied',appliedAt:new Date().toISOString()});changed=true
  }
  if(Number(db.schemaVersion||0)<53){db.schemaVersion=53;db.schemaMigratedAt=new Date().toISOString();changed=true}
  if(changed)save({render:false});else storageState.skippedWrites++;
 }
 migrateV53();window.__imperioDatabase=db;window.__imperioStorageState=storageState;
 setTimeout(renderStorageSafetyBanner,0)
})();
