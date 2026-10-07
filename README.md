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
