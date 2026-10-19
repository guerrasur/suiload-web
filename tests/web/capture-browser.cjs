const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:1366,height:900},colorScheme:'light'});page.setDefaultTimeout(12000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.SUILOAD_TEST_URL||'http://127.0.0.1:8080');await page.locator('#modal-local.show').waitFor();
 await page.evaluate(async()=>{
   const req=(url,b,method='POST')=>SuiloadLocal.request(url,{method,body:JSON.stringify(b)});
   await req('/api/config',{nombre_local:'Suiload',modo_uso:'comanda',modo_elegido:true,menu_configurado:true,alias_transferencia:'mi.local.mp'},'PUT');
   await req('/api/platos/guardar-carta',{items:[{nombre:'Birra',precio_efectivo:2500},{nombre:'Pizza',precio_efectivo:2000},{nombre:'Vino Botella',precio_efectivo:8000},{nombre:'Vino Copa',precio_efectivo:3000}]});
 });
 await page.reload();await page.waitForFunction(()=>window.SuiloadAppReady);
 const tile=name=>page.locator('#co-quick-items').getByRole('button',{name:new RegExp('Agregar '+name)});
 const row=name=>page.locator('#co-items .co-item').filter({has:page.locator('.co-line-info > strong',{hasText:new RegExp('^'+name+'$')})});
 for(let i=0;i<5;i++)await tile('Birra').click();for(let i=0;i<3;i++)await tile('Pizza').click();
 assert.equal(await row('Birra').locator('input').inputValue(),'5');assert.equal(await tile('Birra').locator('.co-product-count').textContent(),'5');
 assert.equal(await page.locator('#co-items [data-key=nombre], #co-items [data-key=precio_unitario]').count(),0);
 await row('Birra').getByRole('button',{name:'Sumar uno de Birra',exact:true}).click();assert.equal(await row('Birra').locator('input').inputValue(),'6');
 await row('Birra').getByRole('button',{name:'Restar uno de Birra',exact:true}).click();
 await row('Birra').locator('input').fill('12');await row('Birra').locator('input').press('Enter');assert.equal(await tile('Birra').locator('.co-product-count').textContent(),'12');assert.equal(await page.locator('.co-order').count(),0);
 await row('Birra').locator('input').fill('5');await row('Birra').locator('input').blur();
 assert.match(await page.locator('#co-total').textContent(),/18[.,]500/);assert.match(await page.locator('#co-item-count').textContent(),/8 unidades.*2 productos/);
 await row('Birra').getByRole('button',{name:'Editar Birra',exact:true}).click();await page.locator('#co-item-name').fill('Birra fría');await page.locator('#co-item-price').fill('2600');await page.locator('#co-item-apply').click();
 assert.match(await row('Birra fría').locator('.co-subtotal').textContent(),/13[.,]000/);assert.match(await page.locator('#co-total').textContent(),/19[.,]000/);
 await row('Birra fría').getByRole('button',{name:'Editar Birra fría',exact:true}).click();await page.locator('#co-item-price').fill('9999');await page.locator('#co-item-cancel').click();assert.match(await page.locator('#co-total').textContent(),/19[.,]000/);
 await row('Pizza').getByRole('button',{name:'Quitar Pizza',exact:true}).click();assert.equal(await page.locator('#co-items .co-item').count(),1);await page.locator('#co-undo-button').click();assert.equal(await row('Pizza').locator('input').inputValue(),'3');assert.equal(await tile('Pizza').locator('.co-product-count').textContent(),'3');
 await page.locator('.co-options summary').click();await page.locator('#co-custom').click();await page.locator('#co-item-name').fill('Extra');await page.locator('#co-item-price').fill('1200');await page.locator('#co-item-apply').click();
 assert.equal(await row('Extra').locator('input').inputValue(),'1');assert.equal(await row('Extra').locator('.co-qty-minus').isDisabled(),true);
 await page.locator('#co-custom').click();await page.locator('#co-item-name').fill('No agregar');await page.locator('#co-item-name').press('Escape');assert.equal(await page.locator('#co-items .co-item').count(),3);
 await page.locator('#co-save').click();await page.locator('.co-order').waitFor();
 // A second active order must stay above the first after completion.
 await tile('Vino Copa').click();await page.locator('#co-save').click();await page.waitForFunction(()=>state.pedidos.length===2);
 const firstId=await page.locator('.co-order').first().getAttribute('data-id');
 await page.locator(`.co-order[data-id="${firstId}"]`).getByRole('button',{name:'No completado',exact:true}).click();
 await page.waitForFunction(id=>document.querySelector('#co-orders .co-order:last-child')?.dataset.id===id,firstId);
 assert.equal(await page.locator('.co-order').last().getAttribute('data-id'),firstId);assert.match(await page.locator('.co-order').last().textContent(),/No pagado/);assert.equal(await page.locator('.co-completed-heading').count(),1);
 await page.locator(`.co-order[data-id="${firstId}"]`).getByRole('button',{name:'Completado',exact:true}).click();
 await page.waitForFunction(id=>document.querySelector('#co-orders .co-order')?.dataset.id===id,firstId);
 assert.equal(await page.locator('.co-completed-heading').count(),0);
 // Restore a representative draft for desktop/mobile layout checks.
 for(let i=0;i<5;i++)await tile('Birra').click();for(let i=0;i<3;i++)await tile('Pizza').click();await tile('Vino Botella').click();
 await page.locator('.co-options summary').click();await page.evaluate(()=>scrollTo(0,0));
 await page.screenshot({path:'/tmp/suiload-capture-desktop.png',animations:'disabled'});
 const count=await page.locator('#co-items').evaluate(e=>e.clientHeight);assert.ok(count>=220);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.emulateMedia({colorScheme:'dark'});await page.locator('#co-items').scrollIntoViewIfNeeded();
 await page.screenshot({path:'/tmp/suiload-capture-mobile.png',animations:'disabled'});
 assert.ok(await row('Birra').locator('.co-qty-plus').evaluate(e=>e.getBoundingClientRect().width>=42));
 // Delivery uses the same active-first rule after inline status changes.
 await page.locator('#usage-change').click();await page.locator('[data-mode=delivery]').click();
 const deliveryId=await page.evaluate(async()=>{
   const p=await SuiloadLocal.request('/api/pedidos',{method:'POST',body:JSON.stringify({modo:'delivery',tipo:'Envío',fecha:state.fecha,items:[{nombre:'Delivery',cantidad:1,precio_unitario:100}],cliente_nombre:'Reparto'})});
   await SuiloadLocal.request('/api/pedidos',{method:'POST',body:JSON.stringify({modo:'delivery',tipo:'Envío',fecha:state.fecha,items:[{nombre:'Otro',cantidad:1,precio_unitario:100}],cliente_nombre:'Otro reparto'})});
   await loadDay();return p.id;
 });
 await page.locator(`#tabla-body tr[data-id="${deliveryId}"] .r-salio`).click();
 await page.waitForFunction(id=>document.querySelector('#tabla-body tr:last-child')?.dataset.id===String(id),deliveryId);
 await page.locator(`#tabla-body tr[data-id="${deliveryId}"] .r-des-salio`).click();
 await page.waitForFunction(id=>!state.pedidos.find(p=>p.id===id)?.hora_salida,deliveryId);
 assert.notEqual(await page.locator('#tabla-body tr').last().getAttribute('data-id'),String(deliveryId));
 assert.deepEqual(errors,[]);console.log('PASS browser: compact rows, product counts, quantity steps/direct entry, edit/cancel/custom items, undo, completed-last ordering/reversal, fixed checkout and responsive layout.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
