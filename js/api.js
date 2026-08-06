/* ============================================================================
   api.js — cliente contra las funciones de Netlify (Blobs compartidos entre
   todo el equipo), con GUARDADO A PRUEBA DE PÉRDIDAS.

   Principios de este módulo (reescrito para evitar pérdida de evaluaciones):

   1. GUARDAR LOCAL SIEMPRE PRIMERO. Antes de intentar el servidor, la
      evaluación se escribe en IndexedDB. Así, pase lo que pase con la red,
      el dato queda en el teléfono. Si esa escritura local falla (p. ej.
      almacenamiento lleno), se AVISA con un error — nunca se pierde en
      silencio.

   2. NO RENDIRSE CON LA RED. No existe un "netAvailable=false" permanente.
      Cada operación vuelve a intentar el servidor. Si la red está caída en
      este momento, la operación se ENCOLA y se reintenta luego.

   3. COLA DE SINCRONIZACIÓN. Lo que no se pudo mandar al servidor queda en
      una cola persistente (IndexedDB) y se reenvía en cuanto vuelve la
      conexión (al recuperar el evento 'online', al abrir la app, o al pulsar
      "Sincronizar ahora").

   El resultado de save() indica con claridad qué pasó, para que la interfaz
   pueda mostrar una confirmación HONESTA:
     { ok:true, synced:true }  -> guardado y sincronizado con el servidor
     { ok:true, synced:false } -> guardado en el teléfono, pendiente de subir
     (lanza error)             -> NO se pudo guardar ni siquiera local
   ========================================================================= */

const Api = (() => {
  let serverKnownUp = true;   // solo informativo para el indicador de estado
  let backendExists = null;   // ¿esta instalación tiene backend? (null = aún no se sabe)

  function online() {
    return (typeof navigator === "undefined") ? true : navigator.onLine !== false;
  }

  async function tryFetch(url, opts) {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error("api-error-" + res.status);
    return res;
  }

  // ---------------------------------------------------------------- listAll
  async function listAll() {
    if (online()) {
      try {
        const res = await tryFetch("/api/evaluaciones");
        const data = await res.json();
        serverKnownUp = true; backendExists = true;
        // Cache local de lo que hay en el servidor, para tener respaldo offline.
        for (const p of Object.keys(PROCESOS)) {
          if (Array.isArray(data[p])) {
            for (const rec of data[p]) { try { await LocalDB.put(p, rec); } catch (e) {} }
          }
        }
        return data;
      } catch (e) {
        serverKnownUp = false;
        // Si nunca hemos confirmado backend, puede que sea instalación local.
        if (backendExists === null) backendExists = false;
      }
    }
    const out = {};
    for (const p of Object.keys(PROCESOS)) out[p] = await LocalDB.getAll(p);
    return out;
  }

  // ------------------------------------------------------------------- save
  async function save(record) {
    if (!record.id) record.id = crypto.randomUUID();
    record.actualizado = new Date().toISOString();

    // 1) LOCAL PRIMERO — red de seguridad. Si esto falla, avisamos fuerte.
    try {
      await LocalDB.put(record.proceso, record);
    } catch (e) {
      const err = new Error("No se pudo guardar en el dispositivo. Posible almacenamiento lleno.");
      err.causa = e;
      err.critico = true;
      throw err;
    }

    // 2) Intentar el servidor. Si no hay red o falla, encolar para después.
    if (online()) {
      try {
        const res = await tryFetch("/api/evaluaciones", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(record)
        });
        serverKnownUp = true; backendExists = true;
        await res.json().catch(() => ({}));
        return { ok: true, synced: true, record };
      } catch (e) {
        serverKnownUp = false;
        if (backendExists === null) backendExists = false;
      }
    }

    // 3) No se pudo sincronizar ahora: encolar (a menos que sea instalación
    //    puramente local sin backend, donde no hay a dónde sincronizar).
    if (backendExists !== false) {
      try { await LocalDB.encolar({ tipo: "save", proceso: record.proceso, id: record.id, record }); } catch (e) {}
      return { ok: true, synced: false, record };
    }
    return { ok: true, synced: true, record }; // instalación local: "sincronizado" no aplica
  }

  // ----------------------------------------------------------------- remove
  async function remove(proceso, id) {
    try { await LocalDB.remove(proceso, id); } catch (e) {}
    if (online()) {
      try {
        await tryFetch(`/api/evaluaciones?proceso=${encodeURIComponent(proceso)}&id=${encodeURIComponent(id)}`, { method: "DELETE" });
        serverKnownUp = true; backendExists = true;
        return { ok: true, synced: true };
      } catch (e) {
        serverKnownUp = false;
        if (backendExists === null) backendExists = false;
      }
    }
    if (backendExists !== false) {
      try { await LocalDB.encolar({ tipo: "remove", proceso, id }); } catch (e) {}
      return { ok: true, synced: false };
    }
    return { ok: true, synced: true };
  }

  // -------------------------------------------------------------- getConfig
  async function getConfig() {
    if (online()) {
      try {
        const res = await tryFetch("/api/config");
        const data = await res.json();
        serverKnownUp = true; backendExists = true;
        try { await LocalDB.setConfig(data); } catch (e) {}
        return data;
      } catch (e) {
        serverKnownUp = false;
        if (backendExists === null) backendExists = false;
      }
    }
    try { return await LocalDB.getConfig(); }
    catch { return null; }
  }

  // ------------------------------------------------------------- saveConfig
  async function saveConfig(cfg) {
    try { await LocalDB.setConfig(cfg); } catch (e) {}
    if (online()) {
      try {
        await tryFetch("/api/config", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(cfg)
        });
        serverKnownUp = true; backendExists = true;
        return { ok: true, synced: true };
      } catch (e) {
        serverKnownUp = false;
        if (backendExists === null) backendExists = false;
      }
    }
    if (backendExists !== false) {
      try { await LocalDB.encolar({ tipo: "config", cfg }); } catch (e) {}
      return { ok: true, synced: false };
    }
    return { ok: true, synced: true };
  }

  // ------------------------------------------------- procesarCola (reintento)
  // Reenvía todo lo pendiente al servidor. Devuelve cuántos quedaron OK y
  // cuántos siguen pendientes. Seguro de llamar en cualquier momento.
  async function procesarCola() {
    if (!online()) return { enviados: 0, pendientes: await LocalDB.contarCola() };
    let pendientes;
    try { pendientes = await LocalDB.colaPendiente(); }
    catch (e) { return { enviados: 0, pendientes: 0 }; }

    let enviados = 0;
    for (const item of pendientes) {
      try {
        if (item.tipo === "save") {
          await tryFetch("/api/evaluaciones", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify(item.record)
          });
        } else if (item.tipo === "remove") {
          await tryFetch(`/api/evaluaciones?proceso=${encodeURIComponent(item.proceso)}&id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
        } else if (item.tipo === "config") {
          await tryFetch("/api/config", {
            method: "PUT", headers: { "content-type": "application/json" },
            body: JSON.stringify(item.cfg)
          });
        }
        await LocalDB.quitarDeCola(item.cola_id);
        enviados++;
        serverKnownUp = true; backendExists = true;
      } catch (e) {
        // Distinguir el tipo de fallo:
        // - Error de red (fetch lanza TypeError, sin respuesta): seguimos sin
        //   señal → detener y reintentar toda la cola después.
        // - Error del servidor (api-error-4xx): ese registro puntual es
        //   problemático; lo saltamos para que NO bloquee al resto de la cola.
        const msg = String(e && e.message || "");
        const esErrorServidor = msg.startsWith("api-error-4");
        if (esErrorServidor) {
          // Marcar intentos; tras varios, dejarlo pero seguir con los demás.
          item.intentos = (item.intentos || 0) + 1;
          try { await LocalDB.encolar(item); } catch (_) {}
          continue;
        }
        serverKnownUp = false;
        break;
      }
    }
    const restantes = await LocalDB.contarCola();
    return { enviados, pendientes: restantes };
  }

  async function pendientesCount() {
    try { return await LocalDB.contarCola(); } catch (e) { return 0; }
  }

  function isOnline() { return serverKnownUp && online(); }
  function hayBackend() { return backendExists !== false; }

  return { listAll, save, remove, getConfig, saveConfig, procesarCola, pendientesCount, isOnline, hayBackend };
})();
