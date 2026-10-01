import assert from 'node:assert/strict';
import { applyClientHeaderMapping, mapClientHeaders } from '../src/migration/client-excel.ts';
import { normalizeBatchSet, reconcileClientBatch } from '../src/migration/client-batch.logic.ts';

let tests=0;
const ok=(v,m)=>{tests++;assert.ok(v,m)};
const eq=(a,b,m)=>{tests++;assert.deepEqual(a,b,m)};
const H=n=>'sha256:'+String(n).padStart(64,'0');

const headers=[
  'Cliente','Código','Aniversário','Telefone','Celular','E-mail','Sexo','Como Conheceu',
  'CPF','CEP','Endereço','Número','Estado','Cidade','Complemento','Bairro','Profissão',
  'Cadastrado','Obs','RG'
];

const mapping=mapClientHeaders(headers);
const byHeader=Object.fromEntries(mapping.map(x=>[x.sourceHeader,x.canonicalKey]));
eq(byHeader['Cliente'],'name','Cliente -> name');
eq(byHeader['Código'],'sourceId','Código -> sourceId somente para auditoria/proveniência');
eq(byHeader['Aniversário'],'birthDate','Aniversário -> birthDate');
eq(byHeader['Telefone'],'phoneFixed','Telefone -> fixo secundário');
eq(byHeader['Celular'],'phone','Celular -> telefone principal');
eq(byHeader['E-mail'],'email','E-mail -> email');
eq(byHeader['Sexo'],'gender','Sexo preservado');
eq(byHeader['Como Conheceu'],'referralSource','Como Conheceu preservado');
eq(byHeader['CPF'],'cpf','CPF -> cpf');
eq(byHeader['CEP'],'postalCode','CEP preservado');
eq(byHeader['Endereço'],'addressLine','Endereço preservado');
eq(byHeader['Número'],'addressNumber','Número preservado');
eq(byHeader['Estado'],'state','Estado preservado');
eq(byHeader['Cidade'],'city','Cidade preservada');
eq(byHeader['Complemento'],'addressComplement','Complemento preservado');
eq(byHeader['Bairro'],'neighborhood','Bairro preservado');
eq(byHeader['Profissão'],'profession','Profissão preservada');
eq(byHeader['Cadastrado'],'sourceCreatedAt','Cadastrado -> data de criação na origem');
eq(byHeader['Obs'],'notes','Obs preservada');
eq(byHeader['RG'],'rg','RG preservado');
ok(mapping.every(x=>x.canonicalKey),'todos os 20 cabeçalhos reais do Avec são reconhecidos');

const raw=applyClientHeaderMapping({
  Cliente:'CLIENTE TESTE',
  'Código':33297858,
  'Aniversário':'21/6/1982',
  'Telefone':3133920040,
  'Celular':31984444949,
  'E-mail':'TESTE@EXAMPLE.COM',
  'Sexo':'F',
  'Como Conheceu':'INTERNET',
  'CPF':'014.208.396-83',
  'CEP':'32041-780',
  'Endereço':'Rua Teste',
  'Número':0,
  'Estado':'mg',
  'Cidade':'Contagem',
  'Complemento':'Apto 1',
  'Bairro':'Centro',
  'Profissão':'Professora',
  'Cadastrado':'24/12/2024',
  'Obs':'Observação de teste',
  'RG':'MG-123',
},mapping);

eq(raw.phone,31984444949,'Celular vence telefone fixo como principal');
eq(raw.phoneFixed,3133920040,'fixo permanece preservado');
eq(raw.sourceCreatedAt,'24/12/2024','Cadastrado não é confundido com alteração');
ok(raw.sourceUpdatedAt===undefined,'Cadastrado nunca cria sourceUpdatedAt');

const rows=normalizeBatchSet({
  mode:'CLIENTS_ONLY',
  batchId:'BATCH_AVEC_LAYOUT',
  phase:'REHEARSAL',
  files:[{
    unitId:'centro',
    exportedAt:'2026-10-01T14:40:00-03:00',
    fileName:'avec-clientes.xlsx',
    fileHash:H(91),
    sourceUpdatedAtReliable:false,
    rows:[raw]
  }]
});
const row=rows[0];
eq(row.source.sourceId,'33297858','Código preservado como id da origem');
eq(row.phone,'+5531984444949','celular normalizado como telefone principal');
eq(row.legacyProfile.phoneFixed,'+553133920040','fixo normalizado separadamente');
eq(row.legacyProfile.birthDate,'1982-06-21','aniversário completo normalizado');
eq(row.legacyProfile.postalCode,'32041-780','CEP normalizado');
eq(row.legacyProfile.addressNumber,null,'zero automático de Número vira ausência');
eq(row.legacyProfile.state,'MG','UF normalizada');
eq(row.legacyProfile.sourceCreatedAt,'2024-12-24','data Cadastrado preservada como criação da origem');
eq(row.sourceUpdatedAt,null,'sem updatedAt confiável inventado');
eq(row.email,'teste@example.com','email normalizado');

const invalid=applyClientHeaderMapping({
  Cliente:'OUTRA PESSOA',
  'Código':33297859,
  'Aniversário':'21/5/2976',
  'Telefone':3133334444,
  'Celular':'',
  'Cadastrado':'07/01/2019'
},mapping);
const invalidRow=normalizeBatchSet({
  mode:'CLIENTS_ONLY',
  batchId:'BATCH_AVEC_INVALID',
  phase:'REHEARSAL',
  files:[{unitId:'centro',exportedAt:'2026-10-01T14:40:00-03:00',fileName:'avec-invalid.xlsx',fileHash:H(92),rows:[invalid]}]
})[0];
eq(invalidRow.phone,'+553133334444','fixo vira principal somente quando celular está vazio');
eq(invalidRow.legacyProfile.birthDate,null,'aniversário impossível não é promovido como data válida');
eq(invalidRow.legacyProfile.sourceCreatedAt,'2019-01-07','Cadastrado dd/mm/aaaa normalizado');

const sameLegacyCodeDifferentPeople={
  mode:'CLIENTS_ONLY',
  batchId:'BATCH_CODE_NOT_DEDUPE',
  phase:'REHEARSAL',
  files:[
    {unitId:'centro',exportedAt:'2026-10-01T14:40:00-03:00',fileName:'c.xlsx',fileHash:H(93),rows:[{sourceId:'999',name:'Pessoa Um',phone:'31999990001'}]},
    {unitId:'big',exportedAt:'2026-10-01T14:41:00-03:00',fileName:'b.xlsx',fileHash:H(94),rows:[{sourceId:'999',name:'Pessoa Dois',phone:'31999990002'}]}
  ]
};
const report=reconcileClientBatch(sameLegacyCodeDifferentPeople,{},[]);
eq(report.crossUnit.clusters,2,'Código legado igual entre unidades não funde pessoas');
eq(report.crossUnit.multiUnitClusters,0,'Código legado não cria cliente de rede');

console.log(JSON.stringify({ok:true,tests,feature:'avec_real_export_layout_contract'}));
