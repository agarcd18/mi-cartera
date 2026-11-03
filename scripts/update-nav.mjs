// update-nav.mjs — descarga el valor liquidativo PÚBLICO de cada fondo y actualiza data/nav.json y data/nav-history.json.
// Sin credenciales ni datos privados. Cadena de fuentes por fondo: finanzen (sources.json) → Yahoo → FT.
// Reglas: nunca inventa un dato; si un fondo falla conserva el último valor válido y lo registra en "errors".
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseFundPage } from './parse.mjs';
import { fromYahoo, fromFT } from './fetchers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = async (p, def) => { try { return JSON.parse(await readFile(join(root, p), 'utf8')); } catch { return def; } };
const sources = await rd('scripts/sources.json', {});
const nav = await rd('data/nav.json', { funds: {}, errors: {} });
const hist = await rd('data/nav-history.json', {});
nav.funds ||= {}; nav.errors = {};

const MAX_JUMP = 0.15;       // salto > 15 % respecto al último dato guardado: sospechoso
const MAX_JUMP_OTHER = 0.08; // fuentes alternativas: más estricto (por si es otra clase de participación)
let okCount = 0;

async function fromFinanzen(isin, url) {
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; mi-cartera-personal/1.0)', 'accept-language': 'de,es;q=0.8' } });
    const body = await res.text();
    console.log(`  ${url} → HTTP ${res.status}, ${body.length} bytes`);
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const r = parseFundPage(body, isin);
    return r.error ? r : { ...r, source: new URL(url).hostname.replace(/^www\./, '') };
  } catch (e) { return { error: e.message }; } finally { clearTimeout(to); }
}

for (const [isin, urls] of Object.entries(sources)) {
  const chain = [...urls.map((u) => ({ n: 'finanzen', strict: false, f: () => fromFinanzen(isin, u) })),
    { n: 'yahoo', strict: true, f: () => fromYahoo(isin) }, { n: 'ft', strict: true, f: () => fromFT(isin) }];
  const h = (hist[isin] ||= []);
  const last = h.length ? h[h.length - 1] : null;
  let got = null; const fails = [];
  for (const s of chain) {
    let r;
    try { r = await s.f(); } catch (e) { r = { error: e.message }; }
    if (r.error) { fails.push(`${s.n}: ${r.error}`); continue; }
    const lim = s.strict ? MAX_JUMP_OTHER : MAX_JUMP;
    if (last && r.date > last[0] && Math.abs(r.nav / last[1] - 1) > lim) { fails.push(`${s.n}: salto sospechoso ${last[1]} → ${r.nav} (${r.date})`); continue; }
    got = r; break;
  }
  if (!got) { nav.errors[isin] = fails.join(' | '); console.error(`✗ ${isin}: ${nav.errors[isin]}`); continue; }
  if (last && got.date < last[0]) { console.log(`= ${isin}: dato (${got.date}) más antiguo que el guardado (${last[0]}); se ignora`); okCount++; continue; }
  nav.funds[isin] = { nav: got.nav, date: got.date, source: got.source };
  const have = new Set(h.map((p) => p[0]));
  for (const p of got.history || [[got.date, got.nav]]) if (!have.has(p[0])) h.push(p);
  h.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  console.log(`✓ ${isin}: ${got.nav} (${got.date}) vía ${got.source}`);
  okCount++;
}

nav.generated = new Date().toISOString();
delete nav.note;
await writeFile(join(root, 'data/nav.json'), JSON.stringify(nav, null, 2) + '\n');
await writeFile(join(root, 'data/nav-history.json'), JSON.stringify(hist) + '\n');
if (okCount === 0) { console.error('No se pudo actualizar ningún fondo con ninguna fuente.'); process.exit(1); }
