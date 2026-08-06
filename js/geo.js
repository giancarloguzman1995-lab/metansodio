/* ============================================================================
   geo.js — captura la ubicación GPS del inspector con el API del navegador.
   Requiere permiso del usuario (una vez) y conexión segura (https, que la URL
   de Netlify ya cumple). Bajo techo o con mala señal, la precisión puede ser
   de decenas de metros; por eso se guarda también la precisión reportada.
   ========================================================================= */

const Geo = (() => {
  function disponible() {
    return typeof navigator !== "undefined" && "geolocation" in navigator;
  }

  /** Devuelve una promesa con { lat, lon, precision, capturado } o lanza un
   *  error con mensaje entendible para mostrar al inspector. */
  function capturar(opts = {}) {
    return new Promise((resolve, reject) => {
      if (!disponible()) {
        reject(new Error("Este dispositivo o navegador no permite ubicación."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        pos => {
          resolve({
            lat: Number(pos.coords.latitude.toFixed(6)),
            lon: Number(pos.coords.longitude.toFixed(6)),
            precision: pos.coords.accuracy != null ? Math.round(pos.coords.accuracy) : null,
            capturado: new Date().toISOString()
          });
        },
        err => {
          let msg;
          switch (err && err.code) {
            case 1: msg = "Permiso de ubicación denegado. Actívalo en los ajustes del navegador."; break;
            case 2: msg = "No se pudo obtener la señal GPS. Intenta al aire libre."; break;
            case 3: msg = "La ubicación tardó demasiado. Vuelve a intentar."; break;
            default: msg = "No se pudo capturar la ubicación.";
          }
          reject(new Error(msg));
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0, ...opts }
      );
    });
  }

  /** URL de Google Maps para abrir un punto. */
  function urlMaps(lat, lon) {
    return `https://www.google.com/maps?q=${lat},${lon}`;
  }

  /** Texto corto para mostrar/exportar. */
  function texto(geo) {
    if (!geo || geo.lat == null) return "";
    const prec = geo.precision != null ? ` (±${geo.precision} m)` : "";
    return `${geo.lat}, ${geo.lon}${prec}`;
  }

  return { disponible, capturar, urlMaps, texto };
})();
