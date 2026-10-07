"use strict";
// Independent browser edition. IndexedDB is the authoritative database.
// Each operation loads and commits within one exclusive cross-tab lock.
(() => {
  const defaults = {minutos_demora_salida:"30", hora_alerta_sin_facturar:"14:00", hora_limite_pedidos:"13:40", costo_envio_default:"3000", direccion_local:"", ciudad_default:"", nombre_local:""};
  const fresh = () => ({schema:1, config:{...defaults}, platos:structuredClone(window.SUILOAD_SEED), clientes:[], pedidos:[], cuentas:[], repartidores:{}, platosDia:{}, geocache:{}, seq:100});
  const today = () => new Date().toLocaleDateString("en-CA");
  const now = () => {const d=new Date(); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,-1);};
  const round = n => Math.round((n+Number.EPSILON)*100)/100;
  const positive = n => {if(!Number.isFinite(Number(n))) throw Error("Indicá un monto válido"); return Math.max(0,Number(n));};
  const find = (rows,id,label) => {const r=rows.find(x=>x.id===+id);if(!r)throw Error(label+" no encontrado");return r;};
  const orderNames = (a,b) => (a.nombre||"").localeCompare(b.nombre||"", "es") || (a.direccion||"").localeCompare(b.direccion||"", "es");
  const remove = (rows,id) => rows.splice(rows.findIndex(x=>x.id===+id),1);
  let connection;
  const db = () => connection ||= new Promise((resolve,reject) => {
    const req=indexedDB.open("suiload-device",1);
    req.onupgradeneeded=()=>req.result.createObjectStore("data");
    req.onsuccess=()=>{req.result.onversionchange=()=>req.result.close();resolve(req.result);};
    req.onerror=()=>reject(Error("No se pudo abrir el almacenamiento del navegador. Usá un navegador con almacenamiento habilitado."));
    req.onblocked=()=>reject(Error("Cerrá otras pestañas de Suiload y volvé a abrir."));
  });
  async function read() {
    const c=await db();
    return new Promise((resolve,reject)=>{const t=c.transaction("data","readonly"),r=t.objectStore("data").get("state");r.onsuccess=()=>resolve(r.result||fresh());r.onerror=()=>reject(r.error);});
  }
  async function write(s) {
    const c=await db();
    return new Promise((resolve,reject)=>{const t=c.transaction("data","readwrite");t.objectStore("data").put(s,"state");t.oncomplete=()=>resolve();t.onabort=t.onerror=()=>reject(Error("No se guardaron los cambios. Revisá el espacio disponible del dispositivo."));});
  }
  // Also serialize on browsers without Web Locks; they cannot safely share writes.
  let queue=Promise.resolve();
  function exclusive(fn) {
    const run=()=>navigator.locks ? navigator.locks.request("suiload-data",fn) : fn();
    const result=queue.then(run);queue=result.catch(()=>{});return result;
  }
  function total(p) {
    const sub=p.items.reduce((n,i)=>n+i.cantidad*i.precio_unitario,0);
    const descuento=p.descuento_tipo==="porcentaje" ? round(sub*Math.min(positive(p.descuento_valor||0),100)/100) : p.descuento_tipo==="monto" ? Math.min(sub,positive(p.descuento_valor||0)) : 0;
    const envio=p.tipo==="Envío"&&!p.no_cobrar_envio ? positive(p.costo_envio||0) : 0;
    return {subtotal:sub, descuento, envio, total:round(Math.max(0,sub+envio-descuento))};
  }
  function normalizeDiscount(p) {
    if(["", "ninguno", undefined].includes(p.descuento_tipo)) p.descuento_tipo=null;
    if(p.descuento_tipo!==null&&!["porcentaje","monto"].includes(p.descuento_tipo))throw Error("Descuento inválido");
    p.descuento_valor=positive(p.descuento_valor||0);
    if(p.descuento_tipo==="porcentaje")p.descuento_valor=Math.min(100,p.descuento_valor);
  }
  function validateOrder(p) {
    if(!["Envío","Reserva"].includes(p.tipo))throw Error("Tipo de pedido inválido");
    if(!["Efectivo","Transferencia","QR","Posnet"].includes(p.metodo_pago))throw Error("Método de pago inválido");
    normalizeDiscount(p);p.costo_envio=positive(p.costo_envio||0);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(p.fecha))throw Error("Fecha inválida");
    p.items.forEach(i=>{i.cantidad=Math.max(1,Math.trunc(Number(i.cantidad)||1));i.precio_unitario=positive(i.precio_unitario||0);});
    p.total=total(p).total;
  }
  function number(s,fecha) {
    const used=new Set(s.pedidos.filter(p=>p.fecha===fecha).map(p=>p.numero));
    for(let i=0;i<90;i++){const n=10+(i*37)%90;if(!used.has(n))return n;}
    return Math.max(...used)+1;
  }
  function out(p,cfg) {
    const result=structuredClone(p), waiting=p.tipo==="Envío"&&!p.hora_salida&&p.hora_salida_programada&&now()<p.hora_salida_programada;
    result.esperando_hora_salida=!!waiting;result.demorado=false;result.alerta_sin_facturar=false;
    if(!p.anulado&&p.fecha===today()&&!waiting){
      result.demorado=p.tipo==="Envío"&&!p.hora_salida && Date.now()-new Date(p.hora_salida_programada||p.hora_pedido).getTime() > Number(cfg.minutos_demora_salida||30)*60000;
      result.alerta_sin_facturar=!p.facturado&&now().slice(11,16)>=(cfg.hora_alerta_sin_facturar||"14:00");
    }
    return result;
  }
  const balance = c => c.movimientos.reduce((n,m)=>n+(m.tipo==="carga"?m.cantidad:-m.cantidad),0);
  function accountOut(s,c) {
    const base={id:c.id,cliente_id:c.cliente_id,nombre:find(s.clientes,c.cliente_id,"Cliente").nombre,tipo:c.tipo};
    const desc=(a,b)=>b.fecha.localeCompare(a.fecha)||b.id-a.id;
    if(c.tipo==="platos")return {...base,saldo:balance(c),movimientos:[...c.movimientos].sort(desc)};
    const pendiente=round(c.pedidos.filter(p=>p.cierre_id===null).reduce((n,p)=>n+p.total,0));
    const por_cobrar=round(c.cierres.filter(x=>!x.pagado).reduce((n,x)=>n+x.total,0));
    return {...base,pendiente,por_cobrar,saldo:round(pendiente+por_cobrar),pedidos:[...c.pedidos].sort(desc),cierres:[...c.cierres].sort((a,b)=>b.id-a.id)};
  }
  async function dispatch(s,path,method,b,q) {
    const parts=path.split("/").filter(Boolean).slice(1), [domain,id,action,subid,subaction]=parts;
    const fecha=q.get("fecha")||today();const next=()=>++s.seq;
    const day=()=>s.pedidos.filter(p=>p.fecha===fecha&&!p.anulado);
    if(domain==="version")return {version:"1.0.0 web"};
    if(domain==="config") {
      if(method==="PUT")for(const k of Object.keys(defaults))if(b[k]!=null)s.config[k]=String(b[k]);
      return s.config;
    }
    if(domain==="clientes") {
      if(method==="GET"){let rows=[...s.clientes].sort(orderNames);if(id!=="agenda"){const needle=(q.get("q")||"").toLowerCase();rows=rows.filter(x=>[x.nombre,x.direccion,x.telefono].some(v=>(v||"").toLowerCase().includes(needle))).slice(0,20);}return rows;}
      if(method==="DELETE"){find(s.clientes,id,"Cliente");if(s.cuentas.some(c=>c.cliente_id===+id))throw Error("El cliente tiene una cuenta. Conservá su historial.");remove(s.clientes,id);return null;}
      const data={nombre:"",direccion:"",telefono:"",indicaciones:"",descuento_tipo:null,descuento_valor:0,...b};normalizeDiscount(data);
      if(method==="POST"){const c={...data,id:next()};s.clientes.push(c);return c;}
      if(method==="PUT"){const c=find(s.clientes,id,"Cliente");Object.assign(c,data);return c;}
    }
    if(domain==="platos") {
      if(method==="GET")return s.platos.filter(p=>q.get("incluir_inactivos")==="true"||p.activo).sort((a,b)=>a.categoria.localeCompare(b.categoria)||orderNames(a,b));
      if(["aumentar","set-precios"].includes(id)){
        const selected=s.platos.filter(p=>b.ids==null?p.activo&&!p.es_plato_del_dia:b.ids.includes(p.id));
        for(const p of selected)for(const key of ["precio_efectivo","precio_lista"]) {
          if(id==="aumentar")p[key]=positive(p[key]+Number(b.monto));
          else if(b[key]!=null)p[key]=positive(b[key]);
        }
        return {ok:true,actualizados:selected.length};
      }
      if(method==="DELETE"){const p=find(s.platos,id,"Plato");if(action==="definitivo"){if(p.activo)throw Error("Sólo se pueden borrar definitivamente platos dados de baja.");remove(s.platos,id);return null;}p.activo=false;return {ok:true};}
      const data={nombre:"",categoria:"",activo:true,es_plato_del_dia:false,precio_efectivo:0,precio_lista:0,...b};
      data.precio_efectivo=positive(data.precio_efectivo);data.precio_lista=positive(data.precio_lista);
      if(method==="POST"){const p={...data,id:next()};s.platos.push(p);return p;}
      if(method==="PUT"){const p=find(s.platos,id,"Plato");Object.assign(p,data);return p;}
    }
    if(domain==="pedidos") {
      if(id==="repartidores")return [...new Set(s.pedidos.map(p=>p.repartidor).filter(Boolean))].sort();
      if(id==="facturar-dia") {
        const rows=day().filter(p=>!p.facturado&&(!q.get("metodo_pago")||p.metodo_pago===q.get("metodo_pago")));
        rows.forEach(p=>{p.facturado=true;p.hora_facturado=now();});return {fecha,facturados:rows.length};
      }
      if(method==="GET")return s.pedidos.filter(p=>p.fecha===fecha).sort((a,b)=>a.hora_pedido.localeCompare(b.hora_pedido)||a.id-b.id).map(p=>out(p,s.config));
      if(method==="POST"&&!id) {
        const f=b.fecha||fecha;
        const p={tipo:"Envío",cliente_nombre:"",cliente_direccion:"",cliente_telefono:"",indicaciones:"",items:[],costo_envio:0,no_cobrar_envio:false,descuento_tipo:null,descuento_valor:0,metodo_pago:"Efectivo",pago_efectivo_detalle:"",repartidor:"",notas:"",hora_salida_programada:null,...b,id:next(),fecha:f,numero:number(s,f),hora_pedido:now(),hora_salida:null,orden_ruta:null,facturado:false,hora_facturado:null,pagado:false,anulado:false};
        p.items=p.items.map(i=>({...i,id:next()}));validateOrder(p);s.pedidos.push(p);return out(p,s.config);
      }
      const p=find(s.pedidos,id,"Pedido");
      if(method==="DELETE"){if(!p.anulado)throw Error("Sólo se pueden borrar definitivamente pedidos anulados.");remove(s.pedidos,id);return null;}
      if(action==="anular"||action==="restaurar"){p.anulado=action==="anular";return out(p,s.config);}
      if(method==="PATCH") {
        if(b.fecha&&b.fecha!==p.fecha){b.numero=number(s,b.fecha);b.orden_ruta=null;}
        if(b.repartidor!==undefined&&b.repartidor!==p.repartidor&&b.orden_ruta===undefined)b.orden_ruta=null;
        if(b.facturado!==undefined)b.hora_facturado=b.facturado?(p.hora_facturado||now()):null;
        if(b.items)b.items=b.items.map(i=>({...i,id:next()}));
        Object.assign(p,b);validateOrder(p);return out(p,s.config);
      }
    }
    if(domain==="repartidores-dia") {
      if(method==="PUT")s.repartidores[fecha]=b.nombres.map(n=>n.trim()).filter(Boolean).slice(0,2);
      return {fecha,nombres:s.repartidores[fecha]||[]};
    }
    if(domain==="plato-del-dia") {
      if(method==="PUT")s.platosDia[fecha]={fecha,definido:true,hay:!!b.hay,items:b.hay?b.items.filter(i=>i.nombre.trim()).map(i=>({id:next(),nombre:i.nombre.trim(),precio_efectivo:positive(i.precio_efectivo),precio_lista:positive(i.precio_lista)})):[]};
      return s.platosDia[fecha]||{fecha,definido:false,hay:false,items:[]};
    }
    if(domain==="resumen") {
      const rows=day(),por_metodo={Efectivo:0,Transferencia:0,QR:0,Posnet:0};
      rows.forEach(p=>por_metodo[p.metodo_pago]+=p.total);
      Object.keys(por_metodo).forEach(k=>por_metodo[k]=round(por_metodo[k]));
      return {fecha,cantidad:rows.length,total:round(rows.reduce((n,p)=>n+p.total,0)),por_metodo};
    }
    if(domain==="facturacion") {
      const buckets={};
      for(const p of day()) {
        const x=buckets[p.metodo_pago]||={items:{},envios:0,pedidos:0,facturados:0,total:0};
        x.pedidos++;x.total+=p.total;if(p.facturado){x.facturados++;continue;}
        if(p.tipo==="Envío"&&!p.no_cobrar_envio)x.envios++;
        for(const i of p.items)x.items[i.nombre]=(x.items[i.nombre]||0)+i.cantidad;
      }
      for(const x of Object.values(buckets)){x.total=round(x.total);x.items=Object.entries(x.items).map(([nombre,cantidad])=>({nombre,cantidad})).sort((a,b)=>b.cantidad-a.cantidad||a.nombre.localeCompare(b.nombre));}
      return {fecha,metodos:["Efectivo","Transferencia","QR","Posnet"].filter(k=>buckets[k]),por_metodo:buckets};
    }
    if(domain==="pendientes") {
      const rows=s.pedidos.filter(p=>!p.anulado&&p.fecha<today()&&!p.facturado);
      return {sin_facturar_anteriores:rows.length,fechas_anteriores:[...new Set(rows.map(p=>p.fecha))].sort(),pedidos_futuros:s.pedidos.filter(p=>!p.anulado&&p.fecha>today()).length};
    }
    if(domain==="cuentas") {
      if(!id){
        if(method==="GET")return s.cuentas.map(c=>{const x=accountOut(s,c);return {id:x.id,cliente_id:x.cliente_id,nombre:x.nombre,tipo:x.tipo,valor:x.saldo};}).sort(orderNames);
        find(s.clientes,b.cliente_id,"Cliente");if(s.cuentas.some(c=>c.cliente_id===b.cliente_id))throw Error("Este cliente ya tiene una cuenta");
        if(!["platos","semanal"].includes(b.tipo))throw Error("Modalidad inválida");
        const c={id:next(),cliente_id:b.cliente_id,tipo:b.tipo,movimientos:[],pedidos:[],cierres:[]};s.cuentas.push(c);return {id:c.id};
      }
      const c=find(s.cuentas,id,"Cuenta");if(method==="GET")return accountOut(s,c);
      if(action==="movimientos") {
        if(c.tipo!=="platos")throw Error("Esta operación no corresponde a la modalidad de la cuenta");
        if(method==="DELETE") {
          find(c.movimientos,subid,"Movimiento");let saldo=0;
          for(const m of [...c.movimientos].sort((a,b)=>a.id-b.id))if(m.id!==+subid){saldo+=m.tipo==="carga"?m.cantidad:-m.cantidad;if(saldo<0)throw Error("Primero corregí los retiros posteriores a esta carga");}
          remove(c.movimientos,subid);return null;
        }
        const cantidad=Number(b.cantidad);if(!Number.isInteger(cantidad)||cantidad<1)throw Error("Cantidad inválida");
        if(!["carga","retiro"].includes(b.tipo))throw Error("Movimiento inválido");
        if(b.tipo==="retiro"&&!b.plato.trim())throw Error("Indicá qué plato retiró");
        if(b.tipo==="retiro"&&cantidad>balance(c))throw Error(`Quedan ${balance(c)} platos; no se puede descontar ${cantidad}`);
        const m={id:next(),fecha:b.fecha||today(),tipo:b.tipo,cantidad,plato:(b.plato||"").trim(),nota:(b.nota||"").trim()};
        c.movimientos.push(m);return {id:m.id,saldo:balance(c)};
      }
      if(c.tipo!=="semanal")throw Error("Esta operación no corresponde a la modalidad de la cuenta");
      if(action==="pedidos") {
        if(method==="DELETE"){const p=find(c.pedidos,subid,"Pedido");if(p.cierre_id!==null)throw Error("El pedido ya fue incluido en un cierre");remove(c.pedidos,subid);return null;}
        if(!b.items?.length)throw Error("Agregá al menos un plato");
        const items=b.items.map(i=>{if(!i.plato.trim()||!Number.isInteger(i.cantidad)||i.cantidad<1)throw Error("Cada renglón necesita un plato y una cantidad válida");return {...i,precio_unitario:positive(i.precio_unitario),precio_extra:positive(i.precio_extra||0)};});
        const p={id:next(),fecha:b.fecha||today(),nota:(b.nota||"").trim(),items,cierre_id:null,total:round(items.reduce((n,i)=>n+i.cantidad*(i.precio_unitario+i.precio_extra),0))};c.pedidos.push(p);return {id:p.id,total:p.total};
      }
      if(action==="cierres") {
        if(subid==="cobrar-todos") {
          const rows=c.cierres.filter(x=>!x.pagado);if(!rows.length)throw Error("No hay cierres pendientes de cobro");rows.forEach(x=>x.pagado=true);return {cierres:rows.length,total:round(rows.reduce((n,x)=>n+x.total,0))};
        }
        if(subaction==="pagado"){const x=find(c.cierres,subid,"Cierre");x.pagado=true;return {id:x.id,pagado:true};}
        const hasta=b.hasta||today(),rows=c.pedidos.filter(p=>p.cierre_id===null&&p.fecha<=hasta);if(!rows.length)throw Error("No hay pedidos pendientes hasta esa fecha");
        const x={id:next(),fecha:hasta,total:round(rows.reduce((n,p)=>n+p.total,0)),pagado:false};c.cierres.push(x);rows.forEach(p=>p.cierre_id=x.id);return {id:x.id,total:x.total,pedidos:rows.length};
      }
    }
    if(domain==="rutas")return window.SuiloadRoutes.calculate(s,fecha,q.get("repartidor"));
    throw Error("Operación no disponible: "+path);
  }
  async function request(url,opts={}) {
    return exclusive(async()=>{
      const u=new URL(url,location.origin), method=opts.method||"GET",s=await read();
      const result=await dispatch(s,u.pathname,method,opts.body?JSON.parse(opts.body):{},u.searchParams);
      // Geocoding updates its device cache during read-only route requests too.
      if(method!=="GET"||u.pathname==="/api/rutas"||u.pathname==="/api/rutas/repartidor")await write(s);
      return structuredClone(result);
    });
  }
  function download(data,name,type="application/json") {
    const url=URL.createObjectURL(data instanceof Blob?data:new Blob([data],{type}));
    const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  // Validate the complete backup before replacing any device data.
  function validateBackup(s) {
    if(!s||s.schema!==1||!Number.isInteger(s.seq)||s.seq<0||!s.config||typeof s.config!=="object")throw Error("Copia incompatible");
    for(const k of ["platos","clientes","pedidos","cuentas"]) {
      if(!Array.isArray(s[k]))throw Error("Copia incompleta");
      const ids=new Set();for(const x of s[k]){if(!x||!Number.isInteger(x.id)||x.id<1||ids.has(x.id))throw Error("Identificadores inválidos en la copia");ids.add(x.id);s.seq=Math.max(s.seq,x.id);}
    }
    for(const p of s.platos){if(typeof p.nombre!=="string"||typeof p.categoria!=="string")throw Error("Carta inválida");p.precio_efectivo=positive(p.precio_efectivo);p.precio_lista=positive(p.precio_lista);}
    for(const c of s.clientes){if(typeof c.nombre!=="string")throw Error("Cliente inválido");normalizeDiscount(c);}
    for(const p of s.pedidos){if(!Array.isArray(p.items)||typeof p.hora_pedido!=="string")throw Error("Pedido inválido");validateOrder(p);for(const i of p.items)s.seq=Math.max(s.seq,i.id||0);}
    for(const c of s.cuentas){find(s.clientes,c.cliente_id,"Cliente");if(!["platos","semanal"].includes(c.tipo)||![c.movimientos,c.pedidos,c.cierres].every(Array.isArray))throw Error("Cuenta inválida");for(const list of [c.movimientos,c.pedidos,c.cierres])for(const x of list){if(!Number.isInteger(x.id)||typeof x.fecha!=="string")throw Error("Registro de cuenta inválido");s.seq=Math.max(s.seq,x.id);}for(const p of c.pedidos){if(!Array.isArray(p.items))throw Error("Pedido de cuenta inválido");p.total=round(p.items.reduce((n,i)=>n+positive(i.cantidad)*(positive(i.precio_unitario)+positive(i.precio_extra||0)),0));if(p.cierre_id!==null)find(c.cierres,p.cierre_id,"Cierre");}for(const x of c.cierres)x.total=round(c.pedidos.filter(p=>p.cierre_id===x.id).reduce((n,p)=>n+p.total,0));}
    for(const k of ["repartidores","platosDia","geocache"])if(!s[k]||typeof s[k]!=="object"||Array.isArray(s[k]))throw Error("Copia incompleta");
    for(const list of Object.values(s.repartidores))if(!Array.isArray(list)||!list.every(n=>typeof n==="string"))throw Error("Repartidores inválidos");
    for(const p of Object.values(s.platosDia)){if(!Array.isArray(p.items))throw Error("Platos del día inválidos");for(const i of p.items){if(typeof i.nombre!=="string")throw Error("Plato inválido");s.seq=Math.max(s.seq,i.id||0);i.precio_efectivo=positive(i.precio_efectivo);i.precio_lista=positive(i.precio_lista);}}
    s.config={...defaults,...s.config};return s;
  }
  window.SuiloadLocal={request,total,download,
    ready:()=>exclusive(async()=>{const s=await read();await write(s);return true;}),
    snapshot:()=>exclusive(read),
    backup:()=>exclusive(async()=>download(JSON.stringify({app:"suiload",exported:now(),data:await read()},null,2),`Suiload_copia_${today()}.json`)),
    restore:text=>exclusive(async()=>{const envelope=JSON.parse(text);if(envelope.app!=="suiload")throw Error("Este archivo no es una copia de Suiload");const s=validateBackup(envelope.data);await write(s);}),
    exportExcel:async(fecha,mes)=>{const s=await exclusive(read);window.SuiloadExcel.export(s,fecha,mes);},
  };
})();
