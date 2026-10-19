"use strict";
// One editor for first-run setup and subsequent changes. Saving is atomic.
(() => {
  const el = id => document.getElementById(id);
  const modal = el('modal-menu'), form = el('menu-form'), rows = el('menu-rows');
  let finish, initial = false, busy = false, previousFocus;
  function addRow(item = {}) {
    const row = document.createElement('div');
    row.className = 'menu-row';
    if (item.id != null) row.dataset.id = item.id;
    const field = (label, key, type, value, required = false) => {
      const wrapper = document.createElement('label');
      wrapper.className = 'field';
      const text = document.createElement('span'); text.textContent = label;
      const input = document.createElement('input');
      input.type = type; input.dataset.key = key; input.value = value ?? '';
      input.required = required;
      if (type === 'number') { input.min = '0'; input.step = '0.01'; input.inputMode = 'decimal'; }
      wrapper.append(text, input); row.append(wrapper);
      return input;
    };
    field('Nombre del ítem', 'nombre', 'text', item.nombre, true);
    field('Categoría (opcional)', 'categoria', 'text', item.categoria);
    field('Precio / Efectivo $', 'precio_efectivo', 'number', item.precio_efectivo, true);
    field('Lista $ (opcional)', 'precio_lista', 'number', item.precio_lista);
    if (item.id != null) {
      const label = document.createElement('label'); label.className = 'menu-active';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
      checkbox.dataset.key = 'activo'; checkbox.checked = item.activo !== false;
      label.append(checkbox, document.createTextNode('Disponible')); row.append(label);
    } else {
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn ghost sm';
      remove.textContent = 'Quitar'; remove.setAttribute('aria-label', 'Quitar ítem nuevo');
      remove.onclick = () => { row.remove(); el('menu-add').focus(); };
      row.append(remove);
    }
    rows.append(row);
    return row;
  }
  function close() {
    modal.classList.remove('show');
    previousFocus?.focus();
    const resolve = finish; finish = null; resolve?.();
  }
  function open(items, firstRun, config = {}) {
    initial = firstRun; previousFocus = document.activeElement;
    rows.replaceChildren(); el('menu-error').textContent = '';
    el('menu-alert-settings').hidden = !initial;
    el('menu-alert-enabled').checked = config.alerta_sin_facturar_habilitada === 'true';
    el('menu-alert-time').value = config.hora_alerta_sin_facturar || '14:00';
    syncAlert();
    el('menu-title').textContent = initial ? 'Paso 2 de 2: armá tu menú' : 'Editar menú y precios';
    el('menu-save').textContent = initial ? 'Guardar menú y continuar' : 'Guardar cambios';
    el('menu-cancel').textContent = initial ? 'Configurar después' : 'Cancelar';
    items.forEach(addRow);
    if (!items.length) addRow();
    modal.classList.add('show'); rows.querySelector('input')?.focus();
    return new Promise(resolve => { finish = resolve; });
  }
  function alertConfig() {
    return {alerta_sin_facturar_habilitada:el('menu-alert-enabled').checked, hora_alerta_sin_facturar:el('menu-alert-time').value};
  }
  function syncAlert() {
    el('menu-alert-time').disabled = busy || !el('menu-alert-enabled').checked;
    el('menu-alert-time').required = initial && el('menu-alert-enabled').checked;
  }
  el('menu-alert-enabled').onchange = syncAlert;
  function setBusy(value) {
    busy = value;
    form.querySelectorAll('button,input').forEach(input => { input.disabled = value; });
    syncAlert();
  }
  el('menu-add').onclick = () => addRow().querySelector('input').focus();
  el('menu-cancel').onclick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (initial) await window.SuiloadLocal.request('/api/config', {method:'PUT', body:JSON.stringify({menu_configurado:'true',...alertConfig()})});
      close();
    } catch (e) { el('menu-error').textContent = e.message; }
    finally { setBusy(false); }
  };
  form.onsubmit = async event => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    const items = [...rows.children].map(row => {
      const item = {};
      if (row.dataset.id) item.id = Number(row.dataset.id);
      row.querySelectorAll('input').forEach(input => { item[input.dataset.key] = input.type === 'checkbox' ? input.checked : input.value.trim(); });
      return item;
    });
    if (!items.length) { el('menu-error').textContent = 'Agregá al menos un ítem, o elegí Configurar después.'; return; }
    setBusy(true); el('menu-error').textContent = '';
    try {
      await window.SuiloadLocal.request('/api/platos/guardar-carta', {method:'POST', body:JSON.stringify({items,...(initial?{config:alertConfig()}: {})})});
      if (!initial) { await loadCatalog(); await loadCarta(); }
      close(); toast('Menú guardado.', 'ok');
    } catch (e) { el('menu-error').textContent = e.message; }
    finally { setBusy(false); }
  };
  modal.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !initial) { event.preventDefault(); el('menu-cancel').click(); }
    if (event.key !== 'Tab') return;
    const focusable = [...modal.querySelectorAll('input,button')].filter(input => !input.disabled);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  el('menu-editar').onclick = async () => {
    try {
      const items = await window.SuiloadLocal.request('/api/platos?incluir_inactivos=true');
      await open(items, false);
    } catch (e) { toast(e.message, 'error'); }
  };
  window.SuiloadMenu = {
    async configureIfNeeded() {
      const config = await window.SuiloadLocal.request('/api/config');
      const items = await window.SuiloadLocal.request('/api/platos?incluir_inactivos=true');
      // Never replace an existing menu, including menus from older backups.
      if (config.menu_configurado === 'true' || items.length) return;
      await open([], true, config);
    }
  };
})();
