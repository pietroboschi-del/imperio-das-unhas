export const CANONICAL_UNITS = Object.freeze([
  {id:'centro',name:'Centro de Contagem',timezone:'America/Sao_Paulo',active:true},
  {id:'big',name:'Big Shopping',timezone:'America/Sao_Paulo',active:true},
  {id:'shopping-contagem',name:'Shopping Contagem',timezone:'America/Sao_Paulo',active:true},
] as const);

type UnitRow={id:string;name:string;timezone:string;active:boolean};
type UnitStore={
  unit:{
    findMany(args:any):Promise<UnitRow[]>;
    upsert(args:any):Promise<unknown>;
  };
};

export async function inspectCanonicalUnits(prisma:UnitStore){
  const ids=CANONICAL_UNITS.map(x=>x.id);
  return prisma.unit.findMany({
    where:{id:{in:[...ids]}},
    select:{id:true,name:true,timezone:true,active:true},
    orderBy:{id:'asc'},
  });
}

export async function ensureCanonicalUnits(prisma:UnitStore){
  const before=await inspectCanonicalUnits(prisma);
  const current=new Map(before.map(x=>[x.id,x]));
  const changedIds:string[]=[];
  for(const expected of CANONICAL_UNITS){
    const found=current.get(expected.id);
    const needsChange=!found||found.name!==expected.name||found.timezone!==expected.timezone||found.active!==true;
    if(!needsChange)continue;
    changedIds.push(expected.id);
    await prisma.unit.upsert({
      where:{id:expected.id},
      create:{...expected},
      update:{name:expected.name,timezone:expected.timezone,active:true},
    });
  }
  const after=await inspectCanonicalUnits(prisma);
  return {before,after,changedIds};
}
