/* ============================================================================
   export-pdf.js — genera el PDF de una evaluación individual, replicando el
   formato de inspección en papel (encabezado, tolerancias, puntos, semáforo,
   observaciones y firmas), usando jsPDF + jspdf-autotable (CDN).
   ========================================================================= */

const ExportPdf = (() => {

  const INK = [30, 35, 24];
  const SOFT = [90, 94, 82];
  const GREEN = [46, 139, 87];
  const AMBER = [201, 138, 31];
  const RED = [193, 68, 61];

  function colorFor(sem) {
    return sem === "verde" ? GREEN : sem === "amarillo" ? AMBER : sem === "rojo" ? RED : SOFT;
  }

  async function exportEvaluacion(r) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const schema = PROCESOS[r.proceso];
    const marginX = 40;
    let y = 46;

    // ---- Logos configurados ----
    const logos = (typeof App !== "undefined" && App.state && App.state.logos) || {};
    const LOGO_MAX_W = 110, LOGO_MAX_H = 40;
    let logoBottom = y;
    function drawLogo(dataUrl, align) {
      if (!dataUrl) return;
      try {
        const props = doc.getImageProperties(dataUrl);
        const scale = Math.min(LOGO_MAX_W / props.width, LOGO_MAX_H / props.height);
        const w = props.width * scale, h = props.height * scale;
        const x = align === "left" ? marginX : 572 - w;
        doc.addImage(dataUrl, x, y - 12, w, h);
        logoBottom = Math.max(logoBottom, y - 12 + h);
      } catch (e) { /* si el logo no carga, el PDF sigue generándose */ }
    }
    drawLogo(logos.izquierdo, "left");
    drawLogo(logos.derecho, "right");
    if (logos.izquierdo || logos.derecho) y = logoBottom + 18;

    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...SOFT);
    doc.text(EMPRESA.toUpperCase(), marginX, y);
    doc.text(`FORMATO ${schema.codigoFormato}`, 572, y, { align: "right" });
    y += 16;

    doc.setFontSize(17); doc.setTextColor(...INK);
    doc.text(`Evaluación Metam Sodio — ${schema.labelLargo || schema.label}`, marginX, y);
    y += 8;
    doc.setDrawColor(...INK); doc.setLineWidth(1);
    doc.line(marginX, y, 572, y);
    y += 20;

    // ---- Datos generales ----
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    const genRows = [
      ["Fecha", r.fecha || "—", "Semana", String(r.semana ?? "—")],
      ["UT / Lote", `${r.ut_codigo || "—"}${r.ut_nombre ? " — " + r.ut_nombre : ""}`, "Zona", r.zona || "—"],
      ["Finca", r.finca || "—", "Evaluador SIC", r.evaluador || "—"],
      [`N° ${schema.pointItemLabel || "puntos"} registrados`, String((r.puntos || []).length), "", ""]
    ];
    if (r.proceso === "previo") {
      genRows.push(["Ciclo", r.ciclo || "—", "Historial fitosanitario", r.historial_fitosanitario || "—"]);
      genRows.push(["DAT de aplicación", r.dat_aplicacion !== "" && r.dat_aplicacion != null ? r.dat_aplicacion + " DAT" : "—",
        "Dosis planificada", r.dosis_planificada_lmz ? r.dosis_planificada_lmz + " L/mz" : "—"]);
      genRows.push(["Responsable de campo", r.responsable || "—", "Turno", r.turno || "—"]);
    }
    if (r.proceso === "durante") {
      genRows.push(["Área evaluada", r.area_evaluada_mz ? r.area_evaluada_mz + " mz" : "—", "Turno", r.turno || "—"]);
      genRows.push(["Operador de aplicación", r.operador || "—", "Franja horaria", r.franja_horaria || "—"]);
      genRows.push(["Tiempo de aplicación", r.tiempo_aplicacion_min ? r.tiempo_aplicacion_min + " min" : "—",
        "Concentración", r.concentracion_ppm ? r.concentracion_ppm + " ppm" : "—"]);
      genRows.push(["Uso de EPP", r.epp_uso ? "Sí" : "No", "", ""]);
      const calc = r.calculados || {};
      genRows.push(["Litros aplicados", r.litros_aplicados ? r.litros_aplicados + " L" : "—",
        "Dosis planificada", r.dosis_planificada_lmz ? r.dosis_planificada_lmz + " L/mz" : "—"]);
      genRows.push(["Dosis aplicada", calc.dosis_aplicada_lmz != null ? calc.dosis_aplicada_lmz.toFixed(1) + " L/mz" : "—",
        "Presión promedio", calc.presion_promedio_psi != null ? calc.presion_promedio_psi.toFixed(1) + " PSI" : "—"]);
    }
    if (r.proceso === "post") {
      genRows.push(["Tiempo de lavado", r.tiempo_lavado_horas ? r.tiempo_lavado_horas + " h" : "—",
        "Post-riego / sellado", r.postriego_sellado ? "Ejecutado" : "No ejecutado"]);
      genRows.push(["Período de ventilación", r.ventilacion_dat !== "" && r.ventilacion_dat != null ? r.ventilacion_dat + " DAT" : "—",
        "Decisión final del lote", r.decision_final || "—"]);
    }
    if (r.geo && r.geo.lat != null) {
      const prec = r.geo.precision != null ? ` (±${r.geo.precision} m)` : "";
      genRows.push(["Ubicación GPS", `${r.geo.lat}, ${r.geo.lon}${prec}`, "", ""]);
    }
    doc.autoTable({
      startY: y, margin: { left: marginX, right: 40 },
      body: genRows, theme: "plain",
      styles: { fontSize: 9.5, cellPadding: 3, textColor: INK },
      columnStyles: { 0: { fontStyle: "bold", textColor: SOFT, cellWidth: 100 }, 2: { fontStyle: "bold", textColor: SOFT, cellWidth: 110 } }
    });
    y = doc.lastAutoTable.finalY + 14;

    if (r.geo && r.geo.lat != null) {
      const url = `https://www.google.com/maps?q=${r.geo.lat},${r.geo.lon}`;
      doc.setFontSize(9); doc.setTextColor(24, 95, 165);
      doc.textWithLink("Abrir ubicación en Google Maps →", marginX, y, { url });
      doc.setTextColor(...INK);
      y += 16;
    }
    const sem = semaforoFor(r.cumplimiento_pct);
    doc.setFillColor(...colorFor(sem));
    doc.roundedRect(marginX, y, 170, 30, 5, 5, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    doc.text(`Cumplimiento: ${r.cumplimiento_pct == null ? "—" : r.cumplimiento_pct.toFixed(1) + "%"}`, marginX + 12, y + 20);
    y += 46;

    // ---- Resumen por variable ----
    doc.setTextColor(...INK); doc.setFontSize(11); doc.setFont("helvetica", "bold");
    doc.text("Resumen por variable", marginX, y); y += 6;

    const summaryRows = [];
    schema.point.forEach(pf => {
      if (!pf.tol) return;
      const s = r.resumen && r.resumen[pf.id];
      if (!s) { summaryRows.push([pf.label, "—", "Sin datos", "", ""]); return; }
      const tolTxt = s.tol.min !== null && s.tol.max !== null ? `${s.tol.min} - ${s.tol.max}` : (s.tol.min !== null ? `Min. ${s.tol.min}` : `Max. ${s.tol.max}`);
      if (s.isRange) {
        summaryRows.push([
          pf.label, tolTxt,
          pctTxt(s.pct.bajo), pctTxt(s.pct.dentro), pctTxt(s.pct.sobre)
        ]);
      } else {
        summaryRows.push([pf.label, tolTxt, "—", pctTxt(s.pct.cumple), "—"]);
      }
    });
    const summaryMeta = schema.point.filter(pf => pf.tol).map(pf => r.resumen && r.resumen[pf.id]);
    doc.autoTable({
      startY: y + 6, margin: { left: marginX, right: 40 },
      head: [["Variable", "Tolerancia", "% Bajo", "% Dentro / Cumple", "% Sobre"]],
      body: summaryRows,
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [47, 75, 60], textColor: 255 },
      columnStyles: { 2: { halign: "center" }, 3: { halign: "center" }, 4: { halign: "center" } },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const s = summaryMeta[data.row.index];
        if (!s) return;
        const col = data.column.index;
        // % Bajo (col 2) y % Sobre (col 4): rojo y negrita si > 0
        if (col === 2 && s.pct && s.pct.bajo > 0) { data.cell.styles.textColor = RED; data.cell.styles.fontStyle = "bold"; }
        if (col === 4 && s.pct && s.pct.sobre > 0) { data.cell.styles.textColor = RED; data.cell.styles.fontStyle = "bold"; }
        // % Dentro / Cumple (col 3): verde si 100%, rojo si por debajo
        if (col === 3 && s.cumplimientoPct !== null && s.cumplimientoPct !== undefined) {
          if (s.cumplimientoPct >= 100) data.cell.styles.textColor = GREEN;
          else { data.cell.styles.textColor = RED; data.cell.styles.fontStyle = "bold"; }
        }
      }
    });
    y = doc.lastAutoTable.finalY + 16;

    // ---- Puntos de muestreo ----
    if (y > 640) { doc.addPage(); y = 46; }
    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(...INK); doc.text(schema.pointSectionTitle || "Puntos de muestreo", marginX, y);
    const ptHead = ["#", ...schema.point.map(pf => pf.label)];
    const ptBody = (r.puntos || []).map((pt, i) => [
      String(i + 1),
      ...schema.point.map(pf => pf.type === "boolean" ? (pt[pf.id] ? "Sí" : "No") : (pt[pf.id] === "" || pt[pf.id] === undefined ? "—" : pt[pf.id]))
    ]);
    doc.autoTable({
      startY: y + 8, margin: { left: marginX, right: 40 },
      head: [ptHead], body: ptBody,
      styles: { fontSize: 8.5, cellPadding: 3, halign: "center" },
      headStyles: { fillColor: [139, 94, 52], textColor: 255 },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const pf = schema.point[data.column.index - 1];
        if (!pf || !pf.tol) return;
        const s = r.resumen && r.resumen[pf.id];
        if (!s) return;
        const rawVal = pf.type === "boolean" ? data.cell.raw === "Sí" : data.cell.raw;
        const bucket = pf.type === "boolean" ? classifyBoolean(rawVal, s.tol) : classifyValue(rawVal, s.tol);
        if (bucket === "dentro" || bucket === "cumple") {
          data.cell.styles.textColor = GREEN;
        } else if (bucket === "bajo" || bucket === "sobre" || bucket === "no_cumple") {
          // fuera de rango: texto rojo, negrita y fondo rojo tenue
          data.cell.styles.textColor = RED;
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [251, 231, 229];
        }
      }
    });
    y = doc.lastAutoTable.finalY + 16;

    // ---- Observaciones y cierre ----
    if (y > 660) { doc.addPage(); y = 46; }
    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(...INK);
    doc.text("Observaciones y acción correctiva", marginX, y); y += 14;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
    y = writeWrapped(doc, "Observaciones: " + (r.observaciones || "—"), marginX, y, 532);
    y = writeWrapped(doc, "Acción correctiva: " + (r.accion_correctiva || "—"), marginX, y + 6, 532);
    y = writeWrapped(doc, `Responsable: ${r.responsable_correccion || "—"}   ·   Fecha de verificación: ${r.fecha_verificacion || "—"}   ·   Estado: ${r.estado || "N/A"}`, marginX, y + 6, 532);

    // ---- Fotos de soporte ----
    if (r.fotos && r.fotos.length) {
      doc.addPage();
      let py = 46;
      doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...INK);
      doc.text("Fotos de soporte", marginX, py);
      py += 20;

      const boxW = 246, boxH = 180, gap = 20;
      let col = 0;
      r.fotos.forEach(p => {
        if (py + boxH + 24 > 760) { doc.addPage(); py = 46; col = 0; }
        const x = marginX + col * (boxW + gap);
        try {
          const props = doc.getImageProperties(p.dataUrl);
          const scale = Math.min(boxW / props.width, boxH / props.height);
          const w = props.width * scale, h = props.height * scale;
          doc.addImage(p.dataUrl, "JPEG", x + (boxW - w) / 2, py + (boxH - h) / 2, w, h);
        } catch (e) { /* si una imagen no carga, se omite sin romper el PDF */ }
        doc.setDrawColor(...SOFT); doc.setLineWidth(0.5);
        doc.rect(x, py, boxW, boxH);
        if (p.caption) {
          doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(...SOFT);
          doc.text(doc.splitTextToSize(p.caption, boxW), x, py + boxH + 12);
        }
        col++;
        if (col >= 2) { col = 0; py += boxH + 30; }
      });
      y = py + boxH + 30;
    }

    // ---- Firmas ----
    y += 40;
    if (y > 700) { doc.addPage(); y = 60; }

    // Firma pre-cargada del evaluador, si su nombre coincide con el registro.
    const registro = (typeof App !== "undefined" && App.state && App.state.evaluadores) || [];
    const firmante = registro.find(ev =>
      (ev.nombre || "").trim().toLowerCase() === String(r.evaluador || "").trim().toLowerCase()
    );
    if (firmante && firmante.firma) {
      try {
        const props = doc.getImageProperties(firmante.firma);
        const maxW = 140, maxH = 42;
        const scale = Math.min(maxW / props.width, maxH / props.height);
        const w = props.width * scale, h = props.height * scale;
        doc.addImage(firmante.firma, marginX + (150 - w) / 2, y - h - 2, w, h);
      } catch (e) { /* si la firma no carga, queda la línea en blanco para firmar a mano */ }
    }

    ["Evaluador SIC", "Jefe de Producción / Siembra", "Gerente de Calidad e Inocuidad"].forEach((label, i) => {
      const x = marginX + i * 178;
      doc.setDrawColor(...SOFT); doc.line(x, y, x + 150, y);
      doc.setFontSize(8.5); doc.setTextColor(...SOFT);
      doc.text(label, x, y + 12);
      if (i === 0 && r.evaluador) {
        doc.setFontSize(8); doc.setTextColor(...INK);
        doc.text(String(r.evaluador), x, y + 23);
      }
    });

    doc.setFontSize(7.5); doc.setTextColor(...SOFT);
    doc.text(`Generado digitalmente · ${new Date().toLocaleString("es-HN")}`, marginX, 790);

    const filename = `Evaluacion_MetamSodio_${schema.label}_${r.ut_codigo || "lote"}_${r.fecha || ""}.pdf`;
    await deliver(doc, filename);
  }

  /** Comparte el PDF con el selector nativo del dispositivo (WhatsApp, correo, etc.)
   *  cuando el navegador lo soporta — típicamente Chrome en Android. Si no está
   *  disponible (la mayoría de navegadores de escritorio), simplemente lo descarga. */
  async function deliver(doc, filename) {
    try {
      if (navigator.canShare) {
        const blob = doc.output("blob");
        const file = new File([blob], filename, { type: "application/pdf" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: filename });
          return;
        }
      }
    } catch (e) {
      if (e && e.name === "AbortError") return; // el usuario cerró el selector de compartir
    }
    doc.save(filename);
  }

  function pctTxt(v) { return v === null || v === undefined || isNaN(v) ? "—" : v.toFixed(1) + "%"; }

  function writeWrapped(doc, text, x, y, maxWidth) {
    const lines = doc.splitTextToSize(text, maxWidth);
    doc.text(lines, x, y);
    return y + lines.length * 12;
  }

  /* -------------------------------------------------------------------------
     Dashboard ejecutivo a PDF (horizontal) — KPIs, tendencia semanal,
     estado de lotes y rankings de operador y zona.
     ---------------------------------------------------------------------- */
  function exportDashboard(data, pesos) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "landscape" });
    const pageW = doc.internal.pageSize.getWidth();
    const marginX = 40;
    let y = 46;

    const logos = (typeof App !== "undefined" && App.state && App.state.logos) || {};
    function drawLogo(dataUrl, align) {
      if (!dataUrl) return 0;
      try {
        const props = doc.getImageProperties(dataUrl);
        const maxW = 100, maxH = 36;
        const scale = Math.min(maxW / props.width, maxH / props.height);
        const w = props.width * scale, h = props.height * scale;
        const x = align === "left" ? marginX : pageW - marginX - w;
        doc.addImage(dataUrl, x, y - 12, w, h);
        return h;
      } catch (e) { return 0; }
    }
    const lh = Math.max(drawLogo(logos.izquierdo, "left"), drawLogo(logos.derecho, "right"));
    if (lh) y += lh + 4;

    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...SOFT);
    doc.text(EMPRESA.toUpperCase(), marginX, y);
    doc.text("DASHBOARD EJECUTIVO · METAM SODIO", pageW - marginX, y, { align: "right" });
    y += 16;
    doc.setFontSize(17); doc.setTextColor(...INK);
    doc.text("Resumen de cumplimiento — Temporada 26-27", marginX, y);
    y += 8;
    doc.setDrawColor(...INK); doc.setLineWidth(1); doc.line(marginX, y, pageW - marginX, y);
    y += 20;

    const all = Object.keys(PROCESOS).reduce((acc, k) => acc.concat(data[k] || []), []);
    const cards = buildLoteScorecards(data, pesos);
    const compVals = all.map(r => r.cumplimiento_pct).filter(v => v != null);
    const compGlobal = compVals.length ? compVals.reduce((a, b) => a + b, 0) / compVals.length : null;

    // KPIs
    const kpis = [
      ["Cumplimiento global", compGlobal == null ? "—" : compGlobal.toFixed(1) + "%"],
      ["Evaluaciones", String(all.length)],
      ["Lotes completos", String(cards.filter(c => c.completo).length)],
      ["Lotes en rojo", String(cards.filter(c => c.semaforo === "rojo").length)]
    ];
    const kpiW = (pageW - marginX * 2 - 30) / 4;
    kpis.forEach((k, i) => {
      const x = marginX + i * (kpiW + 10);
      doc.setFillColor(247, 244, 235); doc.roundedRect(x, y, kpiW, 54, 6, 6, "F");
      doc.setFontSize(20); doc.setTextColor(...INK); doc.setFont("helvetica", "bold");
      doc.text(String(k[1]), x + 12, y + 26);
      doc.setFontSize(8.5); doc.setTextColor(...SOFT); doc.setFont("helvetica", "normal");
      doc.text(String(k[0]).toUpperCase(), x + 12, y + 44);
    });
    y += 74;

    // Tendencia semanal
    doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(...INK);
    doc.text("Tendencia de cumplimiento por semana", marginX, y); y += 10;
    const trend = tendenciaSemanal(data, null);
    const chartX = marginX, chartY = y, chartW = pageW - marginX * 2, chartH = 150;
    if (trend.length < 2) {
      doc.setFontSize(9); doc.setTextColor(...SOFT); doc.setFont("helvetica", "normal");
      doc.text("Se necesitan al menos dos semanas con datos.", marginX, y + 20);
      y += 40;
    } else {
      const plotL = chartX + 34, plotR = chartX + chartW, plotT = chartY, plotB = chartY + chartH - 24;
      const pw = plotR - plotL, ph = plotB - plotT;
      const xFor = i => plotL + (trend.length === 1 ? pw / 2 : (i / (trend.length - 1)) * pw);
      const yFor = v => plotT + ph - (v / 100) * ph;
      [0, 50, 97, 100].forEach(v => {
        const gy = yFor(v);
        if (v === 97) { doc.setDrawColor(193, 68, 61); doc.setLineWidth(0.7); doc.setLineDashPattern([3, 2], 0); }
        else { doc.setDrawColor(224, 221, 209); doc.setLineWidth(0.4); doc.setLineDashPattern([], 0); }
        doc.line(plotL, gy, plotR, gy);
        doc.setFontSize(8); doc.setTextColor(v === 97 ? 193 : 139, v === 97 ? 68 : 143, v === 97 ? 61 : 128);
        doc.text(v + "%", plotL - 6, gy + 3, { align: "right" });
      });
      doc.setLineDashPattern([], 0);
      doc.setDrawColor(47, 75, 60); doc.setLineWidth(1.5);
      trend.forEach((s, i) => {
        if (i > 0) doc.line(xFor(i - 1), yFor(trend[i - 1].promedio), xFor(i), yFor(s.promedio));
      });
      trend.forEach((s, i) => {
        const cx = xFor(i), cy = yFor(s.promedio);
        const c = colorForHex(semaforoFor(s.promedio));
        doc.setFillColor(c[0], c[1], c[2]);
        doc.circle(cx, cy, 2.5, "F");
        doc.setFontSize(7.5); doc.setTextColor(...INK);
        doc.text(s.promedio.toFixed(0), cx, cy - 6, { align: "center" });
        const wk = s.semana.split("-S")[1] || s.semana;
        doc.setTextColor(...SOFT);
        doc.text("S" + wk, cx, plotB + 14, { align: "center" });
      });
      y = chartY + chartH + 10;
    }

    // Segunda página: rankings
    doc.addPage();
    y = 46;
    doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(...INK);
    doc.text("Cumplimiento por finca", marginX, y); y += 6;
    rankingTable(doc, ranking(data, "finca"), marginX, y + 6, pageW);
    y = doc.lastAutoTable.finalY + 24;
    doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(...INK);
    doc.text("Cumplimiento por operador", marginX, y); y += 6;
    rankingTable(doc, ranking(data, "operador"), marginX, y + 6, pageW);
    y = doc.lastAutoTable.finalY + 24;
    if (y > doc.internal.pageSize.getHeight() - 120) { doc.addPage(); y = 46; }
    doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(...INK);
    doc.text("Cumplimiento por zona", marginX, y); y += 6;
    rankingTable(doc, ranking(data, "zona"), marginX, y + 6, pageW);

    doc.setFontSize(7.5); doc.setTextColor(...SOFT);
    doc.text(`Generado ${new Date().toLocaleString("es-HN")}`, marginX, doc.internal.pageSize.getHeight() - 20);

    const filename = `Dashboard_SIC_MetamSodio_${new Date().toISOString().slice(0, 10)}.pdf`;
    deliver(doc, filename);
  }

  function colorForHex(sem) {
    return sem === "verde" ? [46, 139, 87] : sem === "amarillo" ? [201, 138, 31] : sem === "rojo" ? [193, 68, 61] : [139, 143, 128];
  }

  function rankingTable(doc, rows, marginX, y, pageW) {
    const body = rows.map(o => [o.nombre, String(o.n), o.promedio.toFixed(1) + "%"]);
    doc.autoTable({
      startY: y, margin: { left: marginX, right: marginX },
      head: [["Nombre", "Evaluaciones", "Cumplimiento"]],
      body: body.length ? body : [["Sin datos", "", ""]],
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [47, 75, 60], textColor: 255 },
      columnStyles: { 1: { halign: "center" }, 2: { halign: "right" } },
      didParseCell: (data) => {
        if (data.section !== "body" || data.column.index !== 2) return;
        const val = parseFloat(data.cell.raw);
        if (isNaN(val)) return;
        const c = colorForHex(semaforoFor(val));
        data.cell.styles.textColor = c;
        data.cell.styles.fontStyle = "bold";
      }
    });
  }

  return { exportEvaluacion, exportDashboard };
})();
