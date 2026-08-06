/* ============================================================================
   calc.js — clasifica mediciones contra tolerancias y calcula % de
   cumplimiento por variable y global, con el semáforo verde/ámbar/rojo.
   ========================================================================= */

/**
 * Clasifica un valor numérico contra una tolerancia {min, max}.
 * Devuelve "bajo" | "dentro" | "sobre" (para rangos con min y max)
 * o "cumple" | "no_cumple" (para umbrales de un solo lado).
 */
function classifyValue(value, tol) {
  if (value === null || value === undefined || value === "" || isNaN(value)) return null;
  const v = Number(value);
  const hasMin = tol.min !== null && tol.min !== undefined;
  const hasMax = tol.max !== null && tol.max !== undefined;

  if (hasMin && hasMax) {
    if (v < tol.min) return "bajo";
    if (v > tol.max) return "sobre";
    return "dentro";
  }
  if (hasMin) return v >= tol.min ? "cumple" : "no_cumple";
  if (hasMax) return v <= tol.max ? "cumple" : "no_cumple";
  return null;
}

function classifyBoolean(value, tol) {
  // tol.min = 100 significa "se espera que sea true en 100% de los puntos"
  if (value === null || value === undefined) return null;
  return value ? "cumple" : "no_cumple";
}

/**
 * Calcula, para un conjunto de puntos de muestreo y un esquema de proceso,
 * el resumen por variable: conteos, % en cada bucket, y si aplica bajo/sobre.
 */
function summarizePoints(points, pointSchema, tolerancias) {
  const summary = {};
  pointSchema.forEach(field => {
    if (!field.tol) return;
    const tol = tolerancias[field.tol];
    if (!tol) return;
    const isRange = tol.min !== null && tol.min !== undefined && tol.max !== null && tol.max !== undefined;
    const counts = isRange
      ? { bajo: 0, dentro: 0, sobre: 0, n: 0 }
      : { cumple: 0, no_cumple: 0, n: 0 };

    points.forEach(p => {
      const raw = p[field.id];
      if (raw === null || raw === undefined || raw === "") return;
      const bucket = field.type === "boolean" ? classifyBoolean(raw, tol) : classifyValue(raw, tol);
      if (!bucket) return;
      counts[bucket] = (counts[bucket] || 0) + 1;
      counts.n += 1;
    });

    const pct = {};
    Object.keys(counts).forEach(k => {
      if (k === "n") return;
      pct[k] = counts.n > 0 ? (counts[k] / counts.n) * 100 : null;
    });

    summary[field.id] = {
      label: field.label,
      isRange,
      counts,
      pct,
      // "% cumplimiento" único para promediar entre variables:
      // en rangos es %dentro, en umbrales es %cumple
      cumplimientoPct: counts.n > 0 ? (isRange ? pct.dentro : pct.cumple) : null,
      tol
    };
  });
  return summary;
}

/** Promedio de cumplimiento entre todas las variables evaluadas (0-100). */
function overallCompliance(summary) {
  const vals = Object.values(summary)
    .map(s => s.cumplimientoPct)
    .filter(v => v !== null && v !== undefined && !isNaN(v));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function semaforoFor(pct) {
  if (pct === null || pct === undefined) return "gris";
  if (pct >= SEMAFORO.verde) return "verde";
  if (pct >= SEMAFORO.amarillo) return "amarillo";
  return "rojo";
}

function isoWeek(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("-").map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  if (isNaN(d.getTime())) return "";
  const dayNr = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const fdNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fdNr + 3);
  const weekNumber = 1 + Math.round((d - firstThursday) / (7 * 86400000));
  return weekNumber;
}

/* ============================================================================
   Calificación de lote — visión consolidada de un UT a través de las tres
   etapas (Previo, Durante, Post). Toma la evaluación MÁS RECIENTE de cada
   etapa (una reevaluación refleja el estado corregido, no se promedia con
   intentos anteriores), pondera según PESOS_LOTE, y marca "completo" cuando
   el lote ya tiene Post registrado. Una no conformidad abierta en cualquier
   etapa evita que el semáforo salga verde. Además, si la etapa que define
   `gateField`/`gateFailValues` en PROCESOS (Post → decisión "NO APTO") cae
   en un valor de falla, el lote se fuerza a ROJO sin importar el puntaje
   ponderado — un lote no apto para trasplante no puede salir en verde ni
   ámbar solo porque el resto de variables numéricas estén bien.
   ========================================================================= */
function latestByUt(records) {
  const map = {};
  (records || []).forEach(r => {
    if (!r.ut_codigo) return;
    const prev = map[r.ut_codigo];
    if (!prev || (r.fecha || "") >= (prev.fecha || "")) map[r.ut_codigo] = r;
  });
  return map;
}

function buildLoteScorecards(data, pesos) {
  const procKeys = Object.keys(PROCESOS);
  const latest = {};
  procKeys.forEach(key => { latest[key] = latestByUt(data[key] || []); });

  const uts = new Set();
  Object.values(latest).forEach(m => Object.keys(m).forEach(ut => uts.add(ut)));

  // Etapa(s) que actúan como "completo" del lote: la última definida en
  // PROCESOS (en mecanización era Emplasticado; aquí es Post).
  const etapaCompleta = procKeys[procKeys.length - 1];

  return Array.from(uts).sort().map(ut => {
    const porProceso = {};
    procKeys.forEach(key => { porProceso[key] = latest[key][ut] || null; });

    let sumPeso = 0, sumPonderado = 0;
    procKeys.forEach(key => {
      const rec = porProceso[key];
      if (!rec || rec.cumplimiento_pct === null || rec.cumplimiento_pct === undefined) return;
      const w = pesos[key] ?? 0;
      sumPeso += w;
      sumPonderado += w * rec.cumplimiento_pct;
    });
    const score = sumPeso > 0 ? sumPonderado / sumPeso : null;

    const hasOpenNC = Object.values(porProceso).some(rec => rec && rec.estado === "Abierta");
    let sem = semaforoFor(score);
    if (hasOpenNC && sem === "verde") sem = "amarillo";

    // Compuerta: cualquier etapa con gateField/gateFailValues configurados
    // (hoy: Post → decision_final = "NO APTO") fuerza el lote a rojo.
    let hasGateFail = false;
    procKeys.forEach(key => {
      const schema = PROCESOS[key];
      const rec = porProceso[key];
      if (!schema.gateField || !rec) return;
      if ((schema.gateFailValues || []).includes(rec[schema.gateField])) hasGateFail = true;
    });
    if (hasGateFail) sem = "rojo";

    const fechas = Object.values(porProceso).filter(Boolean).map(r => r.fecha).filter(Boolean);
    const ultimaFecha = fechas.length ? fechas.sort().slice(-1)[0] : null;

    return {
      ut_codigo: ut,
      procesos: porProceso,
      completo: !!porProceso[etapaCompleta],
      score,
      semaforo: sem,
      hasOpenNC,
      hasGateFail,
      ultimaFecha
    };
  });
}

/* ============================================================================
   Agregados para el dashboard ejecutivo.
   ========================================================================= */

/** Promedio de cumplimiento por semana ISO, opcionalmente por proceso.
 *  Devuelve [{ semana, label, promedio, n }] ordenado cronológicamente. */
function tendenciaSemanal(data, proceso) {
  const registros = proceso
    ? (data[proceso] || [])
    : Object.keys(PROCESOS).reduce((acc, k) => acc.concat(data[k] || []), []);
  const porSemana = {};
  registros.forEach(r => {
    if (r.cumplimiento_pct == null || !r.fecha) return;
    const key = `${(r.fecha || "").slice(0, 4)}-S${String(r.semana ?? isoWeek(r.fecha)).padStart(2, "0")}`;
    (porSemana[key] = porSemana[key] || []).push(r.cumplimiento_pct);
  });
  return Object.keys(porSemana).sort().map(key => {
    const vals = porSemana[key];
    return {
      semana: key,
      label: key.replace("-S", " · Sem "),
      promedio: vals.reduce((a, b) => a + b, 0) / vals.length,
      n: vals.length
    };
  });
}

/** Ranking por un campo (operador o zona). Devuelve [{ nombre, promedio, n }]
 *  ordenado de menor a mayor cumplimiento (los que más necesitan atención primero). */
function ranking(data, campo) {
  const all = Object.keys(PROCESOS).reduce((acc, k) => acc.concat(data[k] || []), []);
  const grupos = {};
  all.forEach(r => {
    const k = (r[campo] || "").trim();
    if (!k || r.cumplimiento_pct == null) return;
    (grupos[k] = grupos[k] || []).push(r.cumplimiento_pct);
  });
  return Object.entries(grupos)
    .map(([nombre, vals]) => ({ nombre, promedio: vals.reduce((a, b) => a + b, 0) / vals.length, n: vals.length }))
    .sort((a, b) => a.promedio - b.promedio);
}
