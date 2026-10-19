const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function device() {
 let stored;
 const indexedDB={open(){const r={};setImmediate(()=>{r.result={createObjectStore(){},transaction(){const t={objectStore(){return {get(){const q={};setImmediate(()=>{q.result=structuredClone(stored);q.onsuccess();});return q;},put(s){stored=structuredClone(s);setImmediate(()=>t.oncomplete());}};}};return t;}};r.onupgradeneeded();r.onsuccess();});return r;}};
 const c={window:{},indexedDB,navigator:{},location:{origin:'https://suiload.web.app'},URL,URLSearchParams,structuredClone,Date,Number,Math,Map,Set,Promise,setTimeout,Blob,TextEncoder,Uint8Array,DataView};vm.createContext(c);
 for(const file of ['local-api.js','routes.js','excel.js'])vm.runInContext(fs.readFileSync('web/'+file,'utf8'),c);
 return {local:c.window.SuiloadLocal,excel:c.window.SuiloadExcel,api:(url,b,method='POST')=>c.window.SuiloadLocal.request(url,b===undefined?{}:{method,body:JSON.stringify(b)})};
}
const body={modo:'comanda',tipo:'Reserva',fecha:'2000-01-01',metodo_pago:'Transferencia',items:[{nombre:'Café',cantidad:2,precio_unitario:500}],descuento_tipo:'monto',descuento_valor:100};
test('optional identity, sequential automatic numbers, manual numbers and collision rollback',async()=>{
 const {api,local}=device();await local.ready();
 const [a,b]=await Promise.all([api('/api/pedidos',body),api('/api/pedidos',body)]);
 assert.equal(a.numero,1);assert.equal(b.numero,2);assert.equal(a.cliente_nombre,'');assert.equal(a.total,900);
 const manual=await api('/api/pedidos',{...body,numero:42});assert.equal(manual.numero,42);
 const before=await local.snapshot();await assert.rejects(()=>api('/api/pedidos',{...body,numero:42}),/ya está usado/);assert.deepEqual(await local.snapshot(),before);
 await assert.rejects(()=>api('/api/pedidos',{...body,numero:1.5}),/entero positivo/);
 await assert.rejects(()=>api('/api/pedidos',{...body,items:[]}),/al menos un ítem/);
 assert.equal((await api('/api/pedidos/'+manual.id,{numero:42,cliente_nombre:'Ana'},'PATCH')).numero,42);
 await assert.rejects(()=>api('/api/pedidos/'+manual.id,{numero:1},'PATCH'),/ya está usado/);
 assert.equal((await api('/api/pedidos',{...body,fecha:'2000-01-02',numero:42})).numero,42);
});
test('completion advances kitchen and delivery, never payment; reversal and independent payment',async()=>{
 const {api}=device();const p=await api('/api/pedidos',body);
 const done=await api('/api/pedidos/'+p.id,{completado:true},'PATCH');
 assert.equal(done.marcho,true);assert.equal(done.listo,true);assert.equal(done.completado,true);assert.equal(done.pagado,false);
 const paid=await api('/api/pedidos/'+p.id,{pagado:true},'PATCH');assert.equal(paid.completado,true);assert.equal(paid.pagado,true);
 const back=await api('/api/pedidos/'+p.id,{listo:false},'PATCH');assert.equal(back.completado,false);assert.equal(back.listo,false);assert.equal(back.pagado,true);
 const completedAgain=await api('/api/pedidos/'+p.id,{completado:true},'PATCH');assert.equal(completedAgain.pagado,true);
});
test('past unpaid orders survive completion, mode switches and backups; payment clears debt',async()=>{
 const {api,local}=device();const p=await api('/api/pedidos',body);await api('/api/pedidos/'+p.id,{completado:true},'PATCH');
 await api('/api/config',{modo_uso:'comanda',modo_elegido:true,mostrar_marcho:false},'PUT');
 const before=await local.snapshot();await local.restore(JSON.stringify({app:'suiload',data:before}));
 await api('/api/config',{modo_uso:'delivery'},'PUT');assert.equal((await api('/api/config')).mostrar_marcho,'false');
 assert.equal((await api('/api/comandas/pendientes-cobro')).length,1);
 await api('/api/pedidos/'+p.id,{pagado:true},'PATCH');assert.equal((await api('/api/comandas/pendientes-cobro')).length,0);
 const other=await api('/api/pedidos',body);await api('/api/pedidos/'+other.id+'/anular',{});assert.equal((await api('/api/comandas/pendientes-cobro')).length,0);
});
test('delivery numbering and total remain supported and share collision protection',async()=>{
 const {api}=device();const delivery=await api('/api/pedidos',{...body,modo:'delivery',tipo:'Envío',costo_envio:200});assert.equal(delivery.total,1100);
 await assert.rejects(()=>api('/api/pedidos',{...body,numero:delivery.numero}),/ya está usado/);
 await assert.rejects(()=>api('/api/config',{modo_uso:'desconocido'},'PUT'),/Modo de uso/);
});

test('XLSX records unpaid completed comandas with their kitchen states',async()=>{
 const {api,local,excel}=device();const p=await api('/api/pedidos',body);
 await api('/api/pedidos/'+p.id,{completado:true},'PATCH');
 const data=Buffer.from(excel.build(await local.snapshot(),'2000-01-01')).toString('utf8');
 for(const [column,value] of [['P','Comanda'],['Q','No'],['R','Sí'],['S','Sí'],['T','Sí']])assert.match(data,new RegExp('r="'+column+'3"[^>]*><is><t[^>]*>'+value+'<'));
});

test('automatic numbers continue after the highest manual number, per day and across modes',async()=>{
 const {api,local}=device();
 const manual=await api('/api/pedidos',{...body,numero:280});
 const [first,second]=await Promise.all([api('/api/pedidos',body),api('/api/pedidos',body)]);
 assert.equal(first.numero,281);assert.equal(second.numero,282);
 await api('/api/pedidos',{...body,numero:100});
 assert.equal((await api('/api/pedidos',{...body,modo:'delivery',tipo:'Envío'})).numero,283);
 await api('/api/pedidos/'+manual.id,{numero:500},'PATCH');
 const high=await api('/api/pedidos',body);assert.equal(high.numero,501);
 await api('/api/pedidos/'+high.id+'/anular',{});
 assert.equal((await api('/api/pedidos',body)).numero,502);
 assert.equal((await api('/api/pedidos',{...body,fecha:'2000-01-02'})).numero,1);
 await local.restore(JSON.stringify({app:'suiload',data:await local.snapshot()}));
 assert.equal((await api('/api/pedidos',body)).numero,503);
});
