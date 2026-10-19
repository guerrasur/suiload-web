"use strict";
// Comandas share the device database, backups and menu with delivery orders.
(() => {
  const el = id => document.getElementById(id);
  let config = {}, items = [], editId = null, payment = 'Efectivo', filter = 'todos', saving = false, resolveMode, initialized = false;
  const active = () => config.modo_uso === 'comanda';
  const request = (url, body, method = 'POST') => window.SuiloadLocal.request(url, body === undefined ? {} : {method, body:JSON.stringify(body)});
  const esc = value => escapeHtml(value);
  const modeButtons = [...document.querySelectorAll('[data-mode]')];
  function apply(cfg) {
    config = cfg;
    if(!initialized){initialized=true;setPayment(config.metodo_pago_default||'Efectivo',false);}
    el('comanda-workspace').hidden = !active();
    el('delivery-workspace').hidden = active();
    el('co-tools').setAttribute('aria-expanded','false');
    el('usage-change').textContent = active() ? 'Comandas · Cambiar uso' : 'Reparto · Cambiar uso';
    document.querySelector('.tabs [data-tab="pedidos"]').textContent = active() ? 'Comandas' : 'Pedidos';
    el('c-modo').value = cfg.modo_uso;
    el('c-marcho').checked = cfg.mostrar_marcho !== 'false';
    for(const id of ['c-demora','c-limite','c-envio','c-no-envio','c-tipo-pedido','c-direccion-local','c-ciudad-default','c-asignar-repartidor'])el(id).closest('.field').hidden=active();
    for(const tab of ['clientes','cuentas','judiciales'])document.querySelector(`.tabs [data-tab="${tab}"]`).hidden=active();
    catalog(); renderBoard();
  }
  function choose() {
    el('usage-error').textContent = '';
    el('modal-usage').classList.add('show');
    modeButtons.find(b => b.dataset.mode === config.modo_uso)?.focus();
    return new Promise(resolve => { resolveMode = resolve; });
  }
  modeButtons.forEach(button => button.onclick = async () => {
    modeButtons.forEach(b => b.disabled = true);
    try {
      _cfgCache = await request('/api/config',{modo_uso:button.dataset.mode,modo_elegido:'true'},'PUT');
      apply(_cfgCache);
      el('modal-usage').classList.remove('show');
      resolveMode?.(); resolveMode = null;
      if(window.SuiloadAppReady) { switchTab('pedidos'); await loadCatalog(); await loadDay(); el('usage-change').focus(); }
    } catch(e) { el('usage-error').textContent = e.message; }
    finally { modeButtons.forEach(b => b.disabled = false); }
  });
  el('modal-usage').addEventListener('keydown',e=>{
    if(e.key==='Tab') { e.preventDefault(); (document.activeElement===modeButtons[0]?modeButtons[1]:modeButtons[0]).focus(); }
  });
  el('usage-change').onclick = choose;
  el('co-tools').onclick = () => {
    el('delivery-workspace').hidden = !el('delivery-workspace').hidden;
    el('co-tools').setAttribute('aria-expanded',String(!el('delivery-workspace').hidden));
    for(const tab of ['clientes','cuentas','judiciales'])document.querySelector(`.tabs [data-tab="${tab}"]`).hidden=el('delivery-workspace').hidden;
  };
  const unitPrice = p => payment === 'Efectivo' ? p.precio_efectivo : p.precio_lista;
  function setPayment(value, reprice = true) {
    payment = value;
    document.querySelectorAll('.co-pay[data-pay]').forEach(b=>{
      b.setAttribute('aria-pressed',String(b.dataset.pay===value));
    });
    el('co-otro-pago').value = ['QR','Posnet'].includes(value) ? value : '';
    if(reprice)items.forEach(i=>{const p=state.platos.find(p=>p.id===i.plato_id);if(p)i.precio_unitario=unitPrice(p);});
    renderItems(); catalog();
  }
  document.querySelectorAll('.co-pay[data-pay]').forEach(b=>b.onclick=()=>setPayment(b.dataset.pay));
  el('co-otro-pago').onchange = e => setPayment(e.target.value || 'Efectivo');
  function itemButton(p) {
    const button=document.createElement('button');button.type='button';button.className='co-product';
    button.innerHTML=`<strong>${esc(p.nombre)}</strong><span>${money(unitPrice(p))}</span>`;
    button.onclick=()=>{
      const old=items.find(i=>i.plato_id===p.id&&i.precio_unitario===unitPrice(p));
      if(old)old.cantidad++;else items.push({plato_id:p.id,nombre:p.nombre,cantidad:1,precio_unitario:unitPrice(p)});
      renderItems();
    };return button;
  }
  function catalog() {
    if(!window.SuiloadLocal || typeof state==='undefined')return;
    const menu=state.platos.filter(p=>!p.es_plato_del_dia);
    el('co-quick-items').replaceChildren(); el('co-search-results').replaceChildren();
    const delivery=el('delivery-quick-items');delivery.replaceChildren();
    if(menu.length<=12)menu.forEach(p=>{
      const button=document.createElement('button');button.type='button';button.className='co-product';
      button.innerHTML=`<strong>${esc(p.nombre)}</strong><span>${money(el('f-pago').value==='Efectivo'?p.precio_efectivo:p.precio_lista)}</span>`;
      button.onclick=()=>{
        const previous=state.items.find(i=>!i.es_pdd&&i.plato_id===p.id);
        if(previous)previous.cantidad++;else state.items.push({plato_id:p.id,nombre:p.nombre,cantidad:1,precio_unitario:el('f-pago').value==='Efectivo'?p.precio_efectivo:p.precio_lista,es_pdd:false});
        window.SuiloadDeliveryRenderItems();
      };delivery.append(button);
    });
    el('co-menu-empty').hidden = menu.length>0;
    el('co-catalog-search').hidden = menu.length<=12;
    const query=el('co-search').value.trim().toLocaleLowerCase('es');
    const visible=menu.length<=12 ? menu : menu.filter(p=>(p.nombre+' '+p.categoria).toLocaleLowerCase('es').includes(query));
    const target=el(menu.length<=12?'co-quick-items':'co-search-results');
    visible.forEach(p=>target.append(itemButton(p)));
    if(menu.length>12&&!visible.length)target.textContent='No hay ítems con ese nombre.';
  }
  el('co-search').oninput=catalog;
  function totals() {
    return window.SuiloadLocal.total({items,tipo:'Reserva',descuento_tipo:el('co-desc-tipo').value||null,descuento_valor:el('co-desc-valor').value});
  }
  function updateTotal() { el('co-total').textContent=money(totals().total); }
  function renderItems() {
    const root=el('co-items');root.replaceChildren();
    items.forEach((item,index)=>{
      const row=document.createElement('div');row.className='co-item';
      row.innerHTML=`<label class="field co-item-name">Ítem<input data-key="nombre" aria-label="Nombre del ítem ${index+1}" value="${esc(item.nombre)}" required /></label><label class="field">Cant.<input data-key="cantidad" aria-label="Cantidad de ${esc(item.nombre)}" type="number" min="1" step="1" value="${item.cantidad}" required /></label><label class="field">Precio u.<input data-key="precio_unitario" aria-label="Precio de ${esc(item.nombre)}" type="number" min="0" step="0.01" value="${item.precio_unitario}" required /></label><strong class="co-subtotal">${money(item.cantidad*item.precio_unitario)}</strong><button type="button" class="btn ghost sm" aria-label="Quitar ${esc(item.nombre)}">×</button>`;
      row.querySelectorAll('input').forEach(input=>input.oninput=()=>{
        item[input.dataset.key]=input.dataset.key==='nombre'?input.value:Number(input.value);
        row.querySelector('.co-subtotal').textContent=money(item.cantidad*item.precio_unitario);updateTotal();
      });
      row.querySelector('button').onclick=()=>{items.splice(index,1);renderItems();};root.append(row);
    });
    updateTotal();
  }
  el('co-desc-tipo').onchange=updateTotal;el('co-desc-valor').oninput=updateTotal;
  el('co-custom').onclick=()=>{items.push({plato_id:null,nombre:'',cantidad:1,precio_unitario:0});renderItems();el('co-items').lastElementChild.querySelector('input').focus();};
  function clear() {
    items=[];editId=null;el('comanda-form').reset();el('co-error').textContent='';
    el('co-title').textContent='Nueva comanda';el('co-save').textContent='Anotar comanda';el('co-cancel').textContent='Limpiar';
    setPayment(['Efectivo','Transferencia','QR','Posnet'].includes(config.metodo_pago_default)?config.metodo_pago_default:'Efectivo',false);
  }
  el('co-cancel').onclick=clear;
  el('comanda-form').onsubmit=async event=>{
    event.preventDefault();if(saving)return;
    if(!items.length){el('co-error').textContent='Elegí al menos un ítem del menú.';return;}
    saving=true;el('co-save').disabled=true;el('co-error').textContent='';
    const body={modo:'comanda',tipo:'Reserva',fecha:state.fecha,numero:el('co-numero').value||null,cliente_nombre:el('co-nombre').value.trim(),metodo_pago:payment,items:structuredClone(items),repartidor:el('co-mozo').value.trim(),descuento_tipo:el('co-desc-tipo').value||null,descuento_valor:Number(el('co-desc-valor').value)||0,notas:el('co-notas').value.trim(),costo_envio:0,no_cobrar_envio:true};
    try {
      const order=await request('/api/pedidos'+(editId?'/'+editId:''),body,editId?'PATCH':'POST');
      clear();await loadDay();toast(`Comanda N° ${order.numero} guardada.`,'ok');
    }catch(e){el('co-error').textContent=e.message;}
    finally{saving=false;el('co-save').disabled=false;}
  };
  function edit(p) {
    editId=p.id;items=structuredClone(p.items);payment=p.metodo_pago;
    el('co-nombre').value=p.cliente_nombre;el('co-numero').value=p.numero;el('co-mozo').value=p.repartidor||'';
    el('co-desc-tipo').value=p.descuento_tipo||'monto';el('co-desc-valor').value=p.descuento_valor||0;el('co-notas').value=p.notas||'';
    el('co-title').textContent=`Editar comanda N° ${p.numero}`;el('co-save').textContent='Guardar cambios';el('co-cancel').textContent='Cancelar edición';
    setPayment(p.metodo_pago,false);el('co-nombre').focus();el('comanda-form').scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function mutate(p,body,button) {
    button.disabled=true;
    try{await request('/api/pedidos/'+p.id,body,'PATCH');await loadDay();}
    catch(e){toast(e.message,'error');button.disabled=false;}
  }
  function statusButton(p,key,off,on) {
    const b=document.createElement('button');b.type='button';b.className='co-status '+(p[key]?'is-done':'');
    b.textContent=p[key]?on:off;b.setAttribute('aria-pressed',String(!!p[key]));
    b.onclick=()=>mutate(p,{[key]:!p[key]},b);return b;
  }
  function renderBoard() {
    if(typeof state==='undefined')return;
    el('co-fecha').value=state.fecha;
    const orders=state.pedidos.filter(p=>p.modo==='comanda'&&!p.anulado);
    const unpaid=orders.filter(p=>!p.pagado),sum=rows=>rows.reduce((n,p)=>n+p.total,0);
    el('co-summary').innerHTML=`<h2>${orders.length} comanda${orders.length===1?'':'s'} · ${money(sum(orders))}</h2><p>${orders.filter(p=>!p.completado).length} en curso · ${orders.filter(p=>p.completado).length} completadas</p><p class="${unpaid.length?'co-unpaid':''}">${unpaid.length?`${unpaid.length} sin pagar · ${money(sum(unpaid))}${state.fecha<todayISO()?' · Pendiente al cierre':''}`:'Sin cobros pendientes'}</p>`;
    const names=[...new Set(orders.map(p=>p.repartidor).filter(Boolean))];
    el('co-mozos').innerHTML=names.map(n=>`<option value="${esc(n)}"></option>`).join('');
    const root=el('co-orders');root.replaceChildren();
    const visible=orders.filter(p=>filter==='todos'||filter==='pendientes'&&!p.completado||filter==='listos'&&p.listo&&!p.completado||filter==='completados'&&p.completado||filter==='sin-pagar'&&!p.pagado);
    if(!visible.length)root.innerHTML='<div class="card muted">No hay comandas en esta vista.</div>';
    visible.forEach(p=>{
      const card=document.createElement('article');card.className='card co-order'+(p.completado?' co-completed':'');card.dataset.id=p.id;
      card.innerHTML=`<div class="row between"><h3>N° ${p.numero}${p.cliente_nombre?' · '+esc(p.cliente_nombre):''}</h3><strong>${money(p.total)}</strong></div><p class="muted">${esc(p.metodo_pago)}${p.repartidor?' · Mozo: '+esc(p.repartidor):''}</p><ul>${p.items.map(i=>`<li><strong>${i.cantidad} × ${esc(i.nombre)}</strong><span>${money(i.cantidad*i.precio_unitario)}</span></li>`).join('')}</ul>${p.descuento_valor?`<p class="muted">Descuento: ${money(window.SuiloadLocal.total(p).descuento)}</p>`:''}${p.notas?`<p>${esc(p.notas)}</p>`:''}<div class="co-statuses"></div><div class="row co-order-actions"><button type="button" class="btn ghost sm co-edit">Editar</button><button type="button" class="btn ghost sm co-ticket">Ticket</button><button type="button" class="btn ghost sm co-annul">Anular</button></div>`;
      const statuses=card.querySelector('.co-statuses');statuses.append(statusButton(p,'pagado','No pagado','Pagado'));
      if(config.mostrar_marcho!=='false')statuses.append(statusButton(p,'marcho','No marchó','Marchó'));
      statuses.append(statusButton(p,'listo','Sin preparar','Pedido listo'),statusButton(p,'completado','No completado','Completado'));
      card.querySelector('.co-edit').onclick=()=>edit(p);
      card.querySelector('.co-ticket').onclick=()=>openTicket(p);
      card.querySelector('.co-annul').onclick=async()=>{if(!confirm('¿Anular esta comanda? Se conserva en los datos y deja de sumar.'))return;try{await request(`/api/pedidos/${p.id}/anular`,{});await loadDay();}catch(e){toast(e.message,'error');}};
      root.append(card);
    });
  }
  el('co-filters').querySelectorAll('button').forEach(b=>b.onclick=()=>{
    filter=b.dataset.filter;el('co-filters').querySelectorAll('button').forEach(other=>{const selected=other===b;other.setAttribute('aria-pressed',String(selected));other.className='btn sm '+(selected?'secondary':'ghost');});renderBoard();
  });
  async function debts() {
    const rows=await request('/api/comandas/pendientes-cobro');const root=el('co-deudas');root.hidden=!rows.length;root.replaceChildren();
    if(!rows.length)return;
    const heading=document.createElement('h2');heading.textContent=`Pendientes de cobro de días anteriores · ${money(rows.reduce((n,p)=>n+p.total,0))}`;root.append(heading);
    const detail=document.createElement('details');const title=document.createElement('summary');title.textContent=`Ver ${rows.length} comanda${rows.length===1?'':'s'} sin pagar al cierre`;detail.append(title);
    rows.forEach(p=>{const row=document.createElement('div');row.className='row between co-debt';const label=document.createElement('span');label.textContent=`${p.fecha} · N° ${p.numero}${p.cliente_nombre?' · '+p.cliente_nombre:''} · ${money(p.total)}`;const button=document.createElement('button');button.type='button';button.className='btn secondary sm';button.textContent='Marcar pagado';button.onclick=()=>mutate(p,{pagado:true},button);row.append(label,button);detail.append(row);});root.append(detail);
  }
  el('co-fecha').onchange=async e=>{if(!e.target.value)return;state.fecha=e.target.value;await loadDay();};
  el('co-hoy').onclick=async()=>{state.fecha=todayISO();await loadDay();};
  window.SuiloadComandas={
    active, apply, catalog,
    async chooseModeIfNeeded(){config=await request('/api/config');if(config.modo_elegido!=='true')await choose();else apply(config);},
    async refresh(){renderBoard();if(active())await debts();},
    getDraft(){return {items,editId,payment,fields:['co-nombre','co-numero','co-mozo','co-desc-tipo','co-desc-valor','co-notas'].map(id=>({id,value:el(id).value}))};},
    restoreDraft(draft){if(!draft||!Array.isArray(draft.items))return;items=draft.items;editId=draft.editId||null;draft.fields?.forEach(f=>{if(['co-nombre','co-numero','co-mozo','co-desc-tipo','co-desc-valor','co-notas'].includes(f.id))el(f.id).value=f.value;});if(editId){el('co-title').textContent='Editar comanda';el('co-save').textContent='Guardar cambios';}setPayment(draft.payment||'Efectivo',false);}
  };
})();
