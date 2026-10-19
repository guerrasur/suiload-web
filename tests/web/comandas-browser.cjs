// Requires Playwright and a running static server; no application dependencies.
const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try {
 const context=await browser.newContext({colorScheme:'dark'}),page=await context.newPage(),errors=[];
 page.setDefaultTimeout(12000);
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.SUILOAD_TEST_URL||'http://127.0.0.1:8080');
 await page.locator('#input-nombre-local').fill('Mi café');await page.locator('#local-guardar').click();
 await page.locator('#modal-usage.show').waitFor();await page.locator('[data-mode=comanda]').click();
 await page.locator('#modal-menu.show').waitFor();
 await page.locator('[data-key=nombre]').fill('Café');await page.locator('[data-key=precio_efectivo]').fill('1000');await page.locator('[data-key=precio_lista]').fill('1200');await page.locator('#menu-add').click();
 await page.locator('.menu-row').nth(1).locator('[data-key=nombre]').fill('Medialuna');await page.locator('.menu-row').nth(1).locator('[data-key=precio_efectivo]').fill('500');await page.locator('#menu-save').click();
 await page.waitForFunction(()=>window.SuiloadAppReady);
 assert.equal(await page.locator('.modal-back.show').count(),0);assert.equal(await page.locator('#delivery-workspace').isVisible(),false);
 assert.equal(await page.locator('#co-desc-tipo').inputValue(),'monto');
 assert.equal(await page.locator('#co-quick-items button').count(),2);
 await page.locator('#co-quick-items').getByRole('button',{name:/Café/}).click();await page.locator('#co-quick-items').getByRole('button',{name:/Café/}).click();
 assert.equal(await page.locator('#co-items [data-key=cantidad]').inputValue(),'2');
 await page.locator('[data-pay=Transferencia]').click();assert.equal(await page.locator('[data-pay=Efectivo]').getAttribute('aria-pressed'),'false');assert.equal(await page.locator('[data-pay=Transferencia]').getAttribute('aria-pressed'),'true');
 assert.match(await page.locator('#co-total').textContent(),/2[.,]400/);
 await page.locator('#co-save').click();await page.locator('.co-order').waitFor();assert.match(await page.locator('.co-order h3').textContent(),/N° 1/);
 await page.locator('.co-order').getByRole('button',{name:'No completado',exact:true}).click();
 await page.locator('.co-order').getByRole('button',{name:'Completado',exact:true}).waitFor();
 for(const label of ['Marchó','Pedido listo','No pagado'])await page.locator('.co-order').getByRole('button',{name:label,exact:true}).waitFor();
 await page.locator('.co-order').getByRole('button',{name:'Ticket',exact:true}).click();await page.locator('#modal-ticket.show').waitFor();await page.locator('#modal-ticket').getByRole('button',{name:'Cerrar',exact:true}).click();
 await page.locator('.co-order').getByRole('button',{name:'Editar',exact:true}).click();await page.locator('#co-nombre').fill('Lucía');await page.locator('#co-numero').fill('22');await page.locator('#co-save').click();await page.locator('.co-order h3').getByText('N° 22 · Lucía',{exact:true}).waitFor();
 await page.locator('#co-quick-items').getByRole('button',{name:/Medialuna/}).click();await page.locator('#co-numero').fill('22');await page.locator('#co-save').click();await page.locator('#co-error').getByText(/ya está usado/).waitFor();await page.locator('#co-cancel').click();
 // A completed unpaid order from yesterday remains visible as debt.
 await page.evaluate(async()=>{const p=(await SuiloadLocal.request('/api/pedidos?fecha='+new Date().toLocaleDateString('en-CA')))[0];await SuiloadLocal.request('/api/pedidos',{method:'POST',body:JSON.stringify({...p,id:undefined,numero:80,fecha:'2000-01-01'})});await loadDay();});
 await page.locator('#co-deudas').waitFor();await page.locator('#co-deudas summary').click();await page.locator('#co-deudas button').click();await page.locator('#co-deudas').waitFor({state:'hidden'});
 await page.locator('[data-tab=config]').click();await page.locator('#c-marcho').uncheck();await page.locator('#btn-guardar-config').click();await page.waitForFunction(()=>SuiloadLocal.request('/api/config').then(c=>c.mostrar_marcho==='false'));
 await page.locator('[data-tab=pedidos]').click();assert.equal(await page.locator('.co-order').getByRole('button',{name:'Marchó',exact:true}).count(),0);
 await page.locator('#usage-change').click();await page.locator('[data-mode=delivery]').click();await page.locator('#delivery-workspace').waitFor();assert.equal(await page.locator('#f-desc-tipo').inputValue(),'monto');
 assert.equal(await page.locator('#delivery-quick-items button').count(),2);
 await page.locator('[data-delivery-pay=Transferencia]').click();assert.equal(await page.locator('#f-pago').inputValue(),'Transferencia');
 await page.locator('#delivery-quick-items').getByRole('button',{name:/Medialuna/}).click();
 await page.locator('#f-cliente').fill('Delivery prueba');await page.locator('#f-direccion').fill('Calle 123');await page.locator('#btn-guardar').click();
 await page.waitForFunction(()=>state.pedidos.some(p=>p.cliente_nombre==='Delivery prueba'&&p.modo==='delivery'));
 await page.locator('#usage-change').click();await page.locator('[data-mode=comanda]').click();await page.locator('#comanda-workspace').waitFor();assert.equal(await page.locator('.co-order').count(),1);
 await page.reload();await page.waitForFunction(()=>window.SuiloadAppReady);assert.equal(await page.locator('.modal-back.show').count(),0);assert.match(await page.locator('.co-order h3').textContent(),/Lucía/);
 // Automatic updates preserve a comanda draft and editing fields.
 await page.locator('#co-quick-items').getByRole('button',{name:/Medialuna/}).click();await page.locator('#co-nombre').fill('Borrador');
 await page.evaluate(()=>{sessionStorage.setItem('suiload-update-draft',JSON.stringify({items:state.items,editId:state.editId,fecha:state.fecha,order:[],config:[],tab:'pedidos',comanda:SuiloadComandas.getDraft()}));});
 await page.reload();await page.waitForFunction(()=>!sessionStorage.getItem('suiload-update-draft'));
 assert.equal(await page.locator('#co-nombre').inputValue(),'Borrador');assert.equal(await page.locator('#co-items .co-item').count(),1);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:'/tmp/suiload-comandas-mobile.png',fullPage:true,animations:'disabled'});
 // The configuration selector changes views without erasing the other draft.
 await page.locator('[data-tab=config]').click();await page.locator('#c-modo').selectOption('delivery');await page.locator('#btn-guardar-config').click();
 await page.waitForFunction(()=>SuiloadLocal.request('/api/config').then(c=>c.modo_uso==='delivery'));
 await page.locator('[data-tab=pedidos]').click();await page.locator('#delivery-workspace').waitFor();
 await page.locator('[data-tab=config]').click();await page.locator('#c-modo').selectOption('comanda');await page.locator('#btn-guardar-config').click();
 await page.waitForFunction(()=>SuiloadLocal.request('/api/config').then(c=>c.modo_uso==='comanda'));
 await page.locator('[data-tab=pedidos]').click();await page.locator('#comanda-workspace').waitFor();assert.equal(await page.locator('#co-nombre').inputValue(),'Borrador');
 assert.deepEqual(errors,[]);console.log('PASS browser: onboarding, quick items, payment, optional identity/manual numbers, state cascade, debts, tickets, configuration, mode switches, draft restore and mobile layout.');
 await context.close();
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
