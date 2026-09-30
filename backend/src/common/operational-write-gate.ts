import { ServiceUnavailableException } from '@nestjs/common';

export function assertOperationalWriteEnabled(unitId?:string,message='Escrita operacional central ainda não habilitada neste ambiente'){
  if(String(process.env.OPERATIONAL_WRITES_ENABLED||'false')!=='true')throw new ServiceUnavailableException(message);
  const allow=String(process.env.OPERATIONAL_WRITES_UNITS||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(allow.length&&unitId&&!allow.includes(unitId)){
    throw new ServiceUnavailableException('Escrita operacional central não habilitada para esta unidade');
  }
}

export function operationalWriteStatus(unitId?:string){
  const enabled=String(process.env.OPERATIONAL_WRITES_ENABLED||'false')==='true';
  const allow=String(process.env.OPERATIONAL_WRITES_UNITS||'').split(',').map(x=>x.trim()).filter(Boolean);
  return {enabled,allowedUnits:allow,unitEnabled:enabled&&(!allow.length||!unitId||allow.includes(unitId))};
}
