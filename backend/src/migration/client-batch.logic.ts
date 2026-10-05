import { createHash } from 'node:crypto';

export type ClientBatchPhase = 'REHEARSAL' | 'PRE_CUTOVER' | 'FINAL';
export type ClientBatchFileInput = {
  unitId: string;
  exportedAt: string;
  fileName: string;
  fileHash: string;
  sourceUpdatedAtReliable?: boolean;
  parserVersion?: string;
  rows: Array<Record<string, unknown>>;
};
export type ClientBatchSetInput = {
  mode: 'CLIENTS_ONLY';
  batchId: string;
  phase: ClientBatchPhase;
  files: ClientBatchFileInput[];
};
export type ClientSourceMeta = {
  batchId: string;
  phase: ClientBatchPhase;
  unitId: string;
  exportedAt: string;
  fileName: string;
  fileHash: string;
  sourceRow: number;
  sourceId: string | null;
  sourceUpdatedAtReliable: boolean;
};
export type ClientLegacyProfile = {
  birthDate: string | null;
  phoneFixed: string | null;
  gender: string | null;
  referralSource: string | null;
  postalCode: string | null;
  addressLine: string | null;
  addressNumber: string | null;
  state: string | null;
  city: string | null;
  addressComplement: string | null;
  neighborhood: string | null;
  profession: string | null;
  sourceCreatedAt: string | null;
  notes: string | null;
  rg: string | null;
};
export type NormalizedClientRow = {
  source: ClientSourceMeta;
  name: string | null;
  nameKey: string | null;
  phone: string | null;
  email: string | null;
  cpf: string | null;
  registrationUnitId: string | null;
  registrationUnitProven: boolean;
  sourceUpdatedAt: string | null;
  legacyProfile: ClientLegacyProfile;
  fingerprint: string;
  raw: Record<string, unknown>;
};
export type CentralClientSnapshot = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  registrationUnitId: string | null;
  updatedAt: string;
  legacyPayload: unknown;
  unitIds: string[];
};
export type PreviousUnitSnapshot = { batchId: string | null; rows: NormalizedClientRow[] };
export type PreviousSnapshots = Record<string, PreviousUnitSnapshot | undefined>;
export type ClientField = 'name' | 'phone' | 'email' | 'cpf' | 'registrationUnitId';
export type ClientConflict = {
  clusterId: string;
  type: 'SOURCE_FIELD_CONFLICT' | 'CENTRAL_FIELD_CONFLICT' | 'MULTIPLE_STRONG_MATCHES' | 'AMBIGUOUS_WEAK_MATCH' | 'MISSING_REQUIRED_NAME';
  field?: ClientField;
  centralValue?: string | null;
  sourceValue?: string | null;
  candidateClientIds?: string[];
  candidateClusterIds?: string[];
  sourceAppearsNewer?: boolean;
  resolution: 'REVIEW_REQUIRED';
};
export type ClientClusterPlan = {
  clusterId: string;
  sourceRows: ClientSourceMeta[];
  source: {
    name: string | null;
    phone: string | null;
    email: string | null;
    cpf: string | null;
    registrationUnitId: string | null;
    registrationUnitProven: boolean;
    latestReliableUpdatedAt: string | null;
  };
  targetClientId: string | null;
  action: 'CREATE' | 'UPDATE_SAFE' | 'UNCHANGED' | 'REVIEW_REQUIRED';
  safeFills: Partial<Record<ClientField, string>>;
  unitLinksToAdd: string[];
  conflicts: ClientConflict[];
};
export type ClientBatchReport = {
  mode: 'CLIENTS_ONLY';
  batchId: string;
  phase: ClientBatchPhase;
  files: Array<{
    unitId: string;
    exportedAt: string;
    fileName: string;
    fileHash: string;
    rows: number;
    comparedToBatchId: string | null;
    snapshotDiff: { new: number; changed: number; unchanged: number; missingFromNewSnapshot: number };
  }>;
  crossUnit: { clusters: number; multiUnitClusters: number; reviewRequiredClusters: number };
  summary: { creates: number; safeUpdates: number; unchanged: number; reviewRequired: number; conflicts: number; unitLinksToAdd: number };
  plans: ClientClusterPlan[];
  conflicts: ClientConflict[];
  invariants: {
    previousBatchesAreAuditOnly: true;
    missingRowsNeverDeleteCentralClients: true;
    phoneAloneNeverAutoMerges: true;
    centralNonEmptyValuesPreservedByDefault: true;
    registrationUnitNeverInferredFromFileUnit: true;
  };
  reportHash: string;
};

export const CANONICAL_CLIENT_UNIT_IDS=['centro','big','shopping-contagem'] as const;
const CANONICAL_CLIENT_UNIT_SET=new Set<string>(CANONICAL_CLIENT_UNIT_IDS);

const asText=(v:unknown)=>typeof v==='string'?v.trim():v==null?'':String(v).trim();
const first=(row:Record<string,unknown>,keys:string[])=>{for(const k of keys){const v=row[k];if(v!==undefined&&v!==null&&asText(v)!=='')return v;}return null;};
const stable=(v:unknown):unknown=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,stable(x)])):v;
export const sha256Json=(v:unknown)=>`sha256:${createHash('sha256').update(JSON.stringify(stable(v))).digest('hex')}`;
export const normalizeName=(v:unknown)=>{const s=asText(v).replace(/\s+/g,' ');return s||null;};
export const normalizeNameKey=(v:unknown)=>{const s=normalizeName(v);return s?s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR'):null;};
export const normalizePhone=(v:unknown)=>{const d=asText(v).replace(/\D/g,'');if(!d)return null;if(d.startsWith('55')&&d.length>=12)return `+${d}`;if(d.length===10||d.length===11)return `+55${d}`;return `+${d}`;};
export const normalizeEmail=(v:unknown)=>{const s=asText(v).toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)?s:null;};
export const normalizeCpf=(v:unknown)=>{const d=asText(v).replace(/\D/g,'');return d.length===11&&!/^(\d)\1{10}$/.test(d)?d:null;};

const NAME_PARTICLES=new Set(['de','da','do','das','dos','e']);
const nameTokens=(v:unknown)=>{
  const key=normalizeNameKey(v);if(!key)return [];
  return key.split(/\s+/).filter(x=>x&&!NAME_PARTICLES.has(x));
};
const levenshteinDistance=(a:string,b:string)=>{
  if(a===b)return 0;if(!a.length)return b.length;if(!b.length)return a.length;
  let prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const cur=new Array<number>(b.length+1);cur[0]=i;
    for(let j=1;j<=b.length;j++)cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
    prev=cur;
  }
  return prev[b.length];
};
export const probableSameName=(a:unknown,b:unknown)=>{
  const ka=normalizeNameKey(a),kb=normalizeNameKey(b);if(!ka||!kb)return false;if(ka===kb)return true;
  const maxLen=Math.max(ka.length,kb.length);const similarity=maxLen?1-levenshteinDistance(ka,kb)/maxLen:0;
  const ta=nameTokens(a),tb=nameTokens(b);if(!ta.length||!tb.length)return similarity>=0.84;
  const sa=new Set(ta),sb=new Set(tb),intersection=[...sa].filter(x=>sb.has(x)).length;
  const overlap=intersection/Math.min(sa.size,sb.size);
  const firstSame=ta[0]===tb[0],lastSame=ta.at(-1)===tb.at(-1);
  const contained=ka.length>=5&&kb.length>=5&&(ka.includes(kb)||kb.includes(ka));
  return similarity>=0.84||contained||(firstSame&&lastSame)||(firstSame&&overlap>=0.67);
};

const normalizedText=(v:unknown)=>{const s=asText(v).replace(/\s+/g,' ');return s||null;};
const nonZeroText=(v:unknown)=>{const s=asText(v);if(!s||/^0+(?:[.,]0+)?$/.test(s))return null;return s;};
const normalizePostalCode=(v:unknown)=>{const d=asText(v).replace(/\D/g,'');return d.length===8?`${d.slice(0,5)}-${d.slice(5)}`:null;};
const normalizePtBrDate=(v:unknown,allowDayMonth=false)=>{
  const s=asText(v);if(!s)return null;
  let m=s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if(!m)return null;
  const day=Number(m[1]),month=Number(m[2]),year=m[3]?Number(m[3]):null;
  if(month<1||month>12||day<1||day>31)return null;
  if(year===null)return allowDayMonth?`${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}`:null;
  if(year<1800||year>2100)return null;
  const d=new Date(Date.UTC(year,month-1,day));
  if(d.getUTCFullYear()!==year||d.getUTCMonth()!==month-1||d.getUTCDate()!==day)return null;
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
};
const isoOrNull=(v:unknown)=>{
  const s=asText(v);if(!s)return null;
  const br=normalizePtBrDate(s,false);if(br)return `${br}T00:00:00.000Z`;
  const d=new Date(s);return Number.isNaN(d.getTime())?null:d.toISOString();
};

export function assertClientBatchSet(input: unknown): asserts input is ClientBatchSetInput {
  const x=input as ClientBatchSetInput;
  if(!x||x.mode!=='CLIENTS_ONLY')throw new Error('mode deve ser CLIENTS_ONLY');
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{2,119}$/.test(asText(x.batchId)))throw new Error('batchId inválido');
  if(!['REHEARSAL','PRE_CUTOVER','FINAL'].includes(x.phase))throw new Error('phase inválida');
  if(!Array.isArray(x.files)||x.files.length<1||x.files.length>3)throw new Error('files deve conter de 1 a 3 exportações');
  const units=new Set<string>();
  for(const file of x.files){
    const unitId=asText(file?.unitId);if(!unitId)throw new Error('unitId obrigatório');if(!CANONICAL_CLIENT_UNIT_SET.has(unitId))throw new Error(`unitId não canônico para CLIENTS_ONLY: ${unitId}`);if(units.has(unitId))throw new Error(`unidade duplicada no batch: ${unitId}`);units.add(unitId);
    if(!asText(file.fileName))throw new Error(`fileName obrigatório em ${unitId}`);
    if(!/^sha256:[0-9a-f]{64}$/i.test(asText(file.fileHash)))throw new Error(`fileHash SHA-256 inválido em ${unitId}`);
    if(!isoOrNull(file.exportedAt))throw new Error(`exportedAt inválido em ${unitId}`);
    if(!Array.isArray(file.rows))throw new Error(`rows inválido em ${unitId}`);
  }
}

export function normalizeBatchSet(input: ClientBatchSetInput): NormalizedClientRow[] {
  assertClientBatchSet(input);
  const out:NormalizedClientRow[]=[];
  for(const file of [...input.files].sort((a,b)=>a.unitId.localeCompare(b.unitId))){
    file.rows.forEach((raw,index)=>{
      const sourceRowRaw=first(raw,['sourceRow','rowNumber','row']);
      const sourceRow=Number.isInteger(Number(sourceRowRaw))&&Number(sourceRowRaw)>0?Number(sourceRowRaw):index+2;
      const sourceIdValue=first(raw,['sourceId','id','clientId','clienteId','codigo','código']);
      const sourceId=sourceIdValue==null?null:asText(sourceIdValue)||null;
      const name=normalizeName(first(raw,['name','nome','cliente','clientName']));
      const phone=normalizePhone(first(raw,['phone','celular','whatsapp','mobile','phoneFixed','telefone']));
      const email=normalizeEmail(first(raw,['email','e-mail','mail']));
      const cpf=normalizeCpf(first(raw,['cpf','document','documento']));
      const reg=first(raw,['registrationUnitId','registrationUnit','unidadeCadastro']);
      const registrationUnitId=reg==null?null:asText(reg)||null;
      const provenRaw=first(raw,['registrationUnitProven','registrationUnitReliable','unidadeCadastroComprovada']);
      const registrationUnitProven=provenRaw===true||asText(provenRaw).toLowerCase()==='true'||asText(provenRaw)==='1';
      const sourceUpdatedAt=isoOrNull(first(raw,['updatedAt','modifiedAt','dataAlteracao','ultimaAlteracao']));
      const legacyProfile:ClientLegacyProfile={
        birthDate:normalizePtBrDate(first(raw,['birthDate','aniversario','nascimento']),true),
        phoneFixed:normalizePhone(first(raw,['phoneFixed','telefone','fone'])),
        gender:normalizedText(first(raw,['gender','sexo','genero'])),
        referralSource:normalizedText(first(raw,['referralSource','comoConheceu','origemCliente'])),
        postalCode:normalizePostalCode(first(raw,['postalCode','cep'])),
        addressLine:normalizedText(first(raw,['addressLine','endereco','logradouro'])),
        addressNumber:nonZeroText(first(raw,['addressNumber','numero'])),
        state:normalizedText(first(raw,['state','estado','uf']))?.toUpperCase()||null,
        city:normalizedText(first(raw,['city','cidade'])),
        addressComplement:normalizedText(first(raw,['addressComplement','complemento'])),
        neighborhood:normalizedText(first(raw,['neighborhood','bairro'])),
        profession:normalizedText(first(raw,['profession','profissao'])),
        sourceCreatedAt:normalizePtBrDate(first(raw,['sourceCreatedAt','cadastrado','dataCadastro']),false),
        notes:normalizedText(first(raw,['notes','obs','observacao','observacoes'])),
        rg:normalizedText(first(raw,['rg'])),
      };
      const normalizedCore={name,nameKey:normalizeNameKey(name),phone,email,cpf,registrationUnitId:registrationUnitProven?registrationUnitId:null,registrationUnitProven,sourceUpdatedAt,legacyProfile};
      out.push({
        source:{batchId:input.batchId,phase:input.phase,unitId:file.unitId,exportedAt:new Date(file.exportedAt).toISOString(),fileName:file.fileName,fileHash:file.fileHash.toLowerCase(),sourceRow,sourceId,sourceUpdatedAtReliable:file.sourceUpdatedAtReliable===true},
        ...normalizedCore,
        fingerprint:sha256Json(normalizedCore),raw,
      });
    });
  }
  return out;
}

const strongKeys=(r:Pick<NormalizedClientRow,'cpf'|'email'|'phone'|'nameKey'>)=>{
  const keys:string[]=[];
  if(r.cpf)keys.push(`cpf:${r.cpf}`);
  if(r.email&&r.nameKey)keys.push(`email-name:${r.email}|${r.nameKey}`);
  if(r.phone&&r.nameKey)keys.push(`phone-name:${r.phone}|${r.nameKey}`);
  return keys;
};
const sourceSnapshotKey=(r:NormalizedClientRow)=>r.source.sourceId?`source:${r.source.sourceId}`:strongKeys(r)[0]||`row:${r.source.sourceRow}`;

export function compareSnapshots(current:NormalizedClientRow[],previous:NormalizedClientRow[]){
  const prev=new Map(previous.map(r=>[sourceSnapshotKey(r),r]));
  let fresh=0,changed=0,unchanged=0;
  const seen=new Set<string>();
  for(const row of current){const key=sourceSnapshotKey(row);seen.add(key);const old=prev.get(key);if(!old)fresh++;else if(old.fingerprint===row.fingerprint)unchanged++;else changed++;}
  const missing=[...prev.keys()].filter(k=>!seen.has(k)).length;
  return {new:fresh,changed,unchanged,missingFromNewSnapshot:missing};
}

function legacyObject(v:unknown):Record<string,unknown>{return v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};}
function centralCpf(c:CentralClientSnapshot){const root=legacyObject(c.legacyPayload);const co=legacyObject(root.clientsOnly);return normalizeCpf(co.cpf??root.cpf);}
function provenanceMatches(c:CentralClientSnapshot,row:NormalizedClientRow){
  if(!row.source.sourceId)return false;
  const root=legacyObject(c.legacyPayload),co=legacyObject(root.clientsOnly),sources=Array.isArray(co.sources)?co.sources:[];
  return sources.some(x=>{const s=legacyObject(x);return asText(s.unitId)===row.source.unitId&&asText(s.sourceId)===row.source.sourceId;});
}

class UnionFind{p:number[];constructor(n:number){this.p=Array.from({length:n},(_,i)=>i);}find(x:number):number{return this.p[x]===x?x:(this.p[x]=this.find(this.p[x]));}union(a:number,b:number){a=this.find(a);b=this.find(b);if(a!==b)this.p[b]=a;}}
const sourceMetaKey=(s:ClientSourceMeta)=>`${s.unitId}|${String(s.sourceRow).padStart(12,'0')}|${s.sourceId||''}|${s.fileHash}`;
const compareNormalizedRows=(a:NormalizedClientRow,b:NormalizedClientRow)=>sourceMetaKey(a.source).localeCompare(sourceMetaKey(b.source))||a.fingerprint.localeCompare(b.fingerprint);
const compareConflicts=(a:ClientConflict,b:ClientConflict)=>
  a.clusterId.localeCompare(b.clusterId)||
  String(a.field||'').localeCompare(String(b.field||''))||
  a.type.localeCompare(b.type)||
  String(a.centralValue||'').localeCompare(String(b.centralValue||''))||
  String(a.sourceValue||'').localeCompare(String(b.sourceValue||''))||
  (a.candidateClientIds||[]).join('|').localeCompare((b.candidateClientIds||[]).join('|'))||
  (a.candidateClusterIds||[]).join('|').localeCompare((b.candidateClusterIds||[]).join('|'));
function clusterRows(rows:NormalizedClientRow[]){
  const ordered=[...rows].sort(compareNormalizedRows);
  const uf=new UnionFind(ordered.length),byKey=new Map<string,number>();
  ordered.forEach((r,i)=>{for(const key of strongKeys(r)){const seen=byKey.get(key);if(seen!==undefined)uf.union(i,seen);else byKey.set(key,i);}});
  const groups=new Map<number,NormalizedClientRow[]>();ordered.forEach((r,i)=>{const k=uf.find(i);groups.set(k,[...(groups.get(k)||[]),r]);});
  return [...groups.values()].map(g=>g.sort(compareNormalizedRows)).sort((a,b)=>sourceMetaKey(a[0].source).localeCompare(sourceMetaKey(b[0].source)));
}
function uniqueNonEmpty(values:Array<string|null>){return [...new Set(values.filter((x):x is string=>!!x))];}
function latestReliable(rows:NormalizedClientRow[]){const xs=rows.filter(r=>r.source.sourceUpdatedAtReliable&&r.sourceUpdatedAt).map(r=>r.sourceUpdatedAt as string).sort();return xs.at(-1)||null;}

export function reconcileClientBatch(input:ClientBatchSetInput,previous:PreviousSnapshots,central:CentralClientSnapshot[]):ClientBatchReport{
  const rows=normalizeBatchSet(input);
  const centralNorm=[...central].sort((a,b)=>a.id.localeCompare(b.id)).map(c=>({...c,nameKey:normalizeNameKey(c.name),phoneN:normalizePhone(c.phone),emailN:normalizeEmail(c.email),cpfN:centralCpf(c)}));
  const strongMap=new Map<string,Set<string>>(),phoneMap=new Map<string,Set<string>>(),emailMap=new Map<string,Set<string>>();
  const add=(m:Map<string,Set<string>>,k:string|null,id:string)=>{if(!k)return;const s=m.get(k)||new Set<string>();s.add(id);m.set(k,s);};
  for(const c of centralNorm){for(const k of strongKeys({cpf:c.cpfN,email:c.emailN,phone:c.phoneN,nameKey:c.nameKey}))add(strongMap,k,c.id);add(phoneMap,c.phoneN,c.id);add(emailMap,c.emailN,c.id);}
  const byId=new Map(centralNorm.map(c=>[c.id,c]));
  const plans:ClientClusterPlan[]=[];
  for(const group of clusterRows(rows)){
    const locators=group.map(r=>`${r.source.unitId}|${r.source.fileHash}|${r.source.sourceRow}|${r.source.sourceId||''}`).sort();
    const clusterId=`cluster:${sha256Json(locators).slice(7,31)}`;
    const names=uniqueNonEmpty(group.map(r=>r.name)),phones=uniqueNonEmpty(group.map(r=>r.phone)),emails=uniqueNonEmpty(group.map(r=>r.email)),cpfs=uniqueNonEmpty(group.map(r=>r.cpf));
    const provenRegs=uniqueNonEmpty(group.filter(r=>r.registrationUnitProven).map(r=>r.registrationUnitId));
    const source={name:names[0]||null,phone:phones[0]||null,email:emails[0]||null,cpf:cpfs[0]||null,registrationUnitId:provenRegs[0]||null,registrationUnitProven:provenRegs.length===1,latestReliableUpdatedAt:latestReliable(group)};
    const conflicts:ClientConflict[]=[];
    const sourceFields:[[ClientField,string[]]]|Array<[ClientField,string[]]>=[['name',names],['phone',phones],['email',emails],['cpf',cpfs],['registrationUnitId',provenRegs]];
    for(const [field,vals] of sourceFields)if(vals.length>1)conflicts.push({clusterId,type:'SOURCE_FIELD_CONFLICT',field,sourceValue:vals.join(' | '),resolution:'REVIEW_REQUIRED'});
    if(!source.name)conflicts.push({clusterId,type:'MISSING_REQUIRED_NAME',field:'name',sourceValue:null,resolution:'REVIEW_REQUIRED'});

    const strongCandidates=new Set<string>();
    for(const r of group){for(const c of centralNorm)if(provenanceMatches(c,r))strongCandidates.add(c.id);for(const key of strongKeys(r))for(const id of strongMap.get(key)||[])strongCandidates.add(id);}
    let targetClientId:string|null=null;
    if(strongCandidates.size===1)targetClientId=[...strongCandidates][0];
    else if(strongCandidates.size>1)conflicts.push({clusterId,type:'MULTIPLE_STRONG_MATCHES',candidateClientIds:[...strongCandidates].sort(),resolution:'REVIEW_REQUIRED'});
    if(!targetClientId&&strongCandidates.size===0){
      const weakEvidence=new Map<string,{field:'phone'|'email';value:string;ids:Set<string>}>();
      const addWeak=(field:'phone'|'email',value:string,id:string)=>{
        const key=`${field}:${value}`,entry=weakEvidence.get(key)||{field,value,ids:new Set<string>()};entry.ids.add(id);weakEvidence.set(key,entry);
      };
      for(const r of group){
        if(r.phone)for(const id of phoneMap.get(r.phone)||[]){const c=byId.get(id);if(c&&probableSameName(r.name,c.name))addWeak('phone',r.phone,id);}
        if(r.email)for(const id of emailMap.get(r.email)||[]){const c=byId.get(id);if(c&&probableSameName(r.name,c.name))addWeak('email',r.email,id);}
      }
      for(const e of weakEvidence.values())if(e.ids.size)conflicts.push({clusterId,type:'AMBIGUOUS_WEAK_MATCH',field:e.field,sourceValue:e.value,candidateClientIds:[...e.ids].sort(),resolution:'REVIEW_REQUIRED'});
    }

    const safeFills:Partial<Record<ClientField,string>>={};const units=[...new Set(group.map(r=>r.source.unitId))].sort();let unitLinksToAdd=[...units];
    if(targetClientId){
      const c=byId.get(targetClientId)!;unitLinksToAdd=units.filter(u=>!c.unitIds.includes(u));
      const compare:Array<[ClientField,string|null,string|null]>=[['name',normalizeName(c.name),source.name],['phone',normalizePhone(c.phone),source.phone],['email',normalizeEmail(c.email),source.email],['cpf',c.cpfN,source.cpf]];
      if(source.registrationUnitProven)compare.push(['registrationUnitId',c.registrationUnitId,source.registrationUnitId]);
      for(const [field,cv,sv] of compare){if(!sv)continue;if(!cv){safeFills[field]=sv;continue;}if(cv!==sv){const newer=!!source.latestReliableUpdatedAt&&new Date(source.latestReliableUpdatedAt).getTime()>new Date(c.updatedAt).getTime();conflicts.push({clusterId,type:'CENTRAL_FIELD_CONFLICT',field,centralValue:cv,sourceValue:sv,sourceAppearsNewer:newer,resolution:'REVIEW_REQUIRED'});}}
    }
    const action:ClientClusterPlan['action']=conflicts.length?'REVIEW_REQUIRED':targetClientId?(Object.keys(safeFills).length||unitLinksToAdd.length?'UPDATE_SAFE':'UNCHANGED'):'CREATE';
    const plan={clusterId,sourceRows:group.map(r=>r.source),source,targetClientId,action,safeFills,unitLinksToAdd,conflicts};plans.push(plan);
  }
  const weakSource=new Map<string,{field:'phone'|'email';value:string;ids:string[]}>();
  for(const p of plans){
    for(const [field,value] of [['phone',p.source.phone],['email',p.source.email]] as Array<['phone'|'email',string|null]>){
      if(!value)continue;const key=`${field}:${value}`,entry=weakSource.get(key)||{field,value,ids:[]};entry.ids.push(p.clusterId);weakSource.set(key,entry);
    }
  }
  const plansById=new Map(plans.map(p=>[p.clusterId,p]));
  for(const entry of weakSource.values()){
    const uniq=[...new Set(entry.ids)].sort();if(uniq.length<2)continue;
    for(const id of uniq){
      const p=plansById.get(id)!;
      const candidates=uniq.filter(other=>other!==id&&probableSameName(p.source.name,plansById.get(other)?.source.name));
      if(!candidates.length)continue;
      p.conflicts.push({clusterId:id,type:'AMBIGUOUS_WEAK_MATCH',field:entry.field,sourceValue:entry.value,candidateClusterIds:candidates,resolution:'REVIEW_REQUIRED'});
      p.action='REVIEW_REQUIRED';
    }
  }
  for(const p of plans){
    p.sourceRows.sort((a,b)=>sourceMetaKey(a).localeCompare(sourceMetaKey(b)));
    p.unitLinksToAdd.sort();
    p.conflicts.sort(compareConflicts);
  }
  plans.sort((a,b)=>a.clusterId.localeCompare(b.clusterId));const allConflicts=plans.flatMap(p=>p.conflicts).sort(compareConflicts);
  const fileReports=[...input.files].sort((a,b)=>a.unitId.localeCompare(b.unitId)).map(file=>{const current=rows.filter(r=>r.source.unitId===file.unitId),prev=previous[file.unitId];return {unitId:file.unitId,exportedAt:new Date(file.exportedAt).toISOString(),fileName:file.fileName,fileHash:file.fileHash.toLowerCase(),rows:current.length,comparedToBatchId:prev?.batchId||null,snapshotDiff:compareSnapshots(current,prev?.rows||[])};});
  const core={mode:'CLIENTS_ONLY' as const,batchId:input.batchId,phase:input.phase,files:fileReports,crossUnit:{clusters:plans.length,multiUnitClusters:plans.filter(p=>new Set(p.sourceRows.map(x=>x.unitId)).size>1).length,reviewRequiredClusters:plans.filter(p=>p.action==='REVIEW_REQUIRED').length},summary:{creates:plans.filter(p=>p.action==='CREATE').length,safeUpdates:plans.filter(p=>p.action==='UPDATE_SAFE').length,unchanged:plans.filter(p=>p.action==='UNCHANGED').length,reviewRequired:plans.filter(p=>p.action==='REVIEW_REQUIRED').length,conflicts:allConflicts.length,unitLinksToAdd:plans.reduce((n,p)=>n+p.unitLinksToAdd.length,0)},plans,conflicts:allConflicts,invariants:{previousBatchesAreAuditOnly:true as const,missingRowsNeverDeleteCentralClients:true as const,phoneAloneNeverAutoMerges:true as const,centralNonEmptyValuesPreservedByDefault:true as const,registrationUnitNeverInferredFromFileUnit:true as const}};
  return {...core,reportHash:sha256Json(core)};
}
