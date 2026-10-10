import {BadRequestException, Body, ConflictException, Controller, Get, Put, Req} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {PrismaService} from '../prisma/prisma.service';
import {Authenticated} from '../common/authenticated.decorator';
import {NetworkAdmin} from '../common/network-admin.decorator';
import type {ImperioRequest} from '../common/request-context';

type ClientSourceOption={id:string;label:string;active:boolean;order:number;isDefault:boolean;previousLabels:string[]};
const DEFAULT_LABELS=['Instagram','Google','Indicação','Passou na frente','Já conhecia','Inteligência Artificial','Outro'];
const DEFAULT_OPTIONS:ClientSourceOption[]=DEFAULT_LABELS.map((label,i)=>({
  id:'as'+(i+1),label,active:true,order:(i+1)*10,isDefault:false,previousLabels:[],
}));
function object(v:unknown):Record<string,any>{return v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{}}
function currentOptions(value:unknown):ClientSourceOption[]{
  const rows=object(value).options;
  return Array.isArray(rows)?rows.map(o=>({
    id:String(o.id),label:String(o.label),active:o.active!==false,order:Number(o.order||0),
    isDefault:o.isDefault===true,previousLabels:Array.isArray(o.previousLabels)?o.previousLabels.map(String):[],
  })):DEFAULT_OPTIONS.map(o=>({...o,previousLabels:[]}));
}
function validate(body:any):ClientSourceOption[]{
  if(!body||!Array.isArray(body.options)||body.options.length<1||body.options.length>80)
    throw new BadRequestException('Informe de 1 a 80 opções de origem');
  const ids=new Set<string>(),labels=new Set<string>();let defaults=0;
  const list:ClientSourceOption[]=body.options.map((raw:any,i:number)=>{
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Opção inválida');
    const id=String(raw.id||'').trim(),label=String(raw.label||'').trim();
    if(!/^[a-zA-Z0-9_-]{1,90}$/.test(id)||label.length<1||label.length>100)
      throw new BadRequestException('Código ou nome de opção inválido');
    const normalized=label.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    if(ids.has(id)||labels.has(normalized))throw new ConflictException('Códigos ou nomes repetidos');
    ids.add(id);labels.add(normalized);
    if(typeof raw.active!=='boolean')throw new BadRequestException('Ativação inválida');
    const active=raw.active;
    const isDefault=raw.isDefault===true;
    if(isDefault&&!active)throw new BadRequestException('Opção padrão deve estar ativa');
    if(isDefault)defaults++;
    const history=Array.isArray(raw.previousLabels)?raw.previousLabels:[];
    if(history.length>30||history.some((x:any)=>typeof x!=='string'||x.length>100))
      throw new BadRequestException('Histórico de opção inválido');
    return {id,label,active,isDefault,order:(i+1)*10,previousLabels:history as string[]};
  });
  if(!list.some(x=>x.active))throw new BadRequestException('Mantenha pelo menos uma opção ativa');
  if(defaults>1)throw new BadRequestException('Apenas uma opção pode ser padrão');
  return list;
}

/** One network-wide source of truth, no unit overrides and no rewrite of existing Client history. */
@Controller('api/v1/config/client-sources')
export class ClientSourceConfigController{
  constructor(private readonly prisma:PrismaService){}
  @Authenticated()
  @Get()
  async get(){
    const row=await this.prisma.clientSourceConfig.findUnique({where:{id:'network'}});
    return {scope:'network',version:row?.version??0,options:currentOptions(row?.value)};
  }

  @NetworkAdmin()
  @Put()
  async put(@Body() body:any,@Req() req:ImperioRequest){
    if(!Number.isSafeInteger(body?.expectedVersion)||body.expectedVersion<0)
      throw new BadRequestException('Versão anterior obrigatória');
    const options=validate(body);
    return this.prisma.$transaction(async tx=>{
      const current=await tx.clientSourceConfig.findUnique({where:{id:'network'}});
      const version=current?.version??0;
      if(version!==body.expectedVersion)throw new ConflictException('Configuração alterada por outro administrador. Recarregue as opções.');
      const row=await tx.clientSourceConfig.upsert({
        where:{id:'network'},
        create:{id:'network',value:{options} as Prisma.InputJsonValue,version:1},
        update:{value:{options} as Prisma.InputJsonValue,version:{increment:1}},
      });
      await tx.auditEvent.create({data:{
        id:randomUUID(),userId:req.principal?.userId||null,unitId:null,
        action:'clients.source_options.updated',entityType:'ClientSourceConfig',entityId:'network',
        legacyPayload:{beforeVersion:version,afterVersion:row.version,optionCount:options.length} as Prisma.InputJsonValue,
        occurredAt:new Date(),
      }});
      return {scope:'network',version:row.version,options};
    });
  }
}
