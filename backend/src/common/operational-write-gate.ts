import { ServiceUnavailableException } from '@nestjs/common';

export function assertOperationalWriteEnabled(unitId?:string,message='Escrita operacional central ainda não habilitada neste ambiente'){
  if(String(process.env.OPERATIONAL_WRITES_ENABLED||'false')!=='true')throw new ServiceUnavailableException(message);
  const allow=String(process.env.OPERATIONAL_WRITES_UNITS||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(!allow.length||(unitId&&!allow.includes(unitId))){
    throw new ServiceUnavailableException('Escrita operacional central não habilitada para esta unidade');
  }
}

export function operationalWriteStatus(unitId?:string){
  const enabled=String(process.env.OPERATIONAL_WRITES_ENABLED||'false')==='true';
  const allow=String(process.env.OPERATIONAL_WRITES_UNITS||'').split(',').map(x=>x.trim()).filter(Boolean);
  return {enabled,allowedUnits:allow,unitEnabled:enabled&&(!allow.length||!unitId||allow.includes(unitId))};
}

/**
 * Explicit opt-in to configure records without opening real operations.
 * When operations are already authorized for a unit, preserve the existing
 * ability to manage its records. Global product catalog configuration under
 * the setup-only path requires all three canonical units explicitly enabled.
 */
export function assertConfigurationWriteEnabled(unitId?:string){
  const operational=String(process.env.OPERATIONAL_WRITES_ENABLED||'false')==='true';
  const operationalUnits=String(process.env.OPERATIONAL_WRITES_UNITS||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(operational&&operationalUnits.length>0&&(!unitId||operationalUnits.includes(unitId)))return;
  const setup=String(process.env.SETUP_WRITES_ENABLED||'false')==='true';
  const setupUnits=String(process.env.SETUP_WRITES_UNITS||'').split(',').map(x=>x.trim()).filter(Boolean);
  const setupScopeAllowed=unitId
    ? setupUnits.includes(unitId)
    : ['centro','big','shopping-contagem'].every(id=>setupUnits.includes(id));
  if(!setup||!setupUnits.length||!setupScopeAllowed){
    throw new ServiceUnavailableException('Cadastro definitivo ainda não autorizado para esta unidade');
  }
}
