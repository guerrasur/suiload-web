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
  el('update-web').addEventListener('click',()=>location.reload());
  window.addEventListener('unhandledrejection',e=>toast(e.reason?.message||'No se pudo completar la operación.','error'));
  status();
})();
