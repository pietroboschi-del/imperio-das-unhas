
/* ===== V47: CORREÇÃO DO LANÇAMENTO DE MODELO/PARCERIA NAS COMISSÕES ===== */
function partnershipCommissionRows(c, override=null){
 if(!c)return [];
 let rows=commissionCommandServiceLines(c), grossTotal=rows.reduce((s,r)=>s+Math.max(0,Number(r.gross||0)),0), p=override||c.partnership||{};
 if(!p.enabled)return rows.map(r=>({r,base:0,pct:commissionPercent(r.serviceId,r.professionalId),amount:0}));
 let mode=p.commissionBaseMode||'full', totalBase=mode==='charged'?Math.max(0,Number(p.chargedValue||0)):mode==='custom'?Math.max(0,Number(p.customCommissionBase||0)):grossTotal;
 let denom=grossTotal||rows.length||1;
 return rows.map(r=>{let share=grossTotal?Math.max(0,Number(r.gross||0))/denom:1/(rows.length||1),base=totalBase*share,pct=commissionPercent(r.serviceId,r.professionalId),amount=base*pct/100;return{r,base,pct,amount}})
}
function partnershipCommissionTotal(c,override=null){return partnershipCommissionRows(c,override).reduce((s,x)=>s+Number(x.amount||0),0)}
function currentPartnershipDraft(){return {enabled:!!document.getElementById('mpEnabled')?.checked,chargedValue:Math.max(0,Number(document.getElementById('mpCharged')?.value||0)),commissionBaseMode:document.getElementById('mpCommissionMode')?.value||'full',customCommissionBase:Math.max(0,Number(document.getElementById('mpCommissionCustom')?.value||0))}}
function partnershipCommissionPreviewHtml(c,p){
 let rows=partnershipCommissionRows(c,p),total=rows.reduce((s,x)=>s+x.amount,0),missing=rows.filter(x=>!x.pct);
 let body=rows.map(x=>{let pro=x.r.professionalName||db.pros.find(z=>z.id===x.r.professionalId)?.name||'—',pct=x.pct?String(x.pct).replace('.',',')+'%':'Não configurada';return '<tr><td><b>'+escapeHtml(x.r.serviceName||'Serviço')+'</b></td><td>'+escapeHtml(pro)+'</td><td class="num">'+money(x.base)+'</td><td class="num '+(x.pct?'':'v47-warning')+'">'+pct+'</td><td class="num"><b>'+money(x.amount)+'</b></td></tr>'}).join('');
 if(!body)body='<tr><td colspan="5" class="muted">Nenhum serviço na comanda.</td></tr>';
 let warn=missing.length?'<div class="inline-note" style="margin:10px"><b>Atenção:</b> '+missing.length+' serviço(s) estão sem percentual de comissão para a profissional responsável. Eles aparecem no extrato, mas geram R$ 0,00 até a regra ser configurada em Serviços/Profissionais.</div>':'';
 return '<div class="v47-commission-preview"><div class="v47-commission-preview-head"><div><b>Prévia da comissão</b><div class="muted" style="font-size:10px;margin-top:2px">A comissão entra no extrato da profissional quando a comanda for finalizada.</div></div><div class="spacer"></div><b class="'+(total>0?'v47-ok':'')+'">'+money(total)+'</b></div><table><thead><tr><th>Serviço</th><th>Profissional</th><th class="num">Base</th><th class="num">%</th><th class="num">Comissão</th></tr></thead><tbody>'+body+'</tbody></table>'+warn+'</div>';
}
function refreshPartnershipCommissionPreview(cmdId){let c=db.clientCommands.find(x=>x.id===cmdId),host=document.getElementById('mpCommissionPreview');if(!c||!host)return;host.innerHTML=partnershipCommissionPreviewHtml(c,currentPartnershipDraft())}

commissionServiceItems=function(){
 let out=[];
 for(const c of (db.clientCommands||[]).filter(c=>c.status==='Pago')){
  let rows=commissionApplyComboAllocation(c,commissionCommandServiceLines(c));
  let partnershipMap=new Map();
  if(c.partnership?.enabled){for(const x of partnershipCommissionRows(c,c.partnership))partnershipMap.set(x.r.lineId||x.r.key,{base:x.base,pct:x.pct,amount:x.amount})}
  for(const r of rows){
   let pct=commissionPercent(r.serviceId,r.professionalId),base=db.commissionSettings.discountsReduceBase!==false?r.netCommercial:r.gross,amount=base*pct/100,detail=`${pct?String(pct).replace('.',',')+'%':'Sem comissão configurada'} · base ${money(base)}`;
   if(c.partnership?.enabled){let x=partnershipMap.get(r.lineId||r.key);if(x){base=x.base;pct=x.pct;amount=x.amount}detail=`Modelo/Parceria · base ${money(base)} · ${pct?String(pct).replace('.',',')+'%':'sem % configurado'} · cobrado ${money(c.partnership.chargedValue||0)}`}
   let rule=remunerationRuleFor(r.professionalId,c.unitId,c.date);if(rule&&['fixed','daily'].includes(rule.model)){amount=0;detail=`${remModelLabel(rule.model)} · produção registrada sem comissão de serviço${c.partnership?.enabled?' · Modelo/Parceria':''}`}
   out.push({...r,type:'service',pct,base,amount,description:r.serviceName,detail,partnership:!!c.partnership?.enabled});
  }
 }
 return out
};

openModelPartnership=function(cmdId){
 let c=db.clientCommands.find(x=>x.id===cmdId);if(!c)return;normalizeCommand(c);
 let p=c.partnership||{enabled:false,chargedValue:commandGrossTotal(c),commissionBaseMode:'full',customCommissionBase:commandGrossTotal(c),contentRequired:'',contentStatus:'Pendente',contentDueDate:'',note:''},list=commandGrossTotal(c);
 modal('Modelo / Parceria',`<div class="inline-note"><b>Não é desconto comum.</b> Preço de tabela, valor pago pela modelo e base da comissão ficam separados. A comissão só passa para o saldo da profissional depois que a comanda é finalizada.</div><div class="form-grid" style="margin-top:12px"><div class="field full"><label class="check"><input id="mpEnabled" type="checkbox" ${p.enabled?'checked':''} onchange="refreshPartnershipCommissionPreview('${cmdId}')"> Este atendimento é Modelo / Parceria</label></div><div class="field"><label>Preço de tabela da visita</label><input value="${list.toFixed(2)}" disabled></div><div class="field"><label>Valor que a modelo paga</label><input id="mpCharged" type="number" min="0" step="0.01" value="${Number(p.chargedValue??list)}" oninput="refreshPartnershipCommissionPreview('${cmdId}')"></div><div class="field"><label>Base da comissão</label><select id="mpCommissionMode" onchange="refreshPartnershipCommissionPreview('${cmdId}')"><option value="full" ${p.commissionBaseMode==='full'?'selected':''}>Valor cheio / tabela</option><option value="charged" ${p.commissionBaseMode==='charged'?'selected':''}>Valor efetivamente cobrado</option><option value="custom" ${p.commissionBaseMode==='custom'?'selected':''}>Valor personalizado</option></select></div><div class="field"><label>Base personalizada</label><input id="mpCommissionCustom" type="number" min="0" step="0.01" value="${Number(p.customCommissionBase||list)}" oninput="refreshPartnershipCommissionPreview('${cmdId}')"></div><div class="field full"><label>Conteúdo combinado</label><textarea id="mpContent" rows="3" placeholder="Ex.: 1 Reel + 3 Stories + fotos do resultado">${escapeHtml(p.contentRequired||'')}</textarea></div><div class="field"><label>Status do conteúdo</label><select id="mpContentStatus"><option ${p.contentStatus==='Pendente'?'selected':''}>Pendente</option><option ${p.contentStatus==='Parcial'?'selected':''}>Parcial</option><option ${p.contentStatus==='Entregue'?'selected':''}>Entregue</option><option ${p.contentStatus==='Dispensado'?'selected':''}>Dispensado</option></select></div><div class="field"><label>Prazo do conteúdo</label><input id="mpContentDue" type="date" value="${p.contentDueDate||''}"></div><div class="field full"><label>Observação</label><input id="mpNote" value="${escapeAttr(p.note||'')}"></div></div><div id="mpCommissionPreview">${partnershipCommissionPreviewHtml(c,p)}</div>`,`<button class="btn btn-ghost" onclick="closeModal();openCommand('${cmdId}')">Voltar</button><button class="btn btn-primary" onclick="saveModelPartnership('${cmdId}')">Salvar parceria</button>`);
 setTimeout(()=>document.querySelector('#modalHost .modal')?.classList.add('modal-wide'),0)
};

const _renderCommandModalV47Base=renderCommandModal;
renderCommandModal=function(id){_renderCommandModalV47Base(id);setTimeout(()=>{let c=db.clientCommands.find(x=>x.id===id),card=document.querySelector('#modalHost .v46-partnership-card');if(!c||!card||!c.partnership?.enabled)return;let total=partnershipCommissionTotal(c,c.partnership),status=c.status==='Pago'?'Comissão gerada':'Comissão prevista';let flex=card.querySelector('div[style*="flex:1"]');if(!flex)return;let line=flex.querySelector('.v47-partnership-summary');if(!line){line=document.createElement('div');line.className='v47-partnership-summary muted';line.style='font-size:10px;margin-top:4px';flex.appendChild(line)}line.innerHTML=`${status}: <b>${money(total)}</b>${c.status!=='Pago'?' · finalize a comanda para lançar no extrato':''}`},0)};

const _finalizeCommandPaymentV47Base=finalizeCommandPayment;
finalizeCommandPayment=function(cmdId){let before=db.clientCommands.find(x=>x.id===cmdId),was=before?.status,part=!!before?.partnership?.enabled;_finalizeCommandPaymentV47Base(cmdId);let after=db.clientCommands.find(x=>x.id===cmdId);if(part&&was!=='Pago'&&after?.status==='Pago'){let total=partnershipCommissionTotal(after,after.partnership),missing=partnershipCommissionRows(after,after.partnership).filter(x=>!x.pct).length;setTimeout(()=>toast(missing?`Modelo finalizada · comissão ${money(total)} lançada · ${missing} serviço(s) sem % configurado`:`Modelo finalizada · ${money(total)} de comissão lançados no extrato ✓`),180)}};
