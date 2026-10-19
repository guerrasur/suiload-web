# Suiload — Suipacha Loader web

Edición web independiente de `guerrasur/suipachaloader`, basada en el commit
`0829b2d` (local v1.18.6). Su desarrollo y publicación NO actualizan el repo local.

## Uso

Abrir la web, elegir el nombre del local y cargar los datos. No requiere
instalar Python, descargar la app, crear una cuenta ni un servidor de datos.

Los datos propios se guardan en **IndexedDB** del navegador/dispositivo.
Otra persona que abra el mismo enlace tiene una base independiente. Cambiar
navegador o dispositivo no traslada los datos; se puede exportar/importar
una copia JSON desde Configuración. Incógnito y borrar los datos del sitio
pueden eliminarlos. El botón Proteger guardado solicita almacenamiento
persistente al navegador, que decide si concede la protección.

Incluye pedidos, alertas, carta, clientes, cuentas prepagadas/semanales,
tickets, contactos, rutas de reparto, facturación operativa y XLSX diario/mensual.
La facturación sigue siendo una marca operativa; no envía facturas a Bistro.
No importa automáticamente la SQLite de la edición local.

Rutas: consultas explícitas a Nominatim/OSRM desde el navegador, caché de
coordenadas por dispositivo, una solicitud por segundo. Envía sólo las
direcciones necesarias; el resto de los registros permanece en el dispositivo.
Sin tráfico en vivo. Hasta 12 entregas calcula el recorrido mínimo exacto
por matriz dirigida; dos repartidores hasta 12 pedidos minimizan la ruta más
larga y después el costo total. Para mayores volúmenes usa heurísticas.
Si falla el servicio de calles informa aproximación geográfica; las
direcciones no ubicadas quedan visibles fuera de la propuesta.

## Desarrollo web

Los archivos publicables están en `web/`. No hay build ni dependencias web.

```bash
python -m http.server 8080 --directory web
```

Abrir http://localhost:8080. Los archivos `static/`, `app/` y los tests Python
se conservan sólo como referencia de la copia original. NO son el backend web.
Cada cambio web se verifica contra `web/`; no hay sincronización automática
con el repositorio original.

## Firebase Hosting

Proyecto/site: `suiload`. Publicar sólo `web/`:

```bash
firebase login
firebase deploy --only hosting --project suiload
```

No requiere Firestore, Authentication, Functions ni plan Blaze. Hosting
sigue sujeto a las cuotas de Firebase. La actualización de código no toca
IndexedDB: los datos sobreviven en el mismo origen.

## Configuración y actualización (web v1.0.1)

Configuración permite definir no cobrar envío, tipo y medio de pago, detalle
de efectivo, guardado automático de clientes y asignación del único repartidor.
Se aplican sólo a nuevos pedidos, son independientes por navegador y se incluyen
en las copias JSON. Las bases anteriores reciben los valores predeterminados
sin perder sus registros.

La app comprueba `version.json` al abrir, volver a la pestaña, recuperar conexión
y cada cinco minutos. Aplica la nueva versión automáticamente, sin pedir confirmación.
Conserva en la pestaña el pedido en curso y los ajustes sin guardar; espera
a que terminen las ventanas modales y las ediciones de la tabla. También se puede comprobar manualmente desde Actualizar app.
Las actualizaciones automáticas se pueden desactivar en Configuración.
Los recursos usan URLs versionadas y Hosting revalida el contenido. Cada release
debe actualizar VERSION, web/version.js, web/version.json, /api/version y
las URLs de JS/CSS de web/index.html. Publicar en Firebase sigue siendo un
paso separado: el actualizador detecta las versiones ya desplegadas.

Desde v1.0.2, elegir Reserva o Envío en el formulario guarda automáticamente ese
tipo como predeterminado para los próximos pedidos y al volver a abrir la web.

## Primer ingreso y menú (web v1.0.3)

Una instalación nueva comienza sin carta precargada. Después del nombre del
local, el asistente permite cargar varios ítems con nombre y precio. Categoría
y precio de lista son opcionales; dejar Lista vacío usa el precio en efectivo.
Se puede elegir Configurar después y completarlo desde Carta.

En **Carta → Editar menú y precios** se pueden agregar ítems, modificar nombres,
categorías y ambos precios en una sola pantalla. Destildar Disponible oculta un
ítem sin borrar su historial. Guardar cambios aplica todo junto; Cancelar deja
el menú intacto. Los menús existentes se conservan y los pedidos anteriores no
cambian de precio.

El botón Modo oscuro / Modo claro usa la paleta de SuipachaLoader, toma inicialmente
la preferencia del sistema y recuerda la elección en este navegador.

Prueba de operaciones web, desde la raíz del repositorio:

```bash
mkdir -p /workspace/scratch/4a4a2ad47002
node tests/web/operations.cjs
```

Desde **web v1.0.4**, la alerta de pedidos sin facturar está desactivada por
defecto. En la configuración inicial del menú se puede marcar Activar alerta
y elegir una hora. La misma casilla está disponible en Configuración; desmarcarla
elimina la alerta aunque haya una hora guardada. Las instalaciones anteriores
sin una elección explícita también comienzan con esta alerta desactivada.

## Reparto y comandas (web v1.1.0)

Después del nombre del local se elige el uso: **pedidos y reservas para delivery**
o **anotar comandas**. Se puede alternar desde Cambiar uso en la barra superior
o desde Configuración → Usar Suiload para. La elección se recuerda; no se borra
el menú ni el historial. El modo comandas no pregunta por repartidores ni por
el plato del día. Los menús existentes no se reemplazan.

Comandas pone primero comprador y número (ambos opcionales), Efectivo o
Transferencia y los ítems. Una carta de hasta 12 ítems presenta un botón por
ítem; para cartas mayores hay búsqueda. Repetir un botón suma cantidad. Si el
número queda vacío, asigna el primer entero positivo disponible del día; un
número manual ya usado se rechaza sin guardar. Los números son únicos por fecha
entre ambos modos. Mozo, descuento, notas, ítems fuera de carta y otros medios
de pago están en Más opciones. Descuento comienza en Monto $ con valor cero.

El tablero muestra ítems, total, pago, Marchó, Pedido listo y Completado.
Completar marca Marchó y Listo, sin modificar Pagado. Se puede deshacer cada
estado; quitar Listo o Marchó también quita Completado. Configuración permite
ocultar Marchó. Los cobros pendientes del día se resumen junto al tablero;
los de días anteriores aparecen en Pendientes de cobro, aunque la comanda esté
completada. Tickets distinguen la transferencia de un pago efectivamente
marcado y los XLSX incluyen uso, pago y estados de la comanda.

Las funciones de reparto, reservas, rutas, reportes, clientes y cuentas siguen
accesibles desde Más funciones o cambiando a Reparto. La vista de comandas
filtra las comandas; la tabla original permite consultar también el historial
completo y restaurar anulaciones. Las copias JSON conservan los nuevos estados. Las actualizaciones
automáticas también recuperan el borrador de la comanda en curso.

Validación desde la raíz:

```bash
node --test tests/web/comandas.cjs
node tests/web/operations.cjs
```

Para la prueba de navegador se requiere Playwright disponible para Node y
Chromium instalado (CHROMIUM_PATH permite cambiar el ejecutable). Con el servidor
estático en otra terminal, ejecutar:

```bash
node tests/web/comandas-browser.cjs
```

Publicación: la v1.1.0 incluye los cambios de la v1.0.4. Basta desplegar una vez
la versión actual desde Cloud Shell; no hace falta publicar versiones intermedias.

## Alias y controles siempre visibles (web v1.1.1)

La cabecera del área de trabajo muestra **ALIAS:** con el texto destacado,
entre el título de la vista y la fecha. Editar permite
cambiarlo; Dejar fijo conserva el alias bloqueado hasta pulsar Desbloquear.
También se puede configurar desde Configuración. Se guarda en este navegador,
se incluye en las copias JSON y aparece en ambas vistas de pedidos. La app espera
si se está editando el alias antes de aplicar una actualización automática.

La lista de ítems tiene altura acotada y desplazamiento propio. El total del
pedido y Guardar quedan fijos al pie de la pantalla: agregar ítems no los
empuja hacia abajo. El resumen al final de la página muestra el total de todos los pedidos no
anulados de la fecha elegida, los subtotales por medio de pago, lo cobrado y lo
pendiente. **Exportar Excel del día** descarga esa fecha, también desde Comandas.
Los medios conservan sus emojis y colores: 💵 efectivo verde y 🏦 transferencia
azul; el botón no elegido se oscurece.

Prueba adicional de navegador (con el mismo servidor y Playwright):

```bash
node tests/web/workspace-browser.cjs
```

En **web v1.1.2** el alias se ubica dentro de la página, entre Comandas (o
Pedidos y reservas) y el selector de fecha. En pantallas pequeñas pasa a una
fila propia debajo del título. Usa el azul de la aplicación, con el alias
en negrita, y conserva la edición y el bloqueo del texto.

En **web v1.1.3**, el resumen del día y Exportar Excel del día quedan al final
de la página, con desplazamiento normal. Sólo el total del pedido en curso y
Guardar permanecen anclados al pie de la pantalla.

## Carga de ítems y orden de pedidos (web v1.1.4)

Las comandas completadas se agrupan al final de la lista; los cobros pendientes
siguen visibles y se pueden marcar pagados allí. Al deshacer Completado, la
comanda vuelve al grupo de pedidos en curso. En la tabla de reparto, los pedidos
que ya salieron y las reservas listas también quedan al final.

La carga usa filas compactas: nombre y precio unitario como texto, cantidad
con −/+ o escritura directa, subtotal y quitar. Editar abre el nombre y el
precio sólo cuando se necesitan; Cancelar no cambia el ítem. Un ítem fuera de
carta se agrega al aplicar, sin dejar filas vacías al cancelar. Quitar permite
Deshacer. Los botones de productos muestran la cantidad ya elegida y sumar de
nuevo incrementa la misma línea cuando el ítem y el precio coinciden. La lista
tiene más espacio y mantiene su propio
desplazamiento; Total y Guardar continúan fijos.

Referencias consultadas para el diseño: [Odoo POS, líneas del pedido](https://github.com/odoo/odoo/blob/18.0/addons/point_of_sale/static/src/app/generic_components/orderline/orderline.xml),
[tarjetas de producto de Odoo POS](https://github.com/odoo/odoo/blob/18.0/addons/point_of_sale/static/src/app/generic_components/product_card/product_card.xml)
y [carrito de ERPNext](https://github.com/frappe/erpnext/blob/develop/erpnext/selling/page/point_of_sale/pos_item_cart.js).
Se tomaron como referencia la jerarquía producto/cantidad/importe y la separación
de los detalles de edición, manteniendo el diseño y la implementación de Suiload.

Prueba de cantidades, edición/cancelación, deshacer, productos fuera de carta,
orden de completadas, reparto y diseño móvil (con Chromium, Playwright y servidor):

```bash
node tests/web/capture-browser.cjs
```
