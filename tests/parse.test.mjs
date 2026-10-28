import assert from 'node:assert/strict';
import { parseFundPage } from '../scripts/parse.mjs';
// Fixtures: texto tal y como lo vimos renderizado de las fichas públicas (NO es el HTML real; ver README).
const sp = `<div>Kaufen</div><span>585,95 EUR</span> <span>-10,43 EUR</span> <span>-1,75 %</span><span>23.10.26</span>
 <h2>Amundi S&P 500 Screened INDEX AE Fonds aktueller Kurs</h2><table><tr><td>Kurs</td><td>585,95 EUR</td></tr><tr><td>Kursdatum</td><td>23.10.2026</td></tr></table> ISIN: LU0996179007`;
assert.deepEqual(parseFundPage(sp, 'LU0996179007').nav, 585.95);
assert.equal(parseFundPage(sp, 'LU0996179007').date, '2026-10-23');
const wd = `<h2>Nettoinventarwert (NAV)</h2><table><tr><td>440,90 EUR</td><td>3,56 EUR</td><td>0,81 %</td></tr></table><table><tr><td><b>Vortag</b></td><td>437,34 EUR</td><td><b>Datum</b></td><td>21.10.2026</td></tr></table> LU0996182563`;
const r = parseFundPage(wd, 'LU0996182563'); assert.equal(r.nav, 440.9); assert.equal(r.date, '2026-10-21');
assert.ok(parseFundPage(sp, 'LU0000000000').error, 'ISIN distinto debe rechazarse');
assert.ok(parseFundPage('<html>nada LU0996179007</html>', 'LU0996179007').error);
const bad = sp.replace('Kurs</td><td>585,95', 'Kurs</td><td>999,95');
assert.ok(parseFundPage(bad, 'LU0996179007').error, 'patrones en desacuerdo → rechazo');
const big = parseFundPage('<p>Kurs 1.234,56 EUR Kursdatum 01.02.2026 LU1</p>', 'LU1'); assert.equal(big.nav, 1234.56);
console.log('parse tests OK');
