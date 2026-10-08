// businessDate columns are date labels; timestamp columns need zoned boundaries.
export function businessDayRange(date:string,timeZone:string){
  const midnight=(text:string)=>{
    const desired=Date.parse(text+'T00:00:00.000Z');let guess=desired;
    for(let i=0;i<4;i++){
      const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess));
      const get=(type:string)=>Number(parts.find(p=>p.type===type)?.value||0);
      const delta=desired-Date.UTC(get('year'),get('month')-1,get('day'),get('hour'),get('minute'),get('second'));
      guess+=delta;if(!delta)break;
    }
    return new Date(guess);
  };
  const next=new Date(Date.parse(date+'T00:00:00.000Z')+86400000).toISOString().slice(0,10);
  return {start:midnight(date),end:midnight(next)};
}
