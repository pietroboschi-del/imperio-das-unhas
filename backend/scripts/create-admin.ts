import * as argon2 from 'argon2';
import { PrismaClient, SystemRole } from '@prisma/client';
const prisma=new PrismaClient();
async function main(){
  const username=String(process.env.ADMIN_USERNAME||'').trim();
  const password=String(process.env.ADMIN_PASSWORD||'');
  const displayName=String(process.env.ADMIN_NAME||'Dono').trim();
  if(!username||password.length<12)throw new Error('Defina ADMIN_USERNAME e ADMIN_PASSWORD com no mínimo 12 caracteres');
  const passwordHash=await argon2.hash(password,{type:argon2.argon2id});
  await prisma.user.upsert({
    where:{username},
    create:{username,displayName,passwordHash,passwordResetRequired:false,active:true,networkAdmin:true,systemRole:SystemRole.OWNER,permissions:['*']},
    update:{displayName,passwordHash,passwordResetRequired:false,active:true,networkAdmin:true,systemRole:SystemRole.OWNER,permissions:['*']},
  });
  console.log(JSON.stringify({ok:true,username,networkAdmin:true,systemRole:SystemRole.OWNER}));
}
main().finally(()=>prisma.$disconnect());
