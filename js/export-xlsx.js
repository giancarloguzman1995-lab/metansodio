/* ============================================================================
   export-xlsx.js — genera el Excel consolidado (una hoja por etapa) a partir
   de las evaluaciones guardadas. Las columnas se generan dinámicamente desde
   PROCESOS[key].header — así cualquier campo que se agregue en data.js
   aparece automáticamente en el Excel sin tocar este archivo.
   ========================================================================= */

const ExportXlsx = (() => {

  // Campos de encabezado que ya se muestran en columnas fijas al inicio de
  // cada fila (Fecha/UT/Zona/Finca), para no repetirlos.
  const OMITIR_HEADER = new Set(["fecha", "ut_codigo", "zona", "finca"]);

  function rowsForProceso(procKey, records) {
    const schema = PROCESOS[procKey];
    return records.map(r => {
      const base = {
        "Fecha": r.fecha || "",
        "Semana": r.semana ?? "",
        "UT (código)": r.ut_codigo || "",
        "Lote": r.ut_nombre || "",
        "Zona": r.zona || "",
        "Finca": r.finca || fincaDeUt(r.ut_codigo) || ""
      };

      // Resto de campos de encabezado, generados dinámicamente desde el
      // esquema de la etapa (aplica igual a Previo, Durante y Post).
      schema.header.forEach(f => {
        if (OMITIR_HEADER.has(f.id)) return;
        let v = r[f.id];
        if (f.type === "boolean") v = v ? "Sí" : "No";
        base[f.label] = v === undefined || v === null ? "" : v;
      });

      base["Latitud"] = r.geo && r.geo.lat != null ? r.geo.lat : "";
      base["Longitud"] = r.geo && r.geo.lon != null ? r.geo.lon : "";
      base["Precisión GPS (m)"] = r.geo && r.geo.precision != null ? r.geo.precision : "";
      base["Ubicación (Maps)"] = r.geo && r.geo.lat != null ? `https://www.google.com/maps?q=${r.geo.lat},${r.geo.lon}` : "";
      base[`N° de ${(schema.pointItemLabel || "puntos")}s registrados`] = (r.puntos || []).length;

      // Columnas por variable medida por punto. El promedio se calcula desde
      // las mediciones crudas (r.puntos), así también aplica a evaluaciones
      // ya guardadas. Los porcentajes vienen del resumen calculado al
      // momento del registro.
      schema.point.forEach(pf => {
        if (!pf.tol) return;
        if (pf.type !== "boolean") {
          base[`${pf.label} — Promedio`] = numOrEmpty(promedioDePuntos(r.puntos, pf.id));
        }
        const s = r.resumen && r.resumen[pf.id];
        if (!s) return;
        if (s.isRange) {
          base[`${pf.label} — % Bajo`] = numOrEmpty(s.pct.bajo);
          base[`${pf.label} — % Dentro`] = numOrEmpty(s.pct.dentro);
          base[`${pf.label} — % Sobre`] = numOrEmpty(s.pct.sobre);
        } else {
          base[`${pf.label} — % Cumple`] = numOrEmpty(s.pct.cumple);
        }
      });

      // Métricas calculadas (solo Durante: dosis aplicada, presión
      // promedio, etc. — definidas en schema.computed).
      if (schema.computed && r.calculados) {
        schema.computed.forEach(c => {
          const v = r.calculados[c.id];
          base[`${c.label}${c.unit ? " (" + c.unit + ")" : ""}`] = numOrEmpty(v);
        });
      }

      base["% Cumplimiento global"] = numOrEmpty(r.cumplimiento_pct);
      base["Observaciones"] = r.observaciones || "";
      base["Acción correctiva"] = r.accion_correctiva || "";
      base["Responsable de la corrección"] = r.responsable_correccion || "";
      base["Fecha de verificación"] = r.fecha_verificacion || "";
      base["Estado no conformidad"] = r.estado || "N/A";
      base["Actualizado"] = r.actualizado || "";
      return base;
    });
  }

  function numOrEmpty(v) {
    return v === null || v === undefined || isNaN(v) ? "" : Number(v.toFixed(2));
  }

  /** Promedio de todas las mediciones de una variable dentro de una evaluación
   *  (por ejemplo, el promedio de PSI de todas las válvulas de un lote). */
  function promedioDePuntos(puntos, fieldId) {
    const vals = (puntos || [])
      .map(p => p[fieldId])
      .filter(v => v !== "" && v !== null && v !== undefined && !isNaN(v))
      .map(Number);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  /** Fila final "PROMEDIO GENERAL": promedia cada columna numérica a lo largo
   *  de todas las evaluaciones de la hoja. Las columnas de texto quedan vacías. */
  function filaPromedioGeneral(rows, etiquetaCol) {
    if (!rows.length) return null;
    const out = {};
    Object.keys(rows[0]).forEach(col => {
      const vals = rows
        .map(r => r[col])
        .filter(v => typeof v === "number" && !isNaN(v));
      out[col] = vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : "";
    });
    out[etiquetaCol] = "PROMEDIO GENERAL";
    return out;
  }

  function loteRows(data) {
    const cards = buildLoteScorecards(data, App.state.pesosLote);
    const procKeys = Object.keys(PROCESOS);
    return cards.map(c => {
      const row = { "UT": c.ut_codigo };
      procKeys.forEach(key => {
        row[`${PROCESOS[key].label} (%)`] = numOrEmpty(c.procesos[key] && c.procesos[key].cumplimiento_pct);
      });
      row["Estado"] = c.completo ? "Completo" : "En proceso";
      row["Última fecha"] = c.ultimaFecha || "";
      row["Calificación de lote (%)"] = numOrEmpty(c.score);
      row["Semáforo"] = c.semaforo;
      row["Decisión NO APTO"] = c.hasGateFail ? "Sí" : "No";
      row["NC abierta"] = c.hasOpenNC ? "Sí" : "No";
      return row;
    });
  }

  function exportConsolidado(data) {
    const wb = XLSX.utils.book_new();
    let any = false;

    const lRows = loteRows(data);
    if (lRows.length) {
      const prom = filaPromedioGeneral(lRows, "UT");
      if (prom) lRows.push(prom);
    }
    const lWs = lRows.length ? XLSX.utils.json_to_sheet(lRows) : XLSX.utils.aoa_to_sheet([["Sin lotes evaluados todavía"]]);
    XLSX.utils.book_append_sheet(wb, lWs, "Lotes");

    Object.keys(PROCESOS).forEach(key => {
      const records = (data[key] || []).slice().sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
      const rows = rowsForProceso(key, records);
      if (rows.length) {
        const prom = filaPromedioGeneral(rows, "Fecha");
        if (prom) rows.push(prom);
      }
      const ws = rows.length
        ? XLSX.utils.json_to_sheet(rows)
        : XLSX.utils.aoa_to_sheet([["Sin evaluaciones registradas todavía"]]);
      XLSX.utils.book_append_sheet(wb, ws, PROCESOS[key].label.slice(0, 31));
      if (rows.length) any = true;
    });
    if (!any && typeof toast === "function") toast("Aún no hay datos para exportar");
    const fname = `Consolidado_SIC_MetamSodio_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fname);
  }

  return { exportConsolidado };
})();
