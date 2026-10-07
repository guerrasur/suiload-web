"use strict";
// Small dependency-free XLSX writer: ZIP (stored entries), inline strings,
// numeric monetary cells, one worksheet per day. Never interprets user text as formulas.
(() => {
  const enc=new TextEncoder(),xml=s=>String(s??"").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const table=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);return n>>>0;});
  const crc=bytes=>{let n=0xffffffff;for(const b of bytes)n=(n>>>8)^table[(n^b)&255];return (n^0xffffffff)>>>0;};
  const concat=parts=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let i=0;for(const p of parts){out.set(p,i);i+=p.length;}return out;};
  function zip(files){const parts=[],central=[];let offset=0;
    for(const [path,content] of Object.entries(files)){
      const name=enc.encode(path),data=enc.encode(content),sum=crc(data);
      const local=new Uint8Array(30),v=new DataView(local.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,sum,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);
      parts.push(local,name,data);
      const header=new Uint8Array(46),h=new DataView(header.buffer);h.setUint32(0,0x02014b50,true);h.setUint16(4,20,true);h.setUint16(6,20,true);h.setUint16(8,0x800,true);h.setUint32(16,sum,true);h.setUint32(20,data.length,true);h.setUint32(24,data.length,true);h.setUint16(28,name.length,true);h.setUint32(42,offset,true);central.push(header,name);offset+=local.length+name.length+data.length;
    }
    const size=central.reduce((n,p)=>n+p.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,Object.keys(files).length,true);v.setUint16(10,Object.keys(files).length,true);v.setUint32(12,size,true);v.setUint32(16,offset,true);
    return concat([...parts,...central,end]);
  }
  const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const pre='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const columns=['N°','Hora','Tipo','Cliente','Dirección','Ítems','Envío','Descuento','Total','Pago','Detalle pago','Repartidor','Hora salida','Facturado','Notas'];
  const widths=[6,8,11,20,24,40,10,11,12,14,14,14,12,11,20];
  const months=['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const cell=(r,c,value,style=0)=>{const ref=String.fromCharCode(65+c)+r;return typeof value==='number'?`<c r="${ref}" s="${style}"><v>${value}</v></c>`:`<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;};
  function sheet(s,fecha,rows){
    const local=s.config.nombre_local||'Suipacha',formatted=fecha.split('-').reverse().join('/');
    let row=3,total=0,count=0,by={Efectivo:0,Transferencia:0,QR:0,Posnet:0};
    let cells=`<row r="1" ht="26" customHeight="1">${cell(1,0,`${local} — Pedidos ${formatted}`,1)}</row><row r="2">${columns.map((v,c)=>cell(2,c,v,1)).join('')}</row>`;
    for(const p of rows){const t=window.SuiloadLocal.total(p),values=[p.numero||'',p.hora_pedido?.slice(11,16)||'',p.tipo,p.cliente_nombre,p.cliente_direccion,p.items.map(i=>`${i.cantidad}x ${i.nombre}`).join('\n'),t.envio||'',t.descuento||'',p.total,p.metodo_pago,p.pago_efectivo_detalle,p.repartidor,p.hora_salida?.slice(11,16)||'',p.facturado?'Sí':'No',(p.anulado?'ANULADO — ':'')+p.notas];
      cells+=`<row r="${row}">${values.map((v,c)=>cell(row,c,v,p.anulado?3:[6,7,8].includes(c)?2:0)).join('')}</row>`;row++;
      if(!p.anulado){total+=p.total;count++;by[p.metodo_pago]=(by[p.metodo_pago]||0)+p.total;}
    }
    row++;for(const [label,value,isMoney] of [['Cantidad de pedidos',count,false],['TOTAL DEL DÍA',total,true],...Object.entries(by).map(([k,v])=>[k,v,true])]){cells+=`<row r="${row}">${cell(row,0,label)}${cell(row,8,Math.round(value*100)/100,isMoney?2:0)}</row>`;row++;}
    return pre+`<worksheet xmlns="${ns}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${cells}</sheetData><mergeCells count="1"><mergeCell ref="A1:O1"/></mergeCells></worksheet>`;
  }
  function build(s,fecha,mes){
    const selected=s.pedidos.filter(p=>fecha?p.fecha===fecha:p.fecha.slice(0,7)===mes).sort((a,b)=>a.fecha.localeCompare(b.fecha)||a.hora_pedido.localeCompare(b.hora_pedido));
    const dates=fecha?[fecha]:[...new Set(selected.map(p=>p.fecha))];if(!dates.length)dates.push(mes+'-01');
    const local=(s.config.nombre_local||'Suipacha').replace(/[\\/*?:\[\]]/g,' ').slice(0,25);
    const names=dates.map(d=>`${local}- ${d.slice(8,10)}${d.slice(5,7)}`);
    const files={
      '[Content_Types].xml':pre+`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${dates.map((d,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
      '_rels/.rels':pre+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml':pre+`<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n,i)=>`<sheet name="${xml(n)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`,
      'xl/_rels/workbook.xml.rels':pre+`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${dates.map((d,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      'xl/styles.xml':pre+`<styleSheet xmlns="${ns}"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="12"/><name val="Calibri"/></font><font><strike/><color rgb="FF9C9C9C"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2F5496"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`
    };
    dates.forEach((d,i)=>files[`xl/worksheets/sheet${i+1}.xml`]=sheet(s,d,selected.filter(p=>p.fecha===d)));
    return zip(files);
  }
  window.SuiloadExcel={build,export:(s,fecha,mes)=>{const local=(s.config.nombre_local||'Suipacha').replace(/[\\/:*?"<>|]/g,'_');const filename=fecha?`${local}_${fecha.split('-').reverse().join('-')}.xlsx`:`${local}_Pedidos_-_${months[Number(mes.slice(5,7))]}_${mes.slice(0,4)}.xlsx`;window.SuiloadLocal.download(new Blob([build(s,fecha,mes)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),filename);}};
})();
