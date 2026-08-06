/* ============================================================================
   localdb.js — almacenamiento local con IndexedDB (en vez de localStorage).
   Se usa cuando la app corre sin backend (sin Netlify): a diferencia de
   localStorage (límite ~5-10MB, se llena rápido con fotos), IndexedDB soporta
   cientos de MB, suficiente para varias evaluaciones con fotos de campo.
   ========================================================================= */

const LocalDB = (() => {
  const DB_NAME = "sic_metam_sodio";
  const DB_VERSION = 1;
  const STORES = ["previo", "durante", "post", "config", "cola_sync"];
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) { reject(new Error("IndexedDB no disponible en este navegador")); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        STORES.forEach(name => {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: name === "config" ? "key" : (name === "cola_sync" ? "cola_id" : "id") });
          }
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function getAll(store) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function put(store, value) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(value);
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function remove(store, key) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getConfig() {
    const row = (await getAll("config")).find(r => r.key === "tolerancias");
    return row ? row.value : null;
  }
  async function setConfig(value) {
    return put("config", { key: "tolerancias", value });
  }

  /* -------- Cola de sincronización --------
     Cada elemento pendiente: { cola_id, tipo: "save"|"remove"|"config",
     proceso, id, record?, cfg?, ts }. Se reintenta contra el servidor cuando
     vuelve la conexión. */
  async function encolar(item) {
    if (!item.cola_id) item.cola_id = (crypto.randomUUID ? crypto.randomUUID() : "c-" + Date.now() + "-" + Math.random());
    item.ts = item.ts || new Date().toISOString();
    return put("cola_sync", item);
  }
  async function colaPendiente() {
    return getAll("cola_sync");
  }
  async function quitarDeCola(cola_id) {
    return remove("cola_sync", cola_id);
  }
  async function contarCola() {
    return (await getAll("cola_sync")).length;
  }

  return { getAll, put, remove, getConfig, setConfig, encolar, colaPendiente, quitarDeCola, contarCola };
})();
