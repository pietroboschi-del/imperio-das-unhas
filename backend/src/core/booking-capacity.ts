export type CapacityDemand={id:string;start:number;end:number;categoryId:string};
export function hasPhysicalCapacity(stations:Array<{id:string;categories:string[]}>,existing:CapacityDemand[],candidates:CapacityDemand[]){
  const demands=[...existing,...candidates],candidateIds=new Set(candidates.map(d=>d.id));
  const marks=[...new Set(demands.flatMap(d=>[d.start,d.end]))].sort((a,b)=>a-b);
  for(let i=0;i<marks.length-1;i++){
    const active=demands.filter(d=>d.start<marks[i+1]&&d.end>marks[i]);
    if(!active.some(d=>candidateIds.has(d.id)))continue;
    const eligible=active.map(d=>stations.filter(s=>s.categories.includes(d.categoryId)).map(s=>s.id));
    if(active.some((d,j)=>!d.categoryId||!eligible[j].length))return false;
    const owners=new Map<string,number>();
    const assign=(j:number,seen:Set<string>):boolean=>{
      for(const id of eligible[j]){if(seen.has(id))continue;seen.add(id);const prior=owners.get(id);if(prior===undefined||assign(prior,seen)){owners.set(id,j);return true;}}
      return false;
    };
    for(let j=0;j<active.length;j++)if(!assign(j,new Set()))return false;
  }
  return true;
}
