
// ===== V37: METAS FINANCEIRAS VISUAIS =====
let financeGoalMonth=financeToday.slice(0,7);
let financeGoalUnit='all';

function goalMonthLabel(month){
 const [y,m]=String(month||'').split('-').map(Number);if(!y||!m)return month||'';
 return new Date(y,m-1,1,12).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
}
function goalMonthBounds(month){
 const [y,m]=month.split('-').map(Number),last=new Date(y,m,0).getDate();
 return {start:`${month}-01`,end:`${month}-${String(last).padStart(2,'0')}`,days:last};
}
function goalRecord(unitId,month){return (db.financeGoals||[]).find(g=>g.unitId===unitId&&g.month===month)||null}
function goalDefaultWeekdays(){return [0,1,2,3,4,5,6]}
function goalWeekdays(g){return Array.isArray(g?.openWeekdays)&&g.openWeekdays.length?g.openWeekdays.map(Number):goalDefaultWeekdays()}
function goalOperationalDates(g,month){
 const {days}=goalMonthBounds(month),[y,m]=month.split('-').map(Number),allowed=new Set(goalWeekdays(g)),out=[];
 for(let d=1;d<=days;d++){let dt=new Date(y,m-1,d,12);if(allowed.has(dt.getDay()))out.push(`${month}-${String(d).padStart(2,'0')}`)}return out;
}
function goalPaidRevenue(unitId,month){
 return (db.clientCommands||[]).filter(c=>c.status==='Pago'&&c.unitId===unitId&&String(c.date||'').startsWith(month)).reduce((sum,c)=>sum+Math.max(0,Number(c.total!==undefined?c.total:(typeof commandGrossTotal==='function'?commandGrossTotal(c):0))),0);
}
function goalScheduledRevenue(unitId,month){
 const today=financeToday,groups=new Map();
 for(const raw of (db.bookings||[])){
  let b=normalizeBooking(raw);if(b.unit!==unitId||!String(b.date||'').startsWith(month))continue;
  if(['Cancelado','Faltou','Bloqueado','Concluído'].includes(b.status))continue;
  if(month===today.slice(0,7)&&b.date<today)continue;
  let clientKey=b.clientId||`name:${b.client||''}`,key=`${clientKey}|${b.unit}|${b.date}`;
  if(!groups.has(key))groups.set(key,[]);
  (b.items||[]).forEach((it,i)=>groups.get(key).push({key:`${b.id}:${i}`,serviceId:it.serviceId,qty:1,amount:Math.max(0,Number(it.price||0))}));
 }
 let total=0;for(const entries of groups.values()){
  let base=entries.reduce((s,e)=>s+e.amount,0),apps=typeof comboApplicationsFromEntries==='function'?comboApplicationsFromEntries(entries):[],discount=apps.reduce((s,a)=>s+Math.max(0,Number(a.discount||0)),0);total+=Math.max(0,base-discount);
 }return total;
}
function goalUnitStats(unitId,month){
 const g=goalRecord(unitId,month),goal=Math.max(0,Number(g?.amount||0)),realized=goalPaidRevenue(unitId,month),scheduled=goalScheduledRevenue(unitId,month),coverage=realized+scheduled,remaining=Math.max(0,goal-realized),remainingAfterSchedule=Math.max(0,goal-coverage),dates=goalOperationalDates(g,month),today=financeToday,bounds=goalMonthBounds(month);
 let elapsed=0,remainingDays=0;
 if(month<today.slice(0,7)){elapsed=dates.length;remainingDays=0}
 else if(month>today.slice(0,7)){elapsed=0;remainingDays=dates.length}
 else{elapsed=dates.filter(d=>d<=today).length;remainingDays=dates.filter(d=>d>today).length}
 let expected=goal&&dates.length?goal*(elapsed/dates.length):0,progress=goal?Math.min(100,(realized/goal)*100):0,coveragePct=goal?Math.min(999,(coverage/goal)*100):0,requiredDaily=remainingDays?remainingAfterSchedule/remainingDays:0;
 return {unitId,g,goal,realized,scheduled,coverage,remaining,remainingAfterSchedule,dates,elapsed,remainingDays,expected,progress,coveragePct,requiredDaily,bounds};
}
function goalFilteredUnits(){return db.units.filter(u=>u.active!==false&&(financeGoalUnit==='all'||u.id===financeGoalUnit))}
function goalAggregate(month){
 let stats=goalFilteredUnits().map(u=>goalUnitStats(u.id,month)),defined=stats.filter(s=>s.goal>0),goal=defined.reduce((s,x)=>s+x.goal,0),realized=stats.reduce((s,x)=>s+x.realized,0),scheduled=stats.reduce((s,x)=>s+x.scheduled,0),coverage=realized+scheduled,remaining=Math.max(0,goal-realized),remainingAfterSchedule=Math.max(0,goal-coverage),remainingDays=defined.length?Math.max(...defined.map(x=>x.remainingDays),0):0,requiredDaily=defined.reduce((s,x)=>s+x.requiredDaily,0),expected=defined.reduce((s,x)=>s+x.expected,0);
 return {stats,defined,goal,realized,scheduled,coverage,remaining,remainingAfterSchedule,remainingDays,requiredDaily,expected,progress:goal?Math.min(100,realized/goal*100):0,coveragePct:goal?Math.min(999,coverage/goal*100):0};
}
function goalPct(v){return `${Number(v||0).toFixed(1).replace('.',',')}%`}
function goalSetFilter(kind,value){if(kind==='month')financeGoalMonth=value||financeToday.slice(0,7);if(kind==='unit')financeGoalUnit=value||'all';renderFinanceGoals()}
function goalPrevMonth(delta){let [y,m]=financeGoalMonth.split('-').map(Number),d=new Date(y,m-1+delta,1,12);financeGoalMonth=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;renderFinanceGoals()}
function goalResetMonth(){financeGoalMonth=financeToday.slice(0,7);renderFinanceGoals()}
function goalPaceLabel(s){if(!s.goal)return ['Sem meta','neutral'];if(s.realized>=s.goal)return ['Meta atingida','ok'];if(s.expected<=0)return ['Mês ainda não iniciado','neutral'];let diff=s.realized-s.expected,pct=Math.abs(diff)/(s.goal||1);if(pct<.03)return ['Na linha proporcional','neutral'];return diff>0?['Acima da linha proporcional','ok']:['Abaixo da linha proporcional','attn']}
function goalProgressHtml(agg){
 if(!agg.goal)return `<div class="goal-empty">Defina pelo menos uma meta para visualizar o progresso do mês.</div>`;
 let r=Math.min(100,agg.realized/agg.goal*100),s=Math.min(100,agg.scheduled/agg.goal*100),expected=Math.min(100,agg.expected/agg.goal*100),schedWidth=Math.max(0,Math.min(100-r,s));
 return `<div class="goal-progress-wrap"><div class="goal-progress"><span class="realized" style="width:${r}%"></span><span class="scheduled" style="left:${r}%;width:${schedWidth}%"></span><span class="expected" style="left:${expected}%" title="Linha proporcional do mês"></span></div><div class="goal-progress-legend"><span><i class="r"></i>Realizado ${money(agg.realized)}</span><span><i class="s"></i>Agenda futura ${money(agg.scheduled)}</span><span><i class="e"></i>Linha proporcional ${money(agg.expected)}</span></div></div>`;
}
function renderFinanceGoals(){
 let units=goalFilteredUnits(),agg=goalAggregate(financeGoalMonth),monthLabel=goalMonthLabel(financeGoalMonth),unitOptions=`<option value="all" ${financeGoalUnit==='all'?'selected':''}>Todas as unidades</option>${db.units.filter(u=>u.active!==false).map(u=>`<option value="${u.id}" ${financeGoalUnit===u.id?'selected':''}>${escapeHtml(u.name)}</option>`).join('')}`;
 let scope=financeGoalUnit==='all'?'Rede / todas as unidades':financeUnitLabel(financeGoalUnit),definedCount=agg.defined.length;
 adminPage.innerHTML=`<div class="page-head"><div><h1>Metas</h1><div class="muted">Acompanhe faturamento realizado, agenda futura e quanto ainda falta para o objetivo do mês.</div></div><div class="spacer"></div>${financeGoalUnit!=='all'?`<button class="btn btn-primary" onclick="openFinanceGoalV37('${financeGoalUnit}')">${goalRecord(financeGoalUnit,financeGoalMonth)?'Editar meta':'Definir meta'}</button>`:''}</div>
 <div class="goal-toolbar"><button class="btn btn-ghost btn-sm" onclick="goalPrevMonth(-1)">←</button><div class="field"><label>Mês</label><input type="month" value="${financeGoalMonth}" onchange="goalSetFilter('month',this.value)"></div><button class="btn btn-ghost btn-sm" onclick="goalPrevMonth(1)">→</button><button class="btn btn-soft btn-sm" onclick="goalResetMonth()">Mês atual</button><div class="field"><label>Unidade</label><select onchange="goalSetFilter('unit',this.value)">${unitOptions}</select></div><div class="spacer"></div><button class="btn btn-ghost btn-sm" onclick="copyGoalsFromPreviousMonth()">Copiar mês anterior</button></div>
 <div class="finance-config-banner"><div class="icon">🎯</div><div><b>${escapeHtml(scope)} · ${escapeHtml(monthLabel)}</b> — O realizado vem das comandas pagas. O valor agendado respeita serviços, combos e cancelamentos; ele aparece separado do realizado para não confundir agenda com faturamento efetivo.</div></div>
 <div class="goal-kpis"><div class="goal-kpi emphasis"><span>Meta do mês</span><b>${agg.goal?money(agg.goal):'—'}</b><small>${definedCount} unidade(s) com meta definida</small></div><div class="goal-kpi good"><span>Realizado</span><b>${money(agg.realized)}</b><small>${agg.goal?goalPct(agg.progress)+' da meta':'Sem meta definida'}</small></div><div class="goal-kpi"><span>Agendado restante</span><b>${money(agg.scheduled)}</b><small>Agenda ainda não faturada</small></div><div class="goal-kpi"><span>Realizado + agenda</span><b>${money(agg.coverage)}</b><small>${agg.goal?goalPct(agg.coveragePct)+' de cobertura':'—'}</small></div><div class="goal-kpi warn"><span>Falta após agenda</span><b>${agg.goal?money(agg.remainingAfterSchedule):'—'}</b><small>Considerando os horários já marcados</small></div><div class="goal-kpi"><span>Média adicional/dia</span><b>${agg.goal?(agg.requiredDaily>0?money(agg.requiredDaily):'R$ 0,00'):'—'}</b><small>Dias operacionais restantes</small></div></div>
 <div class="goal-overview"><div class="goal-panel"><h3>Progresso consolidado</h3><p>Realizado e agenda futura contra a meta definida. A linha vertical indica o ponto proporcional esperado do mês.</p>${goalProgressHtml(agg)}</div><div class="goal-panel"><h3>Leitura rápida</h3><p>Indicadores para decisão sem misturar faturamento realizado com agenda futura.</p><div class="goal-side-list"><div class="goal-side-row"><span>Falta para a meta só com realizado</span><b>${agg.goal?money(agg.remaining):'—'}</b></div><div class="goal-side-row"><span>Falta considerando a agenda</span><b>${agg.goal?money(agg.remainingAfterSchedule):'—'}</b></div><div class="goal-side-row"><span>Unidades sem meta neste mês</span><b>${Math.max(0,units.length-definedCount)}</b></div></div></div></div>
 <div class="goal-unit-table-wrap"><table class="goal-unit-table"><thead><tr><th>Unidade</th><th>Meta</th><th>Realizado</th><th>Agendado</th><th>Cobertura</th><th>Falta após agenda</th><th>Progresso</th><th>Dias restantes</th><th>Média adicional/dia</th><th></th></tr></thead><tbody>${units.map(u=>goalUnitRow(u,goalUnitStats(u.id,financeGoalMonth))).join('')}</tbody></table></div>
 <div class="goal-note"><b>Regra da meta:</b> “Realizado” só muda quando a comanda é paga. “Agendado” é uma previsão operacional e já considera preço de combo quando os serviços da visita formam um combo. Sinais e créditos recebidos antes do atendimento não contam como faturamento realizado.</div>`;
}
function goalUnitRow(u,s){let pace=goalPaceLabel(s);return `<tr><td><div class="unit-name">${escapeHtml(u.name)}</div><div class="muted-mini">${escapeHtml(goalMonthLabel(financeGoalMonth))}</div></td><td>${s.goal?`<b>${money(s.goal)}</b>`:'<span class="goal-chip neutral">Não definida</span>'}</td><td><b>${money(s.realized)}</b></td><td>${money(s.scheduled)}</td><td>${s.goal?`${money(s.coverage)}<div class="muted-mini">${goalPct(s.coveragePct)}</div>`:'—'}</td><td>${s.goal?money(s.remainingAfterSchedule):'—'}</td><td>${s.goal?`<div class="goal-mini-progress"><span style="width:${Math.min(100,s.progress)}%"></span></div><div class="muted-mini">${goalPct(s.progress)}</div><span class="goal-chip ${pace[1]}">${pace[0]}</span>`:'—'}</td><td>${s.goal?`${s.remainingDays}<div class="muted-mini">de ${s.dates.length} operacionais</div>`:'—'}</td><td>${s.goal?(s.requiredDaily>0?money(s.requiredDaily):'R$ 0,00'):'—'}</td><td><button class="btn btn-ghost btn-sm" onclick="openFinanceGoalV37('${u.id}')">${s.goal?'Editar':'Definir'}</button></td></tr>`}
function openFinanceGoalV37(unitId){
 let g=goalRecord(unitId,financeGoalMonth),weekdays=goalWeekdays(g),weekdayNames=[['Dom',0],['Seg',1],['Ter',2],['Qua',3],['Qui',4],['Sex',5],['Sáb',6]];
 modal(g?'Editar meta mensal':'Definir meta mensal',`<div class="form-grid"><div class="field"><label>Unidade</label><input value="${escapeAttr(financeUnitLabel(unitId))}" disabled></div><div class="field"><label>Mês</label><input value="${escapeAttr(goalMonthLabel(financeGoalMonth))}" disabled></div><div class="field full"><label>Meta de faturamento</label><input id="goalAmountV37" type="number" min="0" step="0.01" value="${Number(g?.amount||0)}" placeholder="Ex.: 50000"></div><div class="field full"><label>Dias em que a unidade opera normalmente</label><div class="goal-weekdays">${weekdayNames.map(([n,d])=>`<label class="goal-weekday"><input type="checkbox" class="goal-weekday-check" value="${d}" ${weekdays.includes(d)?'checked':''}> ${n}</label>`).join('')}</div><div class="muted" style="font-size:10px;margin-top:5px">Usamos esses dias apenas para calcular dias restantes e média diária necessária. A meta continua mensal.</div></div><div class="field full"><label>Observação (opcional)</label><textarea id="goalNoteV37" rows="3" placeholder="Ex.: mês com feriado prolongado, campanha especial...">${escapeHtml(g?.note||'')}</textarea></div></div><div class="inline-note" style="margin-top:12px"><b>O que entra no realizado:</b> comandas pagas no mês. Sinais antecipados, créditos, gorjetas e transferências não entram como faturamento da meta.</div>`,`<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>${g?`<button class="btn btn-danger" onclick="removeFinanceGoalV37('${unitId}')">Excluir meta</button>`:''}<button class="btn btn-primary" onclick="saveFinanceGoalV37('${unitId}')">Salvar meta</button>`);
}
function saveFinanceGoalV37(unitId){
 let amount=Math.max(0,Number(document.getElementById('goalAmountV37')?.value||0)),openWeekdays=[...document.querySelectorAll('.goal-weekday-check:checked')].map(x=>Number(x.value));if(amount<=0){toast('Informe uma meta maior que zero');return}if(!openWeekdays.length){toast('Selecione pelo menos um dia de funcionamento');return}let g=goalRecord(unitId,financeGoalMonth);if(!g){g={id:'fg'+Date.now()+unitId,unitId,month:financeGoalMonth};db.financeGoals.push(g)}g.amount=amount;g.openWeekdays=openWeekdays;g.note=document.getElementById('goalNoteV37')?.value.trim()||'';g.updatedAt=new Date().toISOString();g.updatedBy=typeof currentUserName==='function'?currentUserName():'Master';save();closeModal();renderFinanceGoals();toast('Meta salva ✓');
}
function removeFinanceGoalV37(unitId){let g=goalRecord(unitId,financeGoalMonth);if(!g)return;if(!confirm(`Excluir a meta de ${financeUnitLabel(unitId)} para ${goalMonthLabel(financeGoalMonth)}?`))return;db.financeGoals=db.financeGoals.filter(x=>x!==g);save();closeModal();renderFinanceGoals();toast('Meta excluída')}
function copyGoalsFromPreviousMonth(){
 let [y,m]=financeGoalMonth.split('-').map(Number),d=new Date(y,m-2,1,12),prev=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,units=goalFilteredUnits(),sources=units.map(u=>goalRecord(u.id,prev)).filter(Boolean);if(!sources.length){toast('Não existem metas no mês anterior para copiar');return}if(!confirm(`Copiar ${sources.length} meta(s) de ${goalMonthLabel(prev)} para ${goalMonthLabel(financeGoalMonth)}?`))return;
 for(const src of sources){let dest=goalRecord(src.unitId,financeGoalMonth);if(!dest){dest={id:'fg'+Date.now()+src.unitId+Math.random(),unitId:src.unitId,month:financeGoalMonth};db.financeGoals.push(dest)}dest.amount=Number(src.amount||0);dest.openWeekdays=[...goalWeekdays(src)];dest.note=src.note||'';dest.updatedAt=new Date().toISOString();dest.updatedBy=typeof currentUserName==='function'?currentUserName():'Master'}save();renderFinanceGoals();toast('Metas do mês anterior copiadas ✓');
}
// Compatibilidade com o botão/funções antigas da V32.
openFinanceGoal=function(){let uid=financeGoalUnit!=='all'?financeGoalUnit:financeUnitId();openFinanceGoalV37(uid)};
saveFinanceGoal=function(){let uid=financeGoalUnit!=='all'?financeGoalUnit:financeUnitId();saveFinanceGoalV37(uid)};
