
/* V41 — volta do DRE para leitura tabular */
function dre41Pct(value,base){value=Number(value||0);base=Number(base||0);return base?value/base*100:0}
function dre41PctText(value,base){return goalPct(dre41Pct(value,base))}
function dre41Row(label,value,base,cls='',extra=''){return `<tr class="${cls}"><td>${label}${extra}</td><td class="num ${Number(value||0)<0?'negative':''}">${money(Math.abs(Number(value||0)))}</td><td class="num">${base?dre41PctText(Math.abs(Number(value||0)),base):'—'}</td></tr>`}
function renderFinanceDreBody(){
  let host=document.getElementById('financeDreBody');if(!host)return;
  let st=financeDrePeriod(),d=financeDreDataV40(st),base=d.netRevenue||1,serviceNetTotal=d.categories.reduce((s,x)=>s+x.net,0),expenseEntries=Object.entries(d.byCat).sort((a,b)=>b[1]-a[1]);
  let categoryRevenueRows=d.categories.map(x=>`<tr class="indent2 clickable" onclick="openDreCategoryV40('${escapeAttr(x.category)}')"><td>${escapeHtml(x.category)}</td><td class="num positive">${money(x.net)}</td><td class="num">${dre41PctText(x.net,Math.max(1,serviceNetTotal))}</td></tr>`).join('');
  let categoryCommissionRows=d.categories.filter(x=>x.commissions>0).map(x=>`<tr class="indent2 clickable" onclick="openDreCategoryV40('${escapeAttr(x.category)}')"><td>${escapeHtml(x.category)}</td><td class="num">${money(x.commissions)}</td><td class="num">${dre41PctText(x.commissions,base)}</td></tr>`).join('');
  let expenseRows=expenseEntries.map(([k,v])=>`<tr class="indent1"><td>${escapeHtml(k)}</td><td class="num">${money(v)}</td><td class="num">${dre41PctText(v,base)}</td></tr>`).join('');
  let grossService=d.serviceGross||0;
  let dreRows=`
    <tr class="section revenue"><td>RECEITA BRUTA DE VENDAS</td><td class="num">${money(d.grossRevenue)}</td><td class="num">${dre41PctText(d.grossRevenue,base)}</td></tr>
    <tr class="indent1"><td>Serviços</td><td class="num">${money(grossService)}</td><td class="num">${dre41PctText(grossService,base)}</td></tr>
    ${d.productRevenue?`<tr class="indent1"><td>Produtos de revenda</td><td class="num">${money(d.productRevenue)}</td><td class="num">${dre41PctText(d.productRevenue,base)}</td></tr>`:''}
    ${d.packageRevenue?`<tr class="indent1"><td>Venda de pacotes</td><td class="num">${money(d.packageRevenue)}</td><td class="num">${dre41PctText(d.packageRevenue,base)}</td></tr>`:''}
    ${d.categories.length?`<tr class="subtotal"><td>Subtotais por categoria de serviço</td><td class="num">${money(serviceNetTotal)}</td><td class="num">100%</td></tr>${categoryRevenueRows}`:''}
    <tr><td>(−) Descontos e combos</td><td class="num negative">${money(d.discounts)}</td><td class="num">${dre41PctText(d.discounts,base)}</td></tr>
    ${d.customerFees?`<tr><td>(+) Acréscimos cobrados da cliente</td><td class="num positive">${money(d.customerFees)}</td><td class="num">${dre41PctText(d.customerFees,base)}</td></tr>`:''}
    <tr class="subtotal"><td>RECEITA LÍQUIDA COMERCIAL</td><td class="num positive">${money(d.netRevenue)}</td><td class="num">100%</td></tr>

    <tr class="section cost"><td>CUSTOS VARIÁVEIS</td><td class="num">${money(d.processorFees+d.commissions)}</td><td class="num">${dre41PctText(d.processorFees+d.commissions,base)}</td></tr>
    <tr class="indent1"><td>(D) Materiais / Insumos</td><td class="num"><span class="dre41-pending">Pendente</span></td><td class="num">—</td></tr>
    <tr class="indent1"><td>Despesas com cartão / taxas de operadora</td><td class="num">${money(d.processorFees)}</td><td class="num">${dre41PctText(d.processorFees,base)}</td></tr>
    <tr class="indent1"><td>(E) Comissões de profissionais</td><td class="num">${money(d.commissions)}</td><td class="num">${dre41PctText(d.commissions,base)}</td></tr>
    ${categoryCommissionRows}
    <tr class="section result"><td>MARGEM DE CONTRIBUIÇÃO</td><td class="num">${money(d.contributionValue)}</td><td class="num">${dre41PctText(d.contributionValue,base)}</td></tr>

    <tr class="section cost"><td>DESPESAS OPERACIONAIS CLASSIFICADAS</td><td class="num">${money(d.expenseTotal)}</td><td class="num">${dre41PctText(d.expenseTotal,base)}</td></tr>
    ${expenseRows||`<tr class="indent1"><td class="mutedcell">Nenhuma despesa operacional classificada no período</td><td class="num">—</td><td class="num">—</td></tr>`}
    <tr class="subtotal ${d.operatingResult<0?'bad':''}"><td>RESULTADO OPERACIONAL</td><td class="num">${money(d.operatingResult)}</td><td class="num">${dre41PctText(d.operatingResult,base)}</td></tr>
    <tr><td>Impostos</td><td class="num"><span class="dre41-pending">Pendente</span></td><td class="num">—</td></tr>
    <tr class="result-line ${d.managerialProfit<0?'bad':''}"><td>RESULTADO GERENCIAL PARCIAL</td><td class="num">${money(d.managerialProfit)}</td><td class="num">${dre41PctText(d.managerialProfit,base)}</td></tr>`;

  let catRows=d.categories.map(x=>{let margin=x.net?x.contribution/x.net*100:0;return `<tr class="clickable" onclick="openDreCategoryV40('${escapeAttr(x.category)}')"><td>${escapeHtml(x.category)}</td><td class="num">${money(x.gross)}</td><td class="num">${money(x.discounts)}</td><td class="num positive">${money(x.net)}</td><td class="num">${money(x.commissions)}</td><td class="num">${money(x.processorFees)}</td><td class="num"><span class="dre41-pending">Pendente</span></td><td class="num">${money(x.directKnown)}</td><td class="num ${x.contribution>=0?'positive':'negative'}">${money(x.contribution)}</td><td class="num ${margin>=0?'dre41-margin-good':'dre41-margin-bad'}">${goalPct(margin)}</td></tr>`}).join('');

  host.innerHTML=`
    <div class="dre41-kpis">
      <div class="dre41-kpi"><span>Receita bruta de vendas</span><b>${money(d.grossRevenue)}</b><small>Faturamento antes de descontos</small></div>
      <div class="dre41-kpi"><span>Margem de contribuição</span><b>${money(d.contributionValue)}</b><small>${goalPct(d.contributionMargin)} da receita líquida · antes de insumos</small></div>
      <div class="dre41-kpi ${d.operatingResult>=0?'good':'warn'}"><span>Resultado operacional</span><b>${money(d.operatingResult)}</b><small>Margem ${goalPct(d.operatingMargin)}</small></div>
      <div class="dre41-kpi ${d.managerialProfit>=0?'good':'warn'}"><span>Resultado Gerencial Parcial</span><b>${money(d.managerialProfit)}</b><small>Margem ${goalPct(d.managerialProfitMargin)}</small></div>
    </div>
    <div class="dre41-card">
      <div class="dre41-card-head"><div><h3>DRE — Resultado</h3><div class="sub">Estrutura em tabela: receita, custos, margem e resultado no mesmo fluxo visual.</div></div><div class="muted">${formatDateBR(st.from)} → ${formatDateBR(st.to)}</div></div>
      <div class="dre41-table-wrap"><table class="dre41-table"><thead><tr><th>Descrição</th><th class="num">Valor do período (R$)</th><th class="num">% da receita líquida</th></tr></thead><tbody>${dreRows}</tbody></table></div>
      <div class="dre41-note"><b>Leitura:</b> linhas verdes mostram geração de resultado; linhas alaranjadas mostram consumo. Materiais/insumos, CMV e impostos ficam explicitamente pendentes até os respectivos módulos fornecerem dados reais. Gorjetas (${money(d.tips)}) continuam fora da receita porque são valores a repassar às profissionais.</div>
    </div>
    <div class="dre41-card">
      <div class="dre41-card-head"><div><h3>Rentabilidade por categoria de serviço</h3><div class="sub">Mostra onde você ganha dinheiro por categoria sem ratear despesas gerais de forma arbitrária.</div></div></div>
      <div class="dre41-table-wrap"><table class="dre41-table dre41-category-table"><thead><tr><th>Categoria</th><th class="num">Bruto</th><th class="num">Descontos / combos</th><th class="num">Líquido</th><th class="num">Comissões</th><th class="num">Taxas alocadas*</th><th class="num">Insumos / CMV</th><th class="num">Custos diretos conhecidos</th><th class="num">Contribuição</th><th class="num">Margem</th></tr></thead><tbody>${catRows||`<tr><td colspan="10" class="mutedcell">Sem serviços pagos no período.</td></tr>`}</tbody></table></div>
      <div class="dre41-note"><b>* Taxas alocadas:</b> distribuídas proporcionalmente ao faturamento líquido das categorias somente para análise. O lançamento financeiro original não é alterado. Despesas gerais não são rateadas sem regra explícita.</div>
    </div>`;
}
