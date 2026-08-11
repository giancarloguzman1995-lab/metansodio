# SIC Metam Sodio — cómo correrlo sin Netlify (laptop + celular)

La app funciona en dos modos, sin tocar nada del código:

- **Modo equipo** (cuando esté desplegada en Netlify): guarda en Netlify Blobs,
  compartido entre todos los evaluadores y dispositivos.
- **Modo de pruebas local** (este paquete): guarda todo en este dispositivo
  usando IndexedDB del navegador — soporta evaluaciones con fotos adjuntas
  sin llenarse rápido, a diferencia de `localStorage`.

## Las tres etapas

Metam Sodio se evalúa en **tres momentos distintos**, cada uno con su propio
formato digital, con base en el Manual de Aplicación de Metam Sodio (guía
QM_G-036):

- **Previo** (`QM_F-26A`) — verifica que el terreno esté listo antes de
  aplicar: prueba del puño (humedad a capacidad de campo) en varios puntos
  del lote, ventana de aplicación respecto al trasplante (DAT) y dosis
  planificada según el historial fitosanitario del lote.
- **Durante** (`QM_F-26B`) — registra la aplicación en sí: franja horaria,
  concentración (ppm), tiempo de aplicación, litros aplicados, y la presión
  (PSI) de cada válvula. Al final se muestra un **resumen de cálculos**
  (dosis aplicada, presión promedio, % de cumplimiento de dosis) igual que
  en el mockup que armó el inspector en base44.
- **Post** (`QM_F-26C`) — cierre: tiempo de lavado, post-riego/sellado del
  gas, período de ventilación, prueba de germinación/fitotoxicidad por
  submuestra, y la **decisión final Apto / No apto** del lote.

## Semáforo de lotes

La pestaña **Lotes** combina la evaluación más reciente de Previo, Durante y
Post por UT, con una calificación ponderada (por defecto Previo 25% ·
Durante 35% · Post 40% — ajustable en Configuración). Un lote se marca
"Completo" en cuanto tiene Post registrado. Además de la regla normal (una
no conformidad abierta evita el verde), **una decisión "NO APTO" en Post
fuerza el lote a rojo**, sin importar cómo salga el puntaje ponderado — un
lote no apto para trasplante no puede maquillarse con buenos números en
otra variable.

## ⚠️ Valores pendientes de confirmar

Dos valores en `js/data.js` quedaron con la referencia inicial del mockup y
**deben confirmarse con el área técnica** antes de usarse en campo (son
editables desde Configuración → basta con ajustarlos ahí, no hay que tocar
código):

- **Rango de presión por válvula**: 9–12 PSI.
- **Máximo de válvulas por lote**: 20 (esto solo afecta el aviso "X de 20"
  en el formulario; no bloquea agregar más si hiciera falta — para bajar el
  tope real hay que editar `pointMax` en `js/data.js`).

## Usarla en tu laptop

1. Descomprime el zip.
2. Entra a la carpeta `sic-metam-sodio` y corre uno de estos (elige el que
   tengas instalado):
   ```
   python3 -m http.server 8080
   ```
   o
   ```
   npx serve .
   ```
3. Abre **http://localhost:8080** (o la URL que te indique) en Chrome.

No abras `index.html` con doble clic si vas a usar fotos: los navegadores
limitan IndexedDB en archivos abiertos así (`file://`). Con el servidor local
de arriba no hay ese problema.

## Usarla también en el celular (Chrome), sin desplegar nada

El comando del paso 2 deja el servidor accesible para cualquier dispositivo
conectado a la **misma red WiFi** que tu laptop:

1. Con el servidor corriendo en tu laptop, busca la IP local de tu laptop:
   - **Windows**: abre `cmd` y escribe `ipconfig` → busca "Dirección IPv4"
     (algo como `192.168.1.23`).
   - **Mac**: Preferencias del Sistema → Red, o `ifconfig` en Terminal.
2. En el celular, conéctate a la **misma red WiFi**.
3. Abre Chrome y ve a `http://` + esa IP + `:8080` — por ejemplo:
   `http://192.168.1.23:8080`

**Importante:** en este modo, el celular y la laptop guardan sus datos por
separado (cada navegador tiene su propio IndexedDB). No se sincronizan
automáticamente entre sí — eso es justo lo que resuelve el despliegue en
Netlify más adelante. Mientras tanto, usa **Historial → Respaldo JSON** en
cada dispositivo para juntar manualmente lo capturado por distintos
evaluadores.

## Fotos de soporte

En "Nueva evaluación" hay una sección **Fotos de soporte**: el botón abre la
cámara directamente en celular (o el explorador de archivos en laptop), y
cada foto se comprime automáticamente antes de guardarse. Puedes agregar una
descripción corta a cada una.

## Reporte PDF rápido para enviar desde el campo

Desde **Historial → Reporte PDF**, se genera un PDF con los datos de la
evaluación (adaptados a la etapa: Previo, Durante o Post), el semáforo de
cumplimiento, la tabla de puntos/válvulas y las fotos adjuntas con sus
descripciones.

- **En Chrome Android**: se abre directamente el selector de compartir del
  celular (WhatsApp, correo, Drive, etc.) — el inspector puede enviarlo sin
  salir de la app.
- **En laptop o navegadores sin esa función**: se descarga el PDF normalmente.

## App instalable y offline (PWA)

Una vez desplegada en Netlify (con `https`), la app se puede **instalar en el
teléfono** como si fuera nativa y **abre y funciona sin señal**:

- En Chrome Android: menú ⋮ → "Agregar a pantalla de inicio" / "Instalar app".
- En iPhone (Safari): botón Compartir → "Agregar a pantalla de inicio".

El service worker (`sw.js`) guarda el código de la app, las librerías de PDF y
Excel, y las fuentes, para que todo cargue sin internet. La captura offline ya
la resolvía IndexedDB + la cola de sincronización; la PWA agrega que **la app
misma abra sin señal**, no solo que guarde sin señal.

**⚠️ Al publicar una actualización:** cada vez que cambies cualquier archivo
(`js`, `css`, `index.html`…), **sube el número de `APP_VERSION`** en la parte
de arriba de `sw.js` (por ejemplo `v1.0.0` → `v1.0.1`). Ese cambio es lo que
hace que los teléfonos detecten la versión nueva y muestren el aviso
**"Hay una versión nueva · Actualizar ahora"**. Si no lo subes, algunos
teléfonos podrían quedarse con la versión vieja en caché.

Los íconos de la app (carpeta `icons/`) se generaron del logo de Gestión de
Calidad e Inocuidad, igual que en la app de Mecanización, para que las dos
apps hermanas se reconozcan como parte del mismo sistema SIC.

## Cuando quieras desplegarlo de verdad

Este mismo paquete incluye `netlify.toml` y `netlify/functions/`, listos
para cuando `netlify deploy --prod` vuelva a funcionar — no hay que cambiar
nada en el código, y las evaluaciones que quieras conservar se pasan con el
respaldo JSON.
