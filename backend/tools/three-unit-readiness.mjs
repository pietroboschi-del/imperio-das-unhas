import { PrismaClient } from '@prisma/client';

const prisma=new PrismaClient();
const UNITS=['centro','big','shopping-contagem'];
const terminalBooking=['CANCELLED','CANCELED','CANCELADO','Cancelado','Faltou'];

async function unitSummary(unitId){
  const now=new Date();
  const [unit,professionalLinks,userAccesses,clientLinks,futureBookings,openCash]=await Promise.all([
    prisma.unit.findUnique({where:{id:unitId},select:{id:true,name:true,active:true,timezone:true}}),
    prisma.professionalUnit.count({where:{unitId,active:true,professional:{active:true}}}),
    prisma.userUnitAccess.count({where:{unitId,active:true,user:{active:true}}}),
    prisma.clientUnitLink.count({where:{unitId,active:true,client:{active:true}}}),
    prisma.booking.count({where:{unitId,startAt:{gte:now},status:{notIn:terminalBooking}}}),
    prisma.cashSession.count({where:{unitId,status:{in:['open','OPEN','aberto','ABERTO']}}}),
  ]);
  return {unit,activeProfessionalLinks:professionalLinks,activeUserAccesses:userAccesses,activeClientLinks:clientLinks,futureNonTerminalBookings:futureBookings,openCashSessions:openCash};
}

try{
  const [activeServices,networkAdmins,units]=await Promise.all([
    prisma.service.count({where:{active:true}}),
    prisma.user.count({where:{active:true,networkAdmin:true}}),
    Promise.all(UNITS.map(unitSummary)),
  ]);
  console.log(JSON.stringify({ok:true,readOnly:true,activeServices,networkAdmins,units},null,2));
}finally{
  await prisma.$disconnect();
}
