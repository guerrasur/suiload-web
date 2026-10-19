const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844},colorScheme:'dark',acceptDownloads:true});page.setDefaultTimeout(12000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.SUILOAD_TEST_URL||'http://127.0.0.1:8080');await page.locator('#modal-local.show').waitFor();
 await page.evaluate(async()=>{
   const api=(url,b,method='POST')=>SuiloadLocal.request(url,{method,body:JSON.stringify(b)});
   await api('/api/config',{nombre_local:'Prueba',modo_uso:'comanda',modo_elegido:true,menu_configurado:true},'PUT');
   await api('/api/platos/guardar-carta',{items:[{nombre:'Café',precio_efectivo:200},{nombre:'Tostado',precio_efectivo:450}]});
 });
 await page.reload();await page.waitForFunction(()=>window.SuiloadAppReady);
 assert.match(await page.locator('[data-pay=Efectivo]').textContent(),/💵/);assert.match(await page.locator('[data-pay=Transferencia]').textContent(),/🏦/);
 assert.equal(await page.locator('[data-pay=Efectivo]').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(31, 138, 76)');
 assert.equal(await page.locator('[data-pay=Transferencia]').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(47, 111, 208)');
 const before=await page.locator('#co-save').boundingBox();
 await page.evaluate(()=>SuiloadComandas.restoreDraft({items:Array.from({length:20},(_,i)=>({nombre:'Ítem '+i,cantidad:1,precio_unitario:10,plato_id:null})),payment:'Efectivo',fields:[]}));
 const after=await page.locator('#co-save').boundingBox();assert.ok(Math.abs(after.y-before.y)<1);assert.ok(after.y>=0&&after.y+after.height<=844);
 assert.ok(await page.locator('#co-items').evaluate(e=>e.scrollHeight>e.clientHeight));
 let checkout=await page.locator('#co-checkout').boundingBox(),footer=await page.locator('#day-totals').boundingBox();assert.ok(checkout.y+checkout.height<=footer.y);
 await page.locator('#co-cancel').click();
 await page.evaluate(async()=>{
   const api=(url,b,method='POST')=>SuiloadLocal.request(url,{method,body:JSON.stringify(b)});
   const base={modo:'comanda',tipo:'Reserva',fecha:state.fecha,items:[{nombre:'Prueba',cantidad:1,precio_unitario:200}],metodo_pago:'Efectivo'};
   await api('/api/pedidos',base);
   const transfer=await api('/api/pedidos',{...base,metodo_pago:'Transferencia',items:[{nombre:'Tostado',cantidad:1,precio_unitario:450}]});
   await api('/api/pedidos/'+transfer.id,{pagado:true},'PATCH');
   const canceled=await api('/api/pedidos',{...base,items:[{nombre:'No sumar',cantidad:1,precio_unitario:999}]});await api('/api/pedidos/'+canceled.id+'/anular',{});
   await loadDay();
 });
 assert.match(await page.locator('#day-total-value').textContent(),/650/);assert.match(await page.locator('[data-method=Efectivo]').textContent(),/200/);assert.match(await page.locator('[data-method=Transferencia]').textContent(),/450/);
 assert.match(await page.locator('#day-payment-status').textContent(),/Cobrado.*450.*Sin pagar.*200/);
 const downloadEvent=page.waitForEvent('download');await page.locator('#day-export').click();const download=await downloadEvent;assert.match(download.suggestedFilename(),/\.xlsx$/);await download.saveAs('/tmp/suiload-workspace-day.xlsx');
 await page.locator('#alias-edit').click();await page.locator('#alias-input').fill('mi.local.mp');await page.locator('#alias-lock').check();await page.locator('#alias-save').click();
 await page.locator('#alias-value').getByText('mi.local.mp',{exact:true}).waitFor();assert.match(await page.locator('#alias-edit').textContent(),/Desbloquear/);assert.equal(await page.locator('#alias-input').isVisible(),false);
 await page.reload();await page.waitForFunction(()=>window.SuiloadAppReady);assert.equal(await page.locator('#alias-value').textContent(),'mi.local.mp');assert.match(await page.locator('#alias-edit').textContent(),/Desbloquear/);
 await page.locator('#alias-edit').click();await page.locator('#alias-input').fill('No guardar');await page.locator('#alias-cancel').click();assert.equal(await page.locator('#alias-value').textContent(),'mi.local.mp');
 await page.locator('#alias-edit').click();await page.locator('#alias-input').fill('<b>mi.alias</b>');await page.locator('#alias-save').click();await page.locator('#alias-value').getByText('<b>mi.alias</b>',{exact:true}).waitFor();assert.equal(await page.locator('#alias-value b').count(),0);
 // The alias and both footer bars keep their own space after resize and scrolling.
 await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));
 assert.equal(await page.locator('#alias-bar').evaluate(e=>e.getBoundingClientRect().top),0);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'/tmp/suiload-workspace-mobile.png',animations:'disabled'});
 await page.locator('#usage-change').click();await page.locator('[data-mode=delivery]').click();await page.locator('#delivery-workspace').waitFor();
 const deliveryBefore=await page.locator('#btn-guardar').boundingBox();
 for(let i=0;i<8;i++)await page.locator('#add-item').click();
 const deliveryAfter=await page.locator('#btn-guardar').boundingBox();assert.ok(Math.abs(deliveryAfter.y-deliveryBefore.y)<1);
 assert.equal(await page.locator('#day-export').isVisible(),true);
 assert.match(await page.locator('#day-total-value').textContent(),/650/);
 await page.locator('[data-tab=carta]').click();assert.equal(await page.locator('#day-totals').isVisible(),false);assert.equal(await page.locator('#alias-bar').isVisible(),true);
 assert.deepEqual(errors,[]);console.log('PASS browser: payment colors/emoji, stationary checkout with many items, daily subtotals and unpaid totals, daily XLSX, alias editing/locking/persistence and mobile layout in both views.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
