// parse.mjs — extrae (nav, fecha) del HTML de una ficha pública de fondo (finanzen.net / finanzen.at).
// Estrategia defensiva: HTML → texto, varios patrones, y si dos patrones dan datos distintos se RECHAZA.

const NUM = '(\\d{1,3}(?:\\.\\d{3})*,\\d{2,4})';
const DATE = '(\\d{2}\\.\\d{2}\\.(?:\\d{4}|\\d{2}))';

export function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&euro;/g, '€')
    .replace(/[|]/g, ' ')
    .replace(/\s+/g, ' ');
}
const toNum = (s) => Number(s.replace(/\./g, '').replace(',', '.'));
function toIso(d) {
  const [dd, mm, yy] = d.split('.');
  return `${yy.length === 2 ? '20' + yy : yy}-${mm}-${dd}`;
}

const PATTERNS = [
  // "585,95 EUR -10,43 EUR -1,75 % 23.10.26"
  { name: 'cabecera', re: new RegExp(`${NUM} EUR [-+−]?[\\d.,]+ EUR [-+−]?[\\d.,]+ % ${DATE}`) },
  // "Kurs 585,95 EUR Kursdatum 23.10.2026"
  { name: 'kurs', re: new RegExp(`Kurs ${NUM} EUR Kursdatum ${DATE}`) },
  // "Nettoinventarwert (NAV) 440,90 EUR 3,56 EUR 0,81 % Vortag 437,34 EUR Datum 21.10.2026"
  { name: 'nav', re: new RegExp(`Nettoinventarwert \\(NAV\\) ${NUM} EUR [-+−]?[\\d.,]+ EUR [-+−]?[\\d.,]+ % Vortag [\\d.,]+ EUR Datum ${DATE}`) },
];

export function parseFundPage(html, isin) {
  const text = htmlToText(html);
  if (isin && !html.includes(isin) && !text.includes(isin)) {
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.replace(/\s+/g, ' ').trim().slice(0, 120);
    return { error: `La página no menciona el ISIN ${isin} (título: «${title ?? 'sin título'}», ${html.length} bytes, ¿bloqueo/consentimiento?)` };
  }
  const found = [];
  for (const p of PATTERNS) {
    const m = text.match(p.re);
    if (m) found.push({ pat: p.name, nav: toNum(m[1]), date: toIso(m[2]) });
  }
  if (!found.length) {
    const i = text.search(/\d,\d{2} EUR/);
    const ctx = i >= 0 ? text.slice(Math.max(0, i - 150), i + 250) : text.slice(0, 300);
    return { error: `No se reconoce el formato de la página (¿ha cambiado?). Texto (${text.length} car.) cerca del primer precio: «${ctx}»` };
  }
  const first = found[0];
  for (const f of found) {
    if (f.nav !== first.nav || f.date !== first.date) return { error: `Patrones en desacuerdo: ${JSON.stringify(found)}` };
  }
  if (!(first.nav > 0 && first.nav < 100000)) return { error: 'Precio fuera de rango' };
  if (Number.isNaN(Date.parse(first.date))) return { error: 'Fecha no válida' };
  return { nav: first.nav, date: first.date, patterns: found.map((f) => f.pat) };
}
