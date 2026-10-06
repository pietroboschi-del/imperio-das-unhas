import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
let tests=0;const ok=(v,m)=>{tests++;assert.ok(v,m)};

ok(html.includes('V99 · PROFESSIONAL UNIT HYDRATION GATE'),'gate de hidratação de unidades existe');
ok(html.includes("ORDER=Object.freeze(['centro','big','shopping-contagem'])"),'Centro, Big e Shopping Contagem têm ordem canônica');
ok(html.includes("source:'/api/v1/units'")&&html.includes('window.__imperioCentralApi.units()'),'modal busca unidades no backend central');
ok(html.includes("CENTRAL_TO_LOCAL=Object.freeze({centro:'u3',big:'u1','shopping-contagem':'u2'})"),'unidades centrais são convertidas para IDs locais do formulário');
ok(html.includes('db.units=hydrated'),'unidades hidratadas alimentam o mesmo db.units usado pela UI');
ok(html.includes('class=\\\"pfUnit\\\"')&&html.includes('db.units.filter(u=>u.active).map'),'Perfil renderiza opções de unidades ativas');
ok(html.includes('syncProUnitScheduleAvailability()'),'seleção de unidade atualiza disponibilidade da escala');
ok(html.includes('const scheduleRows=db.units.map(u=>weekdays.map((day,idx)=>'),'Horários gera grade por unidade e dia');
ok(html.includes("const weekdays=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']"),'grade contém os sete dias da semana');
ok(html.includes('pfs-work')&&html.includes('pfs-start')&&html.includes('pfs-end'),'grade expõe trabalha/entrada/saída');
ok(html.includes("document.querySelectorAll('.pfUnit:checked')")&&html.includes("selected.has(r.dataset.unit)"),'seleção habilita apenas linhas das unidades marcadas');
ok(html.includes("unitIds=[...document.querySelectorAll('.pfUnit:checked')].map(x=>centralUnitRef(x.value))"),'save persiste unidades canônicas');
ok(html.includes("schedule[unit+'-'+r.dataset.day]={work:"),'save persiste escala por unidade/dia');
ok(html.includes('if(!unitIds.includes(unit))return'),'escala não mistura unidade não selecionada');
ok(html.includes("for(const [k,v] of Object.entries(c.schedule||{}))")&&html.includes("localUnitRef(m[1])+'-'+m[2]"),'reabertura reidrata escala central para a unidade correta');
ok(html.includes("units:(x.unitIds||[]).map(localUnitRef)"),'reabertura restaura seleção multiunidade');
ok(html.includes("if(!units.length){toast('Selecione pelo menos uma unidade');return}"),'salvamento exige ao menos uma unidade');
ok(html.includes('await window.__imperioCentralApi.units();')&&html.includes('return baseOpenPro.apply(self,args)'),'modal só abre após hidratar unidades');
ok(html.includes("values.includes('professionals.manage')"),'hidratação respeita permissão mínima de profissionais');

console.log(JSON.stringify({ok:true,tests,feature:'professional_units_schedule_ui_gate'}));
