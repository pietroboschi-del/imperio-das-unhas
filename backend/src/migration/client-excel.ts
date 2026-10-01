import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import type { ClientBatchPhase, ClientBatchSetInput } from './client-batch.logic';

export type UploadedClientWorkbook = {
  originalname: string;
  mimetype?: string;
  size?: number;
  buffer: Buffer;
};

export type ClientExcelManifest = {
  batchId: string;
  phase: ClientBatchPhase;
  files: Array<{
    unitId: string;
    exportedAt: string;
    sheetName?: string;
    sourceUpdatedAtReliable?: boolean;
  }>;
};

export type ClientExcelInspection = {
  unitId: string;
  fileName: string;
  fileHash: string;
  sheetName: string;
  headers: string[];
  mappedHeaders: Array<{ sourceHeader: string; canonicalKey: string | null }>;
  unmappedHeaders: string[];
  duplicateCanonicalHeaders: string[];
  rowCount: number;
};

const MAX_ENTRIES=512;
const MAX_UNCOMPRESSED_TOTAL=64*1024*1024;
const MAX_ENTRY_SIZE=24*1024*1024;

const xmlDecode=(s:string)=>s
  .replace(/&#x([0-9a-f]+);/gi,(_,x)=>String.fromCodePoint(parseInt(x,16)))
  .replace(/&#([0-9]+);/g,(_,x)=>String.fromCodePoint(parseInt(x,10)))
  .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');

const attr=(attrs:string,name:string)=>{
  const escaped=name.replace(/[.*+?^$()|[\]\\{}]/g,'\\$&');
  const m=attrs.match(new RegExp('(?:^|\\s)'+escaped+'="([^"]*)"','i'));
  return m?xmlDecode(m[1]):null;
};

function findEocd(buf:Buffer){
  const min=Math.max(0,buf.length-0xffff-22);
  for(let i=buf.length-22;i>=min;i--)if(buf.readUInt32LE(i)===0x06054b50)return i;
  throw new Error('Arquivo não é um XLSX/ZIP válido: EOCD ausente');
}

function unzipXlsx(buf:Buffer){
  if(buf.length<4||buf.readUInt32LE(0)!==0x04034b50)throw new Error('Arquivo não é um XLSX válido (assinatura ZIP ausente)');
  const eocd=findEocd(buf);
  const count=buf.readUInt16LE(eocd+10);
  const centralOffset=buf.readUInt32LE(eocd+16);
  if(count>MAX_ENTRIES)throw new Error('XLSX excede o limite de entradas internas');
  const entries=new Map<string,Buffer>();
  let offset=centralOffset,total=0;
  for(let i=0;i<count;i++){
    if(offset+46>buf.length||buf.readUInt32LE(offset)!==0x02014b50)throw new Error('Diretório central XLSX inválido');
    const method=buf.readUInt16LE(offset+10);
    const compressedSize=buf.readUInt32LE(offset+20);
    const uncompressedSize=buf.readUInt32LE(offset+24);
    const nameLen=buf.readUInt16LE(offset+28);
    const extraLen=buf.readUInt16LE(offset+30);
    const commentLen=buf.readUInt16LE(offset+32);
    const localOffset=buf.readUInt32LE(offset+42);
    if([compressedSize,uncompressedSize,localOffset].some(x=>x===0xffffffff))throw new Error('XLSX ZIP64 não suportado neste fluxo');
    if(uncompressedSize>MAX_ENTRY_SIZE)throw new Error('Entrada interna XLSX excede o limite de tamanho');
    total+=uncompressedSize;if(total>MAX_UNCOMPRESSED_TOTAL)throw new Error('XLSX excede o limite descompactado');
    const name=buf.subarray(offset+46,offset+46+nameLen).toString('utf8');
    if(localOffset+30>buf.length||buf.readUInt32LE(localOffset)!==0x04034b50)throw new Error('Cabeçalho local XLSX inválido');
    const localNameLen=buf.readUInt16LE(localOffset+26),localExtraLen=buf.readUInt16LE(localOffset+28);
    const dataStart=localOffset+30+localNameLen+localExtraLen;
    const compressed=buf.subarray(dataStart,dataStart+compressedSize);
    let data:Buffer;
    if(method===0)data=Buffer.from(compressed);
    else if(method===8)data=inflateRawSync(compressed);
    else throw new Error('Compressão XLSX não suportada: método '+method);
    if(data.length!==uncompressedSize)throw new Error('Tamanho XLSX inconsistente em '+name);
    entries.set(name,data);
    offset+=46+nameLen+extraLen+commentLen;
  }
  return entries;
}

function workbookSheets(entries:Map<string,Buffer>){
  const workbook=entries.get('xl/workbook.xml')?.toString('utf8');
  const rels=entries.get('xl/_rels/workbook.xml.rels')?.toString('utf8');
  if(!workbook||!rels)throw new Error('XLSX sem workbook.xml ou relacionamentos');
  const targets=new Map<string,string>();
  for(const m of rels.matchAll(/<Relationship\b([^>]*)\/?\s*>/gi)){
    const id=attr(m[1],'Id'),target=attr(m[1],'Target');
    if(id&&target){
      const resolved=target.startsWith('/')?target.slice(1):posix.normalize(posix.join('xl',target));
      targets.set(id,resolved);
    }
  }
  const sheets:Array<{name:string;path:string}>=[];
  for(const m of workbook.matchAll(/<sheet\b([^>]*)\/?\s*>/gi)){
    const name=attr(m[1],'name');
    const rid=attr(m[1],'r:id')||attr(m[1],'id');
    const target=rid?targets.get(rid):null;
    if(name&&target)sheets.push({name,path:target});
  }
  if(!sheets.length){
    const fallback=[...entries.keys()].filter(x=>/^xl\/worksheets\/sheet\d+\.xml$/i.test(x)).sort();
    if(fallback[0])sheets.push({name:'Sheet1',path:fallback[0]});
  }
  if(!sheets.length)throw new Error('XLSX sem planilhas legíveis');
  return sheets;
}

function sharedStrings(entries:Map<string,Buffer>){
  const xml=entries.get('xl/sharedStrings.xml')?.toString('utf8');
  if(!xml)return [] as string[];
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)].map(m=>
    [...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map(x=>xmlDecode(x[1])).join('')
  );
}

function columnIndex(ref:string){
  const m=ref.match(/^([A-Z]+)\d+$/i);if(!m)return null;
  let n=0;for(const ch of m[1].toUpperCase())n=n*26+(ch.charCodeAt(0)-64);
  return n-1;
}

function cellValue(attrs:string,body:string,strings:string[]){
  const type=attr(attrs,'t');
  if(type==='inlineStr')return [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map(x=>xmlDecode(x[1])).join('');
  const v=body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1];
  if(v==null)return '';
  const decoded=xmlDecode(v);
  if(type==='s'){const idx=Number(decoded);return Number.isInteger(idx)&&idx>=0?strings[idx]??'':'';}
  if(type==='b')return decoded==='1';
  if(type==='str'||type==='e')return decoded;
  const num=Number(decoded);
  return Number.isFinite(num)?num:decoded;
}

function normalizeHeader(header:string){
  return header.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'');
}

const HEADER_ALIASES:Record<string,string>={
  nome:'name',nomedocliente:'name',nomecliente:'name',cliente:'name',razaosocial:'name',
  telefone:'phone',telefone1:'phone',celular:'phone',whatsapp:'phone',fone:'phone',fone1:'phone',
  email:'email',emailcliente:'email',correioeletronico:'email',
  cpf:'cpf',cpfcliente:'cpf',documento:'cpf',documentocliente:'cpf',
  id:'sourceId',idcliente:'sourceId',clienteid:'sourceId',codigo:'sourceId',codigocliente:'sourceId',codcliente:'sourceId',codigodocliente:'sourceId',
  updatedat:'sourceUpdatedAt',dataalteracao:'sourceUpdatedAt',datadealteracao:'sourceUpdatedAt',ultimaalteracao:'sourceUpdatedAt',dataultimaalteracao:'sourceUpdatedAt',atualizadoem:'sourceUpdatedAt',modificacao:'sourceUpdatedAt',
  registrationunitid:'registrationUnitId',unidadedecadastro:'registrationUnitId',unidadecadastro:'registrationUnitId',
  registrationunitproven:'registrationUnitProven',unidadecadastrocomprovada:'registrationUnitProven',
};

function excelSerialToIso(value:number){
  if(!Number.isFinite(value)||value<1||value>100000)return value;
  const ms=Math.round((value-25569)*86400000);
  const d=new Date(ms);return Number.isNaN(d.getTime())?value:d.toISOString();
}

function parseSheet(xml:string,strings:string[]):Array<{rowNumber:number;values:unknown[]}>{
  const rows:Array<{rowNumber:number;values:unknown[]}>=[];let sequential=1;
  for(const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/gi)){
    const rowNumber=Number(attr(rm[1],'r')||sequential)||sequential;sequential=rowNumber+1;
    const values:unknown[]=[];let nextCol=0;
    for(const cm of rm[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)){
      const ref=attr(cm[1],'r');const byRef=ref?columnIndex(ref):null;const idx=byRef??nextCol;nextCol=idx+1;
      values[idx]=cellValue(cm[1],cm[2],strings);
    }
    rows.push({rowNumber,values});
  }
  return rows;
}

export function parseClientWorkbook(buffer:Buffer,requestedSheetName?:string){
  const entries=unzipXlsx(buffer);
  const sheets=workbookSheets(entries);
  const sheet=requestedSheetName?sheets.find(s=>s.name===requestedSheetName):sheets[0];
  if(!sheet)throw new Error('Planilha "'+requestedSheetName+'" não encontrada. Disponíveis: '+sheets.map(s=>s.name).join(', '));
  const xml=entries.get(sheet.path)?.toString('utf8');
  if(!xml)throw new Error('Conteúdo da planilha "'+sheet.name+'" ausente');
  const parsed=parseSheet(xml,sharedStrings(entries));
  const headerRow=parsed.find(r=>r.values.some(v=>String(v??'').trim()!==''));
  if(!headerRow)throw new Error('Planilha "'+sheet.name+'" está vazia');
  const headers=headerRow.values.map(v=>String(v??'').trim());
  const mapping=headers.map(sourceHeader=>({sourceHeader,canonicalKey:sourceHeader?(HEADER_ALIASES[normalizeHeader(sourceHeader)]||null):null}));
  const canonicalCounts=new Map<string,number>();
  for(const m of mapping)if(m.canonicalKey)canonicalCounts.set(m.canonicalKey,(canonicalCounts.get(m.canonicalKey)||0)+1);
  const duplicateCanonicalHeaders=[...canonicalCounts.entries()].filter(([,n])=>n>1).map(([k])=>k).sort();
  const dataRows:Array<Record<string,unknown>>=[];
  for(const row of parsed.filter(r=>r.rowNumber>headerRow.rowNumber)){
    if(!row.values.some(v=>String(v??'').trim()!==''))continue;
    const raw:Record<string,unknown>={sourceRow:row.rowNumber};
    for(let i=0;i<headers.length;i++){
      const h=headers[i];if(!h)continue;
      raw[h]=row.values[i]??'';
    }
    for(const {sourceHeader,canonicalKey} of mapping){
      if(!canonicalKey||!sourceHeader)continue;
      let value=raw[sourceHeader];
      if(canonicalKey==='sourceUpdatedAt'&&typeof value==='number')value=excelSerialToIso(value);
      if((raw[canonicalKey]===undefined||String(raw[canonicalKey]??'').trim()==='')&&String(value??'').trim()!=='')raw[canonicalKey]=value;
    }
    dataRows.push(raw);
  }
  return {
    sheetName:sheet.name,
    headers,
    rows:dataRows,
    mappedHeaders:mapping,
    unmappedHeaders:mapping.filter(x=>x.sourceHeader&&!x.canonicalKey).map(x=>x.sourceHeader),
    duplicateCanonicalHeaders,
  };
}

function parseManifest(body:unknown):ClientExcelManifest{
  const root=body&&typeof body==='object'&&!Array.isArray(body)?body as Record<string,unknown>:{};
  const raw=root.manifest??body;
  let parsed:unknown=raw;
  if(typeof raw==='string'){try{parsed=JSON.parse(raw)}catch{throw new Error('manifest JSON inválido')}}
  const m=parsed as ClientExcelManifest;
  if(!m||typeof m!=='object'||typeof m.batchId!=='string'||!Array.isArray(m.files))throw new Error('manifest inválido');
  if(!['REHEARSAL','PRE_CUTOVER','FINAL'].includes(String(m.phase)))throw new Error('phase inválida no manifest');
  return m;
}

export function buildClientBatchFromExcel(files:UploadedClientWorkbook[],body:unknown){
  const manifest=parseManifest(body);
  if(!Array.isArray(files)||files.length<1||files.length>3)throw new Error('Envie de 1 a 3 arquivos XLSX');
  if(files.length!==manifest.files.length)throw new Error('Quantidade de arquivos não corresponde ao manifest');
  const maxBytes=Math.max(1024*1024,Number(process.env.CLIENT_XLSX_MAX_BYTES||12*1024*1024));
  const inspections:ClientExcelInspection[]=[];
  const batchFiles:ClientBatchSetInput['files']=[];
  for(let i=0;i<files.length;i++){
    const upload=files[i],meta=manifest.files[i];
    if(!upload?.buffer?.length)throw new Error('Arquivo '+(i+1)+' vazio');
    if(upload.buffer.length>maxBytes)throw new Error('Arquivo '+upload.originalname+' excede CLIENT_XLSX_MAX_BYTES');
    if(/\.xls$/i.test(upload.originalname)&&!/\.xlsx$/i.test(upload.originalname))throw new Error('Formato .xls antigo não suportado; exporte como .xlsx');
    const parsed=parseClientWorkbook(upload.buffer,meta.sheetName);
    const fileHash='sha256:'+createHash('sha256').update(upload.buffer).digest('hex');
    batchFiles.push({
      unitId:String(meta.unitId||'').trim(),
      exportedAt:String(meta.exportedAt||'').trim(),
      fileName:String(upload.originalname||('clientes-'+(i+1)+'.xlsx')),
      fileHash,
      sourceUpdatedAtReliable:meta.sourceUpdatedAtReliable===true,
      rows:parsed.rows,
    });
    inspections.push({
      unitId:String(meta.unitId||'').trim(),
      fileName:String(upload.originalname||('clientes-'+(i+1)+'.xlsx')),
      fileHash,
      sheetName:parsed.sheetName,
      headers:parsed.headers,
      mappedHeaders:parsed.mappedHeaders,
      unmappedHeaders:parsed.unmappedHeaders,
      duplicateCanonicalHeaders:parsed.duplicateCanonicalHeaders,
      rowCount:parsed.rows.length,
    });
  }
  const set:ClientBatchSetInput={mode:'CLIENTS_ONLY',batchId:manifest.batchId,phase:manifest.phase,files:batchFiles};
  return {set,inspections};
}
