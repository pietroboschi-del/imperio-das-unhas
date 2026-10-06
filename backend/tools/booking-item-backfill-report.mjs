import {PrismaClient} from '@prisma/client';

const prisma=new PrismaClient();
const TERMINAL=new Set(['CANCELLED','CANCELED','CANCELADO','Cancelado','Faltou']);
try{
  const rows=await prisma.booking.findMany({
    where:{items:{none:{}}},
    select:{id:true,unitId:true,status:true,serviceId:true,professionalId:true,startAt:true,serviceDate:true},
    orderBy:[{serviceDate:'asc'},{id:'asc'}],
  });
  const review=rows.map(row=>{
    const missing=[
      !row.serviceId?'serviceId':null,
      !row.professionalId?'professionalId':null,
      !row.startAt?'startAt':null,
    ].filter(Boolean);
    return {
      bookingId:row.id,unitId:row.unitId,status:row.status,
      reason:missing.length?'ambiguous_missing_'+missing.join('+'):'unexpected_backfillable_header_tuple',
      operational:row.status!=='Bloqueado'&&!TERMINAL.has(row.status),
    };
  });
  const invalidOperational=review.filter(x=>x.operational);
  console.log(JSON.stringify({ok:invalidOperational.length===0,totalWithoutItems:review.length,invalidOperational:invalidOperational.length,review},null,2));
  if(invalidOperational.length)process.exitCode=2;
}finally{
  await prisma.$disconnect();
}
