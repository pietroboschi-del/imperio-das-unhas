
// ===== V33: FINANCEIRO VISUAL — ENTRADAS NASCEM DO FECHAMENTO DO CAIXA =====
let financeTableFilters={date:'',nature:'',category:'',unit:'',account:''};

function financeCashClosureRevision(s){
 if(!s)return null;
 let history=Array.isArray(s.closureHistory)?s.closureHistory.filter(Boolean):[];
 if(s.lastClosureId){let exact=history.find(h=>h.id===s.lastClosureId);if(exact)return exact}
 if(history.length){
   return [...history].sort((a,b)=>{
     let r=Number(a.revision||0)-Number(b.revision||0);if(r)return r;
     return String(a.closedAt||'').localeCompare(String(b.closedAt||''));
   }).slice(-1)[0]||null
 }
 if(Array.isArray(s.closedMovementIds)){
   return {id:s.lastClosureId||`${s.id}:legacy-close`,revision:Number(s.reopenCount||0)+1,closedAt:s.closedAt||'',closedBy:s.closedBy||'',movementIds:[...s.closedMovementIds],snapshot:s.snapshot||null,legacyFrozen:true}
 }
 return null
}

function financeClosedCashRows(){
 let rows=[];
 for(const s of (db.cashSessions||[]).filter(x=>x.status==='closed')){
   let closure=financeCashClosureRevision(s);
   let frozenIds=Array.isArray(closure?.movementIds)?closure.movementIds:[];
   if(!frozenIds.length)continue;
   let idSet=new Set(frozenIds);
   let movements=(db.demoCashMovements||[]).filter(m=>idSet.has(m.id)&&cashReceiptMovement(m));
   let byAccount=new Map();
   for(const m of movements){
     let accountId=m.accountId||'',account=m.account||'Conta não identificada',key=accountId?`id:${accountId}`:`name:${account}`;
     if(!byAccount.has(key))byAccount.set(key,{accountId,account,rows:[]});
     byAccount.get(key).rows.push(m);
   }
   [...byAccount.values()].forEach((group,i)=>{
     let ms=group.rows,amount=ms.reduce((sum,m)=>sum+Number(m.amount||0),0);
     if(!(amount>0))return;
     rows.push({
       id:`cashclose_${s.id}_${closure?.revision||0}_${i}`,
       sourceType:'cash_closure',cashSessionId:s.id,closureId:closure?.id||'',closureRevision:Number(closure?.revision||0),
       movementIds:ms.map(m=>m.id),movements:ms,
       date:s.date,referenceDate:s.date,closedAt:closure?.closedAt||s.closedAt||'',unitId:s.unitId,
       accountId:group.accountId,account:group.account,
       nature:'Fechamento de caixa',category:'Recebimentos',
       origin:`Caixa do dia ${formatDateBR(s.date)}`,
       amount,status:'Efetivado',dreImpact:false
     });
   });
 }
 return rows;
}

function financeNonReceiptRows(){
 return (db.demoFinancialEntries||[]).filter(e=>{
   if(e.excludedFromOperationalLedger===true)return false;
   let n=String(e.nature||'').toLowerCase();
   // Recebimentos operacionais são apresentados somente de forma consolidada no fechamento do caixa.
   if(n.includes('recebimento de comanda')||n.includes('sinais recebidos')||n.includes('créditos recebidos')||n.includes('creditos recebidos')||n.includes('gorjeta recebida'))return false;
   if(e.sourceType==='client_receivable_settlement'&&e.sourceId){
     let paired=(db.demoCashMovements||[]).some(m=>m.sourceType==='client_receivable_settlement'&&m.sourceId===e.sourceId);
     if(paired)return false;
   }
   return true;
 }).map(e=>({...e,sourceType:e.id?.startsWith('fe_manual_')?'manual':(e.sourceType||'financial')}));
}

function financeOperationalLedgerEntries(){
 return [...financeClosedCashRows(),...financeNonReceiptRows()].sort((a,b)=>{
   let d=String(b.date||'').localeCompare(String(a.date||''));if(d)return d;
   return String(b.closedAt||b.createdAt||'').localeCompare(String(a.closedAt||a.createdAt||''));
 });
}

function financeUnique(rows,key,labelFn=x=>x){
 return [...new Set(rows.map(r=>labelFn(r[key],r)).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'pt-BR'));
}
function financeSetHeaderFilter(key,value){financeTableFilters[key]=value;renderFinanceEntriesBody()}
function financeClearHeaderFilters(){financeTableFilters={date:'',nature:'',category:'',unit:'',account:''};renderFinanceEntriesBody()}
function financeApplyHeaderFilters(rows){let f=financeTableFilters;return rows.filter(e=>{
 if(f.date&&e.date!==f.date)return false;
 if(f.nature&&(e.nature||'')!==f.nature)return false;
 if(f.category&&financeEntryCategory(e)!==f.category)return false;
 if(f.unit&&e.unitId!==f.unit)return false;
 if(f.account&&(e.account||'')!==f.account)return false;
 return true;
})}
function financeHeaderSelect(key,values,displayFn=(x)=>x){let cur=financeTableFilters[key]||'';return `<select class="finance-th-filter ${cur?'active':''}" onchange="financeSetHeaderFilter('${key}',this.value)"><option value="">Todos</option>${values.map(v=>`<option value="${escapeAttr(v)}" ${cur===v?'selected':''}>${escapeHtml(displayFn(v))}</option>`).join('')}</select>`}
function financeHeaderDateSelect(rows){let vals=financeUnique(rows,'date').sort((a,b)=>b.localeCompare(a));let cur=financeTableFilters.date||'';return `<select class="finance-th-filter ${cur?'active':''}" onchange="financeSetHeaderFilter('date',this.value)"><option value="">Todas</option>${vals.map(v=>`<option value="${v}" ${cur===v?'selected':''}>${formatDateBR(v)}</option>`).join('')}</select>`}
function financeHeaderUnitSelect(rows){let ids=financeUnique(rows,'unitId');let cur=financeTableFilters.unit||'';return `<select class="finance-th-filter ${cur?'active':''}" onchange="financeSetHeaderFilter('unit',this.value)"><option value="">Todas</option>${ids.map(v=>`<option value="${v}" ${cur===v?'selected':''}>${escapeHtml(financeUnitLabel(v))}</option>`).join('')}</select>`}
function financeHasFilters(){return Object.values(financeTableFilters).some(Boolean)}

function financeVisualKpis(rows){let incoming=0,outgoing=0;for(const e of rows){let a=Number(e.amount||0);if(a>=0)incoming+=a;else outgoing+=Math.abs(a)}return {incoming,outgoing,net:incoming-outgoing}}

function renderFinanceEntries(){
 adminPage.innerHTML=`<div class="page-head"><div><h1>Financeiro</h1><div class="muted">Visão consolidada: os recebimentos entram no Financeiro a partir do <b>fechamento do caixa</b>, e não uma linha por comanda.</div></div><div class="spacer"></div><button class="btn btn-primary" onclick="openFinanceEntry()">+ Novo lançamento</button></div><div class="finance-ledger-note"><div class="ico">▦</div><div><b>Uma linha por conta em cada fechamento.</b> Ex.: todo o valor recebido no Itaú — Shopping Contagem no caixa de 25/09 aparece em uma única linha. Clique na linha para ver a composição das comandas e recebimentos que formaram o total.</div></div><div id="financeEntriesBody"></div>`;
 renderFinanceEntriesBody();
}

function renderFinanceEntriesBody(){
 let host=document.getElementById('financeEntriesBody');if(!host)return;
 let all=financeOperationalLedgerEntries(),es=financeApplyHeaderFilters(all),k=financeVisualKpis(es);
 let natures=financeUnique(all,'nature'),cats=[...new Set(all.map(financeEntryCategory))].filter(Boolean).sort((a,b)=>a.localeCompare(b,'pt-BR')),accounts=financeUnique(all,'account');
 window.financeVisualRows=all;
 host.innerHTML=`<div class="finance-kpis"><div class="finance-kpi positive"><span>Entradas consolidadas</span><b>${money(k.incoming)}</b></div><div class="finance-kpi negative"><span>Saídas</span><b>${money(k.outgoing)}</b></div><div class="finance-kpi emphasis"><span>Movimento líquido</span><b>${money(k.net)}</b></div><div class="finance-kpi"><span>Fechamentos no filtro</span><b>${new Set(es.filter(e=>e.sourceType==='cash_closure').map(e=>e.cashSessionId)).size}</b></div><div class="finance-kpi"><span>Linhas exibidas</span><b>${es.length}</b></div></div>
 ${financeHasFilters()?`<div style="display:flex;justify-content:flex-end;margin:-4px 0 8px"><button class="btn btn-ghost btn-sm finance-clear-filters" onclick="financeClearHeaderFilters()">Limpar filtros</button></div>`:''}
 <div class="finance-table-wrap"><table class="finance-ledger"><thead><tr>
 <th><div class="finance-th-label">Data de referência <span class="funnel">▼</span></div>${financeHeaderDateSelect(all)}</th>
 <th><div class="finance-th-label">Natureza <span class="funnel">▼</span></div>${financeHeaderSelect('nature',natures)}</th>
 <th><div class="finance-th-label">Categoria <span class="funnel">▼</span></div>${financeHeaderSelect('category',cats)}</th>
 <th><div class="finance-th-label">Unidade <span class="funnel">▼</span></div>${financeHeaderUnitSelect(all)}</th>
 <th><div class="finance-th-label">Conta / destino <span class="funnel">▼</span></div>${financeHeaderSelect('account',accounts)}</th>
 <th><div class="finance-th-label">Referência</div></th><th style="text-align:right"><div class="finance-th-label" style="justify-content:flex-end">Valor</div></th></tr></thead><tbody>
 ${es.length?es.map(e=>`<tr onclick="openFinanceVisualDetail('${escapeAttr(e.id)}')"><td><b>${formatDateBR(e.date)}</b>${e.closedAt?`<div class="muted" style="font-size:10px">fechado ${formatDateLocalTimestamp(e.closedAt)} ${formatTimeLocal(e.closedAt)}</div>`:''}</td><td>${e.sourceType==='cash_closure'?`<span class="finance-close-pill">▣ ${escapeHtml(e.nature)}</span>`:`<b>${escapeHtml(e.nature||'Lançamento')}</b>`}</td><td><span class="finance-category-pill">${escapeHtml(financeEntryCategory(e))}</span></td><td>${escapeHtml(financeUnitLabel(e.unitId))}</td><td><b>${escapeHtml(e.account||'—')}</b></td><td><div class="finance-ref"><b>${escapeHtml(e.origin||e.supplier||'—')}</b>${e.sourceType==='cash_closure'?'Clique para ver a composição':'Lançamento financeiro'}</div></td><td style="text-align:right" class="finance-value ${Number(e.amount||0)>=0?'finance-entry-positive':'finance-entry-negative'}">${Number(e.amount||0)>=0?'+ ':''}${money(Number(e.amount||0))}</td></tr>`).join(''):`<tr><td colspan="7" class="finance-empty">Nenhum lançamento com estes filtros.${all.length===0?' Feche um caixa para os recebimentos consolidados aparecerem aqui.':''}</td></tr>`}
 </tbody></table></div>`;
}

function openFinanceVisualDetail(id){
 let e=(window.financeVisualRows||[]).find(x=>x.id===id);if(!e)return;
 if(e.sourceType!=='cash_closure'){
   modal('Detalhe do lançamento',`<div class="finance-detail-summary"><div class="finance-detail-box"><span>Data</span><b>${formatDateBR(e.date)}</b></div><div class="finance-detail-box"><span>Unidade</span><b>${escapeHtml(financeUnitLabel(e.unitId))}</b></div><div class="finance-detail-box"><span>Conta</span><b>${escapeHtml(e.account||'—')}</b></div></div><div class="field"><label>Natureza / categoria</label><div><b>${escapeHtml(e.nature||'Lançamento')}</b> · ${escapeHtml(financeEntryCategory(e))}</div></div><div class="field" style="margin-top:12px"><label>Origem / descrição</label><div>${escapeHtml(e.origin||e.supplier||'—')}</div></div><div style="font-size:24px;font-weight:900;margin-top:16px" class="${Number(e.amount||0)>=0?'finance-entry-positive':'finance-entry-negative'}">${money(Number(e.amount||0))}</div>`,`<button class="btn btn-primary" onclick="closeModal()">Fechar</button>`);return;
 }
 let s=(db.cashSessions||[]).find(x=>x.id===e.cashSessionId),ms=e.movements||[];
 modal(`Fechamento · ${e.account}`,`<div class="finance-detail-summary"><div class="finance-detail-box"><span>Caixa de referência</span><b>${formatDateBR(e.date)}</b></div><div class="finance-detail-box"><span>Unidade</span><b>${escapeHtml(financeUnitLabel(e.unitId))}</b></div><div class="finance-detail-box"><span>Total nesta conta</span><b>${money(e.amount)}</b></div></div><div class="inline-note" style="margin-bottom:12px">Fechamento confirmado por <b>${escapeHtml(s?.closedBy||'—')}</b>${s?.closedAt?` em ${formatDateLocalTimestamp(s.closedAt)} às ${formatTimeLocal(s.closedAt)}`:''}. A tabela abaixo é apenas a composição auditável do total consolidado.</div><div class="table-card"><table class="table"><thead><tr><th>Tipo</th><th>Forma</th><th>Origem</th><th>Valor</th></tr></thead><tbody>${ms.map(m=>`<tr><td>${escapeHtml(m.type||'Recebimento')}</td><td>${escapeHtml(m.paymentMethod||'—')}</td><td>${escapeHtml(cashOriginText(m))}</td><td class="finance-entry-positive"><b>${money(Number(m.amount||0))}</b></td></tr>`).join('')}</tbody></table></div>${s?.closeNote?`<div class="inline-note" style="margin-top:12px"><b>Observação do fechamento:</b> ${escapeHtml(s.closeNote)}</div>`:''}`,`<button class="btn btn-primary" onclick="closeModal()">Fechar</button>`);
 setTimeout(()=>document.querySelector('#modalHost .modal')?.classList.add('modal-wide'),0);
}

// Saldo visual das contas usa exatamente o mesmo ledger operacional exibido no Financeiro.
function financeAccountEntryMatches(a,e){
 if(!a||!e)return false;
 if(e.accountId)return e.accountId===a.id;
 let names=new Set([a.name,...(Array.isArray(a.previousNames)?a.previousNames:[])].filter(Boolean));
 return names.has(e.account)
}
function financeAccountBalance(a){
 return financeOperationalLedgerEntries().filter(e=>financeAccountEntryMatches(a,e)&&e.status!=='Previsto').reduce((s,e)=>s+Number(e.amount||0),0)
}
