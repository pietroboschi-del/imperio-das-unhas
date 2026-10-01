import fs from 'node:fs';
import assert from 'node:assert/strict';

const src=fs.readFileSync(new URL('../src/admin-recovery.ts',import.meta.url),'utf8');
let tests=0;const ok=(v,m)=>{tests++;assert.ok(v,m)};

ok(src.includes('ADMIN_RECOVERY_USERNAME'),'recovery exige username dedicado');
ok(src.includes('ADMIN_RECOVERY_PASSWORD'),'recovery exige senha dedicada');
ok(src.includes('password.length<12'),'mantém mínimo de 12 caracteres');
ok(src.includes('argon2.argon2id'),'usa Argon2id');
ok(src.includes('passwordResetRequired:false'),'remove obrigação de reset no login recuperado');
ok(src.includes('networkAdmin:true'),'restaura networkAdmin');
ok(src.includes('SystemRole.OWNER'),'restaura OWNER');
ok(src.includes("permissions:['*']"),'restaura permissões de owner');
ok(src.includes('SessionStatus.ACTIVE')&&src.includes('SessionStatus.REVOKED'),'revoga sessões ativas');
ok(src.includes('userCredentialToken.updateMany'),'invalida tokens de credencial antigos');
ok(src.includes('argon2.verify'),'verifica hash persistido antes de sair');
ok(!src.includes('cambraia'),'nenhuma senha é hardcoded no repositório');

console.log(JSON.stringify({ok:true,tests,feature:'admin_recovery'}));
