// update-nav.mjs — descarga el valor liquidativo PÚBLICO de cada fondo y actualiza data/nav.json y data/nav-history.json.
// No usa credenciales ni datos privados. Se ejecuta en GitHub Actions una vez al día.
// Reglas: nunca inventa un dato; si un fondo falla conserva el último valor válido y lo registra en "errors".
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseFundPage } from './parse.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = async (p, def) => { try { return JSON.parse(await readFile(join(root, p), 'utf8')); } catch { return def; } };
const sources = await rd('scripts/sources.json', {});
const nav = await rd('data/nav.json', { funds: {}, errors: {} });
const hist = await rd('data/nav-history.json', {});
nav.funds ||= {}; nav.errors = {};

const MAX_JUMP = 0.15; // un salto diario > 15 % se considera sospechoso
let okCount = 0;

for (const [isin, urls] of Object.entries(sources)) {
  let got = null; const fails = [];
  for (const url of urls) {
    try {
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 20000);
      const res = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; mi-cartera-personal/1.0; consulta diaria personal)', 'accept-language': 'de,es;q=0.8' } });
      clearTimeout(to);
      if (!res.ok) { fails.push(`${url} → HTTP ${res.status}`); continue; }
      const r = parseFundPage(await res.text(), isin);
      if (r.error) { fails.push(`${url} → ${r.error}`); continue; }
      got = { ...r, source: new URL(url).hostname.replace(/^www\./, '') };
      break;
    } catch (e) { fails.push(`${url} → ${e.message}`); }
  }
  const prev = nav.funds[isin];
  if (!got) { nav.errors[isin] = fails.join(' | '); console.error(`✗ ${isin}: ${nav.errors[isin]}`); continue; }
  const h = (hist[isin] ||= []);
  const last = h.length ? h[h.length - 1] : null;
  if (last && got.date < last[0]) { console.log(`= ${isin}: dato (${got.date}) más antiguo que el guardado (${last[0]}); se ignora`); okCount++; continue; }
  if (last && got.date > last[0] && Math.abs(got.nav / last[1] - 1) > MAX_JUMP) {
    nav.errors[isin] = `Salto sospechoso ${last[1]} → ${got.nav} (${got.date}); no se guarda. Revísalo a mano.`;
    console.error(`✗ ${isin}: ${nav.errors[isin]}`); continue;
  }
  nav.funds[isin] = { nav: got.nav, date: got.date, source: got.source };
  if (!h.some((p) => p[0] === got.date)) h.push([got.date, got.nav]);
  h.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  console.log(`✓ ${isin}: ${got.nav} (${got.date}) vía ${got.source}`);
  okCount++;
}

nav.generated = new Date().toISOString();
delete nav.note;
await writeFile(join(root, 'data/nav.json'), JSON.stringify(nav, null, 2) + '\n');
await writeFile(join(root, 'data/nav-history.json'), JSON.stringify(hist) + '\n');
// Falla si NINGÚN fondo se pudo actualizar, para que GitHub te avise por correo.
if (okCount === 0) { console.error('No se pudo actualizar ningún fondo.'); process.exit(1); }
