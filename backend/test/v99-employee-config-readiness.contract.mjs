import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
let tests=0;const ok=(v,m)=>{tests++;if(!v)throw new Error(m)};

for(const token of ['sfName','sfCat','sfPrice','sfDur','sfActive','sfOnline','sfClientArea','sfLeadSameArea'])ok(html.includes(token),'serviço expõe '+token);
ok(html.includes("clientArea:sfClientArea.value||'none'"),'clientArea segue para payload central');
ok(html.includes("mustFinishBeforeSameArea:!!sfLeadSameArea.checked"),'mustFinishBeforeSameArea segue para payload central');

for(const token of ['pfName','pfPublicName','pfActive','.pfUnit','pro-service-row','pfr-enabled','pfr-duration','pfr-price','pfr-commission','schedule-row','pfs-work','pfs-start','pfs-end'])ok(html.includes(token),'profissional expõe '+token);
ok(html.includes("unitIds=[...document.querySelectorAll('.pfUnit:checked')]"),'unidades selecionadas seguem para payload central');
ok(html.includes("schedule[unit+'-'+r.dataset.day]"),'escala é persistida por unidade/dia');
ok(html.includes("serviceRules[sid]={enabled:")&&html.includes("duration:row.querySelector('.pfr-duration')")&&html.includes("price:row.querySelector('.pfr-price')"),'overrides de serviço/duração/preço seguem para payload central');

ok(html.includes("allowedCategoryIds:cats"),'workstation persiste allowedCategoryIds');
ok(html.includes("LOCAL_TO_CENTRAL=Object.freeze({u1:'big',u2:'shopping-contagem',u3:'centro'"),'mapeamento usa três unidades canônicas');
ok(!html.includes('big-shopping'),'frontend não usa identificador big-shopping');

ok(html.includes("window.__imperioStructuralCatalogManage=catalogManageAllowed"),'acesso estrutural usa permissão central');
ok(html.includes("values.includes('catalog.manage')"),'catalog.manage libera estrutura sem admin global');
ok(html.includes("window.__imperioStructuralCatalogManage?.()===true"),'guarda V77 aceita permissão central');
ok(html.includes("id='v99StructuralServiceActions'")&&html.includes('Categorias</button>')&&html.includes('Estações</button>'),'Serviços expõe atalhos estruturais');
ok(html.includes('pruneStructuralNav()'),'navegação estrutural é reduzida para não-admin');
ok(html.includes("Sem permissão para gerenciar o catálogo"),'acesso negado permanece explícito sem permissão');

ok(html.includes("'/api/v1/config/categories'")&&html.includes("'/api/v1/config/workstations'"),'categorias/estações usam backend central');
ok(html.includes("'/api/v1/config/services'")&&html.includes("'/api/v1/config/professionals'"),'serviços/profissionais usam backend central');

console.log(JSON.stringify({ok:true,tests,feature:'employee_configuration_readiness_contract'}));
