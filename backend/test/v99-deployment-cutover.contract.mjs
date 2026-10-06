import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let tests=0;
const ok=(v,m)=>{tests++;if(!v)throw new Error(m)};
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

const pkg=JSON.parse(read('package.json'));
const docker=read('Dockerfile');
const env=read('.env.production.example');
const gate=read('src/common/operational-write-gate.ts');
const core=read('src/core/core-write.controller.ts');
const finance=read('src/core/finance-write.controller.ts');
const publicBooking=read('src/core/public-booking.controller.ts');
const bookingCreation=read('src/core/booking-creation.service.ts');
const release=JSON.parse(read('OFFICIAL_RELEASE.json'));
const rollback=read('PRODUCTION_BACKUP_ROLLBACK.md');
const recovery=read('PRODUCTION_RECOVERY.md');
const deployment=read('DEPLOYMENT.md');

ok(pkg.scripts.start==='node dist/main.js','entrypoint aponta para artefato real do Nest');
ok(pkg.scripts['start:prod']==='node dist/main.js','start:prod consistente');
ok(docker.includes('SCHEMA_MIGRATION_ENABLED=false')&&docker.includes('SCHEMA_MIGRATION_ENABLED:-false')&&docker.includes('npm run prisma:migrate')&&docker.includes('npm start'),'container só aplica schema migration com gate explícito');
ok(docker.indexOf('apt-get install -y --no-install-recommends ca-certificates openssl')<docker.indexOf('RUN npm run prisma:generate'),'build instala OpenSSL antes de gerar Prisma Client');
ok(docker.includes('HEALTHCHECK')&&docker.includes('/api/v1/health'),'container possui healthcheck');
ok(env.includes('COOKIE_SECURE=true'),'cookie seguro em produção');
ok(env.includes('SCHEMA_MIGRATION_ENABLED=false'),'template mantém migration de schema desligada por padrão');
ok(env.includes('OPERATIONAL_WRITES_ENABLED=true')&&env.includes('OPERATIONAL_WRITES_UNITS=centro,big,shopping-contagem'),'template atual habilita as três unidades canônicas');
ok(env.includes('MIGRATION_IMPORT_ENABLED=false')&&env.includes('OPENAPI_ENABLED=false'),'recursos sensíveis desligados no template');
ok(gate.includes('OPERATIONAL_WRITES_UNITS')&&gate.includes('allow.length&&unitId&&!allow.includes(unitId)'),'gate implementa allowlist opcional');
ok(core.includes('assertOperationalWriteEnabled(req.unitId!)'),'core write usa gate por unidade');
ok(finance.includes('assertOperationalWriteEnabled(req.unitId!)'),'finance write usa gate por unidade');
ok(publicBooking.includes('this.creation.createPublicBooking')&&bookingCreation.includes("assertOperationalWriteEnabled(input.unitId,'Agendamento online central ainda não habilitado neste ambiente')"),'site delega à criação canônica que usa gate por unidade');

ok(release.releaseId==='official-three-units-2026-10-01','release oficial possui identificador único');
ok(release.repository==='pietroboschi-del/imperio-das-unhas'&&release.branch==='official-three-units-integration','release aponta para repositório e branch oficiais');
ok(release.validatedBaselineSha==='ec56984e190a7b3cb4cdee4d79369853b2f25621','baseline verde da release está fixada por SHA');
ok(release.validatedWorkflow?.runId===36866440047&&release.validatedWorkflow?.conclusion==='success','release referencia a CI verde validada');
ok(release.deploymentRefPolicy==='exact_commit_sha_only'&&release.mainMutationAllowed===false,'deploy exige SHA exato sem alterar main');
ok(JSON.stringify(release.rollout?.initialPlan?.operationalWriteUnits)===JSON.stringify(['centro'])&&new Set(release.rollout?.initialPlan?.blockedWriteUnits||[]).size===2,'manifesto preserva o plano inicial como histórico');
ok(JSON.stringify(release.rollout?.current?.operationalWriteUnits)===JSON.stringify(['centro','big','shopping-contagem'])&&Array.isArray(release.rollout?.current?.blockedWriteUnits)&&release.rollout.current.blockedWriteUnits.length===0,'estado atual autoriza escrita nas três unidades');
ok((release.rollout?.units||[]).every(x=>x.operationalState==='enabled'),'todas as unidades estão marcadas como operacionais no manifesto');
ok(release.infrastructure?.backupRollback?.dailyVolumeBackupConfigured===false&&release.infrastructure?.backupRollback?.logicalBackupConfirmed===true,'release registra ausência de backup Railway e backup lógico confirmado');
ok(release.infrastructure?.backupRollback?.migrationGate==='PROTECTED_BY_CONFIRMED_LOGICAL_BACKUP_2026_10_02','migração atual está protegida pelo dump lógico confirmado');
ok(release.infrastructure?.backupRollback?.schemaMigrationGate?.defaultEnabled===false&&release.infrastructure?.backupRollback?.schemaMigrationGate?.activationRequires==='CONFIRMED_LOGICAL_BACKUP_OR_MANUAL_VOLUME_BACKUP_OR_PITR','schema migration exige proteção de restore confirmada');
ok(deployment.includes('SCHEMA_MIGRATION_ENABLED=false')&&deployment.includes('SCHEMA_MIGRATION_ENABLED=true'),'runbook define ativação controlada e retorno do gate de schema');
ok(rollback.includes('NUNCA restaure o dump diretamente')&&rollback.includes('PostgreSQL 18 separado'),'runbook privilegia rollback não destrutivo em banco separado');
ok(rollback.includes('imperio-postgres-2026-10-02T20-06-42-410Z.dump')&&rollback.includes('pg_restore --list'),'runbook registra dump confirmado e validação de integridade');
ok(release.recovery?.postgresService==='Postgres'&&release.recovery?.volume==='postgres-volume','release fixa PostgreSQL e volume de produção');
ok(JSON.stringify(release.recovery?.automaticBackupSchedule)===JSON.stringify([])&&release.recovery?.dailyRetentionDays===0,'release não inventa política automática inexistente');
ok(release.recovery?.preMigration?.logicalBackupRequired===true&&release.recovery?.preMigration?.verifyBackupFileBeforeImport===true,'backup lógico validável é gate da migração real');
ok(release.recovery?.rollback?.destructiveRestoreDuringPreparation===false&&release.recovery?.rollback?.restoreRehearsalRequiredBeforeOperationalCutover===true,'restore destrutivo não é usado como teste no banco real');
ok(recovery.includes('pg_restore --list')&&recovery.includes('NÃO iniciar promoção/importação real'),'runbook exige dump verificável antes do import');

console.log(JSON.stringify({ok:true,tests,feature:'v99_deployment_cutover_contract'}));
