"use strict";
(() => {
  const address=(d,city)=>{let a=(d||"").trim().replace(/\s+/g," ").replace(/^(.*?\d{1,5})\s+(?:\d{1,3}[a-zA-Z]{1,2}|[a-zA-Z]{1,2}\d{1,3})$/,"$1");if(a&&city&&!a.toLowerCase().includes(city.toLowerCase()))a+=", "+city;return a;};
  const link=(s,ps)=>{const city=s.config.ciudad_default,origin=address(s.config.direccion_local,city),stops=ps.map(p=>address(p.cliente_direccion,city));if(!stops.length)return "";const dest=origin||stops.pop();return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving${origin?"&origin="+encodeURIComponent(origin):""}${stops.length?"&waypoints="+stops.map(encodeURIComponent).join("|"):""}`;};
  const dist=(a,b)=>{if(!a||!b)return 0;const rad=Math.PI/180,lat1=a[0]*rad,lat2=b[0]*rad,dl=(b[0]-a[0])*rad,dn=(b[1]-a[1])*rad;return 12742.0176*Math.asin(Math.min(1,Math.sqrt(Math.sin(dl/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dn/2)**2)));};
  const cost=(m,r)=>{const nodes=[0,...r.map(i=>i+1),0];return nodes.slice(1).reduce((n,b,i)=>n+m[nodes[i]][b],0);};
  const compare=(a,b)=>{for(let i=0;i<a.length;i++){if(a[i]!==b[i])return a[i]-b[i];}return 0;};
  function tours(m) {
    const n=m.length-1,states=new Map(),result=new Map([[0,{cost:0,route:[]}]]);
    const better=(a,b)=>!b||a.cost<b.cost||a.cost===b.cost&&compare(a.route,b.route)<0;
    for(let mask=1;mask<(1<<n);mask++) {
      let best;
      for(let last=0;last<n;last++)if(mask&(1<<last)) {
        const prev=mask^(1<<last);let value;
        if(!prev)value={cost:m[0][last+1],route:[last]};
        else for(let j=0;j<n;j++)if(prev&(1<<j)){const old=states.get(prev*n+j),candidate={cost:old.cost+m[j+1][last+1],route:[...old.route,last]};if(better(candidate,value))value=candidate;}
        states.set(mask*n+last,value);const candidate={cost:value.cost+m[last+1][0],route:value.route};if(better(candidate,best))best=candidate;
      }
      result.set(mask,best);
    }
    return result;
  }
  function order(m,indices) {
    const ids=indices||Array.from({length:m.length-1},(_,i)=>i);if(ids.length<=1)return [...ids];
    if(ids.length<=12){const nodes=[0,...ids.map(i=>i+1)],small=nodes.map(a=>nodes.map(b=>m[a][b]));return tours(small).get((1<<ids.length)-1).route.map(i=>ids[i]);}
    const candidates=[[...ids]];
    for(const first of [...ids].sort((a,b)=>m[0][a+1]-m[0][b+1]||a-b).slice(0,8)){
      const remaining=new Set(ids);remaining.delete(first);const r=[first];
      while(remaining.size){const nxt=[...remaining].sort((a,b)=>m[r.at(-1)+1][a+1]-m[r.at(-1)+1][b+1]||a-b)[0];remaining.delete(nxt);r.push(nxt);}candidates.push(r);
    }
    let best=candidates.sort((a,b)=>cost(m,a)-cost(m,b)||compare(a,b))[0];
    for(let pass=0;pass<30;pass++){let improved=best,value=cost(m,best);for(let i=0;i<best.length;i++)for(let j=i+1;j<best.length;j++){const r=[...best.slice(0,i),...best.slice(i,j+1).reverse(),...best.slice(j+1)];const c=cost(m,r);if(c<value-1e-9){improved=r;value=c;}}if(improved===best)break;best=improved;}
    return best;
  }
  function cluster(points,k) {
    const chosen=[0];while(chosen.length<k){let best=-1,value=-1;for(let i=0;i<points.length;i++)if(!chosen.includes(i)){const d=Math.min(...chosen.map(j=>dist(points[i],points[j])));if(d>value){value=d;best=i;}}chosen.push(best);}
    let centers=chosen.map(i=>points[i]),assignment=[];
    for(let pass=0;pass<30;pass++){const next=points.map((p,i)=>chosen.includes(i)?chosen.indexOf(i):centers.map((c,j)=>({j,d:dist(p,c)})).sort((a,b)=>a.d-b.d||a.j-b.j)[0].j);if(next.join()===assignment.join())break;assignment=next;centers=centers.map((c,j)=>{const ps=points.filter((p,i)=>assignment[i]===j);return [ps.reduce((n,p)=>n+p[0],0)/ps.length,ps.reduce((n,p)=>n+p[1],0)/ps.length];});}
    return centers.map((_,j)=>points.map((p,i)=>i).filter(i=>assignment[i]===j));
  }
  function distribute(m,points,k) {
    const n=points.length;if(!n)return [];k=Math.min(Math.max(1,k),n);if(k===1)return [order(m)];if(k===n)return points.map((p,i)=>[i]);
    if(k===2&&n<=12){const all=tours(m),full=(1<<n)-1;let best,score;for(let mask=1;mask<full;mask++)if(mask&1){const a=all.get(mask),b=all.get(full^mask),v=[Math.max(a.cost,b.cost),a.cost+b.cost,mask];if(!score||compare(v,score)<0){score=v;best=[a.route,b.route];}}return best;}
    let groups=cluster(points,k).map(g=>order(m,g));const cache=new Map();
    const route=ids=>{const key=[...ids].sort((a,b)=>a-b).join();if(!cache.has(key))cache.set(key,order(m,ids));return cache.get(key);};
    const score=gs=>{const cs=gs.map(g=>cost(m,g));return [Math.max(...cs),cs.reduce((a,b)=>a+b,0)];};
    for(let pass=0;pass<12;pass++){let best=groups,value=score(groups);for(let a=0;a<k;a++)for(let b=a+1;b<k;b++){
      const variants=[];if(groups[a].length>1)for(const x of groups[a])variants.push([groups[a].filter(i=>i!==x),[...groups[b],x]]);
      if(groups[b].length>1)for(const x of groups[b])variants.push([[...groups[a],x],groups[b].filter(i=>i!==x)]);
      for(const x of groups[a])for(const y of groups[b])variants.push([[...groups[a].filter(i=>i!==x),y],[...groups[b].filter(i=>i!==y),x]]);
      for(const [ga,gb] of variants){const gs=[...groups];gs[a]=route(ga);gs[b]=route(gb);const v=score(gs);if(compare(v,value)<0){best=gs;value=v;}}
    }if(best===groups)break;groups=best;}
    return groups;
  }
  const remote=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(12000),referrerPolicy:"strict-origin-when-cross-origin"});if(!r.ok)throw Error("Servicio de mapas no disponible");return r.json();};
  let nextGeocode=0;
  async function geocode(s,d) {
    const query=address(d,s.config.ciudad_default),key=query.toLowerCase();if(!query)return null;
    if(s.geocache[key])return s.geocache[key];
    const pause=Math.max(0,nextGeocode-Date.now());if(pause)await new Promise(r=>setTimeout(r,pause));
    // Requests are sequential, user-triggered, and cached in this device.
    try {
      nextGeocode=Date.now()+1100;
      const rows=await remote("https://nominatim.openstreetmap.org/search?"+new URLSearchParams({q:query,format:"json",limit:"1",addressdetails:"0"}));
      if(!Array.isArray(rows)||!rows.length)return null;
      const p=[Number(rows[0].lat),Number(rows[0].lon)];if(!p.every(Number.isFinite))return null;s.geocache[key]=p;return p;
    }catch{return null;}
  }
  async function calculate(s,fecha,repartidor) {
    const names=s.repartidores[fecha]||[];if(!repartidor&&!names.length)throw Error("Cargá primero los repartidores del día.");
    const rows=s.pedidos.filter(p=>p.fecha===fecha&&p.tipo==="Envío"&&!p.anulado&&!p.hora_salida&&(!p.hora_salida_programada||new Date(p.hora_salida_programada)<=new Date())&&(!repartidor||p.repartidor===repartidor));
    if(repartidor&&rows.length<2)throw Error(`${repartidor} tiene menos de 2 pedidos pendientes hoy.`);
    if(!rows.length)return {fecha,repartidores_dia:names,grupos:[],sin_geocodificar:[]};
    const located=[],points=[],missing=[];
    for(const p of rows){const xy=await geocode(s,p.cliente_direccion);if(xy){located.push(p);points.push(xy);}else missing.push(p);}
    if(repartidor&&located.length<2)throw Error("No se pudieron ubicar suficientes direcciones para armar la ruta.");
    const origin=await geocode(s,s.config.direccion_local),all=[origin,...points];
    let matrix=all.map(a=>all.map(b=>dist(a,b))),criterio="geografica",aviso="No se pudieron consultar las calles. Recorrido aproximado por distancia geográfica.";
    if(!origin)aviso="No se pudo ubicar el local. Configurá o revisá su dirección para calcular salida y regreso.";
    else if(points.length)try {
      const coords=all.map(p=>`${p[1].toFixed(6)},${p[0].toFixed(6)}`).join(";");
      const result=await remote(`https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration`);
      const m=result.durations,n=all.length;
      if(result.code!=="Ok"||!Array.isArray(m)||m.length!==n||m.some(row=>!Array.isArray(row)||row.length!==n||row.some(v=>typeof v!=="number"||!Number.isFinite(v)||v<0))||[...(result.sources||[]),...(result.destinations||[])].some(p=>p.distance>300))throw Error("Matriz inválida");
      matrix=m;criterio="calles";aviso="";
    }catch{}
    const groups=repartidor?[order(matrix)]:distribute(matrix,points,names.length);
    const serialize=p=>({id:p.id,numero:p.numero,cliente_nombre:p.cliente_nombre,cliente_direccion:p.cliente_direccion,cliente_telefono:p.cliente_telefono});
    if(repartidor){const ps=groups[0].map(i=>located[i]);return {repartidor,criterio,aviso,maps_link:link(s,ps),pedidos:ps.map(serialize),sin_geocodificar:missing.map(serialize)};}
    return {fecha,repartidores_dia:names,criterio,aviso,grupos:groups.map((g,i)=>{const ps=g.map(j=>located[j]);return {etiqueta:String.fromCharCode(65+i),minutos_estimados:criterio==="calles"?Math.round(cost(matrix,g)/6)/10:null,pedidos:ps.map(serialize),maps_link:link(s,ps)};}),sin_geocodificar:missing.map(serialize)};
  }
  window.SuiloadRoutes={calculate,order,distribute,cost,link};
})();
