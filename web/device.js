"use strict";
(() => {
  const el=id=>document.getElementById(id);
  async function status(){let protectedData=false;try{protectedData=await navigator.storage?.persisted();}catch{}el('device-detail').textContent=protectedData?'Guardado persistente habilitado. Mantené una copia de seguridad.':'Guardado local habilitado. Podés solicitar protección contra limpieza automática del navegador.';}
  el('backup-export').addEventListener('click',async()=>{try{await SuiloadLocal.backup();toast('Copia de seguridad descargada.','ok');}catch(e){toast(e.message,'error');}});
  el('backup-import').addEventListener('click',()=>el('backup-file').click());
  el('backup-file').addEventListener('change',async event=>{
    const file=event.target.files[0];event.target.value='';if(!file)return;
    if(!confirm('Importar esta copia reemplaza los datos de este navegador. ¿Continuar?'))return;
    try{await SuiloadLocal.backup();await SuiloadLocal.restore(await file.text());location.reload();}catch(e){toast('No se importó la copia: '+e.message,'error');}
  });
  el('storage-persist').addEventListener('click',async()=>{try{const granted=await navigator.storage?.persist();toast(granted?'Guardado persistente habilitado.':'El navegador no concedió protección. Conservá una copia de seguridad.',granted?'ok':'info');await status();}catch(e){toast(e.message,'error');}});
  const draftKey='suiload-update-draft';
  let checking=false,available=null,reloading=false;
  const fields=root=>Array.from(document.querySelectorAll(root+' input[id],'+root+' select[id],'+root+' textarea[id]'))
    .filter(e=>!['file','password'].includes(e.type)).map(e=>({id:e.id,value:e.value,checked:e.checked}));
  async function applyUpdate(){
    if(reloading||!window.SuiloadAppReady)return;
    // Let modal workflows and inline saves finish before reloading.
    if(document.querySelector('.modal-back.show')||document.activeElement?.closest('#tabla'))return;
    reloading=true;
    try {
      await SuiloadLocal.ready();
      const draft={items:state.items,editId:state.editId,fecha:state.fecha,
        order:fields('#pedido-form'),config:fields('#view-config'),
        tab:document.querySelector('.tabs button.active')?.dataset.tab||'pedidos',
        configDirty:configDirty,focus:document.activeElement?.id};
      sessionStorage.setItem(draftKey,JSON.stringify(draft));
      location.reload();
    }catch(e){reloading=false;toast('No se pudo actualizar: '+e.message,'error');}
  }
  let configDirty=false;
  document.addEventListener('input',e=>{if(e.target.closest('#view-config'))configDirty=true;});
  document.addEventListener('change',e=>{if(e.target.closest('#view-config'))configDirty=true;});
  document.addEventListener('suiload-ready',async()=>{
    try{
      const raw=sessionStorage.getItem(draftKey);if(!raw)return;
      const draft=JSON.parse(raw);
      if(!Array.isArray(draft.items)||!Array.isArray(draft.order))throw Error('Borrador inválido');
      state.fecha=draft.fecha;await loadDay();
      state.items=draft.items;state.editId=draft.editId;
      fillRepartidorSelect(el('f-repartidor'),draft.order.find(f=>f.id==='f-repartidor')?.value||'');
      const restore=rows=>rows.forEach(f=>{const e=el(f.id);if(e){e.value=f.value;if(e.type==='checkbox'||e.type==='radio')e.checked=f.checked;}});
      restore(draft.order);renderItems();toggleEnvio();toggleVuelto();recalc();
      el('form-title').textContent=draft.editId?'Editar pedido':'📝 Nuevo pedido';
      el('btn-guardar').textContent=draft.editId?'Guardar cambios':'Guardar pedido';
      switchTab(draft.tab);
      if(draft.configDirty){await loadConfig();restore(draft.config);configDirty=true;}
      el(draft.focus)?.focus();
      sessionStorage.removeItem(draftKey);
      toast('App actualizada. Se conservó el pedido en curso.','ok');
    }catch(e){toast('No se pudo recuperar el borrador: '+e.message,'error');}
  });
  async function checkUpdate(manual=false){
    if(checking)return;checking=true;
    try{
      const cfg=await SuiloadLocal.request('/api/config');
      if(!manual&&cfg.buscar_actualizaciones_auto==='false')return;
      const response=await fetch('/version.json?t='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error('No se pudo comprobar la versión');
      const release=await response.json();
      if(!/^\d+\.\d+\.\d+$/.test(release.version))throw Error('Versión inválida');
      const parts=release.version.split('.').map(Number),current=window.SUILOAD_VERSION.split('.').map(Number);
      const newer=parts.some((v,i)=>v>current[i]&&parts.slice(0,i).every((n,j)=>n===current[j]));
      if(newer){
        available=release.version;
        el('update-message').textContent='Actualizando a v'+available+'. Se conserva el pedido en curso. Si hay una ventana abierta, se actualizará al cerrarla.';
        el('update-banner').classList.add('show');
        await applyUpdate();
      }else if(manual){toast('La app ya está actualizada (v'+window.SUILOAD_VERSION+').','ok');}
    }catch(e){if(manual)toast('No se pudo buscar la actualización. Revisá la conexión.','error');}
    finally{checking=false;}
  }
  el('update-web').addEventListener('click',()=>checkUpdate(true));
  el('apply-update').addEventListener('click',applyUpdate);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkUpdate();});
  window.addEventListener('online',()=>checkUpdate());
  setInterval(()=>checkUpdate(),5*60*1000);
  setInterval(()=>{if(available)applyUpdate();},3000);
  checkUpdate();
  window.addEventListener('unhandledrejection',e=>toast(e.reason?.message||'No se pudo completar la operación.','error'));
  status();
})();
