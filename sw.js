/* ============================================================================
   sw.js — Service Worker de SIC Metam Sodio (PWA)

   Qué hace, en palabras simples:
   - Guarda el código de la app en el teléfono la primera vez que se abre con
     señal. Después, la app ABRE Y FUNCIONA aunque no haya nada de señal.
   - Cachea también las librerías externas (jsPDF, xlsx) y las fuentes de
     Google, para que los PDF/Excel y el diseño funcionen sin internet.
   - Maneja las actualizaciones: cuando subes una versión nueva, este archivo
     detecta el cambio y le avisa a la app para que ofrezca "Actualizar".

   ⚠️ IMPORTANTE AL ACTUALIZAR LA APP:
   Cada vez que cambies cualquier archivo del proyecto (js, css, index.html),
   SUBE EL NÚMERO DE VERSIÓN de abajo (APP_VERSION). Ese cambio es lo que hace
   que los teléfonos detecten la nueva versión y se actualicen. Si no lo subes,
   los teléfonos podrían seguir con la versión vieja en caché.
   ========================================================================= */

const APP_VERSION = "v1.0.0";                 // <-- SUBIR EN CADA ACTUALIZACIÓN
const CACHE_APP = "sic-metam-app-" + APP_VERSION;
const CACHE_EXT = "sic-metam-ext-" + APP_VERSION;

// Archivos propios de la app (app shell). Se descargan al instalar.
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/data.js",
  "./js/calc.js",
  "./js/localdb.js",
  "./js/api.js",
  "./js/img-utils.js",
  "./js/geo.js",
  "./js/export-xlsx.js",
  "./js/export-pdf.js",
  "./js/app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon.png"
];

// Recursos externos que la app necesita (se cachean al vuelo la primera vez).
const EXTERNOS_PREFIJOS = [
  "https://cdnjs.cloudflare.com/",
  "https://fonts.googleapis.com/",
  "https://fonts.gstatic.com/"
];

// -------- Instalación: precachear el app shell --------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_APP).then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())   // activa de inmediato tras confirmar
      .catch((e) => { /* si falla un archivo, no bloquear la instalación entera */ })
  );
});

// -------- Activación: borrar cachés de versiones viejas --------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k.startsWith("sic-metam-") && k !== CACHE_APP && k !== CACHE_EXT)
            .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// -------- Estrategias de fetch --------
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo GET se cachea; el resto (POST/PUT/DELETE al backend) pasa directo.
  if (req.method !== "GET") return;

  // Nunca interceptar las llamadas al backend de evaluaciones/config:
  // deben ir siempre a la red (y si falla, la app ya tiene su cola offline).
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/.netlify/")) {
    return; // dejar pasar a la red normalmente
  }

  const esExterno = EXTERNOS_PREFIJOS.some((p) => req.url.startsWith(p));

  if (esExterno) {
    // Recursos externos (CDN/fuentes): cache-first, y si no está, red + guardar.
    event.respondWith(
      caches.match(req).then((hit) =>
        hit || fetch(req).then((res) => {
          const copia = res.clone();
          caches.open(CACHE_EXT).then((c) => c.put(req, copia)).catch(() => {});
          return res;
        }).catch(() => hit) // sin red y sin caché: falla suave
      )
    );
    return;
  }

  // Mismo origen (app shell y navegación): cache-first con respaldo de red.
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) {
        // En segundo plano, intentar refrescar el recurso para la próxima vez.
        fetch(req).then((res) => {
          if (res && res.ok) {
            const copia = res.clone();
            caches.open(CACHE_APP).then((c) => c.put(req, copia)).catch(() => {});
          }
        }).catch(() => {});
        return hit;
      }
      // No estaba en caché: ir a la red y guardar.
      return fetch(req).then((res) => {
        if (res && res.ok && url.origin === self.location.origin) {
          const copia = res.clone();
          caches.open(CACHE_APP).then((c) => c.put(req, copia)).catch(() => {});
        }
        return res;
      }).catch(() => {
        // Sin red y sin caché: si es una navegación, servir el index cacheado.
        if (req.mode === "navigate") return caches.match("./index.html");
      });
    })
  );
});

// -------- Comunicación con la app (para el flujo de actualización) --------
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  } else if (event.data === "GET_VERSION") {
    event.ports[0] && event.ports[0].postMessage(APP_VERSION);
  }
});
