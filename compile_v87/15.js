
/* ===== V48: MODELOS APARECEM COMO PREVISÃO EM PROFISSIONAIS ANTES DA FINALIZAÇÃO ===== */
function commissionPendingModelItems(){
 let out=[];
 for(const c of (db.clientCommands||[]).filter(c=>c.status!=='Pago'&&c.partnership?.enabled)){
  for(const x of partnershipCommissionRows(c,c.partnership)){
   let r=x.r;if(!r.professionalId)continue;
   let rule=remunerationRuleFor(r.professionalId,c.unitId,c.date),amount=x.amount,detail=`Modelo/Parceria · base ${money(x.base)} · ${x.pct?String(x.pct).replace('.',',')+'%':'comissão não configurada'}`;
   if(rule&&['fixed','daily'].includes(rule.model)){amount=0;detail=`${remModelLabel(rule.model)} · produção sem comissão de serviço`}
   out.push({type:'predicted_model',key:`pred:${c.id}:${r.lineId||r.key}`,date:c.date,unitId:c.unitId,professionalId:r.professionalId,commandId:c.id,clientId:c.clientId,serviceId:r.serviceId,serviceName:r.serviceName,professionalName:r.professionalName,base:x.base,pct:x.pct,amount,detail});
  }
 }
 return out;
}
function commissionPendingModelFiltered({proId='',unitId=commissionUnit,from=commissionFrom,to=commissionTo}={}){
 return commissionPendingModelItems().filter(x=>(!proId||x.professionalId===proId)&&(unitId==='all'||x.unitId===unitId)&&(!from||x.date>=from)&&(!to||x.date<=to));
}
function commissionPendingModelForPro(proId){return commissionPendingModelFiltered({proId}).reduce((s,x)=>s+Number(x.amount||0),0)}

const _renderCommissionCenterV48Base=renderCommissionCenter;
renderCommissionCenter=function(){
 _renderCommissionCenterV48Base();
 let table=adminPage.querySelector('.commission-table');if(!table)return;
 let headRow=table.querySelector('thead tr');if(headRow&&!headRow.querySelector('.v48-pred-head')){
  let th=document.createElement('th');th.className='num v48-pred-head';th.textContent='Prevista (modelos)';
  let ref=headRow.children[2];headRow.insertBefore(th,ref||null);
 }
 let ps=commissionCurrentPros(),bodyRows=[...table.querySelectorAll('tbody tr')];
 bodyRows.forEach((tr,i)=>{let p=ps[i];if(!p||tr.querySelector('.commission-empty')||tr.querySelector('.v48-pred-cell'))return;let v=commissionPendingModelForPro(p.id),td=document.createElement('td');td.className='num v48-pred-cell';td.innerHTML=`<span class="${v>0?'v48-predicted':''}">${money(v)}</span>`;let ref=tr.children[2];tr.insertBefore(td,ref||null)});
 let total=commissionPendingModelFiltered().reduce((s,x)=>s+Number(x.amount||0),0),kpis=adminPage.querySelector('.commission-kpis');
 if(kpis&&!kpis.querySelector('.v48-pred-kpi')){let d=document.createElement('div');d.className='commission-kpi v48-pred-kpi';d.innerHTML=`<span>Comissão prevista · modelos</span><b>${money(total)}</b><small>Comandas abertas. Não entra no saldo até finalizar.</small>`;kpis.insertBefore(d,kpis.firstChild)}
};

const _openCommissionProfessionalV48Base=openCommissionProfessional;
openCommissionProfessional=function(proId){
 _openCommissionProfessionalV48Base(proId);
 setTimeout(()=>{
  let m=document.querySelector('#modalHost .modal');if(!m)return;
  let pending=commissionPendingModelFiltered({proId}).sort((a,b)=>String(b.date).localeCompare(String(a.date))),sum=pending.reduce((s,x)=>s+Number(x.amount||0),0);
  let grid=m.querySelector('.commission-detail-grid');
  if(grid&&!grid.querySelector('.v48-pred-box')){let d=document.createElement('div');d.className='commission-detail-box v48-pred-box';d.innerHTML=`<span>Prevista · modelos</span><b class="v48-predicted">${money(sum)}</b>`;grid.appendChild(d)}
  if(!pending.length||m.querySelector('.v48-pending-card'))return;
  let clientName=id=>db.clients.find(c=>c.id===id)?.name||'Cliente';
  let rows=pending.map(x=>`<tr><td>${formatDateBR(x.date)}</td><td><b>${escapeHtml(clientName(x.clientId))}</b></td><td>${escapeHtml(x.serviceName||'Serviço')}</td><td class="num">${money(x.base)}</td><td class="num ${x.pct?'':'v47-warning'}">${x.pct?String(x.pct).replace('.',',')+'%':'Não configurada'}</td><td class="num"><b>${money(x.amount)}</b></td><td><span class="v48-badge">Aguardando finalização</span></td></tr>`).join('');
  let card=document.createElement('div');card.className='v48-pending-card';card.innerHTML=`<div class="v48-pending-head"><div><b>Modelos / Parcerias ainda abertas</b><div class="muted" style="font-size:10px;margin-top:2px">Visibilidade operacional: estas comissões estão previstas, mas ainda não fazem parte do saldo a pagar.</div></div><div class="spacer"></div><b class="v48-predicted">${money(sum)}</b></div><div style="overflow:auto"><table><thead><tr><th>Data</th><th>Cliente</th><th>Serviço</th><th class="num">Base</th><th class="num">%</th><th class="num">Prevista</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  let note=[...m.querySelectorAll('.inline-note')].find(x=>x.textContent.includes('Período:'));
  if(note)note.insertAdjacentElement('afterend',card);else if(grid)grid.insertAdjacentElement('afterend',card);
 },0)
};

const _openModelPartnershipV48Base=openModelPartnership;
openModelPartnership=function(cmdId){
 _openModelPartnershipV48Base(cmdId);
 setTimeout(()=>{let note=document.querySelector('#modalHost .modal .inline-note');if(note&&note.textContent.includes('comissão só passa'))note.innerHTML='<b>Não é desconto comum.</b> Preço de tabela, valor pago pela modelo e base da comissão ficam separados. Ao salvar, a comissão aparece em <b>Profissionais → Comissões & Acertos</b> como <b>Prevista</b>. Ela só entra no saldo a pagar depois que a comanda for finalizada.'},0)
};
