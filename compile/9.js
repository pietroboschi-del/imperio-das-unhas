
// ===== V40: DRE executivo + rentabilidade por categoria =====
function dre40Pct(v,base){return base>0?(v/base*100):0}
function dre40LineCategory(l){let s=db.services.find(x=>x.id===l.serviceId)||serviceByNameV39(l.name);return s?.category||'Sem categoria'}
function financeDreDataV40(st){
  let d=financeDreDataV39(st),cats={};
  for(const c of d.cmds){
    let p=dre39CommandParts(c),serviceGross=p.serviceLines.reduce((s,l)=>s+Math.max(0,Number(l.unitPrice||0)*Number(l.qty||1)),0),lineNetRaw=p.serviceLines.reduce((s,l)=>s+Math.max(0,Number(l.unitPrice||0)*Number(l.qty||1)-Number(l.discount||0)),0),comboDiscount=(c.comboApplications||[]).reduce((s,a)=>s+Math.max(0,Number(a.discount||0)),0),comboRatio=lineNetRaw?Math.max(0,(lineNetRaw-comboDiscount)/lineNetRaw):1;
    for(const l of p.serviceLines){
      let cat=dre40LineCategory(l),gross=Math.max(0,Number(l.unitPrice||0)*Number(l.qty||1)),lineDisc=Math.max(0,Number(l.discount||0)),netBeforeCombo=Math.max(0,gross-lineDisc),net=netBeforeCombo*comboRatio,discount=Math.max(0,gross-net),pid=l.professionalId,srv=db.services.find(s=>s.id===l.serviceId)||serviceByNameV39(l.name),pct=Number(srv?.proRules?.[pid]?.commission||0),comm=net*pct/100;
      if(!cats[cat])cats[cat]={category:cat,gross:0,discounts:0,net:0,commissions:0,processorFees:0,inputs:0,directKnown:0,contribution:0,services:{}};
      let x=cats[cat];x.gross+=gross;x.discounts+=discount;x.net+=net;x.commissions+=comm;
      let sn=srv?.name||l.name||'Serviço';if(!x.services[sn])x.services[sn]={gross:0,net:0,count:0};x.services[sn].gross+=gross;x.services[sn].net+=net;x.services[sn].count+=Number(l.qty||1);
    }
  }
  // Taxas de adquirência são custo direto do recebimento, mas não vêm identificadas por categoria.
  // Alocamos proporcionalmente à receita líquida de serviços apenas para análise de categoria, sem mudar o DRE oficial.
  let catNet=Object.values(cats).reduce((s,x)=>s+x.net,0);
  for(const x of Object.values(cats)){
    x.processorFees=catNet?d.processorFees*(x.net/catNet):0;
    x.inputs=0; // será alimentado pelo módulo de Estoque/Insumos
    x.directKnown=x.commissions+x.processorFees+x.inputs;
    x.contribution=x.net-x.directKnown;
  }
  let knownConsumption=d.processorFees+d.commissions+d.expenseTotal;
  let contributionValue=d.netRevenue-d.processorFees-d.commissions; // antes de insumos/despesas operacionais
  let contributionMargin=d.netRevenue?contributionValue/d.netRevenue*100:0;
  let operatingResult=d.operating,operatingMargin=d.netRevenue?operatingResult/d.netRevenue*100:0;
  // Enquanto impostos/CMV/insumos não estão completos, o "lucro" é gerencial parcial e é rotulado como tal.
  let managerialProfit=operatingResult,managerialProfitMargin=operatingMargin;
  return {...d,categories:Object.values(cats).sort((a,b)=>b.net-a.net),knownConsumption,contributionValue,contributionMargin,operatingResult,operatingMargin,managerialProfit,managerialProfitMargin};
}
function openDreCategoryV40(catName){let st=financeDrePeriod(),d=financeDreDataV40(st),x=d.categories.find(c=>c.category===catName);if(!x)return;let rows=Object.entries(x.services).sort((a,b)=>b[1].net-a[1].net).map(([n,v])=>`<tr><td>${escapeHtml(n)}</td><td class="num">${v.count}</td><td class="num">${money(v.gross)}</td><td class="num">${money(v.net)}</td></tr>`).join('');modal(`Categoria · ${escapeHtml(catName)}`,`<div class="inline-note" style="margin-bottom:12px"><b>Rentabilidade direta conhecida.</b> Comissões e taxa financeira alocada já entram. Insumos/CMV serão incorporados automaticamente quando o módulo de Estoque estiver fechado.</div><div class="finance-detail-summary"><div class="finance-detail-box"><span>Faturamento líquido</span><b>${money(x.net)}</b></div><div class="finance-detail-box"><span>Custos diretos conhecidos</span><b>${money(x.directKnown)}</b></div><div class="finance-detail-box"><span>Contribuição conhecida</span><b>${money(x.contribution)}</b></div></div><div class="table-card" style="margin-top:12px"><table class="table"><thead><tr><th>Serviço</th><th>Qtd.</th><th>Bruto</th><th>Líquido</th></tr></thead><tbody>${rows||'<tr><td colspan="4">Sem serviços no período.</td></tr>'}</tbody></table></div>`,`<button class="btn btn-primary" onclick="closeModal()">Fechar</button>`)}
function renderFinanceDreBody(){
  let host=document.getElementById('financeDreBody');if(!host)return;let st=financeDrePeriod(),d=financeDreDataV40(st),base=d.netRevenue||1;
  let incomeMax=Math.max(1,...d.categories.map(x=>x.net)),outRows=[['Comissões',d.commissions,'Comissões dos serviços realizados'],['Taxas financeiras',d.processorFees,'Taxas de adquirência/operadora'],...Object.entries(d.byCat).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[k,v,'Despesa operacional classificada'])];
  host.innerHTML=`
  <div class="dre40-kpis">
    <div class="dre40-kpi emph"><span>Receita bruta de vendas</span><b>${money(d.grossRevenue)}</b><small>Serviços + produtos + pacotes</small></div>
    <div class="dre40-kpi"><span>Margem de contribuição</span><b>${money(d.contributionValue)}</b><small>${goalPct(d.contributionMargin)} da receita líquida · antes de insumos</small></div>
    <div class="dre40-kpi ${d.operatingResult>=0?'good':'warn'}"><span>Resultado operacional</span><b>${money(d.operatingResult)}</b><small>Margem ${goalPct(d.operatingMargin)}</small></div>
    <div class="dre40-kpi ${d.managerialProfit>=0?'good':'warn'}"><span>Resultado Gerencial Parcial</span><b>${money(d.managerialProfit)}</b><small>Margem ${goalPct(d.managerialProfitMargin)} · ainda sem insumos/CMV/impostos completos</small></div>
  </div>
  <div class="dre40-grid">
    <div class="dre40-card"><h3>Onde ganhamos dinheiro</h3><div class="sub">Faturamento líquido dos serviços agrupado pela categoria cadastrada.</div>${d.categories.length?d.categories.map(x=>`<div class="dre40-moneyrow" onclick="openDreCategoryV40('${escapeAttr(x.category)}')" style="cursor:pointer"><div><b>${escapeHtml(x.category)}</b><div class="dre40-bar income"><i style="width:${Math.min(100,x.net/incomeMax*100)}%"></i></div></div><div class="val">${money(x.net)}</div><div class="pct">${goalPct(dre40Pct(x.net,Math.max(1,d.categories.reduce((s,c)=>s+c.net,0))))}</div></div>`).join(''):'<div class="finance-empty">Sem serviços pagos no período.</div>'}</div>
    <div class="dre40-card"><h3>Onde o resultado está sendo consumido</h3><div class="sub">Cada saída mostra valor e percentual da receita líquida comercial.</div>${outRows.length?outRows.map(([n,v,help])=>`<div class="dre40-moneyrow"><div><b>${escapeHtml(n)}</b><div class="dre40-bar out"><i style="width:${Math.min(100,dre40Pct(v,base))}%"></i></div><small class="muted">${escapeHtml(help)}</small></div><div class="val">${money(v)}</div><div class="pct">${goalPct(dre40Pct(v,base))}</div></div>`).join(''):'<div class="finance-empty">Sem saídas no período.</div>'}</div>
  </div>
  <div class="dre40-card">
    <div class="dre40-section-title"><div><h3>Rentabilidade por categoria de serviço</h3><div class="muted">Mostra o que cada categoria faturou e os custos diretos que já conseguimos atribuir com segurança.</div></div><span class="dre40-pill pending">Insumos entram após Estoque</span></div>
    <div class="dre40-table-wrap"><table class="dre40-table"><thead><tr><th>Categoria</th><th>Faturamento bruto</th><th>Descontos/combos</th><th>Faturamento líquido</th><th>Comissões</th><th>Taxas alocadas*</th><th>Insumos/CMV</th><th>Custos diretos conhecidos</th><th>Contribuição conhecida</th></tr></thead><tbody>${d.categories.length?d.categories.map(x=>`<tr onclick="openDreCategoryV40('${escapeAttr(x.category)}')" style="cursor:pointer"><td><b>${escapeHtml(x.category)}</b></td><td class="num">${money(x.gross)}</td><td class="num">${money(x.discounts)}</td><td class="num positive">${money(x.net)}</td><td class="num">${money(x.commissions)}</td><td class="num">${money(x.processorFees)}</td><td class="num"><span class="dre40-pill pending">Pendente</span></td><td class="num">${money(x.directKnown)}</td><td class="num ${x.contribution>=0?'positive':''}">${money(x.contribution)}</td></tr>`).join(''):`<tr><td colspan="9">Sem dados no período.</td></tr>`}</tbody></table></div>
    <div class="dre40-note"><b>* Taxas alocadas:</b> como a operadora não informa a categoria do serviço, distribuímos a taxa financeira proporcionalmente ao faturamento líquido das categorias apenas para análise. Isso não altera o lançamento financeiro original. <b>Despesas fixas/operacionais gerais não são rateadas por categoria sem uma regra explícita</b>, para não criar uma falsa rentabilidade.</div>
  </div>
  <div class="dre40-grid" style="margin-top:12px">
    <div class="dre40-card"><h3>DRE do período</h3><div class="sub">Leitura financeira consolidada do que já está disponível no sistema.</div><div class="dre40-profit-stack"><div class="dre40-profit-line"><span>Receita bruta</span><b>${money(d.grossRevenue)}</b></div><div class="dre40-profit-line"><span>(−) Descontos e combos</span><b>${money(d.discounts)}</b></div>${d.customerFees?`<div class="dre40-profit-line"><span>(+) Acréscimos cobrados</span><b>${money(d.customerFees)}</b></div>`:''}<div class="dre40-profit-line total"><span>Receita líquida comercial</span><b>${money(d.netRevenue)}</b></div><div class="dre40-profit-line"><span>(−) Taxas financeiras</span><b>${money(d.processorFees)}</b></div><div class="dre40-profit-line"><span>(−) Comissões</span><b>${money(d.commissions)}</b></div><div class="dre40-profit-line total"><span>Margem de contribuição antes de insumos</span><b>${money(d.contributionValue)}</b></div>${Object.entries(d.byCat).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="dre40-profit-line"><span>(−) ${escapeHtml(k)}</span><b>${money(v)}</b></div>`).join('')}<div class="dre40-profit-line total ${d.operatingResult>=0?'good':'bad'}"><span>Resultado operacional / gerencial parcial</span><b>${money(d.operatingResult)}</b></div></div></div>
    <div class="dre40-card"><h3>Precisão atual do DRE</h3><div class="sub">O sistema não completa lacunas com números inventados.</div><div class="inline-note"><b>Já entram:</b> faturamento realizado, descontos/combos, acréscimos, taxas de operadora, comissões configuradas e despesas financeiras classificadas.</div><div class="inline-note" style="margin-top:8px"><b>Entrarão nas próximas etapas:</b> insumos consumidos por categoria, CMV de produtos de revenda, compras/estoque, custos fixos completos e impostos. Quando esses módulos forem fechados, o indicador “Resultado Gerencial Parcial” passa a poder ser tratado como lucro final do período.</div><div class="inline-note" style="margin-top:8px"><b>Gorjetas:</b> ${money(d.tips)} no período, mantidas fora da receita por serem valores a repassar às profissionais.</div></div>
  </div>`;
}
