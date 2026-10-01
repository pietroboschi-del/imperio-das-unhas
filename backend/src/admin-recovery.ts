import * as argon2 from 'argon2';
import { PrismaClient, SessionStatus, SystemRole } from '@prisma/client';

const prisma=new PrismaClient();

async function main(){
  const username=String(process.env.ADMIN_RECOVERY_USERNAME||'').trim();
  const password=String(process.env.ADMIN_RECOVERY_PASSWORD||'');
  const displayName=String(process.env.ADMIN_RECOVERY_NAME||'Master').trim()||'Master';
  if(!username) throw new Error('Defina ADMIN_RECOVERY_USERNAME');
  if(password.length<12) throw new Error('ADMIN_RECOVERY_PASSWORD deve ter no mínimo 12 caracteres');

  const passwordHash=await argon2.hash(password,{type:argon2.argon2id});
  const now=new Date();

  const result=await prisma.$transaction(async tx=>{
    const user=await tx.user.upsert({
      where:{username},
      create:{
        username,
        displayName,
        passwordHash,
        passwordResetRequired:false,
        active:true,
        networkAdmin:true,
        systemRole:SystemRole.OWNER,
        permissions:['*'],
      },
      update:{
        displayName,
        passwordHash,
        passwordResetRequired:false,
        active:true,
        networkAdmin:true,
        systemRole:SystemRole.OWNER,
        permissions:['*'],
        version:{increment:1},
      },
    });

    const sessions=await tx.session.updateMany({
      where:{userId:user.id,status:SessionStatus.ACTIVE},
      data:{status:SessionStatus.REVOKED,revokedAt:now},
    });

    const tokens=await tx.userCredentialToken.updateMany({
      where:{userId:user.id,usedAt:null,invalidatedAt:null},
      data:{invalidatedAt:now},
    });

    return {userId:user.id,sessionsRevoked:sessions.count,tokensInvalidated:tokens.count};
  });

  const stored=await prisma.user.findUnique({
    where:{username},
    select:{passwordHash:true,active:true,networkAdmin:true,systemRole:true},
  });
  const verified=!!stored?.passwordHash&&await argon2.verify(stored.passwordHash,password);
  if(!verified||!stored?.active||!stored.networkAdmin||stored.systemRole!==SystemRole.OWNER){
    throw new Error('Verificação pós-recuperação falhou');
  }

  console.log(JSON.stringify({
    ok:true,
    username,
    verified:true,
    networkAdmin:true,
    systemRole:SystemRole.OWNER,
    sessionsRevoked:result.sessionsRevoked,
    tokensInvalidated:result.tokensInvalidated,
  }));
}

main()
  .catch(error=>{console.error(String(error?.message||error));process.exitCode=1})
  .finally(()=>prisma.$disconnect());
