// fetchers.mjs — fuentes públicas alternativas. Cada una devuelve {nav, date, history?} o {error}.
// IMPORTANTE: estas fuentes no se han podido probar en vivo desde el entorno de desarrollo.
// Todas validan: sin fecha fiable no hay dato; nunca se rellena con "hoy".

const UA = 'Mozilla/5.0 (compatible; mi-cartera-personal/1.0)';
async function get(url, accept = '*/*') {
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': UA, accept, 'accept-language': 'en,es;q=0.8' } });
    const body = await res.text();
    console.log(`  ${url} → HTTP ${res.status}, ${body.length} bytes`);
    return { ok: res.ok, status: res.status, body };
  } finally { clearTimeout(to); }
}

/* ── Yahoo Finance (API JSON no oficial, pero estable y con histórico) ── */
export function parseYahooChart(json, expectCurrency = 'EUR') {
  const r = json?.chart?.result?.[0];
  if (!r) return { error: 'Respuesta sin datos: ' + JSON.stringify(json?.chart?.error ?? null).slice(0, 150) };
  if (expectCurrency && r.meta?.currency && r.meta.currency !== expectCurrency) return { error: `Divisa ${r.meta.currency}, se esperaba ${expectCurrency}` };
  const ts = r.timestamp || [], close = r.indicators?.quote?.[0]?.close || [], off = r.meta?.gmtoffset || 0;
  const history = [];
  for (let i = 0; i < ts.length; i++) {
    const c = close[i];
    if (!(c > 0)) continue;
    history.push([new Date((ts[i] + off) * 1000).toISOString().slice(0, 10), Math.round(c * 10000) / 10000]);
  }
  if (!history.length) return { error: 'Sin precios válidos en la serie' };
  const [date, nav] = history[history.length - 1];
  return { nav, date, history };
}
export async function fromYahoo(isin) {
  const s = await get(`https://query1.finance.yahoo.com/v1/finance/search?q=${isin}&quotesCount=6&newsCount=0`, 'application/json');
  if (!s.ok) return { error: `búsqueda HTTP ${s.status}` };
  let sym;
  try { const q = JSON.parse(s.body).quotes || []; sym = (q.find((x) => x.quoteType === 'MUTUALFUND') || q[0])?.symbol; } catch { return { error: 'búsqueda: respuesta no es JSON' }; }
  if (!sym) return { error: 'Yahoo no conoce ese ISIN' };
  const c = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=3mo&interval=1d`, 'application/json');
  if (!c.ok) return { error: `gráfico HTTP ${c.status}` };
  let j; try { j = JSON.parse(c.body); } catch { return { error: 'gráfico: respuesta no es JSON' }; }
  const r = parseYahooChart(j);
  return r.error ? r : { ...r, source: `yahoo(${sym})` };
}

/* ── Financial Times (ficha pública de fondos) ── */
const MES = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
export function parseFT(html) {
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const p = text.match(/Price \(EUR\)\s*([\d,]+\.\d{2,4})/);
  const d = text.match(/as of (?:close )?([A-Z][a-z]{2})[a-z]* (\d{1,2}),? (\d{4})/i) || text.match(/(\d{1,2}) ([A-Z][a-z]{2})[a-z]* (\d{4})/);
  if (!p) return { error: 'FT: no encuentro "Price (EUR)"' };
  if (!d) return { error: 'FT: encuentro precio pero no la fecha; se rechaza' };
  let mon, day, year;
  if (MES[d[1]]) { mon = MES[d[1]]; day = d[2]; year = d[3]; } else { day = d[1]; mon = MES[d[2]]; year = d[3]; }
  if (!mon) return { error: 'FT: fecha no reconocida' };
  return { nav: Number(p[1].replace(/,/g, '')), date: `${year}-${mon}-${day.padStart(2, '0')}` };
}
export async function fromFT(isin) {
  const r = await get(`https://markets.ft.com/data/funds/tearsheet/summary?s=${isin}:EUR`, 'text/html');
  if (!r.ok) return { error: `HTTP ${r.status}` };
  if (!r.body.includes(isin)) return { error: `FT: la página no menciona ${isin} (${r.body.length} bytes)` };
  const p = parseFT(r.body);
  return p.error ? p : { ...p, source: 'markets.ft.com' };
}
