// charts.js — gráficos SVG a mano, sin dependencias.
const NS = 'http://www.w3.org/2000/svg';
const el = (n, a = {}, txt) => {
  const e = document.createElementNS(NS, n);
  for (const k in a) e.setAttribute(k, a[k]);
  if (txt != null) e.textContent = txt;
  return e;
};

function niceTicks(min, max, n = 4) {
  if (!(max > min)) { max = min + 1; }
  const span = max - min;
  const step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const f = step0 / mag;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const t = [];
  for (let v = lo; v <= hi + step / 2; v += step) t.push(v);
  return t;
}

/**
 * lineChart(container, opts)
 *  series: [{name, color, pts:[[x,y],...], dashedUntil?: x}]   (x numérico: ms o años)
 *  xTicks: [{x, label}]  yFmt(v) → texto eje  tipFmt(x, [{name,color,y}]) → html texto
 *  zeroBase: fuerza el eje Y a empezar en 0
 */
export function lineChart(box, { series, xTicks = [], yFmt = String, tipFmt, zeroBase = false, height = 220, markers = [] }) {
  box.innerHTML = '';
  const all = series.flatMap((s) => s.pts);
  if (!all.length) return;
  const W = 340, H = height, L = 44, R = 8, T = 10, B = 24;
  let xmin = Math.min(...all.map((p) => p[0])), xmax = Math.max(...all.map((p) => p[0]));
  if (xmax === xmin) xmax = xmin + 1;
  let ymin = Math.min(...all.map((p) => p[1])), ymax = Math.max(...all.map((p) => p[1]));
  if (zeroBase) ymin = Math.min(0, ymin);
  else { const pad = (ymax - ymin || Math.abs(ymax) || 1) * 0.08; ymin -= pad; ymax += pad; }
  const ticks = niceTicks(ymin, ymax);
  ymin = ticks[0]; ymax = ticks[ticks.length - 1];
  const X = (x) => L + ((x - xmin) / (xmax - xmin)) * (W - L - R);
  const Y = (y) => T + (1 - (y - ymin) / (ymax - ymin)) * (H - T - B);

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });
  for (const v of ticks) {
    svg.append(el('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), stroke: 'var(--line)', 'stroke-width': 1 }));
    svg.append(el('text', { x: L - 6, y: Y(v) + 4, 'text-anchor': 'end' }, yFmt(v)));
  }
  for (const t of xTicks) {
    if (t.x < xmin || t.x > xmax) continue;
    svg.append(el('text', { x: X(t.x), y: H - 6, 'text-anchor': t.x === xmin ? 'start' : t.x === xmax ? 'end' : 'middle' }, t.label));
  }
  for (const m of markers) {
    if (m.x < xmin || m.x > xmax) continue;
    svg.append(el('line', { x1: X(m.x), x2: X(m.x), y1: T, y2: H - B, stroke: 'var(--muted)', 'stroke-dasharray': '3 3', 'stroke-width': 1 }));
  }
  for (const s of series) {
    if (!s.pts.length) continue;
    const seg = (pts, dashed) => {
      if (pts.length < 1) return;
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
      svg.append(el('path', { d: pts.length === 1 ? d + 'h0.01' : d, fill: 'none', stroke: s.color, 'stroke-width': 2.4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': dashed ? '5 4' : '', opacity: dashed ? 0.7 : 1 }));
    };
    if (s.dashedUntil != null) {
      const a = s.pts.filter((p) => p[0] <= s.dashedUntil), b = s.pts.filter((p) => p[0] >= s.dashedUntil);
      seg(a, true); seg(b, false);
    } else seg(s.pts, false);
    if (s.pts.length === 1) svg.append(el('circle', { cx: X(s.pts[0][0]), cy: Y(s.pts[0][1]), r: 4, fill: s.color }));
  }
  const cur = el('line', { y1: T, y2: H - B, stroke: 'var(--muted)', 'stroke-width': 1, visibility: 'hidden' });
  svg.append(cur);
  const dots = series.map((s) => { const c = el('circle', { r: 4.5, fill: s.color, stroke: 'var(--card)', 'stroke-width': 2, visibility: 'hidden' }); svg.append(c); return c; });
  const tip = document.createElement('div'); tip.className = 'tip';
  box.append(svg, tip);
  if (tipFmt) tip.innerHTML = tipFmt(null, []);

  const xs = [...new Set(all.map((p) => p[0]))].sort((a, b) => a - b);
  const at = (s, x) => { let best = null; for (const p of s.pts) { if (p[0] <= x) best = p; else break; } return best; };
  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const xv = xmin + ((px - L) / (W - L - R)) * (xmax - xmin);
    let near = xs[0];
    for (const x of xs) if (Math.abs(x - xv) < Math.abs(near - xv)) near = x;
    cur.setAttribute('x1', X(near)); cur.setAttribute('x2', X(near)); cur.setAttribute('visibility', 'visible');
    const vals = [];
    series.forEach((s, i) => {
      const p = at(s, near);
      if (p) { dots[i].setAttribute('cx', X(p[0])); dots[i].setAttribute('cy', Y(p[1])); dots[i].setAttribute('visibility', 'visible'); vals.push({ name: s.name, color: s.color, y: p[1] }); }
      else dots[i].setAttribute('visibility', 'hidden');
    });
    if (tipFmt) tip.innerHTML = tipFmt(near, vals);
  };
  box.classList.add('chart');
  box.onpointermove = move;
  box.onpointerdown = move;
}

/** donut(container, items:[{label,value,color}]) */
export function donut(box, items, centerTop, centerBottom) {
  box.innerHTML = '';
  const tot = items.reduce((s, i) => s + i.value, 0);
  const svg = el('svg', { viewBox: '0 0 120 120', role: 'img', 'aria-label': 'Distribución de la cartera' });
  const R = 46, C = 2 * Math.PI * R, SW = 18;
  svg.append(el('circle', { cx: 60, cy: 60, r: R, fill: 'none', stroke: 'var(--line)', 'stroke-width': SW }));
  let off = 0;
  if (tot > 0) {
    for (const it of items) {
      const len = (it.value / tot) * C;
      if (len <= 0) continue;
      const gap = items.length > 1 ? 1.5 : 0;
      svg.append(el('circle', {
        cx: 60, cy: 60, r: R, fill: 'none', stroke: it.color, 'stroke-width': SW,
        'stroke-dasharray': `${Math.max(len - gap, 0.1)} ${C}`, 'stroke-dashoffset': -off,
        transform: 'rotate(-90 60 60)',
      }));
      off += len;
    }
  }
  if (centerTop) svg.append(el('text', { x: 60, y: 58, 'text-anchor': 'middle', style: 'font-size:11px;fill:var(--muted)' }, centerTop));
  if (centerBottom) svg.append(el('text', { x: 60, y: 73, 'text-anchor': 'middle', style: 'font-size:13px;font-weight:700;fill:var(--ink)' }, centerBottom));
  box.append(svg);
}
