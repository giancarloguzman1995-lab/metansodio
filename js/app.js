/* ============================================================================
   app.js — estado de la aplicación y renderizado de las 4 vistas:
   Nueva evaluación · Historial · Tablero · Configuración
   ========================================================================= */

const App = {
  state: {
    view: "nueva",
    tolerancias: null,
    data: {},
    form: null, // se inicializa con newForm()
    histFilters: { proceso: "", finca: "", ut: "", desde: "", hasta: "" }
  }
};

function deepMerge(base, override) {
  const out = JSON.parse(JSON.stringify(base));
  if (!override) return out;
  Object.keys(override).forEach(proc => {
    Object.keys(override[proc] || {}).forEach(varKey => {
      if (out[proc] && out[proc][varKey]) {
        out[proc][varKey] = { ...out[proc][varKey], ...override[proc][varKey] };
      }
    });
  });
  return out;
}

function newForm(proceso) {
  const schema = PROCESOS[proceso];
  const header = {};
  schema.header.forEach(f => header[f.id] = f.type === "boolean" ? false : "");
  header.fecha = new Date().toISOString().slice(0, 10);
  const cierre = {};
  CIERRE_FIELDS.forEach(f => cierre[f.id] = f.id === "estado" ? "N/A" : "");
  return { proceso, id: crypto.randomUUID(), isEdit: false, header, points: [ makeEmptyPoint(proceso) ], cierre, photos: [], geo: null };
}

function makeEmptyPoint(proceso) {
  const p = {};
  PROCESOS[proceso].point.forEach(f => p[f.id] = f.type === "boolean" ? true : "");
  return p;
}

/* ------------------------------- Boot ------------------------------- */
async function boot() {
  setSync("connecting");
  const [cfg, data] = await Promise.all([Api.getConfig(), Api.listAll()]);

  // Si la configuración guardada es de una versión anterior de tolerancias,
  // se adoptan las oficiales nuevas (si no, el dispositivo seguiría usando
  // las viejas y el cambio nunca llegaría al evaluador).
  const versionGuardada = (cfg && cfg.tolVersion) || 1;
  const tolDesactualizadas = !cfg || versionGuardada < TOLERANCIAS_VERSION;
  App.state.tolerancias = tolDesactualizadas
    ? deepMerge(DEFAULT_TOLERANCIAS, null)
    : deepMerge(DEFAULT_TOLERANCIAS, cfg.tolerancias);
  App.state.tolVersion = TOLERANCIAS_VERSION;

  App.state.pesosLote = { ...DEFAULT_PESOS_LOTE, ...(cfg && cfg.pesosLote) };
  // Logos: se usan los pre-cargados por defecto. Un valor guardado los
  // reemplaza; el valor `false` significa "quitado a propósito" y se respeta.
  App.state.logos = {};
  ["izquierdo", "derecho"].forEach(k => {
    const guardado = cfg && cfg.logos ? cfg.logos[k] : undefined;
    App.state.logos[k] = guardado === false ? null : (guardado || DEFAULT_LOGOS[k]);
  });
  App.state.evaluadores = (cfg && cfg.evaluadores) || DEFAULT_EVALUADORES.slice();
  App.state.data = {};
  Object.keys(PROCESOS).forEach(key => { App.state.data[key] = data[key] || []; });
  App.state.form = newForm(Object.keys(PROCESOS)[0]);

  // Estado de sincronización honesto: si hay pendientes en cola, intentar
  // subirlos ahora y reflejar cuántos quedan.
  const pend0 = await Api.pendientesCount();
  if (pend0 > 0 && Api.isOnline()) {
    await Api.procesarCola();
  }
  const pend = await Api.pendientesCount();
  if (!Api.hayBackend()) setSync("local");
  else setSync(Api.isOnline() ? (pend > 0 ? "pending" : "online") : "offline", pend);

  bindNav();
  wireSyncListeners();
  render();
  if (cfg && versionGuardada < TOLERANCIAS_VERSION) {
    toast("Tolerancias actualizadas a la versión oficial vigente");
  }
}

/* Reintenta la cola automáticamente. En celulares NO basta con el evento
   'online' del navegador: al reconectar datos móviles muchas veces no se
   dispara de forma confiable, y la evaluación queda guardada en el teléfono
   pero sin subir al servidor (el indicador se queda en "Sin conexión").
   Por eso usamos VARIAS señales, no solo una:
     1) evento 'online' del navegador (cuando sí llega).
     2) cuando la app vuelve al primer plano (visibilitychange / focus):
        el inspector normalmente reabre la app ya con señal.
     3) un reintento periódico de respaldo mientras haya algo en cola.
     4) toque manual en el indicador o el botón "Sincronizar pendientes".
   Cualquiera de ellas vacía la cola; con que una funcione, basta. */
function wireSyncListeners() {
  if (App._syncWired) return;
  App._syncWired = true;

  const intentar = () => { sincronizarPendientes(true); };

  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("online", intentar);
    window.addEventListener("focus", intentar);
  }
  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") intentar();
    });
  }

  // Reintento periódico de respaldo: cada 30 s, si hay pendientes y el
  // navegador cree tener red, intenta vaciar la cola en silencio.
  if (!App._syncTimer && typeof setInterval !== "undefined") {
    App._syncTimer = setInterval(async () => {
      try {
        const pend = await Api.pendientesCount();
        if (pend > 0 && Api.hayBackend() && (typeof navigator === "undefined" || navigator.onLine !== false)) {
          await sincronizarPendientes(true);
        }
      } catch (e) { /* silencioso */ }
    }, 30000);
  }

  const statusEl = document.getElementById("syncStatus");
  if (statusEl) {
    statusEl.style.cursor = "pointer";
    statusEl.title = "Toca para sincronizar ahora";
    statusEl.addEventListener("click", () => sincronizarPendientes(false));
  }
}

function setSync(mode, pendientes) {
  const el = document.getElementById("syncStatus");
  el.classList.remove("online", "offline", "local", "pending");
  const txt = el.querySelector(".txt");
  if (mode === "connecting") { txt.textContent = "Conectando…"; }
  else if (mode === "online") { el.classList.add("online"); txt.textContent = "Sincronizado con el equipo"; }
  else if (mode === "pending") {
    el.classList.add("pending");
    const n = pendientes || 0;
    txt.textContent = n > 0 ? `Pendiente de subir: ${n}` : "Pendiente de subir";
  }
  else if (mode === "offline") { el.classList.add("offline"); txt.textContent = "Sin conexión · guardando en el teléfono"; }
  else { el.classList.add("local"); txt.textContent = "Modo de pruebas · guardando en este navegador"; }
}

function bindNav() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      App.state.view = btn.dataset.view;
      render();
    });
  });
}

function render() {
  const root = document.getElementById("view");
  root.innerHTML = "";
  const staleList = document.getElementById("evaluadores-list");
  if (staleList) staleList.remove();
  if (App.state.view === "nueva") root.appendChild(renderNueva());
  else if (App.state.view === "historial") root.appendChild(renderHistorial());
  else if (App.state.view === "lotes") root.appendChild(renderLotes());
  else if (App.state.view === "tablero") root.appendChild(renderTablero());
  else if (App.state.view === "gerencia") root.appendChild(renderGerencia());
  else if (App.state.view === "config") root.appendChild(renderConfig());
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ------------------------------- Helpers DOM ------------------------------- */
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c === null || c === undefined) return;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return node;
}

function fmtPct(v) { return v === null || v === undefined || isNaN(v) ? "—" : v.toFixed(1) + "%"; }

/* ============================================================================
   VISTA: Nueva evaluación
   ========================================================================= */
function renderNueva() {
  const f = App.state.form;
  const schema = PROCESOS[f.proceso];
  const wrap = el("div");

  wrap.appendChild(el("div", { class: "page-head" }, [
    el("span", { class: "eyebrow" }, `Formato ${schema.codigoFormato}${schema.guia ? " · Guía " + schema.guia : ""}`),
    el("h1", {}, `Nueva evaluación · ${schema.labelLargo || schema.label}`),
    el("p", { class: "sub" }, "Los datos se guardan compartidos para todo el equipo SIC en cuanto hay conexión.")
  ]));

  // Selector de etapa
  const procTabs = el("div", { class: "btn-row", style: "margin:0 0 16px" });
  Object.values(PROCESOS).forEach(p => {
    const active = p.key === f.proceso;
    procTabs.appendChild(el("button", {
      class: "btn " + (active ? "" : "secondary") + " small",
      onclick: () => { App.state.form = newForm(p.key); render(); }
    }, p.label));
  });
  wrap.appendChild(procTabs);

  // ---- Encabezado ----
  const headCard = el("div", { class: "card" }, [
    el("h3", {}, "Datos generales"),
    buildFieldsGrid(schema.header, f.header, f.proceso)
  ]);
  wrap.appendChild(headCard);

  // ---- Puntos de medición ----
  const itemLabel = schema.pointItemLabel || "punto";
  const pointsCard = el("div", { class: "card" });
  pointsCard.appendChild(el("h3", {}, schema.pointSectionTitle || "Puntos de muestreo"));
  const countTxt = schema.pointMax ? `${f.points.length} de ${schema.pointMax} ${itemLabel}s registrada(s). ` : "";
  pointsCard.appendChild(el("p", { class: "sub" }, countTxt + (schema.pointSectionDesc || "Agrega un punto por cada medición tomada en el lote. El punto de color junto a cada valor indica si cae dentro de tolerancia.")));
  pointsCard.appendChild(buildPointsTable(f));
  const addRow = el("div", { class: "btn-row" });
  const atMax = schema.pointMax && f.points.length >= schema.pointMax;
  addRow.appendChild(el("button", {
    class: "btn secondary small",
    disabled: atMax ? "disabled" : null,
    onclick: () => { if (atMax) return; f.points.push(makeEmptyPoint(f.proceso)); render(); }
  }, atMax ? `Máximo de ${schema.pointMax} alcanzado` : `+ Agregar ${itemLabel}`));
  pointsCard.appendChild(addRow);
  wrap.appendChild(pointsCard);

  // ---- Fotos de soporte ----
  wrap.appendChild(buildPhotosCard(f));

  // ---- Ubicación GPS ----
  wrap.appendChild(buildGeoCard(f));

  // ---- Resumen calculado ----
  const summary = summarizePoints(f.points, schema.point, App.state.tolerancias[f.proceso]);
  const overall = overallCompliance(summary);
  const sem = semaforoFor(overall);
  const sumCard = el("div", { class: "card" }, [
    el("div", { style: "display:flex;align-items:center;justify-content:space-between;margin-bottom:12px" }, [
      el("h3", { style: "margin:0" }, "Cumplimiento calculado"),
      el("span", { class: "badge " + sem }, [el("span", { class: "sw" }), overall === null ? "Sin datos" : fmtPct(overall)])
    ]),
    buildSummaryList(summary)
  ]);
  wrap.appendChild(sumCard);

  // ---- Resumen de cálculos (solo etapas que definan `computed`, p. ej. Durante) ----
  if (schema.computed) wrap.appendChild(buildComputedCard(f, schema));

  // ---- Cierre / trazabilidad ----
  const cierreCard = el("div", { class: "card" }, [
    el("h3", {}, "Observaciones y cierre"),
    buildFieldsGrid(CIERRE_FIELDS, f.cierre, f.proceso)
  ]);
  wrap.appendChild(cierreCard);

  // ---- Acciones ----
  const actions = el("div", { class: "btn-row" });
  actions.appendChild(el("button", {
    class: "btn",
    onclick: () => saveCurrentForm()
  }, f.isEdit ? "Guardar cambios" : "Guardar evaluación"));
  actions.appendChild(el("button", {
    class: "btn secondary",
    onclick: () => { App.state.form = newForm(f.proceso); render(); toast("Formulario limpiado"); }
  }, "Limpiar"));
  wrap.appendChild(actions);

  return wrap;
}

function buildGeoCard(f) {
  const card = el("div", { class: "card" });
  card.appendChild(el("h3", {}, "Ubicación de la inspección"));

  const status = el("div", { class: "geo-status" });
  const btnRow = el("div", { class: "btn-row", style: "margin-top:10px" });

  function refresh() {
    status.innerHTML = "";
    if (f.geoCapturando) {
      status.appendChild(el("p", { class: "sub" }, "Obteniendo señal GPS…"));
    } else if (f.geo && f.geo.lat != null) {
      status.appendChild(el("div", { class: "geo-ok" }, [
        el("span", { class: "geo-coords" }, Geo.texto(f.geo)),
        el("a", { href: Geo.urlMaps(f.geo.lat, f.geo.lon), target: "_blank", rel: "noopener", class: "geo-link" }, "Ver en Google Maps ↗")
      ]));
      if (f.geo.precision != null && f.geo.precision > 50) {
        status.appendChild(el("p", { class: "conflict-note", style: "margin-top:6px" }, `⚠ Precisión baja (±${f.geo.precision} m). Si puedes, recaptura al aire libre.`));
      }
    } else if (f.geoError) {
      status.appendChild(el("p", { class: "conflict-note" }, "⚠ " + f.geoError));
    } else {
      status.appendChild(el("p", { class: "sub" }, "Sin ubicación capturada."));
    }
  }

  async function capturar() {
    f.geoCapturando = true;
    f.geoError = null;
    refresh();
    try {
      f.geo = await Geo.capturar();
    } catch (e) {
      f.geoError = e.message;
    } finally {
      f.geoCapturando = false;
      // Solo re-renderiza si este sigue siendo el formulario activo y estamos
      // en la vista de captura (evita re-render tras guardar o cambiar de vista).
      if (App.state.form === f && App.state.view === "nueva") render();
    }
  }

  refresh();
  card.appendChild(status);

  btnRow.appendChild(el("button", {
    class: "btn secondary small",
    onclick: capturar
  }, f.geo ? "📍 Recapturar ubicación" : "📍 Capturar ubicación"));
  if (f.geo) {
    btnRow.appendChild(el("button", { class: "btn ghost small", onclick: () => { f.geo = null; render(); } }, "Quitar"));
  }
  card.appendChild(btnRow);

  // Captura automática la primera vez que se abre un formulario nuevo (no en edición),
  // sin bloquear: si el inspector no da permiso, simplemente queda vacío y puede
  // capturar manualmente.
  if (!f.isEdit && !f.geo && !f.geoError && !f.geoAutoIntentado && !f.geoCapturando) {
    f.geoAutoIntentado = true;
    capturar();
  }

  return card;
}

function buildPhotosCard(f) {
  const card = el("div", { class: "card" });
  card.appendChild(el("h3", {}, "Fotos de soporte"));
  card.appendChild(el("p", { class: "sub" }, "Se comprimen automáticamente en este dispositivo y quedan incluidas en el PDF de la evaluación — útil para respaldar hallazgos o el estado del lote."));

  const fileInput = el("input", {
    type: "file", accept: "image/*", capture: "environment", multiple: "multiple",
    style: "display:none"
  });
  fileInput.addEventListener("change", async () => {
    const files = Array.from(fileInput.files || []);
    if (!files.length) return;
    toast(`Procesando ${files.length} foto(s)…`);
    for (const file of files) {
      try {
        const dataUrl = await compressImageFile(file);
        f.photos.push({ id: crypto.randomUUID(), dataUrl, caption: "" });
      } catch (e) {
        toast("No se pudo procesar una imagen");
      }
    }
    fileInput.value = "";
    render();
  });
  card.appendChild(fileInput);

  const addBtn = el("button", { class: "btn secondary small", onclick: () => fileInput.click() }, "📷 Agregar fotos");
  card.appendChild(addBtn);

  if (f.photos.length === 0) {
    card.appendChild(el("p", { class: "sub", style: "margin-top:10px" }, "Sin fotos agregadas todavía."));
    return card;
  }

  const grid = el("div", { class: "photo-grid" });
  f.photos.forEach((p, idx) => {
    const item = el("div", { class: "photo-item" });
    item.appendChild(el("img", { src: p.dataUrl, alt: `Foto de soporte ${idx + 1}` }));
    const cap = el("input", { type: "text", placeholder: "Descripción breve (opcional)", value: p.caption || "" });
    cap.addEventListener("input", () => { p.caption = cap.value; });
    item.appendChild(cap);
    item.appendChild(el("button", {
      class: "btn ghost small", onclick: () => { f.photos.splice(idx, 1); render(); }
    }, "Eliminar"));
    grid.appendChild(item);
  });
  card.appendChild(grid);
  return card;
}

function buildFieldsGrid(fieldSchema, values, proceso) {
  const grid = el("div", { class: "grid grid-2" });
  fieldSchema.forEach(fld => grid.appendChild(buildField(fld, values, proceso)));
  return grid;
}

function buildField(fld, values, proceso) {
  const tol = fld.tol ? App.state.tolerancias[proceso][fld.tol] : null;
  const wrap = el("div", { class: "field" + (fld.type === "number" ? " numeric" : "") });
  wrap.appendChild(el("label", {}, [fld.label, fld.required ? el("span", { class: "req" }, " *") : null]));

  let input;
  if (fld.type === "ut") {
    input = el("select", {}, [
      el("option", { value: "" }, "— Selecciona —"),
      ...UT_CATALOG.map(codigo => el("option", { value: codigo, selected: values[fld.id] === codigo ? "selected" : null }, codigo))
    ]);
    input.addEventListener("change", () => {
      values[fld.id] = input.value;
      // La finca se deduce del código de UT y queda bloqueada.
      values.finca = fincaDeUt(input.value);
      render();
    });
  } else if (fld.type === "finca") {
    // Campo derivado: se muestra bloqueado, siempre refleja la UT seleccionada.
    const fincaVal = values.ut_codigo ? fincaDeUt(values.ut_codigo) : "";
    values.finca = fincaVal;
    input = el("input", { type: "text", value: fincaVal, readonly: "readonly", class: "readonly-field" });
    input.setAttribute("tabindex", "-1");
    wrap.appendChild(input);
    wrap.appendChild(el("div", { class: "hint" }, fincaVal ? "Asignada automáticamente según el código de UT." : "Selecciona una UT para asignar la finca."));
    return wrap;
  } else if (fld.type === "evaluador") {
    const listId = "evaluadores-list";
    input = el("input", { type: "text", value: values[fld.id] ?? "", list: listId, placeholder: "Nombre del evaluador" });
    const hint = el("div", { class: "hint" });
    function refreshHint() {
      const match = (App.state.evaluadores || []).find(ev => ev.nombre.trim().toLowerCase() === String(input.value || "").trim().toLowerCase());
      if (match && match.firma) hint.textContent = "✓ Firma registrada — se incluirá en el PDF.";
      else if (input.value) hint.textContent = "Sin firma registrada. Puedes agregarla en Configuración.";
      else hint.textContent = "";
    }
    input.addEventListener("input", () => { values[fld.id] = input.value; refreshHint(); });
    wrap.appendChild(input);
    if (!document.getElementById(listId)) {
      const dl = el("datalist", { id: listId });
      (App.state.evaluadores || []).forEach(ev => dl.appendChild(el("option", { value: ev.nombre })));
      document.body.appendChild(dl);
    }
    refreshHint();
    wrap.appendChild(hint);
    return wrap;
  } else if (fld.type === "select") {
    input = el("select", {}, [
      el("option", { value: "" }, "—"),
      ...fld.options.map(o => el("option", { value: o, selected: values[fld.id] === o ? "selected" : null }, o))
    ]);
    input.addEventListener("change", () => { values[fld.id] = input.value; });
  } else if (fld.type === "textarea") {
    input = el("textarea", {}, values[fld.id] || "");
    input.addEventListener("input", () => { values[fld.id] = input.value; });
  } else if (fld.type === "boolean") {
    input = el("select", {}, [
      el("option", { value: "true", selected: values[fld.id] ? "selected" : null }, "Sí"),
      el("option", { value: "false", selected: !values[fld.id] ? "selected" : null }, "No")
    ]);
    input.addEventListener("change", () => { values[fld.id] = input.value === "true"; });
  } else {
    input = el("input", { type: fld.type, step: fld.step || null, value: values[fld.id] ?? "" });
    input.addEventListener("input", () => {
      values[fld.id] = fld.type === "number" ? (input.value === "" ? "" : Number(input.value)) : input.value;
      if (tol) renderGauge(gaugeHolder, values[fld.id], tol);
    });
  }
  wrap.appendChild(input);

  var gaugeHolder = null;
  if (tol) {
    gaugeHolder = el("div", {});
    wrap.appendChild(gaugeHolder);
    renderGauge(gaugeHolder, values[fld.id], tol);
    wrap.appendChild(el("div", { class: "hint" }, `Tolerancia: ${tol.min ?? "–"} ${tol.max !== null && tol.max !== undefined ? "– " + tol.max : "mín."}`));
    if (tol.note) wrap.appendChild(el("div", { class: "conflict-note" }, "⚠ " + tol.note));
  }
  return wrap;
}

function renderGauge(holder, value, tol) {
  if (!holder) return;
  holder.innerHTML = "";
  const hasMin = tol.min !== null && tol.min !== undefined;
  const hasMax = tol.max !== null && tol.max !== undefined;
  const lo = hasMin ? tol.min : 0;
  const hi = hasMax ? tol.max : (hasMin ? tol.min * 1.4 : 100);
  const span = hi - lo || 1;
  const padLo = lo - span * 0.35, padHi = hi + span * 0.35;
  const totalSpan = padHi - padLo;
  const bucket = classifyValue(value, tol);
  const semClass = bucket === "dentro" || bucket === "cumple" ? "verde" : (bucket === null ? null : (bucket === "bajo" || bucket === "sobre" || bucket === "no_cumple" ? "rojo" : null));

  const gauge = el("div", { class: "gauge" });
  const zoneLeft = ((lo - padLo) / totalSpan) * 100;
  const zoneWidth = (span / totalSpan) * 100;
  gauge.appendChild(el("div", { class: "zone dentro", style: `left:${zoneLeft}%;width:${zoneWidth}%` }));
  if (value !== "" && value !== null && !isNaN(value)) {
    const pos = Math.min(100, Math.max(0, ((Number(value) - padLo) / totalSpan) * 100));
    gauge.appendChild(el("div", { class: "marker " + (semClass || ""), style: `left:${pos}%` }));
  }
  holder.appendChild(gauge);
  holder.appendChild(el("div", { class: "gauge-labels" }, [
    el("span", {}, hasMin ? String(tol.min) : ""),
    el("span", {}, hasMax ? String(tol.max) : (hasMin ? "mín." : ""))
  ]));
}

function buildPointsTable(f) {
  const schema = PROCESOS[f.proceso];
  const tolSet = App.state.tolerancias[f.proceso];
  const wrap = el("div", { class: "points-table-wrap" });
  const table = el("table", { class: "points" });
  const thead = el("thead", {}, el("tr", {}, [
    el("th", {}, "#"),
    ...schema.point.map(pf => el("th", {}, pf.label)),
    el("th", {}, "")
  ]));
  table.appendChild(thead);
  const tbody = el("tbody");

  f.points.forEach((pt, idx) => {
    const tr = el("tr");
    tr.appendChild(el("td", {}, String(idx + 1)));

    schema.point.forEach(pf => {
      const td = el("td", { class: "pt-cell" });
      const flag = el("span", { class: "pt-flag" });

      function updateFlag() {
        td.classList.remove("pt-ok", "pt-bad");
        if (!pf.tol) { flag.className = "pt-flag"; return; }
        const tol = tolSet[pf.tol];
        const bucket = pf.type === "boolean" ? classifyBoolean(pt[pf.id], tol) : classifyValue(pt[pf.id], tol);
        const ok = bucket === "dentro" || bucket === "cumple";
        const bad = bucket === "bajo" || bucket === "sobre" || bucket === "no_cumple";
        flag.className = "pt-flag " + (ok ? "verde" : (bad ? "rojo" : ""));
        if (ok) td.classList.add("pt-ok");
        else if (bad) td.classList.add("pt-bad");
      }

      let input;
      if (pf.type === "boolean") {
        input = el("input", { type: "checkbox", checked: pt[pf.id] ? "checked" : null });
        input.addEventListener("change", () => { pt[pf.id] = input.checked; updateFlag(); });
      } else {
        input = el("input", { type: "number", step: pf.step || "any", value: pt[pf.id] ?? "" });
        input.addEventListener("input", () => {
          pt[pf.id] = input.value === "" ? "" : Number(input.value);
          updateFlag();
        });
      }
      updateFlag();

      td.appendChild(input);
      td.appendChild(flag);
      tr.appendChild(td);
    });

    const delTd = el("td", {}, el("button", {
      class: "btn ghost small", title: "Eliminar punto",
      onclick: () => { f.points.splice(idx, 1); render(); }
    }, "✕"));
    tr.appendChild(delTd);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

function buildSummaryList(summary) {
  const keys = Object.keys(summary);
  if (keys.length === 0) return el("p", { class: "sub" }, "Agrega puntos de muestreo para ver el cálculo.");
  const list = el("div", { class: "summary-list" });
  keys.forEach(k => {
    const s = summary[k];
    const sem = semaforoFor(s.cumplimientoPct);
    let statsNode;
    if (s.isRange) {
      const bajoBad = s.pct.bajo > 0;
      const sobreBad = s.pct.sobre > 0;
      statsNode = el("span", { class: "stats-breakdown" }, [
        el("span", { class: bajoBad ? "stat-bad" : "stat-muted" }, `Bajo ${fmtPct(s.pct.bajo)}`),
        el("span", { class: "stat-sep" }, " · "),
        el("span", { class: "stat-ok" }, `Dentro ${fmtPct(s.pct.dentro)}`),
        el("span", { class: "stat-sep" }, " · "),
        el("span", { class: sobreBad ? "stat-bad" : "stat-muted" }, `Sobre ${fmtPct(s.pct.sobre)}`)
      ]);
    } else {
      const bad = s.pct.cumple !== null && s.pct.cumple < 100;
      statsNode = el("span", { class: bad ? "stat-bad" : "stat-ok" }, `Cumple ${fmtPct(s.pct.cumple)} (n=${s.counts.n})`);
    }
    list.appendChild(el("div", { class: "summary-row" }, [
      el("span", { class: "name" }, s.label),
      el("span", { class: "summary-right" }, [
        statsNode,
        el("span", { class: "badge " + sem }, [el("span", { class: "sw" }), s.cumplimientoPct === null ? "—" : fmtPct(s.cumplimientoPct)])
      ])
    ]));
  });
  return list;
}

/* Panel "Resumen de cálculos" — métricas derivadas de header + puntos,
   definidas en schema.computed (hoy solo en Durante: dosis aplicada,
   presión promedio, cumplimiento de dosis). Replica el mockup del
   inspector en base44. */
function buildComputedCard(f, schema) {
  const values = {};
  schema.computed.forEach(c => { values[c.id] = c.calc(f.header, f.points); });

  const grid = el("div", { class: "kpis" });
  schema.computed.forEach(c => {
    const v = values[c.id];
    const txt = v === null || v === undefined || isNaN(v) ? "—" : v.toFixed(c.decimals ?? 1);
    grid.appendChild(el("div", { class: "kpi" }, [
      el("div", { class: "val" }, [txt, c.unit ? el("span", { style: "font-size:13px;font-weight:600;margin-left:3px" }, c.unit) : null]),
      el("div", { class: "lbl" }, c.label)
    ]));
  });

  const children = [el("h3", {}, "Resumen de cálculos"), grid];

  if (schema.computedHighlight) {
    const h = schema.computedHighlight.calc(f.header, f.points);
    const card = el("div", { style: "margin-top:14px" });
    const pct = h ? h.pct : null;
    const sem = pct === null ? "gris" : (Math.abs(pct - 100) <= 5 ? "verde" : (Math.abs(pct - 100) <= 15 ? "amarillo" : "rojo"));
    card.appendChild(el("div", { style: "display:flex;align-items:center;justify-content:space-between;margin-bottom:6px" }, [
      el("span", { class: "name" }, schema.computedHighlight.label),
      el("span", { class: "badge " + sem }, [el("span", { class: "sw" }), pct === null ? "Sin datos" : (h.delta >= 0 ? "+" : "") + h.delta.toFixed(1) + " L/mz"])
    ]));
    const track = el("div", { class: "bar-track" });
    track.appendChild(el("div", { class: "bar-fill", style: `width:${pct === null ? 0 : Math.min(140, pct)}%;background:${pct === null ? "var(--gris)" : sem === "verde" ? "var(--verde)" : sem === "amarillo" ? "var(--ambar)" : "var(--rojo)"}` }));
    card.appendChild(track);
    card.appendChild(el("p", { class: "sub", style: "margin-top:6px" }, pct === null ? "Completa litros aplicados, área y dosis planificada para calcularlo." : `${pct.toFixed(0)}% de la dosis planificada`));
    children.push(card);
  }

  return el("div", { class: "card" }, children);
}

async function saveCurrentForm() {
  const f = App.state.form;
  const schema = PROCESOS[f.proceso];
  const missing = schema.header.filter(h => h.required && !f.header[h.id]);
  if (missing.length) {
    toast("Falta completar: " + missing.map(m => m.label).join(", "));
    return;
  }
  const summary = summarizePoints(f.points, schema.point, App.state.tolerancias[f.proceso]);
  const overall = overallCompliance(summary);
  // La finca siempre se deriva del código de UT al guardar (fuente única de verdad).
  f.header.finca = fincaDeUt(f.header.ut_codigo);
  const calculados = {};
  if (schema.computed) schema.computed.forEach(c => { calculados[c.id] = c.calc(f.header, f.points); });
  const record = {
    id: f.id,
    proceso: f.proceso,
    semana: isoWeek(f.header.fecha),
    ...f.header,
    puntos: f.points,
    resumen: summary,
    calculados,
    cumplimiento_pct: overall,
    ...f.cierre,
    fotos: f.photos,
    geo: f.geo || null,
    creado: f.creado || new Date().toISOString()
  };

  let result;
  try {
    result = await Api.save(record);
  } catch (e) {
    // FALLA CRÍTICA: no se pudo guardar ni siquiera en el teléfono.
    // No cerramos el formulario — el inspector NO debe creer que guardó.
    mostrarErrorGuardado(e && e.message ? e.message : "No se pudo guardar la evaluación.");
    return;
  }

  const saved = result.record;
  const list = App.state.data[f.proceso];
  const idx = list.findIndex(r => r.id === saved.id);
  if (idx >= 0) list[idx] = saved; else list.push(saved);

  // Confirmación HONESTA según lo que realmente pasó.
  const pend = await Api.pendientesCount();
  setSync(result.synced ? "online" : "pending", pend);
  if (result.synced) {
    toast("✓ Evaluación guardada y sincronizada");
  } else {
    toast("✓ Guardada en el teléfono. Se subirá al servidor cuando haya señal.");
  }

  App.state.form = newForm(f.proceso);
  App.state.view = "historial";
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("is-active", b.dataset.view === "historial"));
  render();

  // Intentar vaciar la cola en segundo plano si hay algo pendiente.
  if (pend > 0) sincronizarPendientes(true);
}

/* Alerta grande y clara cuando el guardado local falló (caso crítico). No es
   un toast que se desvanece: es un cartel que el inspector debe ver y cerrar. */
function mostrarErrorGuardado(mensaje) {
  const prev = document.getElementById("save-error-modal");
  if (prev) prev.remove();
  const overlay = el("div", { id: "save-error-modal", class: "save-error-overlay" });
  const box = el("div", { class: "save-error-box" }, [
    el("div", { class: "save-error-icon" }, "⚠"),
    el("h3", {}, "La evaluación NO se guardó"),
    el("p", {}, mensaje),
    el("p", { class: "save-error-hint" }, "No cierres la evaluación. Libera espacio en el teléfono (borra fotos o apps que no uses) e intenta guardar de nuevo. Si el problema sigue, toma una foto/PDF de la evaluación antes de salir."),
    el("button", { class: "btn", onclick: () => overlay.remove() }, "Entendido, volver a la evaluación")
  ]);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

/* Vacía la cola de pendientes contra el servidor y refresca el indicador. */
async function sincronizarPendientes(silencioso) {
  const res = await Api.procesarCola();
  const pend = await Api.pendientesCount();
  setSync(Api.isOnline() ? (pend > 0 ? "pending" : "online") : "offline", pend);
  if (!silencioso) {
    if (res.enviados > 0 && pend === 0) toast(`✓ ${res.enviados} evaluación(es) sincronizada(s)`);
    else if (pend > 0) toast(`Quedan ${pend} pendiente(s). Reintentará cuando haya señal.`);
    else toast("No hay nada pendiente por sincronizar");
  } else if (res.enviados > 0) {
    toast(`✓ ${res.enviados} evaluación(es) pendiente(s) sincronizada(s)`);
  }
  if (App.state.view === "historial") render();
}

/* ============================================================================
   VISTA: Historial
   ========================================================================= */
function renderHistorial() {
  const wrap = el("div");
  wrap.appendChild(el("div", { class: "page-head" }, [
    el("span", { class: "eyebrow" }, "Consolidado"),
    el("h1", {}, "Historial de evaluaciones"),
    el("p", { class: "sub" }, "Filtra, exporta a Excel el consolidado, o genera el PDF individual de cada evaluación.")
  ]));

  const filters = App.state.histFilters;
  const filterBar = el("div", { class: "filters" });
  const procSel = el("select", {}, [
    el("option", { value: "" }, "Todos los procesos"),
    ...Object.values(PROCESOS).map(p => el("option", { value: p.key, selected: filters.proceso === p.key ? "selected" : null }, p.label))
  ]);
  procSel.addEventListener("change", () => { filters.proceso = procSel.value; render(); });
  filterBar.appendChild(procSel);

  const fincasUnicas = ["Montelíbano", "Apacilagua", "Porvenir", "Santa Rosa"];
  const fincaSel = el("select", {}, [
    el("option", { value: "" }, "Todas las fincas"),
    ...fincasUnicas.map(fn => el("option", { value: fn, selected: filters.finca === fn ? "selected" : null }, fn))
  ]);
  fincaSel.addEventListener("change", () => { filters.finca = fincaSel.value; render(); });
  filterBar.appendChild(fincaSel);

  const desde = el("input", { type: "date", value: filters.desde });
  desde.addEventListener("change", () => { filters.desde = desde.value; render(); });
  const hasta = el("input", { type: "date", value: filters.hasta });
  hasta.addEventListener("change", () => { filters.hasta = hasta.value; render(); });
  filterBar.appendChild(desde);
  filterBar.appendChild(hasta);

  const search = el("input", { type: "text", placeholder: "Buscar por UT, operador o responsable…", value: filters.ut, style: "min-width:220px" });
  search.addEventListener("input", () => { filters.ut = search.value; render(); });
  filterBar.appendChild(search);
  wrap.appendChild(filterBar);

  const actions = el("div", { class: "btn-row", style: "margin:0 0 14px" });
  actions.appendChild(el("button", { class: "btn", onclick: () => ExportXlsx.exportConsolidado(App.state.data) }, "⬇ Exportar consolidado Excel"));
  actions.appendChild(el("button", { class: "btn secondary", onclick: () => exportBackupJson() }, "⬇ Respaldo JSON"));

  const importInput = el("input", { type: "file", accept: ".json,application/json", style: "display:none" });
  importInput.addEventListener("change", () => {
    const file = (importInput.files || [])[0];
    if (file) importarRespaldoJson(file);
    importInput.value = "";
  });
  actions.appendChild(importInput);
  actions.appendChild(el("button", { class: "btn secondary", onclick: () => importInput.click() }, "⬆ Cargar respaldo JSON"));
  actions.appendChild(el("button", { class: "btn secondary", onclick: () => sincronizarPendientes(false) }, "🔄 Sincronizar pendientes"));
  wrap.appendChild(actions);

  const rows = getFilteredRows(filters);

  if (rows.length === 0) {
    wrap.appendChild(el("div", { class: "card empty-state" }, [
      el("h3", {}, "Aún no hay evaluaciones"),
      el("p", {}, "Registra la primera desde “Nueva evaluación”.")
    ]));
    return wrap;
  }

  const tableWrap = el("div", { class: "table-wrap" });
  const table = el("table", { class: "hist" });
  table.appendChild(el("thead", {}, el("tr", {}, [
    "Fecha", "Sem", "Finca", "Etapa", "UT", "Responsable", "Cumplimiento", "Decisión", "Estado", ""
  ].map(h => el("th", {}, h)))));
  const tbody = el("tbody");
  rows.forEach(r => {
    const sem = semaforoFor(r.cumplimiento_pct);
    tbody.appendChild(el("tr", {}, [
      el("td", {}, r.fecha || "—"),
      el("td", { class: "num" }, String(r.semana ?? "—")),
      el("td", {}, r.finca || fincaDeUt(r.ut_codigo) || "—"),
      el("td", {}, PROCESOS[r.proceso].label),
      el("td", {}, `${r.ut_codigo || "—"}${r.ut_nombre ? " · " + r.ut_nombre : ""}`),
      el("td", {}, r.evaluador || r.operador || r.responsable || "—"),
      el("td", {}, el("span", { class: "badge " + sem }, [el("span", { class: "sw" }), fmtPct(r.cumplimiento_pct)])),
      el("td", {}, r.decision_final ? el("span", { class: "badge " + (r.decision_final === "APTO" ? "verde" : "rojo") }, [el("span", { class: "sw" }), r.decision_final]) : "—"),
      el("td", {}, r.estado && r.estado !== "N/A" ? r.estado : "—"),
      el("td", {}, el("div", { class: "row-actions" }, [
        el("button", { class: "btn ghost small", onclick: () => editRow(r) }, "Editar"),
        el("button", { class: "btn ghost small", onclick: () => ExportPdf.exportEvaluacion(r) }, "📄 Reporte PDF"),
        el("button", { class: "btn ghost small", onclick: () => deleteRow(r) }, "Eliminar")
      ]))
    ]));
  });
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  wrap.appendChild(tableWrap);
  return wrap;
}

function getFilteredRows(filters) {
  const procs = filters.proceso ? [filters.proceso] : Object.keys(App.state.data);
  let rows = [];
  procs.forEach(p => { rows = rows.concat(App.state.data[p] || []); });
  if (filters.desde) rows = rows.filter(r => r.fecha >= filters.desde);
  if (filters.hasta) rows = rows.filter(r => r.fecha <= filters.hasta);
  if (filters.finca) rows = rows.filter(r => (r.finca || fincaDeUt(r.ut_codigo)) === filters.finca);
  if (filters.ut) {
    const q = filters.ut.toLowerCase();
    rows = rows.filter(r =>
      (r.ut_codigo || "").toLowerCase().includes(q) ||
      (r.finca || fincaDeUt(r.ut_codigo) || "").toLowerCase().includes(q) ||
      (r.operador || "").toLowerCase().includes(q) ||
      (r.responsable || "").toLowerCase().includes(q) ||
      (r.evaluador || "").toLowerCase().includes(q)
    );
  }
  return rows.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
}

function editRow(r) {
  const schema = PROCESOS[r.proceso];
  const header = {}; schema.header.forEach(f => header[f.id] = r[f.id] ?? (f.type === "boolean" ? false : ""));
  header.ut_nombre = r.ut_nombre || "";
  const cierre = {}; CIERRE_FIELDS.forEach(f => cierre[f.id] = r[f.id] ?? (f.id === "estado" ? "N/A" : ""));
  const photos = (r.fotos || []).map(p => ({ ...p }));
  App.state.form = { proceso: r.proceso, id: r.id, isEdit: true, creado: r.creado, header, points: (r.puntos && r.puntos.length ? r.puntos : [makeEmptyPoint(r.proceso)]), cierre, photos, geo: r.geo || null };
  App.state.view = "nueva";
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("is-active", b.dataset.view === "nueva"));
  render();
  toast("Editando evaluación — guarda para actualizarla");
}

async function deleteRow(r) {
  if (!confirm(`¿Eliminar la evaluación de ${r.ut_codigo || "este lote"} del ${r.fecha}? Esta acción no se puede deshacer.`)) return;
  await Api.remove(r.proceso, r.id);
  App.state.data[r.proceso] = App.state.data[r.proceso].filter(x => x.id !== r.id);
  toast("Evaluación eliminada");
  render();
}

function exportBackupJson() {
  const blob = new Blob([JSON.stringify(App.state.data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `respaldo-sic-metam-sodio-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
}

/* Carga un respaldo JSON exportado desde otro dispositivo y lo FUSIONA con lo
   que ya hay aquí. Regla de fusión por id:
   - Si la evaluación no existe localmente → se agrega.
   - Si ya existe (mismo id) → se conserva la más reciente según "actualizado".
   Así se pueden juntar los datos de varios inspectores sin duplicar ni perder
   nada, mientras el backend de Netlify no esté activo. */
async function importarRespaldoJson(file) {
  let parsed;
  try {
    const texto = await file.text();
    parsed = JSON.parse(texto);
  } catch (e) {
    toast("El archivo no es un respaldo JSON válido.");
    return;
  }

  const procesos = Object.keys(PROCESOS);
  const esValido = parsed && typeof parsed === "object" && procesos.some(p => Array.isArray(parsed[p]));
  if (!esValido) {
    toast("El archivo no tiene el formato de respaldo esperado.");
    return;
  }

  let nuevas = 0, actualizadas = 0, sinCambio = 0;

  for (const proc of procesos) {
    const entrantes = Array.isArray(parsed[proc]) ? parsed[proc] : [];
    const actuales = App.state.data[proc] || (App.state.data[proc] = []);
    const porId = new Map(actuales.map(r => [r.id, r]));

    for (const rec of entrantes) {
      if (!rec || !rec.id || rec.proceso !== proc) continue;
      // Rellena la finca por si el respaldo venía de una versión anterior.
      if (!rec.finca && rec.ut_codigo) rec.finca = fincaDeUt(rec.ut_codigo);

      const existente = porId.get(rec.id);
      if (!existente) {
        actuales.push(rec);
        porId.set(rec.id, rec);
        await Api.save(rec);
        nuevas++;
      } else {
        const fEnt = existente.actualizado || "";
        const fRec = rec.actualizado || "";
        if (fRec > fEnt) {
          const idx = actuales.findIndex(r => r.id === rec.id);
          actuales[idx] = rec;
          porId.set(rec.id, rec);
          await Api.save(rec);
          actualizadas++;
        } else {
          sinCambio++;
        }
      }
    }
  }

  if (nuevas === 0 && actualizadas === 0) {
    toast(`No había nada nuevo que cargar (${sinCambio} ya estaban registradas).`);
  } else {
    const partes = [];
    if (nuevas) partes.push(`${nuevas} nueva(s)`);
    if (actualizadas) partes.push(`${actualizadas} actualizada(s)`);
    if (sinCambio) partes.push(`${sinCambio} sin cambio`);
    toast("Respaldo cargado: " + partes.join(", ") + ".");
  }
  render();
}

/* ============================================================================
   VISTA: Lotes — calificación final y semáforo por UT
   ========================================================================= */
function renderLotes() {
  const wrap = el("div");
  const procKeys = Object.keys(PROCESOS);
  const etapaCompleta = PROCESOS[procKeys[procKeys.length - 1]].label;
  wrap.appendChild(el("div", { class: "page-head" }, [
    el("span", { class: "eyebrow" }, "Seguimiento" ),
    el("h1", {}, "Semáforo de lotes"),
    el("p", { class: "sub" }, `Combina la evaluación más reciente de ${Object.values(PROCESOS).map(p => p.label).join(", ")} por lote. Se marca “Completo” en cuanto el lote tiene ${etapaCompleta} registrado. Una no conformidad abierta evita que salga verde; una decisión "NO APTO" en Post fuerza el lote a rojo.`)
  ]));

  const cards = buildLoteScorecards(App.state.data, App.state.pesosLote);

  if (cards.length === 0) {
    wrap.appendChild(el("div", { class: "card empty-state" }, [
      el("h3", {}, "Aún no hay lotes evaluados"),
      el("p", {}, "En cuanto registres evaluaciones con UT, aparecerán aquí.")
    ]));
    return wrap;
  }

  const kpis = el("div", { class: "kpis" });
  const completos = cards.filter(c => c.completo);
  const verdes = cards.filter(c => c.semaforo === "verde").length;
  const rojos = cards.filter(c => c.semaforo === "rojo").length;
  const noAptos = cards.filter(c => c.hasGateFail).length;
  const ncAbiertas = cards.filter(c => c.hasOpenNC).length;
  kpis.appendChild(el("div", { class: "kpi" }, [el("div", { class: "val" }, String(cards.length)), el("div", { class: "lbl" }, "Lotes con evaluación")]));
  kpis.appendChild(el("div", { class: "kpi" }, [el("div", { class: "val" }, String(completos.length)), el("div", { class: "lbl" }, `Completos (con ${etapaCompleta})`)]));
  kpis.appendChild(el("div", { class: "kpi" }, [el("div", { class: "val" }, String(verdes)), el("div", { class: "lbl" }, "En verde")]));
  kpis.appendChild(el("div", { class: "kpi" }, [el("div", { class: "val" }, String(rojos)), el("div", { class: "lbl" }, "En rojo")]));
  kpis.appendChild(el("div", { class: "kpi" }, [el("div", { class: "val" }, String(noAptos)), el("div", { class: "lbl" }, "Con decisión NO APTO")]));
  kpis.appendChild(el("div", { class: "kpi" }, [el("div", { class: "val" }, String(ncAbiertas)), el("div", { class: "lbl" }, "Con no conformidad abierta")]));
  wrap.appendChild(kpis);

  const tableWrap = el("div", { class: "table-wrap" });
  const table = el("table", { class: "hist" });
  table.appendChild(el("thead", {}, el("tr", {}, [
    "UT", ...Object.values(PROCESOS).map(p => p.label), "Estado", "Última fecha", "Calificación"
  ].map(h => el("th", {}, h)))));
  const tbody = el("tbody");

  cards.forEach(c => {
    const procBadge = (rec) => {
      if (!rec) return el("span", { class: "badge gris" }, [el("span", { class: "sw" }), "Sin datos"]);
      const s = semaforoFor(rec.cumplimiento_pct);
      return el("span", { class: "badge " + s }, [el("span", { class: "sw" }), fmtPct(rec.cumplimiento_pct)]);
    };
    tbody.appendChild(el("tr", {}, [
      el("td", {}, c.ut_codigo),
      ...procKeys.map(key => el("td", {}, procBadge(c.procesos[key]))),
      el("td", {}, c.completo ? "Completo" : "En proceso"),
      el("td", {}, c.ultimaFecha || "—"),
      el("td", {}, el("span", { class: "badge " + c.semaforo }, [
        el("span", { class: "sw" }),
        (c.score === null ? "—" : c.score.toFixed(1) + "%") + (c.hasGateFail ? " · NO APTO" : "") + (c.hasOpenNC ? " · NC abierta" : "")
      ]))
    ]));
  });
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  wrap.appendChild(tableWrap);

  wrap.appendChild(el("div", { class: "card" }, [
    el("h3", {}, "Cómo se calcula"),
    el("p", { class: "sub" }, `Promedio ponderado de la evaluación más reciente de cada etapa — ${Object.values(PROCESOS).map(p => `${p.label} ${(App.state.pesosLote[p.key] * 100).toFixed(0)}%`).join(", ")} — usando solo las etapas ya evaluadas. Ajustable en Configuración. Una decisión "NO APTO" en Post fuerza el lote a rojo, sin importar el puntaje.`)
  ]));

  return wrap;
}


function renderTablero() {
  const wrap = el("div");
  wrap.appendChild(el("div", { class: "page-head" }, [
    el("span", { class: "eyebrow" }, "Gestión"),
    el("h1", {}, "Tablero de cumplimiento"),
    el("p", { class: "sub" }, "Vista agregada de las tres labores para revisión semanal.")
  ]));

  const all = Object.keys(PROCESOS).reduce((acc, k) => acc.concat(App.state.data[k] || []), []);

  const kpis = el("div", { class: "kpis" });
  Object.values(PROCESOS).forEach(p => {
    const rows = App.state.data[p.key];
    const vals = rows.map(r => r.cumplimiento_pct).filter(v => v !== null && v !== undefined);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    kpis.appendChild(el("div", { class: "kpi" }, [
      el("div", { class: "val" }, avg === null ? "—" : avg.toFixed(1) + "%"),
      el("div", { class: "lbl" }, `${p.label} · ${rows.length} evaluaciones`)
    ]));
  });
  const abiertas = all.filter(r => r.estado === "Abierta").length;
  kpis.appendChild(el("div", { class: "kpi" }, [
    el("div", { class: "val" }, String(abiertas)),
    el("div", { class: "lbl" }, "No conformidades abiertas")
  ]));
  wrap.appendChild(kpis);

  // Cumplimiento por operador (trazabilidad que antes no existía)
  const byOperador = {};
  all.forEach(r => {
    if (!r.operador) return;
    byOperador[r.operador] = byOperador[r.operador] || [];
    if (r.cumplimiento_pct !== null && r.cumplimiento_pct !== undefined) byOperador[r.operador].push(r.cumplimiento_pct);
  });
  const opRows = Object.entries(byOperador)
    .map(([op, vals]) => ({ op, avg: vals.reduce((a, b) => a + b, 0) / (vals.length || 1), n: vals.length }))
    .sort((a, b) => a.avg - b.avg);

  wrap.appendChild(el("div", { class: "card" }, [
    el("h3", {}, "Cumplimiento promedio por operador"),
    opRows.length === 0
      ? el("p", { class: "sub" }, "Aún no hay evaluaciones con operador registrado.")
      : el("div", { class: "bars" }, opRows.map(o => {
          const sem = semaforoFor(o.avg);
          const color = sem === "verde" ? "var(--verde)" : sem === "amarillo" ? "var(--ambar)" : "var(--rojo)";
          return el("div", { class: "bar-row" }, [
            el("span", {}, o.op),
            el("div", { class: "bar-track" }, el("div", { class: "bar-fill", style: `width:${Math.min(100, o.avg)}%;background:${color}` })),
            el("span", { class: "num" }, o.avg.toFixed(0) + "%")
          ]);
        }))
  ]));

  // Cumplimiento por zona
  const byZona = {};
  all.forEach(r => {
    const z = r.zona || "Sin zona";
    byZona[z] = byZona[z] || [];
    if (r.cumplimiento_pct !== null && r.cumplimiento_pct !== undefined) byZona[z].push(r.cumplimiento_pct);
  });
  const zonaRows = Object.entries(byZona).map(([z, vals]) => ({ z, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, n: vals.length }));

  wrap.appendChild(el("div", { class: "card" }, [
    el("h3", {}, "Cumplimiento promedio por zona"),
    zonaRows.length === 0
      ? el("p", { class: "sub" }, "Sin datos.")
      : el("div", { class: "bars" }, zonaRows.map(o => {
          const sem = semaforoFor(o.avg);
          const color = o.avg === null ? "var(--gris)" : sem === "verde" ? "var(--verde)" : sem === "amarillo" ? "var(--ambar)" : "var(--rojo)";
          return el("div", { class: "bar-row" }, [
            el("span", {}, o.z),
            el("div", { class: "bar-track" }, el("div", { class: "bar-fill", style: `width:${o.avg === null ? 0 : Math.min(100, o.avg)}%;background:${color}` })),
            el("span", { class: "num" }, o.avg === null ? "—" : o.avg.toFixed(0) + "%")
          ]);
        }))
  ]));

  const areaTotal = all.reduce((sum, r) => sum + (Number(r.area_evaluada_mz) || 0), 0);
  wrap.appendChild(el("div", { class: "card" }, [
    el("h3", {}, "Cobertura"),
    el("p", { class: "sub" }, `Área evaluada acumulada (todas las labores, toda la temporada capturada): `),
    el("div", { class: "val", style: "font-family:var(--font-display);font-size:22px;font-weight:800" }, `${areaTotal.toFixed(1)} mz`)
  ]));

  return wrap;
}

/* ============================================================================
   VISTA: Configuración
   ========================================================================= */
/* ============================================================================
   VISTA: Gerencia — dashboard ejecutivo para presentar a dirección
   ========================================================================= */
function renderGerencia() {
  const wrap = el("div", { id: "gerencia-root" });
  wrap.appendChild(el("div", { class: "page-head" }, [
    el("span", { class: "eyebrow" }, "Dirección"),
    el("h1", {}, "Dashboard ejecutivo"),
    el("p", { class: "sub" }, "Resumen de la temporada para presentar a gerencia. Usa el botón para exportar a PDF y proyectarlo o enviarlo.")
  ]));

  const all = Object.keys(PROCESOS).reduce((acc, k) => acc.concat(App.state.data[k] || []), []);
  if (all.length === 0) {
    wrap.appendChild(el("div", { class: "card empty-state" }, [
      el("h3", {}, "Aún no hay datos para el dashboard"),
      el("p", {}, "Cuando se registren evaluaciones, aquí aparecerá el resumen ejecutivo.")
    ]));
    return wrap;
  }

  // Botón exportar
  const exportRow = el("div", { class: "btn-row", style: "margin:0 0 16px" });
  exportRow.appendChild(el("button", { class: "btn", onclick: () => ExportPdf.exportDashboard(App.state.data, App.state.pesosLote) }, "⬇ Exportar dashboard a PDF"));
  wrap.appendChild(exportRow);

  // KPIs de cabecera
  const cards = buildLoteScorecards(App.state.data, App.state.pesosLote);
  const compGlobal = overallComplianceGlobal(all);
  const kpis = el("div", { class: "kpis" });
  kpis.appendChild(el("div", { class: "kpi" }, [el("div", { class: "val" }, compGlobal == null ? "—" : compGlobal.toFixed(1) + "%"), el("div", { class: "lbl" }, "Cumplimiento global")]));
  kpis.appendChild(el("div", { class: "kpi" }, [el("div", { class: "val" }, String(all.length)), el("div", { class: "lbl" }, "Evaluaciones")]));
  kpis.appendChild(el("div", { class: "kpi" }, [el("div", { class: "val" }, String(cards.filter(c => c.completo).length)), el("div", { class: "lbl" }, "Lotes completos")]));
  kpis.appendChild(el("div", { class: "kpi" }, [el("div", { class: "val" }, String(cards.filter(c => c.semaforo === "rojo").length)), el("div", { class: "lbl" }, "Lotes en rojo")]));
  wrap.appendChild(kpis);

  // Tendencia semanal (gráfico de líneas SVG)
  const trend = tendenciaSemanal(App.state.data, null);
  wrap.appendChild(el("div", { class: "card" }, [
    el("h3", {}, "Tendencia de cumplimiento por semana"),
    trend.length < 2
      ? el("p", { class: "sub" }, "Se necesitan al menos dos semanas con datos para mostrar la tendencia.")
      : buildLineChart(trend)
  ]));

  // Estado de lotes (barra apilada semáforo)
  const verdes = cards.filter(c => c.semaforo === "verde").length;
  const ambar = cards.filter(c => c.semaforo === "amarillo").length;
  const rojos = cards.filter(c => c.semaforo === "rojo").length;
  const gris = cards.filter(c => c.semaforo === "gris").length;
  wrap.appendChild(el("div", { class: "card" }, [
    el("h3", {}, "Estado de lotes"),
    buildSemaforoBar(verdes, ambar, rojos, gris, cards.length)
  ]));

  // Rankings
  wrap.appendChild(el("div", { class: "card" }, [
    el("h3", {}, "Cumplimiento por finca"),
    buildRankingBars(ranking(App.state.data, "finca"))
  ]));
  wrap.appendChild(el("div", { class: "card" }, [
    el("h3", {}, "Cumplimiento por operador"),
    el("p", { class: "sub" }, "Ordenado de menor a mayor — los primeros necesitan más atención."),
    buildRankingBars(ranking(App.state.data, "operador"))
  ]));
  wrap.appendChild(el("div", { class: "card" }, [
    el("h3", {}, "Cumplimiento por zona"),
    buildRankingBars(ranking(App.state.data, "zona"))
  ]));

  return wrap;
}

function overallComplianceGlobal(registros) {
  const vals = registros.map(r => r.cumplimiento_pct).filter(v => v != null && !isNaN(v));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function colorHexFor(sem) {
  return sem === "verde" ? "#2E8B57" : sem === "amarillo" ? "#C98A1F" : sem === "rojo" ? "#C1443D" : "#8B8F80";
}

function buildLineChart(series) {
  const W = 640, H = 220, padL = 44, padR = 16, padT = 16, padB = 40;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = series.length;
  const xFor = i => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yFor = v => padT + plotH - (v / 100) * plotH;

  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("class", "chart-svg");

  function line(x1, y1, x2, y2, stroke, w, dash) {
    const l = document.createElementNS(ns, "line");
    l.setAttribute("x1", x1); l.setAttribute("y1", y1); l.setAttribute("x2", x2); l.setAttribute("y2", y2);
    l.setAttribute("stroke", stroke); l.setAttribute("stroke-width", w || 1);
    if (dash) l.setAttribute("stroke-dasharray", dash);
    return l;
  }
  function text(x, y, str, anchor, size, fill) {
    const t = document.createElementNS(ns, "text");
    t.setAttribute("x", x); t.setAttribute("y", y);
    t.setAttribute("text-anchor", anchor || "start");
    t.setAttribute("font-size", size || 11);
    t.setAttribute("fill", fill || "#5B5F52");
    t.setAttribute("font-family", "Inter, sans-serif");
    t.textContent = str;
    return t;
  }

  // Grid + eje Y (0, 50, 97, 100)
  [0, 50, 97, 100].forEach(v => {
    const y = yFor(v);
    svg.appendChild(line(padL, y, W - padR, y, v === 97 ? "#C1443D" : "#E0DDD1", v === 97 ? 1 : 0.5, v === 97 ? "4 3" : null));
    svg.appendChild(text(padL - 6, y + 3, v + "%", "end", 10, v === 97 ? "#C1443D" : "#8B8F80"));
  });

  // Línea de datos
  let d = "";
  series.forEach((s, i) => { d += (i === 0 ? "M" : "L") + xFor(i) + " " + yFor(s.promedio) + " "; });
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", d.trim());
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#2F4B3C");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);

  // Puntos + etiquetas X
  series.forEach((s, i) => {
    const cx = xFor(i), cy = yFor(s.promedio);
    const c = document.createElementNS(ns, "circle");
    c.setAttribute("cx", cx); c.setAttribute("cy", cy); c.setAttribute("r", 3.5);
    c.setAttribute("fill", colorHexFor(semaforoFor(s.promedio)));
    svg.appendChild(c);
    svg.appendChild(text(cx, cy - 8, s.promedio.toFixed(0), "middle", 10, "#1E2318"));
    const wk = s.semana.split("-S")[1] || s.semana;
    svg.appendChild(text(cx, H - padB + 16, "S" + wk, "middle", 10, "#5B5F52"));
  });

  return svg;
}

function buildSemaforoBar(verde, ambar, rojo, gris, total) {
  const wrap = el("div");
  const bar = el("div", { class: "semaforo-bar" });
  const seg = (n, cls, label) => {
    if (n === 0) return;
    const pct = (n / total) * 100;
    bar.appendChild(el("div", { class: "semaforo-seg " + cls, style: `width:${pct}%`, title: `${label}: ${n}` },
      pct > 8 ? String(n) : ""));
  };
  seg(verde, "s-verde", "Verde");
  seg(ambar, "s-ambar", "Ámbar");
  seg(rojo, "s-rojo", "Rojo");
  seg(gris, "s-gris", "Sin calificar");
  wrap.appendChild(bar);
  const legend = el("div", { class: "semaforo-legend" }, [
    el("span", {}, [el("span", { class: "dot s-verde" }), `Verde ${verde}`]),
    el("span", {}, [el("span", { class: "dot s-ambar" }), `Ámbar ${ambar}`]),
    el("span", {}, [el("span", { class: "dot s-rojo" }), `Rojo ${rojo}`]),
    gris > 0 ? el("span", {}, [el("span", { class: "dot s-gris" }), `Sin calificar ${gris}`]) : null
  ]);
  wrap.appendChild(legend);
  return wrap;
}

function buildRankingBars(rows) {
  if (rows.length === 0) return el("p", { class: "sub" }, "Sin datos.");
  return el("div", { class: "bars" }, rows.map(o => {
    const sem = semaforoFor(o.promedio);
    return el("div", { class: "bar-row" }, [
      el("span", {}, `${o.nombre} (${o.n})`),
      el("div", { class: "bar-track" }, el("div", { class: "bar-fill", style: `width:${Math.min(100, o.promedio)}%;background:${colorHexFor(sem)}` })),
      el("span", { class: "num" }, o.promedio.toFixed(0) + "%")
    ]);
  }));
}

function renderConfig() {
  const wrap = el("div");
  wrap.appendChild(el("div", { class: "page-head" }, [
    el("span", { class: "eyebrow" }, "Ajustes compartidos" ),
    el("h1", {}, "Tolerancias y calificación de lote"),
    el("p", { class: "sub" }, "Estos valores se guardan para todo el equipo. Los campos con nota ⚠ son valores pendientes de confirmar con el área técnica (Fitosanidad / Producción) — ajústalos aquí en cuanto se confirmen.")
  ]));

  const tol = JSON.parse(JSON.stringify(App.state.tolerancias));
  const pesos = { ...App.state.pesosLote };

  Object.values(PROCESOS).forEach(proc => {
    const group = el("div", { class: "card tol-group" });
    group.appendChild(el("h3", {}, proc.label));
    Object.entries(tol[proc.key]).forEach(([key, t]) => {
      const row = el("div", { class: "tol-row" });
      row.appendChild(el("label", {}, t.label + (t.note ? " ⚠" : "")));
      const minInput = el("input", { type: "number", step: "any", placeholder: "mín.", value: t.min ?? "" });
      minInput.addEventListener("input", () => { t.min = minInput.value === "" ? null : Number(minInput.value); });
      const maxInput = el("input", { type: "number", step: "any", placeholder: "máx.", value: t.max ?? "" });
      maxInput.addEventListener("input", () => { t.max = maxInput.value === "" ? null : Number(maxInput.value); });
      row.appendChild(minInput);
      row.appendChild(maxInput);
      group.appendChild(row);
      if (t.note) group.appendChild(el("div", { class: "conflict-note", style: "margin-bottom:6px" }, "⚠ " + t.note));
    });
    wrap.appendChild(group);
  });

  // ---- Pesos para el semáforo de lote ----
  const pesosCard = el("div", { class: "card tol-group" });
  pesosCard.appendChild(el("h3", {}, "Peso de cada proceso en la calificación de lote"));
  pesosCard.appendChild(el("p", { class: "sub" }, "Deben sumar 100%. Se usa para combinar la evaluación más reciente de cada proceso en la vista “Lotes”."));
  const pesosWarn = el("div", { class: "conflict-note" });
  pesosCard.appendChild(pesosWarn);
  function refreshPesosWarn() {
    const sum = Object.keys(PROCESOS).reduce((s, k) => s + (pesos[k] || 0), 0) * 100;
    pesosWarn.textContent = Math.abs(sum - 100) > 0.5 ? `⚠ Suman ${sum.toFixed(0)}%, no 100% — ajusta antes de guardar.` : "";
  }
  Object.values(PROCESOS).forEach(proc => {
    const row = el("div", { class: "tol-row" });
    row.appendChild(el("label", {}, proc.label));
    const input = el("input", { type: "number", step: "1", min: "0", max: "100", value: Math.round(pesos[proc.key] * 100) });
    input.addEventListener("input", () => {
      pesos[proc.key] = (input.value === "" ? 0 : Number(input.value)) / 100;
      refreshPesosWarn();
    });
    row.appendChild(input);
    row.appendChild(el("span", {}, "%"));
    pesosCard.appendChild(row);
  });
  refreshPesosWarn();
  wrap.appendChild(pesosCard);

  // ---- Logos del encabezado del PDF ----
  const logos = { ...App.state.logos };
  const logosCard = el("div", { class: "card" });
  logosCard.appendChild(el("h3", {}, "Logos del reporte PDF"));
  logosCard.appendChild(el("p", { class: "sub" }, "Los logos oficiales de Grupo Agrolíbano y de Gestión de Calidad e Inocuidad ya vienen pre-cargados y aparecen en el encabezado de cada reporte. Solo cámbialos si necesitas usar otros."));
  const logosGrid = el("div", { class: "grid grid-2" });
  [["izquierdo", "Logo izquierdo"], ["derecho", "Logo derecho"]].forEach(([key, label]) => {
    const box = el("div", { class: "logo-box" });
    box.appendChild(el("label", {}, label));
    const preview = el("div", { class: "logo-preview" });
    function refreshPreview() {
      preview.innerHTML = "";
      if (logos[key]) preview.appendChild(el("img", { src: logos[key], alt: label }));
      else preview.appendChild(el("span", { class: "sub" }, "Sin logo"));
    }
    refreshPreview();
    box.appendChild(preview);

    const fileInput = el("input", { type: "file", accept: "image/*", style: "display:none" });
    fileInput.addEventListener("change", async () => {
      const file = (fileInput.files || [])[0];
      if (!file) return;
      try {
        logos[key] = await compressImageFile(file, 600, 0.9);
        refreshPreview();
        toast("Logo cargado — recuerda guardar la configuración");
      } catch (e) { toast("No se pudo procesar la imagen"); }
      fileInput.value = "";
    });
    box.appendChild(fileInput);
    const btnRow = el("div", { class: "btn-row", style: "margin-top:8px" });
    btnRow.appendChild(el("button", { class: "btn secondary small", onclick: () => fileInput.click() }, "Cambiar"));
    btnRow.appendChild(el("button", { class: "btn ghost small", onclick: () => { logos[key] = false; refreshPreview(); } }, "Quitar"));
    btnRow.appendChild(el("button", { class: "btn ghost small", onclick: () => { logos[key] = DEFAULT_LOGOS[key]; refreshPreview(); } }, "Usar el oficial"));
    box.appendChild(btnRow);
    logosGrid.appendChild(box);
  });
  logosCard.appendChild(logosGrid);
  wrap.appendChild(logosCard);

  // ---- Evaluadores y firmas ----
  const evaluadores = (App.state.evaluadores || []).map(e => ({ ...e }));
  const evalCard = el("div", { class: "card" });
  evalCard.appendChild(el("h3", {}, "Evaluadores SIC y firmas"));
  evalCard.appendChild(el("p", { class: "sub" }, "Cuando el nombre del evaluador de una evaluación coincida con uno de esta lista, su firma se incluye automáticamente sobre la línea “Evaluador SIC” del PDF. Sube la firma como imagen (idealmente PNG con fondo transparente, firmada en papel blanco y fotografiada o escaneada)."));

  const evalList = el("div", { class: "eval-list" });
  function renderEvalList() {
    evalList.innerHTML = "";
    if (evaluadores.length === 0) {
      evalList.appendChild(el("p", { class: "sub" }, "Sin evaluadores registrados todavía."));
    }
    evaluadores.forEach((ev, idx) => {
      const row = el("div", { class: "eval-row" });
      const nameInput = el("input", { type: "text", value: ev.nombre || "", placeholder: "Nombre completo" });
      nameInput.addEventListener("input", () => { ev.nombre = nameInput.value; });
      row.appendChild(nameInput);

      const sigPreview = el("div", { class: "sig-preview" });
      function refreshSig() {
        sigPreview.innerHTML = "";
        if (ev.firma) sigPreview.appendChild(el("img", { src: ev.firma, alt: "Firma de " + (ev.nombre || "") }));
        else sigPreview.appendChild(el("span", { class: "sub" }, "Sin firma"));
      }
      refreshSig();
      row.appendChild(sigPreview);

      const sigInput = el("input", { type: "file", accept: "image/*", style: "display:none" });
      sigInput.addEventListener("change", async () => {
        const file = (sigInput.files || [])[0];
        if (!file) return;
        try {
          ev.firma = await compressImageFile(file, 600, 0.9);
          refreshSig();
          toast("Firma cargada — recuerda guardar la configuración");
        } catch (e) { toast("No se pudo procesar la imagen"); }
        sigInput.value = "";
      });
      row.appendChild(sigInput);

      const acts = el("div", { class: "btn-row", style: "margin:0" });
      acts.appendChild(el("button", { class: "btn secondary small", onclick: () => sigInput.click() }, "Cargar firma"));
      acts.appendChild(el("button", { class: "btn ghost small", onclick: () => { evaluadores.splice(idx, 1); renderEvalList(); } }, "Eliminar"));
      row.appendChild(acts);
      evalList.appendChild(row);
    });
  }
  renderEvalList();
  evalCard.appendChild(evalList);
  evalCard.appendChild(el("div", { class: "btn-row" }, [
    el("button", { class: "btn secondary small", onclick: () => { evaluadores.push({ id: crypto.randomUUID(), nombre: "", firma: null }); renderEvalList(); } }, "+ Agregar evaluador")
  ]));
  wrap.appendChild(evalCard);

  const actions = el("div", { class: "btn-row" });
  actions.appendChild(el("button", {
    class: "btn",
    onclick: async () => {
      const limpios = evaluadores.filter(e => (e.nombre || "").trim());
      await Api.saveConfig({ tolerancias: tol, tolVersion: TOLERANCIAS_VERSION, pesosLote: pesos, logos, evaluadores: limpios });
      App.state.tolerancias = tol;
      App.state.pesosLote = pesos;
      App.state.logos = logos;
      App.state.evaluadores = limpios;
      setSync(Api.isOnline() ? "online" : "offline");
      toast("Configuración guardada");
      render();
    }
  }, "Guardar configuración"));
  actions.appendChild(el("button", {
    class: "btn secondary",
    onclick: () => {
      App.state.tolerancias = deepMerge(DEFAULT_TOLERANCIAS, null);
      App.state.pesosLote = { ...DEFAULT_PESOS_LOTE };
      render();
      toast("Tolerancias y pesos restaurados (logos y firmas no se tocaron)");
    }
  }, "Restaurar tolerancias oficiales"));
  wrap.appendChild(actions);

  wrap.appendChild(el("div", { class: "card" }, [
    el("h3", {}, "Acerca de este formato"),
    el("p", { class: "sub" }, `${EMPRESA} · Sistema de Gestión de la Calidad · Proceso: Fumigación de suelo — Metam Sodio. Los formatos digitales corresponden a QM_F-26A (Previo), QM_F-26B (Durante) y QM_F-26C (Post), con base en la guía QM_G-036.`)
  ]));

  return wrap;
}

document.addEventListener("DOMContentLoaded", boot);
