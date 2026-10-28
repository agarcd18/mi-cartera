import assert from 'node:assert/strict';
import {
  r2, parseNum, valuePortfolio, replay, positionAt, prepareMovement, buildSeries, sliceRange,
  periodStats, futureValue, projectYearly, monthsToGoal, addMonths, addDays, daysBetween,
  mergeNavSeries, navOnOrBefore, freshness, ageOn,
} from '../js/calc.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok  ', name); };
const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

const funds = [
  { id: 'sp', participaciones: 117.30809, capital: 45149.98 },
  { id: 'wd', participaciones: 26.41838, capital: 10684.52 },
  { id: 'em', participaciones: 32.87831, capital: 7899.2 },
];

t('capital total = 63.733,70', () => near(funds.reduce((s, f) => s + f.capital, 0), 63733.7));

t('valor de referencia del usuario (NAV implícitos) = 91.626,55 / +43,77 %', () => {
  const nav = { sp: { nav: 70820.07 / 117.30809, date: 'x' }, wd: { nav: 11684.06 / 26.41838, date: 'x' }, em: { nav: 9122.42 / 32.87831, date: 'x' } };
  const pos = Object.fromEntries(funds.map((f) => [f.id, { units: f.participaciones, capital: f.capital }]));
  const v = valuePortfolio(funds, pos, nav);
  near(v.total, 91626.55); near(v.ganancia, 27892.85); near(v.rent, 43.77);
});

t('valoración con NAV públicos (23/21-oct-2026)', () => {
  const nav = { sp: { nav: 585.95, date: '2026-10-23' }, wd: { nav: 440.9, date: '2026-10-21' }, em: { nav: 259.47, date: '2026-10-21' } };
  const pos = Object.fromEntries(funds.map((f) => [f.id, { units: f.participaciones, capital: f.capital }]));
  const v = valuePortfolio(funds, pos, nav);
  near(v.rows[0].valor, 68736.68); near(v.rows[1].valor, 11647.86); near(v.rows[2].valor, 8530.94);
  near(v.total, 88915.47); near(v.ganancia, 25181.77); near(v.rent, 39.51);
  near(v.rows.reduce((s, r) => s + r.peso, 0), 100, 1e-9);
});

t('sin NAV de un fondo → completo=false, no inventa', () => {
  const pos = Object.fromEntries(funds.map((f) => [f.id, { units: f.participaciones, capital: f.capital }]));
  const v = valuePortfolio(funds, pos, { sp: { nav: 500, date: 'x' }, wd: null, em: null });
  assert.equal(v.completo, false); assert.equal(v.rows[1].valor, null);
});

t('parseNum formatos españoles', () => {
  assert.equal(parseNum('1.234,56'), 1234.56);
  assert.equal(parseNum('117,30809'), 117.30809);
  assert.equal(parseNum('45149.98'), 45149.98);
  assert.equal(parseNum('1,234.56'), 1234.56);
  assert.equal(parseNum('10.000', { dotThousands: true }), 10000);
  assert.equal(parseNum('150.000 €', { dotThousands: true }), 150000);
  assert.ok(Number.isNaN(parseNum('abc')));
});

t('fechas', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-10-27', -12), '2025-10-27');
  assert.equal(addDays('2026-10-27', 5), '2026-11-01');
  assert.equal(daysBetween('2026-10-21', '2026-10-27'), 6);
});

t('aportación suma capital y participaciones', () => {
  const movs = [{ id: 1, tipo: 'aportacion', fecha: '2026-11-01', fondo: 'sp', importe: 100, participaciones: 0.17 }];
  const { pos } = replay(funds, movs);
  near(pos.sp.capital, 45249.98); near(pos.sp.units, 117.47809, 1e-9);
  near(pos.wd.capital, 10684.52);
});

t('traspaso NO cambia el capital total aportado', () => {
  const movs = [{ id: 1, tipo: 'traspaso', fecha: '2026-11-01', fondo: 'sp', destino: 'wd', importe: 5000, participaciones: 8.5, participacionesDestino: 11.3 }];
  const { pos } = replay(funds, movs);
  const total = Object.values(pos).reduce((s, p) => s + p.capital, 0);
  near(total, 63733.7, 1e-6);
  const coste = 45149.98 * (8.5 / 117.30809);
  near(pos.sp.capital, 45149.98 - coste, 1e-6);
  near(pos.wd.capital, 10684.52 + coste, 1e-6);
  near(pos.sp.units, 117.30809 - 8.5, 1e-9); near(pos.wd.units, 26.41838 + 11.3, 1e-9);
});

t('retirada reduce capital a coste medio y participaciones', () => {
  const movs = [{ id: 1, tipo: 'retirada', fecha: '2026-11-01', fondo: 'em', importe: 1000, participaciones: 3.2878310 }];
  const { pos } = replay(funds, movs);
  near(pos.em.units, 32.87831 - 3.287831, 1e-9);
  near(pos.em.capital, 7899.2 * 0.9, 1e-6);
});

t('prepareMovement: estima participaciones con NAV y valida', () => {
  const navFor = () => ({ nav: 500, d: '2026-11-01', exacto: true });
  const posActual = Object.fromEntries(funds.map((f) => [f.id, { units: f.participaciones, capital: f.capital }]));
  const ok = prepareMovement({ tipo: 'aportacion', fecha: '2026-10-01', fondo: 'sp', importe: 250 }, { funds, fechaBase: '2026-09-01', navFor, posActual });
  assert.ok(ok.mov); near(ok.mov.participaciones, 0.5, 1e-12); assert.equal(ok.mov.estimado, true);
  const bad = prepareMovement({ tipo: 'aportacion', fecha: '2026-08-01', fondo: 'sp', importe: 250 }, { funds, fechaBase: '2026-09-01', navFor, posActual });
  assert.ok(bad.error);
  const tooMuch = prepareMovement({ tipo: 'retirada', fecha: '2026-10-01', fondo: 'em', importe: 99999, participaciones: 999 }, { funds, fechaBase: '2026-09-01', navFor, posActual });
  assert.ok(tooMuch.error);
  const same = prepareMovement({ tipo: 'traspaso', fecha: '2026-10-01', fondo: 'sp', destino: 'sp', importe: 10 }, { funds, fechaBase: '2026-09-01', navFor, posActual });
  assert.ok(same.error);
});

t('serie histórica: aportación no cuenta como rentabilidad del periodo', () => {
  const navSeries = {
    sp: [['2026-10-01', 100], ['2026-10-10', 100], ['2026-10-20', 100]],
    wd: [['2026-10-01', 100], ['2026-10-20', 100]],
    em: [['2026-10-01', 100], ['2026-10-20', 100]],
  };
  const f3 = [{ id: 'sp', participaciones: 10, capital: 1000 }, { id: 'wd', participaciones: 0, capital: 0 }, { id: 'em', participaciones: 0, capital: 0 }];
  const movs = [{ id: 1, tipo: 'aportacion', fecha: '2026-10-10', fondo: 'sp', importe: 500, participaciones: 5 }];
  const { efectos } = replay(f3, movs);
  const s = buildSeries({ funds: f3, navSeries, efectos, from: '2026-10-01', to: '2026-10-20' });
  const st = periodStats(s);
  near(st.ganancia, 0, 1e-9); near(st.aportado, 500, 1e-9);
  near(s.at(-1).total, 1500, 1e-9);
});

t('sliceRange', () => {
  const series = [{ d: '2026-01-01' }, { d: '2026-09-01' }, { d: '2026-10-20' }];
  assert.equal(sliceRange(series, '1M', '2026-10-27').pts[0].d, '2026-09-01');
  assert.equal(sliceRange(series, 'MAX', '2026-10-27').pts.length, 3);
  assert.equal(sliceRange(series, '1A', '2026-10-27').cubierto, false);
});

t('mergeNavSeries: manual gana en la misma fecha; ordena', () => {
  const m = mergeNavSeries({ history: [['2026-10-02', 2], ['2026-10-01', 1]], latest: { date: '2026-10-03', nav: 3 }, manual: [{ d: '2026-10-02', nav: 9 }] });
  assert.deepEqual(m.serie, [['2026-10-01', 1], ['2026-10-02', 9], ['2026-10-03', 3]]);
  assert.equal(navOnOrBefore(m.serie, '2026-10-02.5'.slice(0, 10)).nav, 9);
  assert.equal(navOnOrBefore(m.serie, '2026-09-01'), null);
});

t('freshness', () => {
  assert.equal(freshness('2026-10-23', '2026-10-27').nivel, 'ok');
  assert.equal(freshness('2026-10-21', '2026-10-27').nivel, 'aviso');
  assert.equal(freshness('2026-10-01', '2026-10-27').nivel, 'viejo');
});

t('proyección: 91.626 €, 7 %, 500 €/mes', () => {
  // Valores calculados de forma independiente: capital·1.07^n + 500·12·((1.07^n−1)/(12·(1.07^(1/12)−1)))
  const rm = Math.pow(1.07, 1 / 12) - 1;
  for (const y of [30, 35, 40, 45, 50, 55]) {
    const nm = y * 12;
    const exp = 91626 * Math.pow(1 + rm, nm) + 500 * ((Math.pow(1 + rm, nm) - 1) / rm);
    near(futureValue({ capital: 91626, annualPct: 7, monthly: 500, years: y }), exp, 1e-6);
  }
  // sin rentabilidad: suma simple
  near(futureValue({ capital: 1000, annualPct: 0, monthly: 100, years: 2 }), 3400, 1e-9);
  // sin aportaciones: interés compuesto anual exacto
  near(futureValue({ capital: 1000, annualPct: 7, monthly: 0, years: 10 }), 1000 * 1.07 ** 10, 1e-6);
  // 1 año, 12 aportaciones
  const y1 = projectYearly({ capital: 0, annualPct: 7, monthly: 100, years: 1 });
  near(y1[1].aportado, 1200, 1e-9);
  assert.ok(y1[1].valor > 1200 && y1[1].valor < 1250);
});

t('meses hasta objetivo', () => {
  assert.equal(monthsToGoal({ capital: 200, annualPct: 7, monthly: 0, goal: 100 }), 0);
  const m = monthsToGoal({ capital: 1000, annualPct: 0, monthly: 100, goal: 2000 });
  assert.equal(m, 10);
  assert.equal(monthsToGoal({ capital: 1, annualPct: 0, monthly: 0, goal: 2 }), null);
});

t('progreso de objetivo: 91.626/150.000 = 61,08 %', () => near((91626 / 150000) * 100, 61.084, 0.001));

t('edad: 23 hoy, 24 el 4 de enero', () => {
  const a = { edad: 23, ref: '2026-10-27', cumple: '01-04' };
  assert.equal(ageOn(a, '2027-01-03'), 23);
  assert.equal(ageOn(a, '2027-01-04'), 24);
  assert.equal(ageOn(a, '2058-01-04'), 55);
});

console.log(`\n${n} tests OK`);
