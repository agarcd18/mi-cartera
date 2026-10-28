// calc.js — lógica pura (sin DOM). Se usa en la app y en los tests de Node.
// Convención: fechas como texto ISO "YYYY-MM-DD"; importes en euros.

export const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

/* ───────────── Fechas ───────────── */
export function isoToday(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
const toUTC = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export function daysBetween(a, b) {
  return Math.round((toUTC(b) - toUTC(a)) / 86400000);
}
export function addDays(iso, n) {
  const d = new Date(toUTC(iso) + n * 86400000);
  return d.toISOString().slice(0, 10);
}
export function addMonths(iso, n) {
  const d = new Date(toUTC(iso));
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}
export const isIso = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toUTC(s));

/* ───────────── Números escritos a mano ───────────── */
// Acepta "1.234,56", "1234,56", "1234.56", "117,30809".
// dotThousands=true: un único punto seguido de 3 dígitos se entiende como separador de miles ("10.000").
export function parseNum(input, { dotThousands = false } = {}) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : NaN;
  let s = String(input ?? '').trim().replace(/[\s€% ]/g, '');
  if (!s) return NaN;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (hasComma) {
    s = s.replace(',', '.');
  } else if (hasDot) {
    const dots = (s.match(/\./g) || []).length;
    if (dots > 1) s = s.replace(/\./g, '');
    else if (dotThousands && /^\d{1,3}\.\d{3}$/.test(s)) s = s.replace('.', '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/* ───────────── Series de valor liquidativo ───────────── */
// serie: [[iso, nav], ...] ordenada por fecha ascendente
export function navOnOrBefore(serie, date) {
  if (!serie || !serie.length) return null;
  let lo = 0, hi = serie.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (serie[mid][0] <= date) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans >= 0 ? { d: serie[ans][0], nav: serie[ans][1] } : null;
}

// Une histórico automático + último dato automático + valores manuales (el manual gana en la misma fecha).
export function mergeNavSeries({ history = [], latest = null, manual = [] }) {
  const map = new Map();
  const put = (d, nav, src) => {
    if (!isIso(d) || !(Number(nav) > 0)) return;
    map.set(d, { nav: Number(nav), src });
  };
  for (const [d, nav] of history) put(d, nav, 'auto');
  if (latest && latest.date) put(latest.date, latest.nav, 'auto');
  for (const m of manual) put(m.d, m.nav, 'manual');
  const dates = [...map.keys()].sort();
  return {
    serie: dates.map((d) => [d, map.get(d).nav]),
    fuente: Object.fromEntries(dates.map((d) => [d, map.get(d).src])),
  };
}

// Antigüedad del dato: 'ok' ≤ 4 días (cubre fines de semana), 'aviso' 5-7, 'viejo' > 7
export function freshness(navDate, today) {
  if (!navDate) return { dias: null, nivel: 'sin-dato' };
  const dias = daysBetween(navDate, today);
  return { dias, nivel: dias <= 4 ? 'ok' : dias <= 7 ? 'aviso' : 'viejo' };
}

/* ───────────── Valoración de la cartera ───────────── */
// pos: {id: {units, capital}}; navInfo: {id: {nav, date}|null}
export function valuePortfolio(funds, pos, navInfo) {
  const rows = funds.map((f) => {
    const p = pos[f.id] || { units: 0, capital: 0 };
    const n = navInfo[f.id];
    const valor = n && n.nav > 0 ? p.units * n.nav : null;
    const ganancia = valor === null ? null : valor - p.capital;
    return {
      id: f.id,
      units: p.units,
      capital: p.capital,
      nav: n ? n.nav : null,
      navDate: n ? n.date : null,
      valor,
      ganancia,
      rent: valor !== null && p.capital > 0 ? (ganancia / p.capital) * 100 : null,
      peso: 0,
    };
  });
  const completo = rows.every((r) => r.valor !== null);
  const total = rows.reduce((s, r) => s + (r.valor ?? 0), 0);
  const capital = rows.reduce((s, r) => s + r.capital, 0);
  for (const r of rows) r.peso = r.valor !== null && total > 0 ? (r.valor / total) * 100 : 0;
  const ganancia = total - capital;
  return {
    rows,
    total,
    capital,
    ganancia,
    rent: capital > 0 ? (ganancia / capital) * 100 : null,
    completo,
  };
}

/* ───────────── Movimientos ───────────── */
// Un movimiento guardado: {id, ord, tipo:'aportacion'|'retirada'|'traspaso', fecha, fondo, destino?,
//   importe, participaciones, participacionesDestino?, estimado?, nota?}
// Las participaciones se fijan al crear el movimiento (reales o estimadas) y NO cambian después.

export function sortMovs(movs) {
  return [...movs].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.ord ?? 0) - (b.ord ?? 0)));
}

// Reproduce los movimientos sobre la posición base. Devuelve posición final y el efecto de cada movimiento.
// Retirada y traspaso reducen el coste (capital aportado) del fondo de origen en proporción a las
// participaciones vendidas/traspasadas (coste medio). El traspaso traslada ese coste al fondo destino,
// por lo que el capital aportado TOTAL no cambia.
export function replay(funds, movs) {
  const pos = {};
  for (const f of funds) pos[f.id] = { units: f.participaciones, capital: f.capital };
  const efectos = [];
  const avisos = [];
  for (const m of sortMovs(movs)) {
    const e = { id: m.id, fecha: m.fecha, units: {}, capital: {} };
    const o = pos[m.fondo];
    if (!o) { avisos.push(`Movimiento ${m.id}: fondo desconocido`); continue; }
    if (m.tipo === 'aportacion') {
      e.units[m.fondo] = m.participaciones;
      e.capital[m.fondo] = m.importe;
    } else if (m.tipo === 'retirada' || m.tipo === 'traspaso') {
      const u = Math.min(m.participaciones, o.units);
      if (m.participaciones > o.units * (1 + 1e-9)) {
        avisos.push(`El ${m.tipo} del ${m.fecha} vende más participaciones (${m.participaciones}) de las que había (${o.units.toFixed(5)}).`);
      }
      const frac = o.units > 0 ? u / o.units : 0;
      const coste = o.capital * frac;
      e.units[m.fondo] = -u;
      e.capital[m.fondo] = -coste;
      if (m.tipo === 'traspaso') {
        const d = pos[m.destino];
        if (!d) { avisos.push(`Traspaso ${m.id}: destino desconocido`); continue; }
        e.units[m.destino] = m.participacionesDestino;
        e.capital[m.destino] = coste;
      }
    }
    for (const id of Object.keys(e.units)) {
      pos[id].units += e.units[id];
      pos[id].capital += e.capital[id];
    }
    efectos.push(e);
  }
  return { pos, efectos, avisos };
}

// Posición (participaciones y capital) de cada fondo en una fecha: base + efectos con fecha ≤ d
export function positionAt(funds, efectos, date) {
  const pos = {};
  for (const f of funds) pos[f.id] = { units: f.participaciones, capital: f.capital };
  for (const e of efectos) {
    if (e.fecha > date) continue;
    for (const id of Object.keys(e.units)) {
      pos[id].units += e.units[id];
      pos[id].capital += e.capital[id];
    }
  }
  return pos;
}

// Valida y completa un movimiento nuevo. navFor(fondoId, fecha) → {nav, d, exacto} | null
export function prepareMovement(input, { funds, fechaBase, navFor, posActual }) {
  const err = [];
  const ids = funds.map((f) => f.id);
  const m = {
    tipo: input.tipo,
    fecha: input.fecha,
    fondo: input.fondo,
    importe: input.importe,
    nota: (input.nota || '').trim().slice(0, 140),
  };
  if (!['aportacion', 'retirada', 'traspaso'].includes(m.tipo)) err.push('Tipo de movimiento no válido.');
  if (!isIso(m.fecha)) err.push('Fecha no válida.');
  else if (m.fecha <= fechaBase) err.push(`La fecha debe ser posterior a la posición base (${fechaBase}). Lo anterior ya está incluido en tus participaciones iniciales; si hace falta, corrígelas en Ajustes.`);
  else if (m.fecha > isoToday()) err.push('La fecha no puede estar en el futuro.');
  if (!ids.includes(m.fondo)) err.push('Elige un fondo.');
  if (!(m.importe > 0)) err.push('El importe debe ser mayor que 0.');
  if (m.tipo === 'traspaso') {
    m.destino = input.destino;
    if (!ids.includes(m.destino)) err.push('Elige el fondo de destino.');
    else if (m.destino === m.fondo) err.push('Origen y destino deben ser distintos.');
  }
  if (err.length) return { error: err };

  let estimado = false;
  const unitsFor = (fondoId, given) => {
    if (given > 0) return given;
    const n = navFor(fondoId, m.fecha);
    if (!n) { err.push('No hay valor liquidativo para estimar las participaciones: indícalas a mano.'); return NaN; }
    estimado = true;
    return m.importe / n.nav;
  };
  m.participaciones = unitsFor(m.fondo, input.participaciones);
  if (m.tipo === 'traspaso') m.participacionesDestino = unitsFor(m.destino, input.participacionesDestino);
  if (err.length) return { error: err };
  if ((m.tipo === 'retirada' || m.tipo === 'traspaso') && posActual && m.participaciones > posActual[m.fondo].units * (1 + 1e-9)) {
    return { error: [`No tienes tantas participaciones en ese fondo (${posActual[m.fondo].units.toFixed(5)}).`] };
  }
  m.estimado = estimado;
  return { mov: m };
}

/* ───────────── Serie histórica de la cartera ───────────── */
// navSeries: {id: [[iso,nav],...]}
export function buildSeries({ funds, navSeries, efectos, from, to }) {
  const dates = new Set([from]);
  for (const f of funds) for (const [d] of navSeries[f.id] || []) if (d >= from && d <= to) dates.add(d);
  for (const e of efectos) if (e.fecha >= from && e.fecha <= to) dates.add(e.fecha);
  const out = [];
  for (const d of [...dates].sort()) {
    const pos = positionAt(funds, efectos, d);
    let total = 0, capital = 0, ok = true;
    const porFondo = {};
    for (const f of funds) {
      const n = navOnOrBefore(navSeries[f.id], d);
      if (!n) { ok = false; break; }
      const v = pos[f.id].units * n.nav;
      porFondo[f.id] = v;
      total += v;
      capital += pos[f.id].capital;
    }
    if (!ok) continue;
    out.push({ d, total, capital, ganancia: total - capital, rent: capital > 0 ? ((total - capital) / capital) * 100 : null, f: porFondo });
  }
  return out;
}

export const RANGOS = ['1S', '1M', '3M', '6M', '1A', 'MAX'];
export function rangeCutoff(rango, today) {
  switch (rango) {
    case '1S': return addDays(today, -7);
    case '1M': return addMonths(today, -1);
    case '3M': return addMonths(today, -3);
    case '6M': return addMonths(today, -6);
    case '1A': return addMonths(today, -12);
    default: return '0000-00-00';
  }
}

// Puntos del rango. Incluye el último punto anterior al corte como referencia (si existe).
export function sliceRange(series, rango, today) {
  if (!series.length) return { pts: [], cubierto: false };
  const cut = rangeCutoff(rango, today);
  let idx = series.findIndex((p) => p.d >= cut);
  if (idx === -1) idx = series.length - 1;
  const cubierto = rango === 'MAX' || series[0].d <= cut;
  if (idx > 0 && series[idx].d > cut) idx -= 1;
  return { pts: series.slice(idx), cubierto };
}

// Ganancia del periodo SIN contar aportaciones: Δvalor − Δcapital aportado.
export function periodStats(pts) {
  if (pts.length < 2) return null;
  const a = pts[0], b = pts[pts.length - 1];
  const ganancia = b.total - a.total - (b.capital - a.capital);
  return {
    desde: a.d, hasta: b.d,
    ganancia,
    pct: a.total > 0 ? (ganancia / a.total) * 100 : null,
    aportado: b.capital - a.capital,
    deltaValor: b.total - a.total,
  };
}

/* ───────────── Proyección ───────────── */
export const monthlyRate = (annualPct) => Math.pow(1 + annualPct / 100, 1 / 12) - 1;

// Capitalización mensual equivalente a la rentabilidad anual efectiva; aportaciones a final de cada mes.
export function futureValue({ capital, annualPct, monthly, years }) {
  const n = Math.round(years * 12);
  const rm = monthlyRate(annualPct);
  if (Math.abs(rm) < 1e-12) return capital + monthly * n;
  const g = Math.pow(1 + rm, n);
  return capital * g + monthly * ((g - 1) / rm);
}

export function projectYearly({ capital, annualPct, monthly, years, inflationPct = 0 }) {
  const out = [];
  for (let y = 0; y <= years; y++) {
    const valor = futureValue({ capital, annualPct, monthly, years: y });
    const aportado = capital + monthly * 12 * y;
    out.push({ year: y, valor, aportado, ganancia: valor - aportado, real: valor / Math.pow(1 + inflationPct / 100, y) });
  }
  return out;
}

export function monthsToGoal({ capital, annualPct, monthly, goal, maxMonths = 12 * 80 }) {
  if (capital >= goal) return 0;
  const rm = monthlyRate(annualPct);
  let v = capital;
  for (let m = 1; m <= maxMonths; m++) {
    v = v * (1 + rm) + monthly;
    if (v >= goal) return m;
  }
  return null;
}

/* ───────────── Edad ───────────── */
// edad indicada en la fecha ref; cumple 'MM-DD'. Suma los cumpleaños transcurridos en (ref, date].
export function ageOn({ edad, ref, cumple }, date) {
  if (!/^\d{2}-\d{2}$/.test(cumple || '') || !isIso(ref)) return edad;
  let k = 0;
  for (let y = +ref.slice(0, 4); y <= +date.slice(0, 4); y++) {
    const b = `${y}-${cumple}`;
    if (isIso(b) && b > ref && b <= date) k++;
  }
  return edad + k;
}
