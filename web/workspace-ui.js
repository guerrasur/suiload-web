"use strict";
(() => {
  const el=id=>document.getElementById(id);
  let aliasConfig={},editing=false;
  function applyAlias(cfg) {
    aliasConfig=cfg;
    el('alias-value').textContent=cfg.alias_transferencia||'Configurar alias';
    el('alias-edit').textContent=cfg.alias_bloqueado==='true'?'🔒 Desbloquear':'✎ Editar';
    el('alias-bar').classList.toggle('alias-fixed',cfg.alias_bloqueado==='true');
    if(!editing){el('alias-input').value=cfg.alias_transferencia||'';el('alias-lock').checked=cfg.alias_bloqueado==='true';}
  }
  function closeAlias() {
    editing=false;el('alias-form').hidden=true;el('alias-display').hidden=false;
    applyAlias(aliasConfig);el('alias-edit').focus();
  }
  el('alias-edit').onclick=()=>{
    editing=true;el('alias-form').hidden=false;el('alias-display').hidden=true;
    el('alias-error').textContent='';el('alias-input').value=aliasConfig.alias_transferencia||'';
    // A locked alias requires an explicit unlock action before editing.
    el('alias-lock').checked=false;el('alias-input').focus();
  };
  el('alias-cancel').onclick=closeAlias;
  el('alias-input').onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();closeAlias();}};
  el('alias-form').onsubmit=async event=>{
    event.preventDefault();el('alias-save').disabled=true;
    try {
      const cfg=await window.SuiloadLocal.request('/api/config',{method:'PUT',body:JSON.stringify({alias_transferencia:el('alias-input').value.trim(),alias_bloqueado:el('alias-lock').checked})});
      _cfgCache=cfg;aliasConfig=cfg;closeAlias();
      el('c-alias').value=cfg.alias_transferencia;el('c-alias-lock').checked=cfg.alias_bloqueado==='true';
    }catch(e){el('alias-error').textContent=e.message;}
    finally{el('alias-save').disabled=false;}
  };
  function renderDayTotals() {
    const orders=state.pedidos.filter(p=>!p.anulado),sum=rows=>rows.reduce((n,p)=>n+p.total,0);
    const paid=orders.filter(p=>p.pagado);
    el('day-totals-label').textContent=`Total del día · ${state.fecha.split('-').reverse().join('/')} · todos los pedidos`;
    el('day-total-value').textContent=money(sum(orders));
    el('day-payment-status').textContent=`Cobrado ${money(sum(paid))} · Sin pagar ${money(sum(orders.filter(p=>!p.pagado)))}`;
    const root=el('day-payment-totals');root.replaceChildren();
    for(const method of ['Efectivo','Transferencia','QR','Posnet']) {
      const rows=orders.filter(p=>p.metodo_pago===method);
      if(!rows.length&&!['Efectivo','Transferencia'].includes(method))continue;
      const badge=document.createElement('span');badge.className='pago-pill '+pagoClase(method);
      badge.dataset.method=method;
      badge.textContent=`${method==='Efectivo'?'💵':method==='Transferencia'?'🏦':'💳'} ${method}: ${money(sum(rows))}`;
      root.append(badge);
    }
  }
  el('day-export').onclick=async()=>{
    const button=el('day-export');button.disabled=true;button.textContent='Generando Excel…';
    try{await window.SuiloadLocal.exportExcel(state.fecha);}
    catch(e){toast(e.message,'error');}
    finally{button.disabled=false;button.textContent='⬇ Exportar Excel del día';}
  };
  function measure() {
    const style=document.documentElement.style;
    const current=el(document.body.classList.contains('comanda-mode')?'co-checkout':'delivery-checkout').getBoundingClientRect().height;
    if(current)style.setProperty('--checkout-height',current+'px');
  }
  const observer=new ResizeObserver(measure);
  for(const id of ['co-checkout','delivery-checkout'])observer.observe(el(id));
  window.addEventListener('resize',measure);
  window.SuiloadWorkspace={applyAlias,renderDayTotals};
})();
