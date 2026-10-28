// store.js — datos privados SOLO en este dispositivo (localStorage). Nada de esto se sube a ningún sitio.
import { isoToday, isIso } from './calc.js';

const KEY = 'cartera.v1';
const NAVCACHE = 'cartera.navcache.v1';

export function defaults() {
  return {
    v: 1,
    config: {
      funds: [
        { id: 'sp', nombre: 'Amundi IS S&P 500 AE-C', corto: 'S&P 500', isin: 'LU0996179007', participaciones: 117.30809, capital: 45149.98, desde: '2025-06-19' },
        { id: 'wd', nombre: 'Amundi Index MSCI World AE-C', corto: 'MSCI World', isin: 'LU0996182563', participaciones: 26.41838, capital: 10684.52, desde: '2026-02-06' },
        { id: 'em', nombre: 'Amundi Index MSCI Emerging Markets IE-C', corto: 'Emerging Markets', isin: 'LU0996175948', participaciones: 32.87831, capital: 7899.2, desde: '2026-02-07' },
      ],
      fechaBase: '2026-10-27', // fecha en la que las participaciones/capital de arriba son correctos
      edad: 23, edadRef: '2026-10-27', cumple: '01-04', edadObjetivo: 55,
      rentEsperada: 7,
      aportacion: { activa: false, mensual: 500, reparto: { sp: 100, wd: 250, em: 150 }, inicio: '2026-11-01' },
      objetivos: [100000, 150000, 200000, 300000, 500000],
      tema: 'auto',
    },
    movs: [],
    manualNav: {}, // { fondoId: [{d, nav}] }  valores liquidativos escritos a mano
    snaps: [],     // [{d,total,capital,f:{id:valor}}]  una foto por día
    seq: 1,
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    return sanitize(JSON.parse(raw));
  } catch {
    return defaults();
  }
}
export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch { return false; }
}

// Completa lo que falte con valores por defecto y descarta lo que no tenga sentido (también para importar).
export function sanitize(o) {
  const d = defaults();
  if (!o || typeof o !== 'object' || !o.config || !Array.isArray(o.config.funds) || o.config.funds.length < 1) throw new Error('Archivo no válido');
  const num = (x, def) => (Number.isFinite(+x) ? +x : def);
  const c = o.config;
  const out = {
    v: 1,
    config: {
      funds: c.funds.slice(0, 8).map((f, i) => ({
        id: String(f.id || 'f' + i).replace(/[^a-z0-9_-]/gi, '').slice(0, 12) || 'f' + i,
        nombre: String(f.nombre ?? '').slice(0, 80),
        corto: String(f.corto ?? f.nombre ?? '').slice(0, 30),
        isin: String(f.isin ?? '').toUpperCase().replace(/\s/g, '').slice(0, 12),
        participaciones: Math.max(0, num(f.participaciones, 0)),
        capital: Math.max(0, num(f.capital, 0)),
        desde: isIso(f.desde) ? f.desde : '',
      })),
      fechaBase: isIso(c.fechaBase) ? c.fechaBase : d.config.fechaBase,
      edad: num(c.edad, d.config.edad), edadRef: isIso(c.edadRef) ? c.edadRef : d.config.edadRef,
      cumple: /^\d{2}-\d{2}$/.test(c.cumple || '') ? c.cumple : '',
      edadObjetivo: num(c.edadObjetivo, d.config.edadObjetivo),
      rentEsperada: num(c.rentEsperada, d.config.rentEsperada),
      aportacion: {
        activa: !!(c.aportacion && c.aportacion.activa),
        mensual: Math.max(0, num(c.aportacion?.mensual, 500)),
        reparto: typeof c.aportacion?.reparto === 'object' && c.aportacion.reparto ? Object.fromEntries(Object.entries(c.aportacion.reparto).map(([k, v]) => [k, Math.max(0, num(v, 0))])) : d.config.aportacion.reparto,
        inicio: isIso(c.aportacion?.inicio) ? c.aportacion.inicio : d.config.aportacion.inicio,
      },
      objetivos: Array.isArray(c.objetivos) ? c.objetivos.map(Number).filter((x) => x > 0).slice(0, 12) : d.config.objetivos,
      tema: ['auto', 'light', 'dark'].includes(c.tema) ? c.tema : 'auto',
    },
    movs: Array.isArray(o.movs) ? o.movs.filter((m) => m && isIso(m.fecha) && ['aportacion', 'retirada', 'traspaso'].includes(m.tipo) && m.importe > 0 && m.participaciones > 0) : [],
    manualNav: {},
    snaps: Array.isArray(o.snaps) ? o.snaps.filter((s) => s && isIso(s.d) && s.total > 0).slice(-4000) : [],
    seq: num(o.seq, 1),
  };
  if (o.manualNav && typeof o.manualNav === 'object') {
    for (const [k, arr] of Object.entries(o.manualNav)) {
      if (Array.isArray(arr)) out.manualNav[k] = arr.filter((x) => x && isIso(x.d) && x.nav > 0);
    }
  }
  out.seq = Math.max(out.seq, ...out.movs.map((m) => (m.id || 0) + 1), 1);
  return out;
}

export function loadNavCache() {
  try { return JSON.parse(localStorage.getItem(NAVCACHE) || 'null'); } catch { return null; }
}
export function saveNavCache(c) {
  try { localStorage.setItem(NAVCACHE, JSON.stringify(c)); } catch { /* sin espacio: no pasa nada */ }
}

// Foto diaria del patrimonio (solo si hay valoración completa).
export function recordSnapshot(state, valuation) {
  if (!valuation.completo || !(valuation.total > 0)) return false;
  const d = isoToday();
  const snap = { d, total: valuation.total, capital: valuation.capital, f: Object.fromEntries(valuation.rows.map((r) => [r.id, r.valor])) };
  const i = state.snaps.findIndex((s) => s.d === d);
  if (i >= 0) state.snaps[i] = snap; else state.snaps.push(snap);
  state.snaps.sort((a, b) => (a.d < b.d ? -1 : 1));
  return true;
}

export function exportJSON(state) {
  return JSON.stringify({ ...state, exportado: new Date().toISOString() }, null, 2);
}
