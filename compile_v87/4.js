
// ===== V35: POSIÇÃO FINANCEIRA / TESOURARIA =====
let financePositionDate=financeToday;
let financePositionUnit='all';
let financePositionType='all';
let financePositionAccount='all';

(db.financialAccounts||[]).forEach(a=>{
  if(a.openingBalance===undefined)a.openingBalance=0;
  if(!a.openingBalanceDate)a.openingBalanceDate=financeToday;
});
save();

function financeMethodForMovement(m){
  let n=normName(m?.paymentMethod||'');
  return (db.paymentMethods||[]).find(pm=>normName(pm.name||'')===n)
    || (db.paymentMethods||[]).find(pm=>{let k=financePaymentMethodKind(pm);return (k==='cash'&&n.includes('dinheiro'))||(k==='pix'&&n.includes('pix'))||(k==='debit'&&n.includes('debito'))||(k==='credit'&&n.includes('credito'))});
}
function financeAccountByName(name){return (db.financialAccounts||[]).find(a=>a.name===name)}
function financeMovementNetForAccount(m,a){
  let gross=Math.max(0,Number(m?.amount||0)),pm=financeMethodForMovement(m),rule=pm?a?.feeRules?.[pm.id]:null;
  let pct=Math.max(0,Number(rule?.percent||0)),fixed=Math.max(0,Number(rule?.fixed||0));
  let fee=Math.min(gross,gross*pct/100+(gross>0?fixed:0));
  return {gross,fee,net:Math.max(0,gross-fee),method:pm,rule:rule||{settlementDays:0}};
}
function financeSettlementDate(sourceDate,rule){return addDaysISO(sourceDate,Math.max(0,Math.round(Number(rule?.settlementDays||0))))}
function financeClosedReceiptMovementsForAccount(a,asOf){
  let closedKeys=new Set((db.cashSessions||[]).filter(s=>s.status==='closed'&&s.date<=asOf).map(s=>`${s.unitId}|${s.date}`));
  return (db.demoCashMovements||[]).filter(m=>m.account===a.name&&m.date<=asOf&&cashReceiptMovement(m)&&closedKeys.has(`${m.unitId}|${m.date}`));
}
function financeAccountPosition(a,asOf=financePositionDate){
  let available=0,receivable=0,fees=0,items=[];
  let baseDate=a.openingBalanceDate||financeToday;
  if(baseDate<=asOf)available+=Number(a.openingBalance||0);
  // Recebimentos vindos de caixas fechados: taxa/prazo são tratados aqui, não em Lançamentos.
  for(const m of financeClosedReceiptMovementsForAccount(a,asOf)){
    let calc=financeMovementNetForAccount(m,a),settlementDate=financeSettlementDate(m.date,calc.rule),pending=settlementDate>asOf;
    fees+=calc.fee;
    if(pending)receivable+=calc.net; else available+=calc.net;
    items.push({id:m.id,date:m.date,settlementDate,paymentMethod:m.paymentMethod||calc.method?.name||'—',gross:calc.gross,fee:calc.fee,net:calc.net,pending,origin:cashOriginText(m)});
  }
  // Despesas, vales, transferências e lançamentos manuais afetam o disponível quando efetivados.
  for(const e of financeNonReceiptRows().filter(e=>e.account===a.name&&e.date<=asOf&&e.status!=='Previsto'))available+=Number(e.amount||0);
  // Suprimentos entram no caixa físico, mas não são receita. Precisam afetar a posição do numerário.
  if(a.type==='CASH'){
    let closedKeys=new Set((db.cashSessions||[]).filter(s=>s.status==='closed'&&s.date<=asOf).map(s=>`${s.unitId}|${s.date}`));
    for(const m of (db.demoCashMovements||[]).filter(m=>m.account===a.name&&m.date<=asOf&&m.type==='Suprimento'&&closedKeys.has(`${m.unitId}|${m.date}`))) available+=Number(m.amount||0);
  }
  return {available,receivable,total:available+receivable,fees,items};
}
function financePositionRows(){
  return (db.financialAccounts||[]).filter(a=>{
    if(financePositionUnit!=='all'&&a.unitId!==financePositionUnit)return false;
    if(financePositionType!=='all'&&a.type!==financePositionType)return false;
    if(financePositionAccount!=='all'&&a.id!==financePositionAccount)return false;
    return true;
  });
}
function financePositionTotals(rows){
  let cash=0,accounts=0,receivable=0,total=0;
  rows.forEach(a=>{let p=financeAccountPosition(a);if(a.type==='CASH')cash+=p.available;else accounts+=p.available;receivable+=p.receivable;total+=p.total});
  return {cash,accounts,receivable,total};
}
function setFinancePositionFilter(k,v){
  if(k==='date')financePositionDate=v||financeToday;
  if(k==='unit')financePositionUnit=v||'all';
  if(k==='type')financePositionType=v||'all';
  if(k==='account')financePositionAccount=v||'all';
  renderFinanceAccounts();
}
function financePositionAccountOptions(){
  let rows=(db.financialAccounts||[]).filter(a=>financePositionUnit==='all'||a.unitId===financePositionUnit);
  return `<option value="all">Todas</option>${rows.map(a=>`<option value="${a.id}" ${financePositionAccount===a.id?'selected':''}>${escapeHtml(a.name)}</option>`).join('')}`;
}
function openFinanceReceivables(id){
  let a=(db.financialAccounts||[]).find(x=>x.id===id);if(!a)return;let p=financeAccountPosition(a),pending=p.items.filter(x=>x.pending).sort((x,y)=>x.settlementDate.localeCompare(y.settlementDate));
  let groups={};pending.forEach(x=>{(groups[x.settlementDate]||(groups[x.settlementDate]=[])).push(x)});
  let body=pending.length?`<div class="receivable-list">${Object.entries(groups).map(([d,items])=>{let total=items.reduce((s,x)=>s+x.net,0);return `<div class="receivable-day"><div class="receivable-day-head"><b>${formatDateBR(d)}</b><b>${money(total)}</b></div><div class="receivable-items">${items.map(x=>`<div class="receivable-item"><strong>${escapeHtml(x.paymentMethod)}</strong><span class="hide-small">Venda ${formatDateBR(x.date)}</span><span class="hide-small">Taxa ${money(x.fee)}</span><span>${money(x.net)}</span></div>`).join('')}</div></div>`}).join('')}</div>`:`<div class="client-empty">Não há valores pendentes de liquidação nesta posição.</div>`;
  modal(`A receber · ${a.name}`,`<div class="finance-detail-summary"><div class="finance-detail-box"><span>Posição em</span><b>${formatDateBR(financePositionDate)}</b></div><div class="finance-detail-box"><span>Disponível</span><b>${money(p.available)}</b></div><div class="finance-detail-box"><span>A receber</span><b>${money(p.receivable)}</b></div></div><div class="inline-note" style="margin-bottom:12px">Valores líquidos das taxas cadastradas. O prazo é calculado por forma de pagamento e conta.</div>${body}`,`<button class="btn btn-primary" onclick="closeModal()">Fechar</button>`);setTimeout(()=>document.querySelector('#modalHost .modal')?.classList.add('modal-wide'),0)
}

renderFinanceAccounts=function(){
 let rows=financePositionRows(),tot=financePositionTotals(rows),active=rows.filter(a=>a.active!==false).length;
 let unitOptions=`<option value="all">Todas as unidades</option>${db.units.filter(u=>u.active!==false).map(u=>`<option value="${u.id}" ${financePositionUnit===u.id?'selected':''}>${escapeHtml(u.name)}</option>`).join('')}`;
 let typeOptions=[['all','Todos os tipos'],['CASH','Caixa físico'],['BANK','Conta bancária'],['PROCESSOR','Operadora / adquirente']].map(([v,n])=>`<option value="${v}" ${financePositionType===v?'selected':''}>${n}</option>`).join('');
 adminPage.innerHTML=`<div class="page-head"><div><h1>Contas e destinos</h1><div class="muted">Posição financeira: quanto já está disponível e quanto ainda vai cair, sem poluir os Lançamentos.</div></div><div class="spacer"></div><button class="btn btn-primary" onclick="openFinanceAccountNew()">+ Nova conta</button></div>
 <div class="finance-config-banner"><div class="icon">💰</div><div><b>Painel de tesouraria.</b> O prazo e as taxas cadastrados aqui são usados para separar <b>Disponível</b> de <b>A receber</b>. A aba Lançamentos continua mostrando apenas o valor total consolidado do fechamento.</div></div>
 <div class="treasury-toolbar"><div class="field"><label>Posição em</label><input type="date" value="${financePositionDate}" onchange="setFinancePositionFilter('date',this.value)"></div><div class="field"><label>Unidade</label><select onchange="financePositionAccount='all';setFinancePositionFilter('unit',this.value)">${unitOptions}</select></div><div class="field"><label>Tipo</label><select onchange="setFinancePositionFilter('type',this.value)">${typeOptions}</select></div><div class="field" style="min-width:230px"><label>Conta / destino</label><select onchange="setFinancePositionFilter('account',this.value)">${financePositionAccountOptions()}</select></div><div class="spacer"></div><button class="btn btn-ghost btn-sm" onclick="financePositionDate=financeToday;financePositionUnit='all';financePositionType='all';financePositionAccount='all';renderFinanceAccounts()">Limpar filtros</button></div>
 <div class="treasury-kpis"><div class="treasury-kpi cash"><span>Dinheiro físico nas lojas</span><b>${money(tot.cash)}</b></div><div class="treasury-kpi"><span>Disponível em contas</span><b>${money(tot.accounts)}</b></div><div class="treasury-kpi receivable"><span>A receber</span><b>${money(tot.receivable)}</b></div><div class="treasury-kpi emphasis"><span>Total financeiro</span><b>${money(tot.total)}</b></div></div>
 <div class="finance-account-toolbar"><span class="pill">${rows.length} conta(s) no filtro</span><span class="muted">${active} ativa(s) · ${rows.length-active} inativa(s)</span><div class="spacer"></div><button class="btn btn-ghost btn-sm" onclick="setFinanceTab('payments')">Ver formas de pagamento</button></div>
 <div class="finance-account-grid">${rows.length?rows.map(a=>{let methods=financeAccountMethods(a),bank=a.details?.institution||a.details?.processor||'',p=financeAccountPosition(a);return `<div class="finance-account-card ${a.active===false?'inactive':''}"><span class="status-chip ${a.active===false?'off':''}">${a.active===false?'Inativa':'Ativa'}</span><span class="finance-tag">${escapeHtml(financeAccountTypeLabel(a.type))}</span><h3>${escapeHtml(a.name)}</h3><div class="muted">${escapeHtml(bank||financeUnitLabel(a.unitId))} · ${escapeHtml(financeUnitLabel(a.unitId))}</div><div class="finance-account-position"><div><span>Disponível</span><b>${money(p.available)}</b></div><div class="pending"><span>A receber</span><b>${money(p.receivable)}</b></div><div class="total"><span>Total</span><b>${money(p.total)}</b></div></div><div class="account-position-note">Posição em ${formatDateBR(financePositionDate)} · valores a receber já líquidos das taxas configuradas.</div><div class="finance-methods">${methods.map(m=>`<span>${escapeHtml(m.name)}</span>`).join('')||'<span>Nenhuma forma vinculada</span>'}</div><div class="account-card-actions">${p.receivable>0.004?`<button class="btn btn-soft btn-sm" onclick="openFinanceReceivables('${a.id}')">Ver a receber</button>`:''}<button class="btn btn-ghost btn-sm" onclick="openFinanceAccount('${a.id}')">Configurar</button></div></div>`}).join(''):`<div class="card"><b>Nenhuma conta encontrada com estes filtros.</b><div class="muted" style="margin-top:5px">Ajuste os filtros ou crie uma nova conta.</div></div>`}</div>`;
};

openFinanceAccount=function(id,isNew=false){let a=db.financialAccounts.find(x=>x.id===id);if(!a)return;let methods=financeActiveConfigMethods();modal(isNew?'Nova conta / destino':'Configurar conta / destino',`<div class="form-grid"><div class="field full"><label class="required">Nome</label><input id="finAccName" value="${escapeAttr(a.name)}" placeholder="Ex.: Itaú — Shopping Contagem"></div><div class="field"><label>Tipo</label><select id="finAccType" onchange="document.getElementById('finAccTypeHint').textContent=financeAccountTypeHint(this.value)"><option value="CASH" ${a.type==='CASH'?'selected':''}>Caixa físico</option><option value="BANK" ${a.type==='BANK'?'selected':''}>Conta bancária</option><option value="PROCESSOR" ${a.type==='PROCESSOR'?'selected':''}>Operadora / adquirente</option></select><div id="finAccTypeHint" class="account-type-hint">${escapeHtml(financeAccountTypeHint(a.type))}</div></div><div class="field"><label>Unidade</label><select id="finAccUnit">${db.units.filter(u=>u.active!==false).map(u=>`<option value="${u.id}" ${u.id===a.unitId?'selected':''}>${escapeHtml(u.name)}</option>`).join('')}</select></div><div class="field"><label>Instituição / operadora</label><input id="finAccInstitution" value="${escapeAttr(a.details?.institution||a.details?.processor||'')}" placeholder="Ex.: Itaú / Stone"></div><div class="field"><label>Identificação interna</label><input id="finAccInternal" value="${escapeAttr(a.details?.internalCode||'')}" placeholder="Opcional"></div><div class="field full"><label class="check" style="margin:0"><input id="finAccActive" type="checkbox" ${a.active!==false?'checked':''}> Conta ativa para novos pagamentos</label></div></div>
 <div class="opening-balance-box"><h3>Saldo inicial para começar o controle</h3><div class="help">Use uma única vez ao colocar uma conta real no sistema. A partir da data-base, os movimentos passam a somar/subtrair automaticamente.</div><div class="form-grid" style="margin-top:10px"><div class="field"><label>Saldo inicial</label><input id="finAccOpeningBalance" type="number" step="0.01" value="${Number(a.openingBalance||0)}"></div><div class="field"><label>Data-base</label><input id="finAccOpeningDate" type="date" value="${a.openingBalanceDate||financeToday}"></div></div></div>
 <div class="section-box"><h3>Formas aceitas, taxa e prazo</h3><div class="help" style="margin-bottom:10px">Marque as formas que podem terminar nesta conta. Taxas e prazos alimentam a posição financeira, mas não poluem a tela de Lançamentos.</div><div class="payment-rule-wrap"><table class="payment-rule-table"><thead><tr><th>Forma</th><th>Taxa %</th><th>Taxa fixa (R$)</th><th>Prazo (dias)</th></tr></thead><tbody>${methods.map(m=>financeAccountRuleRow(a,m)).join('')}</tbody></table></div></div>`,`${isNew?`<button class="btn btn-danger" onclick="financeAccountDeleteDraft('${id}')">Cancelar</button>`:`<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>`}<button class="btn btn-primary" onclick="saveFinanceAccount('${id}')">Salvar conta</button>`);setTimeout(()=>document.querySelector('#modalHost .modal')?.classList.add('modal-wide'),0)};

saveFinanceAccount=function(id){let a=db.financialAccounts.find(x=>x.id===id);if(!a)return;let oldName=a.name,name=document.getElementById('finAccName')?.value.trim()||'';if(!name){toast('Informe o nome da conta');return}let unitId=document.getElementById('finAccUnit')?.value||a.unitId;if(db.financialAccounts.some(x=>x.id!==id&&x.unitId===unitId&&x.name.toLowerCase()===name.toLowerCase())){toast('Já existe uma conta com esse nome nesta unidade');return}a.name=name;a.unitId=unitId;a.type=document.getElementById('finAccType')?.value||a.type;a.active=!!document.getElementById('finAccActive')?.checked;a.details=a.details||{};a.details.institution=document.getElementById('finAccInstitution')?.value.trim()||'';a.details.internalCode=document.getElementById('finAccInternal')?.value.trim()||'';a.openingBalance=Number(document.getElementById('finAccOpeningBalance')?.value||0);a.openingBalanceDate=document.getElementById('finAccOpeningDate')?.value||financeToday;a.paymentMethodIds=[...document.querySelectorAll('.fin-acc-method:checked')].map(x=>x.value);a.feeRules=a.feeRules||{};for(const mid of a.paymentMethodIds){let pct=document.querySelector(`.fin-rule-percent[data-mid="${mid}"]`),fixed=document.querySelector(`.fin-rule-fixed[data-mid="${mid}"]`),days=document.querySelector(`.fin-rule-days[data-mid="${mid}"]`);a.feeRules[mid]={percent:Math.max(0,Number(pct?.value||0)),fixed:Math.max(0,Number(fixed?.value||0)),settlementDays:Math.max(0,Math.round(Number(days?.value||0)))};}if(oldName!==name){(db.demoCashMovements||[]).forEach(m=>{if(m.account===oldName)m.account=name});(db.demoFinancialEntries||[]).forEach(e=>{if(e.account===oldName)e.account=name});(db.clientCreditMovements||[]).forEach(e=>{if(e.financialAccount===oldName)e.financialAccount=name})}save();closeModal();renderFinanceAccounts();toast('Conta financeira atualizada ✓')};
