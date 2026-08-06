/* ============================================================================
   data.js — catálogo de lotes, tolerancias y esquema de cada etapa de Metam
   Sodio. Este archivo es la única fuente de verdad: el formulario, el cálculo
   de semáforos, el resumen de cálculos, el historial y las exportaciones a
   PDF/Excel se generan a partir de estas definiciones. Para agregar una
   variable a una etapa, basta con agregarla aquí — no hay que tocar el resto
   de la app.

   Base: Manual de Aplicación de Metam Sodio (guía QM_G-036). La labor está
   dividida en TRES evaluaciones independientes en el tiempo — Previo,
   Durante y Post — porque cada una mide cosas distintas y ocurre en momentos
   distintos del proceso. Un resumen ponderado por lote (pestaña "Lotes")
   combina la evaluación más reciente de cada una, igual que en el molde de
   Mecanización.
   ========================================================================= */

const UT_CATALOG = ["1001-010", "1001-020", "1001-030", "1001-040", "1001-045", "1001-050", "1001-060", "1001-070", "1001-080", "1001-090", "1001-100", "1001-110", "1001-120", "1001-130", "1001-150", "1001-155", "1001-160", "1001-170", "1001-180", "1002-010", "1002-020", "1002-025", "1002-030", "1002-040", "1002-045", "1002-050", "1002-060", "1002-070", "1002-080", "1002-090", "1002-100", "1002-110", "1002-120", "1002-130", "1002-140", "1002-150", "1002-170", "1002-180", "1002-200", "1002-230", "1003-010", "1003-020", "1003-030", "1003-040", "1003-050", "1003-060", "1003-070", "1003-080", "1003-090", "1003-100", "1003-110", "1003-115", "1003-120", "1003-130", "1003-140", "1003-145", "1003-160", "1003-170", "1003-180", "1003-190", "1003-200", "1003-210", "1003-215", "1003-220", "1003-240", "1003-250", "1003-260", "1003-270", "1003-280", "1003-285", "1003-290", "1003-300", "1003-305", "2001-010", "2001-020", "2001-025", "2001-030", "2001-040", "2001-050", "2001-060", "2001-070", "2001-080", "2001-085", "2001-090", "2001-100", "2001-110", "2001-120", "2001-130", "2001-140", "2001-150", "2001-160", "2001-170", "2001-180", "2001-190", "2001-200", "2001-210", "2002-010", "2002-020", "2002-030", "2002-040", "2002-050", "2002-060", "2002-070", "2002-080", "2002-090", "2002-100", "2002-110", "2002-120", "2002-130", "2002-140", "2002-150", "2003-010", "2003-020", "2003-030", "2003-040", "2003-050", "2003-060", "2003-070", "2003-080", "2003-090", "2003-100", "2003-110", "2003-120", "2003-130", "2003-140", "2004-020", "2004-030", "2004-040", "2004-050", "2004-060", "2004-070", "2004-080", "2004-090", "2004-100", "2004-110", "2004-150", "2004-160", "2004-170", "2004-180", "2004-190", "2004-200", "2004-210", "2004-220", "2004-230", "2005-010", "2005-020", "2005-030", "2005-040", "2005-050", "2005-060", "2005-070", "2005-080", "2005-090", "2005-100", "2005-110", "2005-120", "2005-130", "2005-140", "2005-150", "2005-160", "2005-170", "2005-180", "2005-190", "2005-200", "2005-210", "2005-220"];

/* ----------------------------------------------------------------------
   TOLERANCIAS POR DEFECTO
   ------------------------------------------------------------------- */

// Versión de las tolerancias oficiales. Al subirla, los dispositivos que ya
// tenían guardada una versión anterior adoptan automáticamente los valores
// nuevos.
// v1 (ago-2026): valores iniciales tomados de la guía QM_G-036. La presión
//                por válvula (9–12 PSI) y el máximo de válvulas por lote (20)
//                quedan como referencia inicial — PENDIENTES de confirmar
//                con el área técnica; ajustables aquí en cuanto se confirmen.
const TOLERANCIAS_VERSION = 1;

const DEFAULT_TOLERANCIAS = {
  previo: {
    humedad_pct: { min: 100, max: null, label: "Prueba del puño conforme (%)", note: "Forma bola y se desmorona = capacidad de campo. Si no se desmorona (muy húmedo) o no forma bola (muy seco), el punto no está listo para aplicar." },
    profundidad_muestreo_cm: { min: 15, max: null, label: "Profundidad de muestreo de humedad (cm)", note: "Valor de referencia — confirma con el área técnica." },
    ventana_dat: { min: 7, max: 25, label: "Ventana de aplicación vs. trasplante (DAT)", note: "Según manual QM_G-036: Ciclo 1 → 20–25 DAT · Ciclo 2 → 7–14 DAT. El rango de aquí es la unión de ambos; usa el campo Ciclo del lote para confirmar cuál aplica." },
    dosis_lmz: { min: 250, max: 350, label: "Dosis planificada (L/mz)", note: "Según historial fitosanitario: alto riesgo (Fusarium/nematodos) ≈ 350 L/mz · bajo riesgo 250–300 L/mz." }
  },
  durante: {
    concentracion_ppm: { min: 3500, max: 4000, label: "Concentración programada (ppm)", note: null },
    tiempo_aplicacion_min: { min: 120, max: null, label: "Tiempo de aplicación (min)", note: "≥ 2 horas (120 min) según manual QM_G-036." },
    epp_pct: { min: 100, max: null, label: "Uso de EPP (%)", note: null },
    presion_psi: { min: 9, max: 12, label: "Presión por válvula (PSI)", note: "Rango PENDIENTE de confirmar con el área técnica — ajustable aquí en cuanto se confirme." }
  },
  post: {
    tiempo_lavado_horas: { min: 1, max: null, label: "Tiempo de lavado (h)", note: null },
    postriego_pct: { min: 100, max: null, label: "Post-riego / sellado del gas ejecutado (%)", note: null },
    ventilacion_dat: { min: 10, max: null, label: "Período de ventilación (DAT)", note: null },
    germinacion_pct: { min: 100, max: null, label: "Prueba de germinación / fitotoxicidad conforme (%)", note: null }
  }
};

// Semáforo general de cumplimiento.
const SEMAFORO = { verde: 98, amarillo: 97 }; // >=verde: verde, >=amarillo: amarillo, si no: rojo

// Pesos para la calificación final del LOTE, combinando la evaluación más
// reciente de cada etapa. "Post" pesa más porque ahí vive la decisión final
// Apto/No apto — y además actúa como compuerta: un lote con decisión
// "NO APTO" sale en rojo sin importar el puntaje ponderado (ver calc.js).
// Editable desde Configuración.
const DEFAULT_PESOS_LOTE = { previo: 0.25, durante: 0.35, post: 0.40 };

// Logos que aparecen en el encabezado del PDF (izquierdo y derecho).
// Vienen pre-cargados con los logos oficiales, así aparecen en cualquier
// dispositivo sin que nadie tenga que subirlos. Se pueden reemplazar o quitar
// desde Configuración; ese cambio queda guardado por encima de estos valores.
const DEFAULT_LOGOS = {
  izquierdo: "data:image/png;base64,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",
  derecho: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASIAAACZCAMAAAC8GseGAAAAwFBMVEX///////7///3+///9///+//7//v/+/v///v7++Pj+6eP5/PTz8+/s7eri78bo5+bi4uLT47Di3Nza2trY2NjW1tbU1NTS0tLrz8XNzc3Ky8n/wWPTxqbGxsK212qkzTShzC3Dw8PAwMCjyTWcxjGhzSuhzCufzSqfyyebxyX/v0r+sX3Qu6y7u7u4uLi1tbWxsbGurq6rq6umpqahoaH+j2yknZaampr+cC7/aA//Zw3+Yxr/ZQv/Ywf/Xgz+VwjLB/RhAAAzLElEQVR42t1daZsat7JuobRarGOcxMFZgHiGzTzZwxMYtv//r269VaWtYTz+eOb2OfEAvertqlLtqirZrPzx9J9x/FH+5T+mipvTQ104zVXlFe5sOKQpLmr1Xk6ubO6f0/6UbQaP6Zye6oxztwfYO2fjq7NVUz7uA23DsA3yrU9bAMTi/+E06/hadXlxixubqvbZnT2fY8M4jR7k6B9nsqEDSueBb4Nf+fSm9o3u81buyjei4TaV9+E0XAY354tZzyc7611ExcTxhgvce2UueyfxDHkO9/CQg9TG6O6rar8SW+U4hCdr7pyS04PNH9KZ7Kre1Lcv1+QUkD0EjbhOP9u7FPX1Wzi4yUn/IWx3QIoQBWLQF2DiKF1ghiqSlYv/0Ltk1iwfgElIj6wDuvqT0KyxTTk4E4nSmCpcMnCPqQKJBYp1VYu75ereFOfR3rp8oY01d9n23bsWRsMSojo+pT6FdXpny1cFYhkF1Ya++SRPXKJzXMpZEzmODzK+QKGpZUTMOk6RTpTDRxujT8B06PX0po2K0rUvaMsHqVdglR6hrtPRkU7fYXuJkvr3CdGVorVOD2dM+fqtta1bOlvdkeAu5xDvXpLDJntbYVB8qGtdyd3hPSZA16JMF5nK5cRn8tu8e5eD1MZIX0UAWC7n0n0bSGSR5UQ8loWkd42JsrwhCezrWgV6KZKUwWyYgiJQLMkdvX8PorNBFpkInQvjguwX/nKO7h52ekHDtQCxQU44m4HI9+er6AWs4qMXtu/fB5DeZSBFiEx6Cy5NXW05aHBfsJhpMBQwuUxAhqRNXens6xr38vQN3F2SU8wpPr5c5r10Rxffk/ORsA3BUte3NG8i7Rvj8vsZ7wKtGCUdKzyeAMVt3mPLKanAqD0geoIgYm3UAL6kodhs6gpSyMQTXD4c0UYcRLwJeNKgaOTO3sxVUTvDOMOkXudvMJsXGucCrAwK06BM81FoWD1AELWQEZUoIv7bb7+9C1KCyBT6n2tJRavyh3+o+8PReDyeYqO/o2FLmDX5lJ+po8XQRD1xPldWnMqcXNAmhOVa1sVD/IQ2ryxgW7LTZOzuyrfrRTlOsx1Lh+++y0FqY/SCapwo3mCTe/RHhM1sg229XvOfGSE16iRFwdyfVW+ksmPcDeZpJ5qSsEA2NBEYRg8NqpU+2OR6vW5bD+2ZxnJevpEXKotEkbHx/X333R2QIkYvcxBEj4lv0A/H09lyvVmv5vPFfLGcz5f4j4Bar2bjUf8+0nVxaVO5fMr0X9Y8FUST6VsuqOy94/W49TZpU/lcaOJ1TJJUGW+Ygv/x8fvvv48g3WJ0V0M16Rll64+IetZLbHP+b75YzGVbLBbrzXw6HlQvK8wN61O3L6P2UX2ymfx5fetttxNfvBBfCDH7ssnXtj/xkD98+NACKceoasnT/IXiwWEq9MfT1XoN4lkQPsxhsq2Xi6VSE7HcqGWyuFuyEsw8jXC3nfQ8BGZvErceTuB9BIAVeRO3bhf/Dlic9CZb2iZdwNGVvXQ3XKkXhGk8uSeSqtu6Ta5Auh9++OFDoKQMowgR0x5UCSFYVRuSAOyPiYBALAsSQKvVjOU0bySY5sR62EVIbR6noxwR60qJ2UBAQuT0dscrtuOWxshSRTcSLl3sO9O+XbfqHtOu67HXw58JRruVYy67nvAc/24srrQLd+/u+bTLcb8DbFUvu03+EnnEH38ASB9ewKgQIU1SiQK1+vGUAJoz9cxINA/6dVKtOxDgM0KJaWm5WU2HwlW51mtbVNTdnU/Pp9Pz8/m6I/aYPIeNIPK7K/adeF/3eI77ngmi4/PzhSCiY84nHPN83fcAEe09Y9iT4/N5R3djJ0F3LyefzufjxMphB72NSvXEfB8/CkggpFuMStZ0VXB56HiGU+Iw2ljcDDF1dfBPv9Pp8x96oMFoPJuDzgjIzWzc59k7GpvGZ7MJI7a9PB/Ox+PlJCOeHHggNGZ69smFPod9BBEjgWGeAdFJTrgSJIfj8Xx4BtHw2M/7rkIUHBIMEZ2Hf4894t8jIXTClUCsJpMC9Fw/flSQ2hgJRCY3oFpSDTy2ZIBU0kApGkA2DUbTcU0AylzWYWkuUKpIMmqIJZtfiRPPft5PehMaMV46UDlueZvY3flwCvu2Hr/tLvQLPnQDROEYvk6v4rELdkdgZgOjnQ+X3Xa3PzGNAaLn405uI+oUSVqoZqR22h9/DCDlGAUyUmXPluqXbAMiIZIyK6KNoWGtaAYEiLJm/RGBMahGT3PivgER05DQXIHd1rNxR3xqrOrYzJJnA09GSj9tMURPAzudjl0dFw2fRcXu/Hza8WC3Vxohf6ITT4QEIGaViLGd8NiJjHZOIVJyBUTXif1mACR31uLsYy97GrbOWYmy1S8/Ckj3MSpnHlaEoCtirhk9bjDLr8E8BMGUZrDNtF8BC4IIXDWqRkQ9ILEOAF1BaM35IOZX0zDtmJpN0AZSwoFPTpAhJF3PV+KPCXGVQGRkXCxWrmfiGSiUBBEBAvVDse3x2Olg+aAQ0SWtyiKZIRQiYAw2xGEEkdg7SgceJiL7Rn755ZeI0QfFKImjKlk36ifCNE8iuR7PMY8t1+CcITMSfe50xuv1EhCBYB6BEREaBBXBMpqyFjAHfZlkXcM1YEQLqhgi8AdNZcf9nuatCZ5dqcjv8MohVva0j+c/jHDLalOC6JkgcpV+YIiY0xJEzgSIjEDE/AiI2GFiortNAf311wyj7xNGoh0FEy8YijZY/gQFSGJOY+dpn4fu+jS/kXJEEK3oB8WIKI1Ih/iL9mJuW2xmw9wCx586aNUKET1pl7YGAyMqgkVXsyh/vpAu4Lzv+tpVQgQ7Nrt0RlNkKqWib/hnBocZzap9V1JRL1CRzaMUNIHzu2s+FRh9KDDSGc0m775aQUQsS5qiwEtmJAMnhDr96RoQrBgi+rCm/eMVPs7Xa6Kdzni15kMFI8HHW2OTu0AgSqobRPNx0utNel0eNg14N0meRDDazsINouI6pyJltNN+d6ZrCkTW8bAVIsfCLEBEt+nhNq4Rv6lXz9SnT59+ZWbL6ChJo+SFSmMiEhxviGWW4Jj++JEtj/l62vdT/nmxFEYjENeEBR27FKlOLElH5xi5zPSvc4hEqe6xuCYyoomeSWuCufxMSqVV9UqpqKpaEBn9gLGf99sTfQziukoQVcKpAhHf5niMCrizahM1n4BRIKQbjCoNB1mbvIHgMtAN5O6Q5QtLbYAxZztNZBHMEQDXmW7EeCOu7IDx5iqP1FUaTFiTQ7S7MCwirlk1gqSAFDpDEdqDR2qBCFRkcohOLXFN1zuezjvRi5SNAkQZox0OooOqnGS+kaf77beIEdPRhwjRO4Yo+AacOqSsIIRRYsAbgWK5GeNnJqKFQgSeIxyrB6azBRRwAhUYLeRsy95TAd/qHVQWEWuQIgeIDoTQmZVDsVB3F5rxoRJ7FxituqWiXFzTZUjOH7cii5JeRAD6TFwHHTSzkERFdr/9BpByjPJZjckGBwNVI/M/EwLT0OiRhDPbYOtpPZgxEnNhNEigFe1YzUkcbQg2pq+IEcnsMXM7kWdtw6RZJYiOUA8ZIlJYWKXrivzpMiGJvAKf8Lh9e0arCkZr6KqH3f6G0Voz2k5uY4w4MaJp9PvvBUZgNcYooyJhMNMIc0Imgwp0sLSBh0bVFGwGH8hyreIapLMgVusz4TB+fBp7SZZPo+DoilOmjxD1eixHGaLno5e4iMFhNQjpGaM1YUbjJyxnNF8wmsevR7FIhKGzGe05n/TZWefy2CG9xT9uMPqQSSMWQsEylVAHSxzWnSF65wtlp9F8xb6iOSYyUBGIi6hnDhbcMNsJHZF6BE4jUd7nEZssupNN+pMAkehF/OrxlnusZfO+SmURD+b+pC8Qdcl0gaAhye5y1bEyxYzWq1zu2eTABD78ETGKrEYSO0KUvEtqno8eCRbM5sMZtOWFuNCUiFjtWa5UL1oyE65ng76gQvRGk9x8jY9MiDeGn8khOrABcgFEwoo9eDAmYlyo0BCIqly7Pt2BSKX+eVfd164zKiofqMEJf/6R0VEko6Ab3fgcRf0jSPrCWECBiYgtMHY6ZozGzMaSHGiyDxKEt1qtwHnzUStC7yqxySaBipwaICIWQCEXHr5AZEpGC+JaDZDj6TlB1IW9KuK6xWggyKqASDT5Rn1aRHd/KkYRoo8ijRSiQD7BhQE2A+90VGGEB5aJaM0sx6SznDIVLZbshwTfkTQClowLMeTs8+cVi6n6xhPaUzPUsrGhln6XNy82mmUtG+P2QS+y0f6tHOxSsePY2FOIINefRVxnEFUspHAbgYg1ep+ibUobfzFGOavlZKTx6DpQ3QDctYa1ulFxzLKHuE4nf3ZWT2HGMoWxdGJppO5s0iEJoM+fZ0RHy/U4WGopFAUrfr+d7I4nNlkB0WHHG5whvG+rjhK10QrVEWRBU+Bkuxd7TiESFZSpKBggpKbvdpgdQU3sVtrzbbb0RDZ3qTV/BYxyiR3I6CHzNvOD0FDnS5jwTxwJko0hWKeNpq3RepN/Z5N/DVSWghBhtGQsWSWyMavC8VhOl8MFalFPIGK96EwkAK47XY7878Te1a7p7/nAxxz4mAAR+9Bk0ncmuNSuZ8atqy41vY1XurAhMPB3iVFORqCi4MdRSTRbipgdjfNt0Po+7gzK733Pzuw1GO2zbhBHUI44/GXkNpZIanvBgz+rx3RyOetGJPANnK7P9L/zZet00j8HcU0HspwmI4U9s3QMOwDOgAjGGF9C/Qrd/TVetgcVIbtNSGchIkV810eIfs9ZLXJaDLnKX2Ivtru+NpOpCHnwvLYMCBGrQRp5VUM0vooowmR/vIjfvRa/h25bTPv74+FyOO4nDYfw7Ra/CxXhEPiuLTHpgeyXPVu7+HnHARC9hDBQd6cX3U26ls2VdBvSAjVRwIve//ddMsoh4vAHJxHRIGm+msL1mm/Ed8X36di3f+j06V86efU5bewBGClBcwKfKm3dyWQ76X3DlpLvpg3PIvs8p1kEl0n65DXKhGO6PET+GURq+RJOQo3G6CW9BBdNdpuQqRUDoe5vwuhPwiiQUSmMStLAPLVke7XYxqQUrfMfpn68Cb+s+QP0JqKhIIgCGTHT2rY6YiVXwtym4BEHWGyRUFvpbHyNuuaEAUkS8SmuKQlbxsnYrc1tDJdlabCdZVy66j//MEYFGSVhRJq1T7mM0w2pflOe1ticwByFOX1A8xNHXqEFzME+Y9WJFmK10UmY0wqEZFKbDbJ0KNvKYjUxo9TAFQAPSIiQmjy5xMTELBMwwczdSMaVy4SpEyPeq+eryBJwmhPiNV+pDVGLjMQIiVRkg7Cm9z4KTg+Z0sF4I8xz8/lCcQFEKyiJiDECOpJf8MqWCH3+PJfLFdlvJkvMkYdsQvaNceZeuLsgNpN7MxGZbce4i0xaSTXM8Ev6WZ7xwxBlZFRyWtQNINNGJEw2s4Gdqq7MyvRcKWTJahE7Q/DLmgmIf+I0CNId1y2EwGkAOGUl8/xh/WQL9aTnVRHobdU2S2aaC6F7WOZ2IsEdEj9WsyG8hKyrxiAMm+02nJQTcQzwem/qPKktS0VkiAJGcU5LLpF3MSsa0hpuVzZY2Y0oxsYCdDBdi3G2UAMEEC0XomozaKQl3tAQkxEbs/Gd8VPCI8QOom3X6sR+oW1SiePsfGYbBPPH5HIhO8Ta/fnCG01iEgggNedyupx3gsbuGnZvoZHXhjPbxP9lAi4uy791TSJR/PPvP0EaZZwWhVGejcFW2UoM1rkSDAB5qCCbFmylLhJEATK2yxZkdtwgRGS0gB5q8pQ2KHWHE3yLl22InmkcWZz4p8PEevh0xJdE1LUPkeuznqIx3L14CHZxN7TElP9b25RRVme+eZvpLA2ycxNEf7SEUaQiNlpq0pAxn7H3Zy5ZMpA1ZMgP2Em2FA/tXCFaMFzsb4PCuFx8vguRao8qgz2bFGR779mj1qvUywE/Bke1xA0PF4oLEIGKDofL9QpoQWFQus8HfBEn6y7sFqAl+6/yMXVDsihTKmXdTpz/91/ltBchsprGCaEsslnlMpuxbJCtRDYrLIGKFgKQkNbnextpj5tpnVR9CXCddz0OOLOyLIF8xstVASJRyBMVHc4ka3bIBtg1EnCDP/e05YvucMUJrD74Djz7gEkTssnVWVVBROW5isGW9f9mnBam/ag8vquyZBvYZ8EiVdEMVwfhsWJ6UrNfIVpIMIRl9TKf7n8a9Xs/BWEERaCvgoEnM/h7yLayYA9J0tjSD/vDM0jCRYj44IyKyBS1CPkL5cF+3++DN38n/gGybMRtltVDhNznMK+5omYkUdG/mTDKIfouMJrW1pCJxaJIlSJOmWHlj/CYLxQyduOLuGa6giqwmGcITZA60suMkLkmd5O5UVcSWpzA4XHWIe7Opz0RCFwXESKZ29kjqVTE1tnl8CwQEeGREU+WvlWIdlWkQOez7G6XOxnywh3XhogxEk4LyqPM+no6Ip+eJA7ZZ12IIh45e4SWrFurTiTO13kOEUuiDKGt4PFTmvZpRjTWBYVZshV4HkPGlIH4Pu/hZtxBgoRhsu2UMxpiYghuS7AbyRAcX1RGY4gGx8OJTWMXk5zuJE/meXTCfPbfFqe1IEpn9B/X8M6Laj3n+Qo0sx7rFKdUFSGai6wuaegnVl2qfoJoDqeRjTnDASIONvaY84ga2KVhfZVBFBktoyKBiH1G194OLkpbQiTo56VUd2qi8qIlzm7+799i2i/kNUNkVWkYsldfgvRz8Sny9KUQCRnNE++xZg0OzBHqi7U0+dyGKNQVBIhiLQ4IaMukNLBVYjQ8fM5o2wwii3hHFyHYbUlFfOmiOCazZ5wGnW26uVbw/XcjjPIpTQ5kO2kk0/lontJio2dfDTKxNsKkv2Rf9SJXiHoyn/Yy5XER9GuNxkpakNhSnv2Kz5ftNySQ+Ncgrk2Liq45FTGgXWHOTBZ1hYpC3Zh1t3ayVlmEdHbE0+mmEaIojES/jhCFvLZx0HiKbbMawUUCclnRxuwFKhKnI/vzE0IjsdUDm6l+Pc31U4UohvoaAYeBsiZntDjp2xCfV4jo7+m8cxJBq9qyKEUS8O5dskI4LcxmdWua9ersfyqMXoQoXBDGOzHFaFZ4gmbToeSDLOG0nzGFzQgiPgq2fOYhmkhxgd1+bkGUpVYoo5kQ7+/uTycO8jzns5KM4AUqgvefZnmcCQBti9HKml0Tyyiq2rQFkx7033/tKe2XTDGSujzJdRCIvGnltsPRtojaMxka7JHWTL9cEG2lwqIa5VbaQiESr2OSRZwMJ7Ge05492uyCjrLIFQZIhAiTvt1dn8lIIfqjP1VbXFvTdo+KN8Ca2tyV2pYh+vdliFJ+y3jFEA1Gra3PEEUoZmA02UNiPBfVHQG191MG0XIRqchwXneAyGghDUKN++0WqvGxl2vXpY2Wz2hs5e22HAOByphk0TMLtKZUni2rNKoKZCU/JjqU/ivktZogUXfMAFcqGj/OZrPH2SO2Gf6MmNFWuadsJUesW5OZqaC1bdu2/jR/pZGKJggLiQ16UgNrUhggyMmOVHTJZJGkWvM5HB2Bnl7oRWXCt2kV0XsVSVWsVvoqiFRcz9kVop4gdZ/NR12mosw4ZcsM0in3f/Qkj7SatI00gcgiZdwUqiNiG2xtPUt+Ncz4L+lFlimuh1A3zqBzxB7JZJFEXE2okjRFcYyN2d+uBO2/KK8ziKLuqIXwnO4gBtloLpa7GLHL5Yr1olwqg464mChHaKQ1Y73Pbd/sehpT1V3MXjB498QmnLrH2WOnFDWdhNnvOYfIaMYZFEc55YCMKrL2rmqAsI2Wuzqsi5V7QSY51yq1pMNfhSijIlEdV8EaY3WRVcdFAdHn2VLKiLLJTHmjy4LosL/jdxSDIASsOcda0lz3vW63K4kimpNIFEdbSxbZngZgwVgTxDJ2Yt4qo/U4luttpg2xc83r/B8Kf01JYrTrBYg+st/xfajcJmmP7JjNtDOcrYPSyEAIRPNVSR3s7E/ft+wxjWr19bpPPjVo1zqh0T/fQPgcd7s9kmN7Fvkhu29kto85iRoB6+YQ7Xd7ZDYQM3IsGjq2VROfoaHdl5Mo4baoqTCZ7HbJPSKpPKCz+jWIIK+Mg8doKG5UyWBQ7wcCqtAmS0bjuT//5aeu1GIHC3+fQwSfmlfPnYPMPXPoGJFkb4XdJKOKc2OOIX4N/fk5qo5IwjsdTpIHc2Yd28GxBuaES42vKCFwz85YTUF3oKpk7pfZaSFhKEKEWb/tmn2vMTfcsE+CA3lF8ImowQqcAkQtz/Qs+/5TqJDt/9R2qS3Y0i8KHRFwRt7hddezfi9RaEOMd0UFSy/EmcXEQG6irULw+XrccRYAO2CdQwEAMNvF3XvELzUkZG5c+S73sXlWB0yVTfovQZT0xBocxr58senFN00QNaN5OXlttyUQ9KK5gLbe3ngd6UyOpNWhZQUk9m5/PO53iG10karRY8/XlnhlWw12aev2+F9SFSWlY7edwKYibUFi2Jb39+w27u5mHkLvg8cIGZem8ZzS2QQXLTGaxQRMe5v/CvX6DhXFbSpex9EmzvhL4T1kzmQQ9apOrkDDMpO3Ib/uL8d95t5nXdylFhvQnrpIEUe0j+PINZ66loB0ncWvjf6Ugs82BK67LPk0hp1i01bKKaqiH4TzXMjO3NfkATej/iL/OkShjGi8wYCqwWPmYKSPsyE7/FfJaVYaGZNQ4xcF0SUTRZrOZ1sVrMm6DL0g7vc/skkhVnXP6ZHWvdQrKTTH8Jk7JMV9Y0Q3dUz4r2WBlGGiSvtsNPTPiCuBBh3JamRvCKY08F6uJk44Y2hSIAZ/cCcIosP1eogWGruLijJ+o6LTlk4vXwpR69sNUfwNenWmBBopVIrtf+j/Pq/0FUHtNEveFcHdVyGKjSHgb1zBBNlI1rnM/eA95HwsA0Q/8X072zSZeZ5dk1q9T0S00FQcBEPr2rQIyakH3lpp/UQfvCIkpmfD2R7WaoDeei6toRtKUyjjuSzM+qz9jLWxjYLjHh5VzADDHlumYTCVvg5RfL8o8SC+GIZAGottTWlYJk4baWiZaagbnOe9+5FGKI75q+5u46bZmRywnngJT09C0Fq8ISLYJ9qiobeNXzlK3dOgNkoa+Y/GruljzPychLR3JDbpTo3pxqG/CpE44eBDGLPXWmIgi5gRu55Bguc+/B6Tbbc3mfQ6gZS7ymaHKKs/f0b0djMuW2IN9qiOvkpZtNMk2itmca61hkNksD9f92gutT2SqYp0NNrboIKNc9jOKMey0BEk8ZbT2FhlgAtTtst+q657rrQ+DqQuJJRr7yfBvaba9a03pEVFIQw3eBTH9Gij4JCFBogGXNuQ3Its1McORvq2dF+S1ZI88zjImMtIKusBJuhJAo1O6367XBfM2YyDPXz9rAAdoDE+n6TU8XhWBZLOhGbN9aMTyTreSj0kQr1sEhNgXnLbTnJV5D9yZJv3Xia5nPsKiNK0z/V4JLBnxUZ0NZ/NMjLaat+l2CYosdkxympRrad1LnkkT5MoDVZodC4GiA5S6qsQIX2YDIsdmx9dsTOO8nXHbjUapxcLxmYQPdPFyRRhsA18uKhp36LohiGCwRxi5eHVvQDRxwCR44QxGSnPacQavkNqR23qTk0C0fi66nhmtnyiV/JhlTH3Vu8PWfRjtRoFfw0ma6eu+Z4m7nGPIZtBxHWsClGPi/m08ndiu1w+bL9RY45t2aq5gYisOC/R8G0oeYen+xvtEHCcdHvboxYAqADwr0EUXAbWakInMVbVL1v3dcxgMJqtCvUxxcoJA53e9oWwXsDj2ImCyHAzOYGo6HKXUxF8SQwRu0KYevDyL1sbSrF5oD14QFqMdhYqunBuO3Enov8Nyag9x0sqYbTjRDICILiiC/eOuP61gMimxkcc1mcN+ynPs34aVjNpVtAyy9A8DIGeUVAar/vCVQRhbbOUvEhFQlhewkQFRNed7TJEEtGGX353VYieFSKkIzNE1a0semaI2Pnm5W673VliuEJF9BBaOBBj/q9BFPoU8gC4bGr1OAxFHZzuuAi5ELkVspXEVMy/SRBdkqz+zHWhHAgIKbyhlg584rM2lRlEJEv33a4wGkPkAkRVgmi/36HmL4OoZLTgwpXg7nm35UQLYxWiSiCqYpqWewUiFzqOCT+AjKAbdTDxz5cxE4TMtBZGE34H6JfYjYKIyCjTicQPUge/jGRsKERaGOaNiOuLzGgHZIhMbiA651TkJaFWZjSTIHouqAixEq1+204uUnXShoiNWMQZXmW0IvrN9XrQjUaPHJ+G4yiWycyLuGIvWB4y31/2LY8sHPt1oUp7mfThUWMTvpKeFGnSP+z2JFq/DJHmTcIbWzBaDlEVqAg/T7hytqlajBY8AqZqXoHIuBT4DnlYWiczl+whKXlAsRVMtjzkIZH6XlCISpfbfIky/vAGYoNN6EWhFlaT1xJEpy3kxuQeo+UQgSp3Wkx1h4qqBBEEdM9LNLNNRSnb+DWIIE6R8Kx9b/1UMOLMR67CY1NkyCr3vMiTEZEdwmaXa2s2EwPWZlTktPSZK3mlOsznsoggYqZQiC73qMhpDoLIInOPiiJEkpgzqHgOtIGKTC6u2ar9GkbL405cbjVfjYOpxgEhkBHXwBTi6Ce0IEiCqAyRhKBtbPRqkurIrumB+gbTjIYUEURlZdIPVNTcMloVIApUZLfixk4QnU7SswVVMVupBGxRkQ3R2eZViLRTVdQSpNcF90xZcw4RkoxmD+yNRJbDvdTYG/N1wamyIjYYG2NjAf1JVEcfWi3mEHGRK5TDb1pUFPuveHYMCKO9IItchAiZAlKpvG1DlPmnvpqKpGbcqXIEBRI9U6RXmjgAJLtvkQuk+wjBQ7Aal63lnLiIMtXRSJ/jgopicmgOUTHpe+5qAQOkhEhVx1xcI9/kBIrlGN2tLFKnnnkFImtu2nl1VBwJRqIdLddSji8JoKvZKwixGVOmH5hcLyrcRgVEHHu8K4suQS9CZ7USIns7oxG/NmyUaSssUjSCdp0gqr4KolZimw2pIAvGaAgXEktt7nzBydaY6FYvE9IccmjBTYxC4NjFNqYm0669IldSkZSTMxWdTgxRt2S0ZIBcQxVyS3VkJwEgQsTpJKFtkM89iLg9/VdAVIs7xDtuOIecPhbZ6JPSl2ZqMvEPVDhJbtrsPgmtFnPpaBAcxqmPr0tUJEEKsZ6Tdn3ehkrQvbUINEpJJ9dk9zR3RHVPCTMqrbUMEKu1yXCvcJcxaQwRGE07Sbmo63ydLDIsBLmsFCehiwHk0bjqjGcb9mGDdaTXxXwxmyP36hakGbuIQlOVoues0agVi+vtJPM6lozG5eQHMNoAxbBbErYX9l1wE7adfvWcZL2fDCTDPWM0MmN7nKVOv24v3B8KVi3QFyqivSfJAgvNOF+b9MXMd9riWEwRsipGTEfrOVEDOoBx0znSBNEaC1w05pgImf5FiR54DHMeEBKHswT0Qm1TrdXhzxcUtsAxBhd0yWjcn4EZjVnuejxepG4Bspdb+XF7Q7hIns+X/eUs7UUSRM90ZRU+7DCBN5z5jtMIaO+FA8GIQUvRgv06vUhju02cfpiOuIHMCA33VtwSC/WO8zXnOk4ZtcWKSEm3uQghzsAZ5BTko5AL7ameD9iQsXBDRSJqD5xhDMl9QDvGq6bsX0/cX0dsvO2VddDDmTOLt1K9D68jH3Lec0n/gctEbE+aAXBkG2rrZdezUv2GBhr2K5whjaQsQIOhdw8PG4rTJEWdu8110ABzzQJ8PN9A90YS7YbbhyFJFOCsRGTNuftME6stpCqPw3qeq8O5cxE2+K4l/XF/FDP2yGofehtd9uhYpn1EOUyd2ooe0e+zqfxWXNF7vsyWrseqI196v9/2iNAQDOjJNIreTuHWHAh2qWO2f43R0hIcwY9YiUAacQcaDHnUl0a8m/V0iIp8UNGGsBtPwX+Qz0tNwiakglKNWnh4rbhMX5NXoQn14obisYbjBLQZ+cP5Ndgs+rF00U0WxcSSJezjV8nDmXA0Q+qv5eR4aWRS8AU5/1J0KZ9uzMEhLt/BoL9aXKdIhTLAILYG5a6EQ0JkQ/JoMGWIiAP7Y3QNFS6TLPXFZjb2mRbRtJpPFyW9qQTB3ta1pwJObQNivHSslCIzjTtZmx9qWi1cwkRh2g2BpVu9DbLga1xqVruj23wNCTSdY6FNIC2n42Fd9YejKfFaPRpX4zGaiE3R97KPDqoSuF1yc9DYg0ToMm84G+pNQmMji7QUROdD/aH3Wv5rwkoymh9tYitWE1KUraxs4DLt1KQC3JuKGC5L8zev57UIyPt7PeEzxEfTjYKEJrz98uBBbJ6qSWsbtDg00jYwBM6MLRAyGk7Wjxp8ldBqpUuIVLEu02LKy+NRjimABupCwL5Bh8MmVOZxvagr1knirDVjapM9QWrLBRJtvhaiHJw6qjLo6Sjdv4np0Kp4NOzr03Ef/mlowQuhFFpecxuCuipNG5va70thr3e83JLN18Roe/h81g7a5PmJqbo8DN0WS8XY0HYTyl6dbA1nCz6X4v6vyAxxkUCNLZgWnwdjbbHLzVE3j1lyP8ETCEgFFl4uzaOWe0dY0yopb6TcEI9WY10GaSRiQgWZ8z6gimWZQp6Qy4vKvEohZ8bE5S4VdqSmdo1QlD6Ate2ECheCWzZ0+H4FoizxNl9BI68AEJAWWpe+DD1nNiLMpYuztFA1nMATsppte+0gm/cvCIERV9sYYLA+JSPYII9j0+PKmiTvx09P7NS0PlKEAU/5kAAcmncbH5ft8WnlkEK43M27LtJBrTwI91QTfcqmbiu1UNKUGG0ZECm3NXeV73OiRraWhUsLLHHHYl/F9XA03ELE1uDOtdd+icZoK3JVRKTOT9aqYb1W+1ARLMNHTK7ICwmE70S34ykPlxScsxWMGrxBGzNnnAlNjOxrEMVQaRWSXKrbVUGqDlZwILbSNFqdwLgT/0zWJrBFJyQXl/6JxHBvSbcikcrckYpZ9XqVZ2yNpj8/FAfYqpyNy/nM1dVNjYzRRWG8ezHvOqOicvUEmy3Dki3b1CeUpo+gGu2nQvo0BPiwrnIhXzykLcYYv6EbEhbVwkzU5yY2QJkmfG2TNBrUQli89AgpHD6chep0klMdbqqUDg/5Q0N8k9thX0fkBN/M0OTLFxv5QOQpGvsaRNWNamV0rbz4GqLk7cfFZKZYTKaTLbTV2LynrMixJjMB66g5Dh+fnjYj4eTR9Im+kGDh8eALNnzDgeH7z+h/OH5Cy1G+ZJ+uMEJCVDpc6lg2T+yHIRbCPk5nHtEBfdaE9WKk2jXGhiaqzn1NDQgrq2GdN5lpeJUro0X85h5bhF4yrL9JMwUtHnCeG8lrewVevK3WlWEstyIdPz0+Pk15sKNHjPAR/47p+OkTl+c8PbLTkgclX5EbQBIafxAv6KN8BxDp4U/SirSP87nlJiCi34d8i0dA1I8Xe2KgLa+UxY/41ZVEQZuSvG6rkLm0MqTQZl5iYuix6lR2YuMScUmXcRJPlKU0hPk7PBAkHuEjkUC/Brngh+nTZjwYjsI3QmDc79BOHrdCpFQkED2N+wM+nFOeRozBlJ8AJ3MqqkL0M1/MD6YMqG2X7BUQpXo0gcjFdfSECOICb0bdSF4kiTF5uYD21cE0li0TCdvBZgW6IcgYymRYcxvSUKegGhOnbnrHj6R4WkCEZRBodKPq4REHOSGAaYCIZ9kAkRwOZPo48Oenx+mjwsUUBuoCofarAV8M0nnKlzGBIxqZ0f75AkTWhAxumoN5zNBuOKMS82yjrbdUqYB57A3rMKE+2UX3NKl+bCT4rD2VwRxJzAaW1GmThjoebZgiZOwsiyFFA0QDhmi8eeTR1tWYiQ4Q1dKoqYQIO/r0JOCzoYLPl2ZiFCoaCWEyoE+PD+IV88HreL829oe8fFhFcx0X6op9o9pmuUnKpfAPW80yKTd5t5I6aWk2rkcEAMFcIwiTIX8c595bGXOHhNXTMEAiEgsuT/7u8VNiNEwcj6BAz4chdfVpahVtfgMPj0AaPwtl91VcRbVGqejvlyHKl6E1xfKxVpuoh/xw0efRPiO5IhrRkJVsQoY8lrGEZ9ZytaXYF7YRbsVAaiGA/lSoXxdcs/zqp+BC0JiQmGeqShAxKSZxrTOa5CHimsSkTC748oDzhsx6CaIOk6iThjvc7uaVOv1kP7l8qda0YqM1qb8X819jw5JuRjQoPrzxQaO3mibjgorNnW1cnBDpYcfCHBEiogbM1jyjsQbwOB0Iq0iX/GGEqMOKumtREWPHpDXka44Cz+KUkUL0OJW3GqnIyKP7L0KUGmKkTsXMFb6uso6Pwl+1DQ632jldA8WGE0pT3mdOnFgwFwOZTzouGqTKIlDRE6Yf3odJCVcYi7zi7slBFnXkohEike5TVrMgtRUwelmRTEWAY2IQi1/wztfrfalniELksi7CsVOLqfJ6JZI2Dta7DUWiJusE4KqiUbu1UtJeV2WDYhutxhEIhTaee8esyLkO3jJGq68eXOT4yJFyUJrR2pO+5NQ/8cl8ZTDeMIjykehNfZ7XRmG2IO3Sh5VGK26IUXRTi21VBCJ7p/Onvec9Yj6rbb5EaLB1tLyA7Il8OQutsqxbnlgaiGjn9KRd6Nk87CGzh02vXpU9DqbQODfKmx1X09aCaMD8iml9KtL7aZxmO9Yu+zLXD1VZHavgyDvPxE5hd/sX6YKSL6zbWHokRQK5bF3Ku8an02i1bZuUIipq2OqgEWKmJzJliBk2xFzp1T+JvgNJPGbp3Rf/B2Pwc7/TlkVPKqrgFhAGDfoD66l9geZxijuBqHzZ4umVLlguTNkynCYX2qHxnw0ix7q0gKmU6ZXGe7ZsdHCxlKCTQvTIDt56ikgKmwXMd6AXo8IFwIHVxjDmNk9KTPiVDejHfrLR+AdWHfRcQXYocsqKicY2mlxso8SUm903EN30UjNBVZY12Rtv2p01LLtjGl28PXRpTIZa0WHC3NBUXMzUsWQey7J+kNHsHpfXy7j9zHsrNKwFUaG37aPudFVqfNvvcOfb9MtIzhlqviauIjfSuYD17WG8WMsF3BJFdyFKyrisP8dh2SaxU8M2bZq64jJ+tnbt5m1hp5O2iqIHJN7s97HwHAi9Qx9xxc5gFNef1b342+eXnHYaPkG2Wg/Urx3W/vUUIz/rEVZO8+Ke7KeL5XbU3aaFqa9jTD/WZSDvdM11ripW5Yncw1pSMSHmuJbNYm2du/pdfSO9jLNfXKXT2ptQhL17cF1OPrY9DbFCq/O3qC4ZEQXd+seb7qDWVNna7dbFMta8Q0vwRqvJhgmhyVZIZglYS1cTk0WvSnekKAzIMyRahQYObSu2Va5r5eDaNVlJqJVIAB4T52DhbA4hIMIu3hamejHAG6VdGzzD3gZHFam9XlvtZN7V5n7ny6zHLDdDsTY1hkIoqojPuUoSIhzbE2ibYBsnPmDE7mrwYKNmSBD7bMDaoL+y59+xukTTQcNalm2kNLPGWoCWzVNPGLFoi+5/gMM9GoFU40QoOHGJYcCGs1q0m5321AaIRKemUbNRNFeOZdaYbnxsoqjvIyeiT3c7FZehpTaN+6AiuuCxr8PC8JqF1qjbNS/rDLSjXbkqly9JfePANlW5/vId7cPls0NcKq+pk8vU2bjusqvcbThWU15jVNsaTXuwr/S7luhonh3ta1ss+21SZAcxBiKoWnUjmLQ2+Ciz0m9rWl24JXXGBNlQcziBKKXmFp5EDbpMNrFBHRblkjPEYPax41veFLqx4fcQuDES4OAG/PShaaroSg2LhHPH8MYEfyG/xHYvZ9WKvi+6psuQTblmu0xsMWlEWvobF1z1TR4LqNspDS06ENHYlDpAymlwKgJFBWukG5Ne3YL5Xew2xOIry4qQ4HW8eavvzk2M0UtiUdFb9e+0PkHRez9A1F7BvKDoXLvO+7bYTOEOqrltTyNhGDZpUq7VM16LBWVFBd5rXazp90GV1WVeXZPy6F4o6xcnVnOvej9GPIwpXhJ9aPVMb0MUtEGf/EXx/NpG+rkRDi68echpNu058lxnIQAjrqZG6/VsUL3AWo2TJBGGjMS312WhXdTWnbHJxEbwP3ArZjL2kWv2pK2Cm15kXuMyWnKFfINAR8zX2TDJWUyRRa/ru+uAZJ3TmQBtkazQVHn/KBNjeswPjtcMcyYcanymkdkQgzOqFtRh2VWBs8rbwkPEOZlKbeRFF9yh8e2xeWSbqMC61C/e85KOQRA6zzcwSTVyEpyBIOJJubY8APrpi6vJvKseHh7oz/tvv/3u++9/+OHjxx9//OWXX3/99Om3337/448///zrr79pI8Xhn39l++//waZDgVL9z98iiG6IKFtwRyF6/+13333/IWLEEClGfwlEEaR////gA4AyhG6XbXqnED0wRN+2IVKMMkKKIAGnN4aVPnIBkJAQI/QiEUWIlIx+eA2jEqZi+1+mmNb2zz8lCZUIBaVI+eyhGuYQqTT6UaVRwEhBehWlt7D9k+ETSSghdGc9y2o4TAI7Z7WEkRCSgJRQenNI/dPGRwG6Rai9nCUgeveukEY5Rr8pRgCphdJb3SI+icl+D4vr/tiWRDkVvYzRLUhvF6bw/AmfbCXLjM3yFZoFoocIUZDYipEwWxBJAlMC6i1uMoK/ZDgBIOWygs2+jQs0D3OMvgsYfcwx+o0xCii9VZz+KsAJBKQkVCwXX64WzxANMzIqMLoBKcGUoHorW/7kMpbfAwW1Efo+W8H6YRgg+hJGDJLy2y1Qb2sLI/j99wKg+zTERJQgyjD6EDBqgcQoZUCl7S2AUoAj8JQACUJieSQ2Gw6rQUZGN3QkEilHKeJ0F6r/4S099u9hJJ8iQEpCoKEbhBSixGoFRgpSRCkDqgTrf3/7rdg+hY3xKUgoIfROECKIXsQoB+mXBFIJ09vbMngiiykJqRwqEYoQJQVSMfpwB6Rff82RerNbGEkgoADQDUIRoi9hFEFilCJMbxaoX3N4Ej4KUBshhmgAiApWCxgVIAlKilMLrLe0pefXAbUAuoNQGyLGSOc1BukWpRKpN7ilYXyM+ChArA+1ERKIbjEikISSclJqAfWGtzicHwJAgcduEVKI7mCklJRQynB6q1gVA9BBQRNSCgpMlonqQYIowygnJOW3hFIbqDe5pbEAniCDAo+1aChBdA+jwG4qlj5kOLW2twFIsWE8Ak8LoYcWQgmiNPW3QcqIiQnqS1i9gU2xCfDIAN+XAOUIDar+PYze6VaC9F2G1IcPCaoP/+Nb/pTfZ+jcAnSHhgBRG6OckAItKU45VDleb2Irn/zbDJ17+CSEcioqeS1iVHDcHZje2pYNpMCnZLKsU3NORQmkF2B6/76N1hvc8pG8a8NzS0N9QHQHozukRCi1kHormN17YowkH9tLABFE/f8D5um+1SFowZwAAAAASUVORK5CYII="
};

// Registro de evaluadores SIC con su firma pre-cargada. Cuando el nombre del
// evaluador de una evaluación coincide con uno de este registro, su firma se
// dibuja automáticamente sobre la línea "Evaluador SIC" del PDF.
// Estructura: [{ id, nombre, firma (dataUrl) }]
const DEFAULT_EVALUADORES = [];

/* ----------------------------------------------------------------------
   ESQUEMA DE ETAPAS
   header: campos a nivel de evaluación completa (una vez por lote/visita)
   point: campos que se repiten por cada medición dentro del lote — SOLO
          admiten type "number" o "boolean" (así lo espera la tabla de
          puntos en app.js)
   computed: métricas derivadas de header + point, solo lectura, mostradas
             en un panel "Resumen de cálculos" (hoy únicamente en Durante,
             replicando el mockup del inspector: dosis aplicada, presión
             promedio y % de cumplimiento de dosis)
   pointMax: tope sugerido de filas en la tabla de puntos (solo UI/aviso,
             no bloquea el guardado)
   gateField / gateFailValues: si el valor más reciente de este campo cae
             en gateFailValues, el lote se fuerza a semáforo ROJO en la
             pestaña "Lotes", sin importar el puntaje ponderado (ver
             buildLoteScorecards en calc.js)
   Tipos soportados en header: text, date, select, number, boolean, ut,
   finca, evaluador, textarea.
   ------------------------------------------------------------------- */
const PROCESOS = {
  previo: {
    key: "previo",
    label: "Previo",
    labelLargo: "Previo — Verificación de condiciones",
    codigoFormato: "QM_F-26A",
    guia: "QM_G-036",
    pointSectionTitle: "Puntos de verificación de humedad",
    pointSectionDesc: "Registra la prueba del puño (capacidad de campo) en distintos puntos del lote antes de aplicar. El manual señala que las condiciones previas del terreno son «el 80% del éxito».",
    pointItemLabel: "punto de humedad",
    header: [
      { id: "fecha", label: "Fecha", type: "date", required: true },
      { id: "ut_codigo", label: "UT / Lote", type: "ut", required: true },
      { id: "zona", label: "Zona", type: "text" },
      { id: "finca", label: "Finca", type: "finca" },
      { id: "ciclo", label: "Ciclo de siembra", type: "select", options: ["C1", "C2"] },
      { id: "historial_fitosanitario", label: "Historial fitosanitario del lote", type: "select", options: ["Alto riesgo (Fusarium / nematodos)", "Bajo riesgo"] },
      { id: "dat_aplicacion", label: "DAT respecto al trasplante programado", type: "number", step: "1", tol: "ventana_dat" },
      { id: "dosis_planificada_lmz", label: "Dosis planificada (L/mz)", type: "number", step: "1", tol: "dosis_lmz" },
      { id: "responsable", label: "Responsable de campo / cuadrilla", type: "text" },
      { id: "evaluador", label: "Evaluador SIC", type: "evaluador", required: true }
    ],
    point: [
      { id: "humedad_ok", label: "Prueba del puño conforme", type: "boolean", tol: "humedad_pct" },
      { id: "profundidad_muestreo_cm", label: "Profundidad de muestreo (cm)", type: "number", step: "1", tol: "profundidad_muestreo_cm" }
    ]
  },
  durante: {
    key: "durante",
    label: "Durante",
    labelLargo: "Durante — Aplicación y válvulas",
    codigoFormato: "QM_F-26B",
    guia: "QM_G-036",
    pointSectionTitle: "Válvulas medidas",
    pointSectionDesc: "Registra la presión de cada válvula durante la aplicación.",
    pointItemLabel: "válvula",
    pointMax: 20,
    header: [
      { id: "fecha", label: "Fecha", type: "date", required: true },
      { id: "ut_codigo", label: "UT / Lote", type: "ut", required: true },
      { id: "zona", label: "Zona", type: "text" },
      { id: "finca", label: "Finca", type: "finca" },
      { id: "area_evaluada_mz", label: "Área (manzanas)", type: "number", step: "0.1", required: true },
      { id: "turno", label: "Turno", type: "select", options: ["Mañana", "Tarde"], required: true },
      { id: "franja_horaria", label: "Franja horaria de aplicación", type: "select", options: ["7–10 a.m.", "3–6 p.m.", "Fuera de franja"] },
      { id: "operador", label: "Operador de aplicación", type: "text", required: true },
      { id: "evaluador", label: "Evaluador SIC", type: "evaluador", required: true },
      { id: "tiempo_aplicacion_min", label: "Tiempo de aplicación (min)", type: "number", step: "1", tol: "tiempo_aplicacion_min" },
      { id: "concentracion_ppm", label: "Concentración programada (ppm)", type: "number", step: "10", tol: "concentracion_ppm" },
      { id: "dosis_planificada_lmz", label: "Dosis planificada (L/mz)", type: "number", step: "1" },
      { id: "litros_aplicados", label: "Litros aplicados", type: "number", step: "1" },
      { id: "epp_uso", label: "Uso de EPP", type: "boolean", tol: "epp_pct" }
    ],
    point: [
      { id: "presion_psi", label: "Presión (PSI)", type: "number", step: "0.1", tol: "presion_psi" }
    ],
    computed: [
      { id: "total_litros", label: "Total litros aplicados", unit: "L", decimals: 1,
        calc: (h) => (h.litros_aplicados === "" || h.litros_aplicados == null) ? null : Number(h.litros_aplicados) },
      { id: "dosis_aplicada_lmz", label: "Dosis aplicada", unit: "L/mz", decimals: 1,
        calc: (h) => {
          const lit = Number(h.litros_aplicados), area = Number(h.area_evaluada_mz);
          if (!lit || !area) return null;
          return lit / area;
        } },
      { id: "presion_promedio_psi", label: "Presión promedio", unit: "PSI", decimals: 1,
        calc: (h, pts) => {
          const vals = (pts || []).map(p => p.presion_psi).filter(v => v !== "" && v !== null && v !== undefined && !isNaN(v)).map(Number);
          if (!vals.length) return null;
          return vals.reduce((a, b) => a + b, 0) / vals.length;
        } },
      { id: "dosis_planificada_lmz", label: "Dosis planificada", unit: "L/mz", decimals: 1,
        calc: (h) => (h.dosis_planificada_lmz === "" || h.dosis_planificada_lmz == null) ? null : Number(h.dosis_planificada_lmz) }
    ],
    // Métrica destacada: barra de cumplimiento de dosis (aplicada vs. planificada).
    computedHighlight: {
      label: "Cumplimiento de dosis",
      calc: (h, pts) => {
        const lit = Number(h.litros_aplicados), area = Number(h.area_evaluada_mz), plan = Number(h.dosis_planificada_lmz);
        if (!lit || !area || !plan) return null;
        const aplicada = lit / area;
        return { pct: (aplicada / plan) * 100, delta: aplicada - plan };
      }
    }
  },
  post: {
    key: "post",
    label: "Post",
    labelLargo: "Post — Cierre y decisión",
    codigoFormato: "QM_F-26C",
    guia: "QM_G-036",
    pointSectionTitle: "Puntos de verificación de germinación",
    pointSectionDesc: "Registra el resultado de la prueba de germinación / fitotoxicidad por submuestra tomada del lote.",
    pointItemLabel: "submuestra",
    gateField: "decision_final",
    gateFailValues: ["NO APTO"],
    header: [
      { id: "fecha", label: "Fecha", type: "date", required: true },
      { id: "ut_codigo", label: "UT / Lote", type: "ut", required: true },
      { id: "zona", label: "Zona", type: "text" },
      { id: "finca", label: "Finca", type: "finca" },
      { id: "evaluador", label: "Evaluador SIC", type: "evaluador", required: true },
      { id: "tiempo_lavado_horas", label: "Tiempo de lavado (h)", type: "number", step: "0.1", tol: "tiempo_lavado_horas" },
      { id: "postriego_sellado", label: "Post-riego / sellado del gas ejecutado", type: "boolean", tol: "postriego_pct" },
      { id: "ventilacion_dat", label: "Período de ventilación (DAT)", type: "number", step: "1", tol: "ventilacion_dat" },
      { id: "decision_final", label: "Decisión final del lote", type: "select", options: ["APTO", "NO APTO"], required: true }
    ],
    point: [
      { id: "germinacion_ok", label: "Germinación / fitotoxicidad conforme", type: "boolean", tol: "germinacion_pct" }
    ]
  }
};

// Campos comunes de cierre / trazabilidad, agregados al final de cualquier
// evaluación (las tres etapas).
const CIERRE_FIELDS = [
  { id: "observaciones", label: "Observaciones", type: "textarea" },
  { id: "accion_correctiva", label: "Acción correctiva", type: "textarea" },
  { id: "responsable_correccion", label: "Responsable de la corrección", type: "text" },
  { id: "fecha_verificacion", label: "Fecha de verificación", type: "date" },
  { id: "estado", label: "Estado de la no conformidad", type: "select", options: ["N/A", "Abierta", "Cerrada"] }
];

const EMPRESA = "Agropecuaria Montelíbano S.A. de C.V.";

// Finca deducida del código de UT (los dos primeros dígitos identifican la
// finca). Se mantiene como una sola fuente de verdad para el formulario, el
// PDF, el Excel y el dashboard.
const FINCA_POR_PREFIJO = {
  "2001": "Montelíbano",
  "2002": "Montelíbano",
  "2003": "Montelíbano",
  "2004": "Apacilagua",
  "2005": "Porvenir"
};
// El resto de prefijos (1001, 1002, 1003) corresponden a Santa Rosa.
function fincaDeUt(codigo) {
  if (!codigo) return "";
  const prefijo = String(codigo).slice(0, 4);
  return FINCA_POR_PREFIJO[prefijo] || "Santa Rosa";
}
