import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CLIENT_XLSX_PARSER_VERSION, parseClientWorkbook } from '../dist/src/migration/client-excel.js';

let tests=0;
const ok=(v,m)=>{tests++;assert.ok(v,m)};
const eq=(a,b,m)=>{tests++;assert.deepEqual(a,b,m)};
const fixture=new URL('./fixtures/avec_single_quote_synthetic.xlsx',import.meta.url);
const parsed=parseClientWorkbook(fs.readFileSync(fixture));

eq(parsed.sheetName,'Sheet1','planilha detectada');
eq(parsed.rows.length,1,'uma linha de dados preservada');
eq(parsed.headers.length,20,'vinte cabeçalhos lidos');
eq(parsed.headers[0],'Cliente','header Cliente reconhecido');
eq(parsed.headers[1],'Código','header Código reconhecido');
eq(parsed.headers[4],'Celular','header Celular reconhecido');
eq(parsed.headers[17],'Cadastrado','header Cadastrado reconhecido');
eq(parsed.unmappedHeaders,[],'nenhum valor da primeira cliente vira cabeçalho');
eq(parsed.duplicateCanonicalHeaders,[],'sem mapeamento duplicado');

const row=parsed.rows[0];
eq(row.sourceRow,2,'linha de origem preservada');
eq(row.Cliente,'CLIENTE TESTE','nome bruto preservado');
eq(row.Código,33297858,'código bruto preservado');
eq(row.Celular,31984444949,'celular bruto preservado');
eq(row.name,'CLIENTE TESTE','nome canônico preenchido');
eq(row.sourceId,33297858,'código canônico preenchido');
eq(row.phone,31984444949,'celular vira telefone principal');
eq(row.phoneFixed,'','fixo vazio preservado');
eq(row.sourceCreatedAt,'24/12/2024','cadastro de origem preservado');
ok(typeof CLIENT_XLSX_PARSER_VERSION==='string'&&CLIENT_XLSX_PARSER_VERSION.length>3,'parser versionado');

console.log(JSON.stringify({ok:true,tests,feature:'xlsx_single_quote_legacy_layout',parserVersion:CLIENT_XLSX_PARSER_VERSION}));
