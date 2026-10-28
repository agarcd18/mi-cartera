import * as C from './calc.js';
import * as S from './store.js';
import { lineChart, donut } from './charts.js';

/* ───────────── Estado ───────────── */
let state = S.load();
let navData = { latest: {}, history: {}, generated: null, ok: false, fromCache: false };
let tab = 'inicio';
let rango = '3M';
const FUND_COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', '#ec4899', '#64748b', '#22c55e', '#a855f7', '#0ea5e9'];
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ───────────── Formato ───────────── */
const nf = (min, max) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: min, maximumFractionDigits: max, useGrouping: 'always' });
const f2 = nf(2, 2), f0 = nf(0, 0), f1 = nf(1, 1), f5 = nf(0, 5);
const eur = (v, d = 2) => (v == null || !Number.isFinite(v) ? '—' : (d === 0 ? f0 : f2).format(v) + ' €');
const eurS = (v) => (v == null ? '—' : (v >= 0 ? '+' : '−') + f2.format(Math.abs(v)) + ' €');
const pctS = (v) => (v == null ? '—' : (v >= 0 ? '+' : '−') + f2.format(Math.abs(v)) + ' %');
const pct = (v, d = 1) => (v == null ? '—' : nf(d, d).format(v) + ' %');
const cls = (v) => (v == null ? 'muted' : v >= 0 ? 'pos' : 'neg');
const fDate = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const fDateS = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
const msOf = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const isoOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const today = () => C.isoToday();
const fundOf = (id) => state.config.funds.find((f) => f.id === id);
const colorOf = (id) => FUND_COLORS[state.config.funds.findIndex((f) => f.id === id) % FUND_COLORS.length];

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2600);
}
const persist = () => { if (!S.save(state)) toast('No se pudo guardar en este navegador'); };

/* ───────────── Valores liquidativos ───────────── */
async function fetchJSON(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(url + ' ' + r.status);
  return r.json();
}
async function loadNav() {
  try {
    const [latest, history] = await Promise.all([fetchJSON('data/nav.json'), fetchJSON('data/nav-history.json').catch(() => ({}))]);
    navData = { latest: latest.funds || {}, history: history || {}, generated: latest.generated || null, ok: true, fromCache: false, errors: latest.errors || {} };
    S.saveNavCache({ latest: navData.latest, history: navData.history, generated: navData.generated });
  } catch {
    const c = S.loadNavCache();
    navData = c ? { ...c, ok: false, fromCache: true } : { latest: {}, history: {}, generated: null, ok: false, fromCache: false };
  }
}

// Serie fusionada (automática + manual) de cada fondo
function navSeries() {
  const out = {}, src = {};
  for (const f of state.config.funds) {
    const l = navData.latest[f.isin];
    const m = C.mergeNavSeries({
      history: navData.history[f.isin] || [],
      latest: l && l.date ? { date: l.date, nav: l.nav } : null,
      manual: state.manualNav[f.id] || [],
    });
    out[f.id] = m.serie; src[f.id] = m.fuente;
  }
  return { series: out, fuente: src };
}

function compute() {
  const { series, fuente } = navSeries();
  const rp = C.replay(state.config.funds, state.movs);
  const navInfo = {};
  for (const f of state.config.funds) {
    const s = series[f.id];
    const last = s[s.length - 1];
    navInfo[f.id] = last ? { nav: last[1], date: last[0], manual: fuente[f.id][last[0]] === 'manual' } : null;
  }
  const val = C.valuePortfolio(state.config.funds, rp.pos, navInfo);
  const dates = state.config.funds.map((f) => navInfo[f.id]?.date).filter(Boolean).sort();
  return { series, fuente, rp, navInfo, val, oldest: dates[0] || null, newest: dates[dates.length - 1] || null };
}

/* ───────────── Interfaz: estructura ───────────── */
const ICON = {
  inicio: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  evol: '<path d="M3 17l6-6 4 4 8-9"/><path d="M15 6h6v6"/>',
  movs: '<path d="M7 7h13l-3-3M17 17H4l3 3"/>',
  futuro: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2L10 21h4l.6-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/>',
};
const TABS = [['inicio', 'Inicio', ICON.inicio], ['evol', 'Evolución', ICON.evol], ['movs', 'Movimientos', ICON.movs], ['futuro', 'Futuro', ICON.futuro], ['ajustes', 'Ajustes', ICON.ajustes]];

function renderTabs() {
  $('#tabs').innerHTML = TABS.map(([id, label, ic]) => `<button data-tab="${id}" ${id === tab ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${ic}</svg>${label}</button>`).join('');
}
function applyTheme() {
  const t = state.config.tema;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('meta[name="theme-color"]').content = dark ? '#0b0e17' : '#f4f5f8';
}

function render() {
  applyTheme(); renderTabs();
  const ctx = compute();
  if (S.recordSnapshot(state, ctx.val)) persist();
  const v = $('#view');
  v.innerHTML = '';
  ({ inicio: viewInicio, evol: viewEvol, movs: viewMovs, futuro: viewFuturo, ajustes: viewAjustes })[tab](v, ctx);
  window.scrollTo(0, 0);
}

function freshChip(ctx) {
  const fr = C.freshness(ctx.oldest, today());
  const txt = !ctx.oldest ? 'Sin datos de precios' : fr.dias <= 0 ? 'Datos de hoy' : `Datos de hace ${fr.dias} ${fr.dias === 1 ? 'día' : 'días'}`;
  return `<span class="chip ${fr.nivel}">${txt}</span>`;
}

/* ───────────── Inicio ───────────── */
function viewInicio(v, ctx) {
  const { val } = ctx;
  const fr = C.freshness(ctx.oldest, today());
  let banners = '';
  if (!val.completo) {
    const faltan = val.rows.filter((r) => r.valor === null).map((r) => esc(fundOf(r.id).corto));
    banners += `<div class="banner"><b>Faltan precios</b> de ${faltan.join(', ')}. El total no es completo. Puedes introducir el valor liquidativo a mano en <b>Ajustes → Valores liquidativos</b>.</div>`;
  }
  if (val.completo && (fr.nivel === 'viejo' || fr.nivel === 'aviso')) {
    banners += `<div class="banner"><b>Precios desactualizados.</b> El valor liquidativo más antiguo es del ${fDate(ctx.oldest)}. Se muestra el último dato válido, no el de hoy.</div>`;
  }
  if (navData.fromCache && !navData.ok) banners += `<div class="banner info">Sin conexión con la fuente de precios: se usan los últimos datos guardados.</div>`;
  const manual = val.rows.filter((r) => ctx.navInfo[r.id]?.manual);
  if (manual.length) banners += `<div class="banner info">Usando valor liquidativo escrito a mano en: ${manual.map((r) => esc(fundOf(r.id).corto)).join(', ')}.</div>`;

  const sinPos = state.config.funds.every((f) => !f.participaciones);
  v.innerHTML = `
    <div class="top"><h1>Mi cartera</h1>${freshChip(ctx)}</div>
    ${banners}
    <section class="card hero">
      <div class="label">Patrimonio actual</div>
      <div class="big num">${val.total > 0 ? eur(val.total) : '—'}</div>
      <div class="pair">
        <div><div class="label">Ganancia</div><div class="v num ${cls(val.ganancia)}">${val.completo ? eurS(val.ganancia) : '—'}</div></div>
        <div><div class="label">Rentabilidad</div><div class="v num ${cls(val.rent)}">${val.completo ? pctS(val.rent) : '—'}</div></div>
      </div>
      <div class="small muted" style="margin-top:12px">Aportado: <span class="num">${eur(val.capital)}</span></div>
    </section>
    <section class="card" id="fondos"></section>
    <section class="card"><h3>Distribución</h3><div class="donut-row"><div id="donut" style="flex:0 0 130px"></div><div class="legend" id="legend"></div></div></section>
    ${sinPos ? '<div class="banner info">Introduce tus participaciones en Ajustes.</div>' : ''}
  `;
  $('#fondos').innerHTML = val.rows.map((r) => {
    const f = fundOf(r.id), n = ctx.navInfo[r.id];
    return `<div class="fund"><div class="dot" style="background:${colorOf(r.id)}"></div>
      <div><div class="name">${esc(f.corto)}</div><div class="sub num">${n ? `${f2.format(n.nav)} € · ${fDateS(n.date)}${n.manual ? ' (manual)' : ''}` : 'sin precio'}</div></div>
      <div class="val"><div class="a num">${eur(r.valor)}</div><div class="b num ${cls(r.rent)}">${r.valor === null ? '—' : `${pctS(r.rent)} · ${eurS(r.ganancia)}`}</div></div></div>`;
  }).join('');
  const items = val.rows.filter((r) => r.valor > 0).map((r) => ({ label: fundOf(r.id).corto, value: r.valor, color: colorOf(r.id), peso: r.peso }));
  donut($('#donut'), items, 'Total', val.total > 0 ? eur(val.total, 0) : '—');
  $('#legend').innerHTML = items.map((i) => `<div><i style="background:${i.color}"></i><span>${esc(i.label)}</span><span class="num"><b>${pct(i.peso)}</b><br><span class="muted small">${eur(i.value, 0)}</span></span></div>`).join('') || '<span class="muted">Sin datos</span>';
}

/* ───────────── Evolución ───────────── */
function historySeries(ctx) {
  const funds = state.config.funds;
  const firsts = funds.map((f) => ctx.series[f.id][0]?.[0]).filter(Boolean);
  if (firsts.length < funds.length) return [];
  const from = firsts.sort().pop(); // primer día en que todos los fondos tienen precio
  let pts = C.buildSeries({ funds, navSeries: ctx.series, efectos: ctx.rp.efectos, from, to: today() });
  const have = new Set(pts.map((p) => p.d));
  for (const s of state.snaps) {
    if (!have.has(s.d)) pts.push({ d: s.d, total: s.total, capital: s.capital, ganancia: s.total - s.capital, rent: null, f: s.f });
  }
  return pts.sort((a, b) => (a.d < b.d ? -1 : 1));
}

function viewEvol(v, ctx) {
  const all = historySeries(ctx);
  v.innerHTML = `<div class="top"><h1>Evolución</h1>${freshChip(ctx)}</div>
    <section class="card">
      <div class="seg" id="rangos">${C.RANGOS.map((r) => `<button data-r="${r}" aria-pressed="${r === rango}">${r === 'MAX' ? 'Inicio' : r}</button>`).join('')}</div>
      <div id="chart" style="margin-top:14px"></div>
      <div class="keys"><span><i style="background:var(--c1)"></i>Patrimonio</span><span><i style="background:var(--muted)"></i>Aportado</span></div>
      <div id="hnote" class="small muted" style="margin-top:10px"></div>
    </section>
    <section class="card" id="pstats"></section>
    <section class="card"><h3>Cómo se construye este gráfico</h3><p class="small muted" style="margin:0">Usa los valores liquidativos públicos guardados y tus participaciones. La ganancia del periodo <b>no cuenta como beneficio el dinero que aportas</b>. Antes de la fecha de posición base (${fDate(state.config.fechaBase)}) se asume que tenías las participaciones actuales (línea discontinua): es una reconstrucción, no tu historial real. Desde esa fecha, tus movimientos se aplican de verdad. La app además guarda una foto diaria cada vez que la abres.</p></section>`;
  const draw = () => {
    const { pts, cubierto } = C.sliceRange(all, rango, today());
    $('#chart').innerHTML = '';
    if (pts.length < 2) {
      $('#chart').innerHTML = `<p class="muted" style="padding:28px 0;text-align:center">Todavía no hay histórico suficiente.<br><span class="small">Se irá completando solo: el script diario guarda un precio por día y esta app guarda una foto cada vez que la abres.</span></p>`;
      $('#pstats').innerHTML = ''; $('#hnote').textContent = '';
      return;
    }
    const x0 = msOf(pts[0].d), x1 = msOf(pts.at(-1).d);
    const xt = [0, 1 / 3, 2 / 3, 1].map((k) => { const x = x0 + (x1 - x0) * k; return { x, label: fDateS(isoOf(x)) }; });
    lineChart($('#chart'), {
      series: [
        { name: 'Aportado', color: 'var(--muted)', pts: pts.map((p) => [msOf(p.d), p.capital]) },
        { name: 'Patrimonio', color: 'var(--c1)', pts: pts.map((p) => [msOf(p.d), p.total]), dashedUntil: msOf(state.config.fechaBase) },
      ],
      xTicks: xt, yFmt: (y) => f0.format(y / 1000) + 'k',
      markers: [{ x: msOf(state.config.fechaBase) }],
      tipFmt: (x, vals) => {
        if (x == null) return 'Toca el gráfico para ver cada día';
        const val = vals.find((q) => q.name === 'Patrimonio'), ap = vals.find((q) => q.name === 'Aportado');
        return `<b>${fDate(isoOf(x))}</b> · patrimonio <b class="num" style="color:var(--ink)">${eur(val?.y)}</b> · aportado <span class="num">${eur(ap?.y)}</span>`;
      },
    });
    $('#hnote').textContent = cubierto ? '' : `Aún no hay datos tan antiguos: se muestra desde el ${fDate(pts[0].d)}.`;
    const st = C.periodStats(pts);
    $('#pstats').innerHTML = st ? `<h3>Periodo ${fDate(st.desde)} → ${fDate(st.hasta)}</h3>
      <div class="grid2"><div><div class="small muted">Ganancia (sin contar aportaciones)</div><div class="num ${cls(st.ganancia)}" style="font-size:22px;font-weight:650">${eurS(st.ganancia)}</div></div>
      <div><div class="small muted">Variación</div><div class="num ${cls(st.pct)}" style="font-size:22px;font-weight:650">${pctS(st.pct)}</div></div></div>
      ${Math.abs(st.aportado) > 0.005 ? `<div class="small muted" style="margin-top:8px">Dinero neto aportado en el periodo: ${eur(st.aportado)}</div>` : ''}` : '';
  };
  draw();
  $('#rangos').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; rango = b.dataset.r; [...$('#rangos').children].forEach((x) => x.setAttribute('aria-pressed', x === b)); draw(); };
}

/* ───────────── Movimientos ───────────── */
const TIPO = { aportacion: 'Aportación', retirada: 'Retirada', traspaso: 'Traspaso' };

function viewMovs(v, ctx) {
  const ap = state.config.aportacion;
  const list = C.sortMovs(state.movs).reverse();
  v.innerHTML = `<div class="top"><h1>Movimientos</h1><button class="btn small" id="addMov">+ Añadir</button></div>
    <div class="banner info"><b>Traspaso ≠ dinero nuevo.</b> Un traspaso mueve capital de un fondo a otro y no cambia el total aportado ni la rentabilidad. Una aportación sube el capital aportado; una retirada lo baja (a coste medio).</div>
    ${ap.activa ? `<section class="card"><h3>Aportación mensual programada</h3><p class="small muted" style="margin:0 0 10px">${eur(ap.mensual, 0)}/mes · ${state.config.funds.map((f) => `${esc(f.corto)} ${f0.format(ap.reparto[f.id] || 0)} €`).join(' · ')}</p><button class="btn ghost block" id="regMes">Registrar la aportación de este mes</button></section>` : ''}
    <section class="card">${list.length ? list.map((m) => {
      const o = fundOf(m.fondo), d = m.destino ? fundOf(m.destino) : null;
      const sign = m.tipo === 'aportacion' ? '+' : m.tipo === 'retirada' ? '−' : '⇄';
      return `<div class="mov"><div class="t">${TIPO[m.tipo]} · ${esc(o?.corto)}${d ? ' → ' + esc(d.corto) : ''}</div><div class="amt num">${sign} ${eur(m.importe)}</div>
        <div class="s">${fDate(m.fecha)} · ${f5.format(m.participaciones)} part.${m.estimado ? ' (estimadas)' : ''}${m.nota ? ' · ' + esc(m.nota) : ''}</div>
        <button class="btn danger small" data-del="${m.id}">Borrar</button></div>`;
    }).join('') : '<p class="muted" style="margin:0">Aún no has registrado movimientos. Tu posición base es la de Ajustes.</p>'}</section>
    ${ctx.rp.avisos.length ? `<div class="banner">${ctx.rp.avisos.map(esc).join('<br>')}</div>` : ''}`;
  $('#addMov').onclick = () => movForm();
  const reg = $('#regMes'); if (reg) reg.onclick = registrarMes;
  v.onclick = (e) => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    if (!confirm('¿Borrar este movimiento? La cartera se recalculará.')) return;
    state.movs = state.movs.filter((m) => m.id !== +b.dataset.del); persist(); render();
  };
}

function navFor(fondoId, fecha) {
  const s = compute().series[fondoId];
  const r = C.navOnOrBefore(s, fecha);
  if (!r) return null;
  return { nav: r.nav, d: r.d, exacto: r.d === fecha };
}

function addMov(input) {
  const rp = C.replay(state.config.funds, state.movs);
  const res = C.prepareMovement(input, { funds: state.config.funds, fechaBase: state.config.fechaBase, navFor, posActual: rp.pos });
  if (res.error) return res;
  res.mov.id = state.seq++; res.mov.ord = res.mov.id;
  state.movs.push(res.mov); persist();
  return res;
}

function registrarMes() {
  const ap = state.config.aportacion, t = today();
  if (t <= state.config.fechaBase) { toast('La fecha base es hoy: cambia la fecha base en Ajustes'); return; }
  const ya = state.movs.some((m) => m.tipo === 'aportacion' && m.nota === 'Aportación mensual' && m.fecha.slice(0, 7) === t.slice(0, 7));
  if (ya && !confirm('Ya registraste la aportación de este mes. ¿Registrar otra?')) return;
  const errs = [];
  for (const f of state.config.funds) {
    const imp = ap.reparto[f.id] || 0;
    if (imp > 0) { const r = addMov({ tipo: 'aportacion', fecha: t, fondo: f.id, importe: imp, nota: 'Aportación mensual' }); if (r.error) errs.push(...r.error); }
  }
  if (errs.length) toast(errs[0]); else toast('Aportación registrada (participaciones estimadas)');
  render();
}

function movForm() {
  const fs = state.config.funds;
  const opts = (sel) => fs.map((f) => `<option value="${f.id}" ${f.id === sel ? 'selected' : ''}>${esc(f.corto)}</option>`).join('');
  const m = $('#modal');
  m.hidden = false;
  m.innerHTML = `<div class="modal" id="mbg"><form class="sheet" id="mform" autocomplete="off">
    <h2 style="margin-top:0">Nuevo movimiento</h2>
    <div class="field"><label>Tipo</label><select name="tipo"><option value="aportacion">Aportación</option><option value="retirada">Retirada</option><option value="traspaso">Traspaso entre fondos</option></select></div>
    <div class="grid2"><div class="field"><label>Fecha</label><input type="date" name="fecha" value="${today()}" max="${today()}" required></div>
    <div class="field"><label>Importe (€)</label><input name="importe" inputmode="decimal" placeholder="250" required></div></div>
    <div class="grid2"><div class="field"><label id="lOrig">Fondo</label><select name="fondo">${opts(fs[0].id)}</select></div>
    <div class="field" id="fDest" hidden><label>Fondo destino</label><select name="destino">${opts(fs[1]?.id)}</select></div></div>
    <div class="grid2"><div class="field"><label id="lPart">Participaciones (opcional)</label><input name="participaciones" inputmode="decimal" placeholder="se estiman"></div>
    <div class="field" id="fPartD" hidden><label>Participaciones destino (opcional)</label><input name="participacionesDestino" inputmode="decimal" placeholder="se estiman"></div></div>
    <div class="field"><label>Nota (opcional)</label><input name="nota" maxlength="140"></div>
    <p class="small muted">Si dejas vacías las participaciones, se estiman con el valor liquidativo de esa fecha. Escribe las reales de MyInvestor si las tienes.</p>
    <div id="merr" class="err" hidden></div>
    <div class="row"><button class="btn" type="submit">Guardar</button><button class="btn ghost" type="button" id="mcancel">Cancelar</button></div></form></div>`;
  const form = $('#mform');
  const sync = () => { const t = form.tipo.value; $('#fDest').hidden = $('#fPartD').hidden = t !== 'traspaso'; $('#lOrig').textContent = t === 'traspaso' ? 'Fondo origen' : 'Fondo'; };
  form.tipo.onchange = sync; sync();
  const close = () => { m.hidden = true; m.innerHTML = ''; };
  $('#mcancel').onclick = close;
  $('#mbg').onclick = (e) => { if (e.target.id === 'mbg') close(); };
  form.onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const r = addMov({
      tipo: fd.get('tipo'), fecha: fd.get('fecha'), fondo: fd.get('fondo'), destino: fd.get('destino'),
      importe: C.parseNum(fd.get('importe'), { dotThousands: true }),
      participaciones: C.parseNum(fd.get('participaciones')) || 0,
      participacionesDestino: C.parseNum(fd.get('participacionesDestino')) || 0,
      nota: fd.get('nota'),
    });
    if (r.error) { const er = $('#merr'); er.hidden = false; er.innerHTML = r.error.map(esc).join('<br>'); return; }
    close(); toast(r.mov.estimado ? 'Guardado (participaciones estimadas)' : 'Movimiento guardado'); render();
  };
}

/* ───────────── Futuro: proyección, escenarios, objetivos ───────────── */
let proj = null;
const HORIZONTES = [30, 35, 40, 45, 50, 55];
const ESC = [['CONSERVADOR', 5, 'var(--c2)'], ['NORMAL', 7, 'var(--c1)'], ['OPTIMISTA', 9, 'var(--c3)']];
let whatIf = { capital: 91626, monthly: 500, years: 40 };

function viewFuturo(v, ctx) {
  const ap = state.config.aportacion;
  if (!proj) proj = { capital: Math.round(ctx.val.total) || 0, rate: state.config.rentEsperada, monthly: ap.activa ? ap.mensual : 0, years: 30 };
  v.innerHTML = `<div class="top"><h1>Futuro</h1></div>
  <section class="card"><h3>Proyección</h3>
    <div class="grid2"><div class="field"><label>Capital inicial (€)</label><input id="pCap" inputmode="decimal" value="${f0.format(proj.capital)}"></div>
    <div class="field"><label>Aportación mensual (€)</label><input id="pMon" inputmode="decimal" value="${f0.format(proj.monthly)}"></div></div>
    <div class="field"><label>Rentabilidad anual esperada (%)</label><div class="row"><input id="pRate" inputmode="decimal" value="${String(proj.rate).replace('.', ',')}" style="flex:1;min-width:90px">
      <div class="seg" id="qRate" style="flex:2">${[5, 7, 9].map((r) => `<button data-rate="${r}" aria-pressed="${proj.rate === r}">${r} %</button>`).join('')}</div></div></div>
    <div class="field"><label>Horizonte</label><div class="seg" id="qYears">${HORIZONTES.map((y) => `<button data-y="${y}" aria-pressed="${proj.years === y}">${y} años</button>`).join('')}</div></div>
    <div id="pOut"></div>
    <div class="disc"><b>Simulación, no una promesa.</b> Los mercados suben y bajan y no hay rentabilidad garantizada. Usa un tipo anual efectivo constante, sin inflación, impuestos ni comisiones; las aportaciones se hacen a final de cada mes.</div>
  </section>
  <section class="card"><h3>¿Cuánto tendría si…?</h3>
    <div class="grid2"><div class="field"><label>Parto de (€)</label><input id="wCap" inputmode="decimal" value="${f0.format(whatIf.capital)}"></div>
    <div class="field"><label>Aporto al mes (€)</label><input id="wMon" inputmode="decimal" value="${f0.format(whatIf.monthly)}"></div></div>
    <button class="btn ghost small" id="wUse" style="margin-bottom:12px">Usar mi patrimonio actual</button>
    <div id="wOut"></div>
    <div class="disc">Tres escenarios fijos: conservador 5 %, normal 7 % y optimista 9 % anual. Es una simulación; el resultado real puede ser muy distinto.</div>
  </section>
  <section class="card"><h3>Objetivos</h3><div id="goals"></div>
    <div class="row" style="margin-top:12px"><input id="gNew" inputmode="numeric" placeholder="Nuevo objetivo en € (ej. 250.000)" style="flex:1;min-width:150px"><button class="btn small" id="gAdd">Añadir</button></div>
  </section>`;

  const readP = () => {
    const c = C.parseNum($('#pCap').value, { dotThousands: true }), m = C.parseNum($('#pMon').value, { dotThousands: true }), r = C.parseNum($('#pRate').value);
    return { c, m, r, ok: c >= 0 && m >= 0 && Number.isFinite(r) && r > -20 && r < 60 };
  };
  const drawP = () => {
    const { c, m, r, ok } = readP();
    const out = $('#pOut');
    if (!ok) { out.innerHTML = '<div class="err">Revisa los valores (la rentabilidad debe estar entre −20 % y 60 %).</div>'; return; }
    Object.assign(proj, { capital: c, monthly: m, rate: r });
    const yrs = projectYearsFor(proj.years);
    const data = C.projectYearly({ capital: c, annualPct: r, monthly: m, years: yrs });
    const fin = data[yrs];
    const edad = C.ageOn({ edad: state.config.edad, ref: state.config.edadRef, cumple: state.config.cumple }, today()) + yrs;
    out.innerHTML = `<div class="grid2" style="margin:6px 0 10px"><div><div class="small muted">Valor en ${yrs} años (${edad} años)</div><div class="num" style="font-size:26px;font-weight:700">${eur(fin.valor, 0)}</div></div>
      <div><div class="small muted">Aportado · Ganancia</div><div class="num" style="font-weight:600">${eur(fin.aportado, 0)}</div><div class="num pos">${eurS(fin.ganancia).replace(',00', '')}</div></div></div>
      <div id="pChart"></div><div class="keys"><span><i style="background:var(--c1)"></i>Valor estimado</span><span><i style="background:var(--muted)"></i>Dinero aportado</span></div>
      <div class="tbl-scroll" style="margin-top:12px"><table><tr><th>Años</th><th>Edad</th><th>Valor</th><th>Aportado</th></tr>${HORIZONTES.map((y) => { const x = C.futureValue({ capital: c, annualPct: r, monthly: m, years: y }); return `<tr><td>${y}</td><td>${edad - yrs + y}</td><td class="num"><b>${eur(x, 0)}</b></td><td class="num muted">${eur(c + m * 12 * y, 0)}</td></tr>`; }).join('')}</table></div>`;
    lineChart($('#pChart'), {
      series: [{ name: 'Aportado', color: 'var(--muted)', pts: data.map((d) => [d.year, d.aportado]) }, { name: 'Valor', color: 'var(--c1)', pts: data.map((d) => [d.year, d.valor]) }],
      xTicks: [0, 1, 2, 3, 4].map((k) => { const x = Math.round((yrs * k) / 4); return { x, label: x + ' a' }; }), zeroBase: true,
      yFmt: (y) => (y >= 1e6 ? f1.format(y / 1e6) + ' M' : f0.format(y / 1000) + 'k'),
      tipFmt: (x, vals) => x == null ? 'Toca el gráfico' : `<b>Año ${x}</b> · valor <b class="num" style="color:var(--ink)">${eur(vals.find((q) => q.name === 'Valor')?.y, 0)}</b> · aportado ${eur(vals.find((q) => q.name === 'Aportado')?.y, 0)}`,
    });
  };
  const projectYearsFor = (y) => y;
  $('#pCap').oninput = $('#pMon').oninput = drawP;
  $('#pRate').oninput = () => { [...$('#qRate').children].forEach((b) => b.setAttribute('aria-pressed', false)); drawP(); };
  $('#qRate').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; $('#pRate').value = b.dataset.rate; [...$('#qRate').children].forEach((x) => x.setAttribute('aria-pressed', x === b)); drawP(); };
  $('#qYears').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; proj.years = +b.dataset.y; [...$('#qYears').children].forEach((x) => x.setAttribute('aria-pressed', x === b)); drawP(); };
  drawP();

  const drawW = () => {
    const c = C.parseNum($('#wCap').value, { dotThousands: true }), m = C.parseNum($('#wMon').value, { dotThousands: true });
    const out = $('#wOut');
    if (!(c >= 0 && m >= 0)) { out.innerHTML = '<div class="err">Revisa los importes.</div>'; return; }
    whatIf.capital = c; whatIf.monthly = m;
    const ys = 55;
    const lines = ESC.map(([n, r, col]) => ({ name: n, color: col, pts: C.projectYearly({ capital: c, annualPct: r, monthly: m, years: ys }).map((d) => [d.year, d.valor]) }));
    out.innerHTML = `<div class="tbl-scroll"><table><tr><th>Años</th>${ESC.map(([n, r]) => `<th>${r} %</th>`).join('')}</tr>
      ${HORIZONTES.map((y) => `<tr><td>${y}</td>${ESC.map(([, r]) => `<td class="num"><b>${eur(C.futureValue({ capital: c, annualPct: r, monthly: m, years: y }), 0)}</b></td>`).join('')}</tr>`).join('')}</table></div>
      <div id="wChart" style="margin-top:12px"></div><div class="keys">${ESC.map(([n, r, col]) => `<span><i style="background:${col}"></i>${n} ${r} %</span>`).join('')}</div>
      <div class="small muted" style="margin-top:8px">Total aportado a 55 años: ${eur(c + m * 12 * ys, 0)}.</div>`;
    lineChart($('#wChart'), {
      series: lines, zeroBase: true,
      xTicks: [0, 11, 22, 33, 44, 55].map((x) => ({ x, label: x + ' a' })),
      yFmt: (y) => (y >= 1e6 ? f1.format(y / 1e6) + ' M' : f0.format(y / 1000) + 'k'),
      tipFmt: (x, vals) => x == null ? 'Toca el gráfico' : `<b>Año ${x}</b> · ` + vals.map((q) => `${q.name.slice(0, 4).toLowerCase()} <b class="num" style="color:var(--ink)">${eur(q.y, 0)}</b>`).join(' · '),
    });
  };
  $('#wCap').oninput = $('#wMon').oninput = drawW;
  $('#wUse').onclick = () => { $('#wCap').value = f0.format(Math.round(ctx.val.total)); drawW(); };
  drawW();

  const drawG = () => {
    const goals = [...state.config.objetivos].sort((a, b) => a - b);
    const total = ctx.val.total;
    $('#goals').innerHTML = goals.map((g) => {
      const p = total / g * 100, w = Math.min(100, p);
      let eta = '';
      if (p < 100) {
        const m = C.monthsToGoal({ capital: total, annualPct: proj.rate, monthly: proj.monthly, goal: g });
        eta = m == null ? 'No se alcanza en 80 años con estos supuestos' : `Con la proyección de arriba (${String(proj.rate).replace('.', ',')} %, ${f0.format(proj.monthly)} €/mes): ~${f1.format(m / 12)} años`;
      } else eta = '¡Objetivo alcanzado!';
      return `<div class="goal"><div class="head"><span class="num">${eur(g, 0)}</span><span class="num">${pct(Math.min(p, 999), 2)}</span></div><div class="bar"><i style="width:${w}%"></i></div>
        <div class="row between small muted" style="margin-top:6px"><span>${eta}</span><button class="btn danger small" data-gdel="${g}">Quitar</button></div></div>`;
    }).join('') || '<p class="muted">Sin objetivos.</p>';
  };
  drawG();
  $('#goals').onclick = (e) => { const b = e.target.closest('[data-gdel]'); if (!b) return; state.config.objetivos = state.config.objetivos.filter((g) => g !== +b.dataset.gdel); persist(); drawG(); };
  $('#gAdd').onclick = () => {
    const g = C.parseNum($('#gNew').value, { dotThousands: true });
    if (!(g > 0)) { toast('Escribe un importe válido'); return; }
    if (!state.config.objetivos.includes(g)) state.config.objetivos.push(g);
    persist(); $('#gNew').value = ''; drawG();
  };
}

/* ───────────── Ajustes ───────────── */
function viewAjustes(v, ctx) {
  const c = state.config, ap = c.aportacion;
  const num = (x) => String(x).replace('.', ',');
  const age = C.ageOn({ edad: c.edad, ref: c.edadRef, cumple: c.cumple }, today());
  v.innerHTML = `<div class="top"><h1>Ajustes</h1></div>
  <section class="card"><h3>Tema</h3><div class="seg" id="tema">${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([k, l]) => `<button data-t="${k}" aria-pressed="${c.tema === k}">${l}</button>`).join('')}</div></section>

  <section class="card"><h3>Tus fondos</h3>
    <p class="small muted" style="margin-top:0">Posición a fecha base. Los movimientos que registres se suman a partir de ella.</p>
    <div class="field"><label>Fecha base (cuando estas cifras son correctas)</label><input type="date" id="fBase" value="${c.fechaBase}" max="${today()}"></div>
    ${c.funds.map((f, i) => `<details ${i === 0 ? 'open' : ''} data-fid="${f.id}"><summary>${esc(f.corto)}</summary>
      <div class="field"><label>Nombre</label><input data-k="nombre" value="${esc(f.nombre)}"></div>
      <div class="grid2"><div class="field"><label>Nombre corto</label><input data-k="corto" value="${esc(f.corto)}"></div><div class="field"><label>ISIN</label><input data-k="isin" value="${esc(f.isin)}" autocapitalize="characters" maxlength="12"></div></div>
      <div class="grid2"><div class="field"><label>Participaciones</label><input data-k="participaciones" inputmode="decimal" value="${num(f.participaciones)}"></div><div class="field"><label>Capital aportado (€)</label><input data-k="capital" inputmode="decimal" value="${num(f.capital)}"></div></div>
      <div class="field"><label>Invertido desde</label><input type="date" data-k="desde" value="${f.desde}"></div></details>`).join('')}
  </section>

  <section class="card"><h3>Valores liquidativos</h3>
    <p class="small muted" style="margin-top:0">${navData.generated ? `Última descarga automática: ${esc(new Date(navData.generated).toLocaleString('es-ES'))}.` : 'No hay descarga automática disponible todavía.'} Si un precio falta o está desfasado, escríbelo a mano (queda marcado como manual).</p>
    ${c.funds.map((f) => { const n = ctx.navInfo[f.id]; return `<div class="grid2" style="align-items:end" data-nid="${f.id}"><div class="field"><label>${esc(f.corto)} ${n ? `(último: ${f2.format(n.nav)} € · ${fDateS(n.date)})` : '(sin precio)'}</label><input data-nav inputmode="decimal" placeholder="Valor liquidativo €"></div><div class="field"><input data-navd type="date" value="${today()}" max="${today()}"></div></div>`; }).join('')}
    <div class="row"><button class="btn small" id="navSave">Guardar valores</button><button class="btn danger small" id="navClear">Borrar los manuales</button></div>
  </section>

  <section class="card"><h3>Aportaciones futuras</h3>
    <div class="switch"><span>Aportación mensual activa<br><span class="small muted">Desactivada = no se asume ninguna</span></span><input type="checkbox" id="apOn" ${ap.activa ? 'checked' : ''}></div>
    <div class="grid2"><div class="field"><label>Total al mes (€)</label><input id="apMes" inputmode="decimal" value="${num(ap.mensual)}"></div><div class="field"><label>Empieza</label><input type="date" id="apIni" value="${ap.inicio}"></div></div>
    <label>Reparto (€ al mes)</label><div class="grid2">${c.funds.map((f) => `<div class="field"><label class="small">${esc(f.corto)}</label><input data-rep="${f.id}" inputmode="decimal" value="${num(ap.reparto[f.id] ?? 0)}"></div>`).join('')}</div>
    <div class="small muted" id="repSum"></div>
  </section>

  <section class="card"><h3>Personal</h3>
    <div class="grid2"><div class="field"><label>Edad actual (hoy: ${age})</label><input id="edad" inputmode="numeric" value="${c.edad}"></div><div class="field"><label>Cumpleaños (DD/MM)</label><input id="cumple" placeholder="04/01" value="${c.cumple ? c.cumple.slice(3) + '/' + c.cumple.slice(0, 2) : ''}"></div></div>
    <div class="grid2"><div class="field"><label>Edad objetivo</label><input id="edadObj" inputmode="numeric" value="${c.edadObjetivo}"></div><div class="field"><label>Rentabilidad anual esperada (%)</label><input id="rent" inputmode="decimal" value="${num(c.rentEsperada)}"></div></div>
    <p class="small muted" style="margin:0">A los ${c.edadObjetivo} años faltan ${Math.max(0, c.edadObjetivo - age)} años aprox.</p>
  </section>

  <section class="card"><h3>Datos</h3>
    <p class="small muted" style="margin-top:0">Todo se guarda solo en este dispositivo. No se envía a ningún servidor. Haz copia de vez en cuando.</p>
    <div class="row"><button class="btn ghost small" id="exp">Exportar copia</button><button class="btn ghost small" id="imp">Importar copia</button><input type="file" id="impf" accept="application/json" hidden></div>
    <div class="row" style="margin-top:10px"><button class="btn danger small" id="reset">Borrar todos los datos de este dispositivo</button></div>
    <p class="small muted">La app nunca pide ni guarda usuario, contraseña ni claves de MyInvestor, y no inicia sesión en ningún banco. Solo usa precios públicos de fondos y lo que tú escribes.</p>
  </section>`;

  const sumRep = () => { const s = [...v.querySelectorAll('[data-rep]')].reduce((a, i) => a + (C.parseNum(i.value, { dotThousands: true }) || 0), 0); const m = C.parseNum($('#apMes').value, { dotThousands: true }) || 0; $('#repSum').innerHTML = Math.abs(s - m) < 0.005 ? `Reparto suma ${eur(s)} ✓` : `<span class="neg">El reparto suma ${eur(s)} y el total es ${eur(m)}.</span>`; };
  sumRep();

  $('#tema').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; c.tema = b.dataset.t; persist(); applyTheme(); [...$('#tema').children].forEach((x) => x.setAttribute('aria-pressed', x === b)); };
  $('#fBase').onchange = (e) => { if (C.isIso(e.target.value)) { c.fechaBase = e.target.value; persist(); toast('Guardado'); } };
  v.querySelectorAll('details[data-fid]').forEach((d) => {
    d.onchange = (e) => {
      const k = e.target.dataset.k; if (!k) return;
      const f = fundOf(d.dataset.fid); let val = e.target.value.trim();
      if (k === 'participaciones' || k === 'capital') { const n = C.parseNum(val, { dotThousands: k === 'capital' }); if (!(n >= 0)) { toast('Número no válido'); e.target.value = String(f[k]).replace('.', ','); return; } f[k] = n; }
      else if (k === 'isin') f.isin = val.toUpperCase().replace(/\s/g, '');
      else if (k === 'desde') f.desde = C.isIso(val) ? val : '';
      else f[k] = val.slice(0, 80);
      persist(); toast('Guardado');
      if (k === 'corto') d.querySelector('summary').textContent = f.corto;
    };
  });
  $('#navSave').onclick = () => {
    let n = 0;
    v.querySelectorAll('[data-nid]').forEach((row) => {
      const id = row.dataset.nid, val = C.parseNum(row.querySelector('[data-nav]').value), d = row.querySelector('[data-navd]').value;
      if (!row.querySelector('[data-nav]').value.trim()) return;
      if (!(val > 0) || !C.isIso(d)) { toast('Revisa el valor o la fecha'); return; }
      const cur = ctx.navInfo[id];
      if (cur && Math.abs(val / cur.nav - 1) > 0.15 && !confirm(`El valor ${f2.format(val)} € difiere más de un 15 % del último (${f2.format(cur.nav)} €). ¿Es correcto?`)) return;
      state.manualNav[id] = (state.manualNav[id] || []).filter((x) => x.d !== d).concat({ d, nav: val }); n++;
    });
    if (n) { persist(); toast(`${n} valor(es) guardado(s)`); render(); } else toast('No hay nada que guardar');
  };
  $('#navClear').onclick = () => { if (confirm('¿Borrar todos los valores liquidativos manuales?')) { state.manualNav = {}; persist(); render(); } };

  const saveAp = () => {
    ap.activa = $('#apOn').checked;
    ap.mensual = Math.max(0, C.parseNum($('#apMes').value, { dotThousands: true }) || 0);
    if (C.isIso($('#apIni').value)) ap.inicio = $('#apIni').value;
    v.querySelectorAll('[data-rep]').forEach((i) => { ap.reparto[i.dataset.rep] = Math.max(0, C.parseNum(i.value, { dotThousands: true }) || 0); });
    proj = null; persist(); sumRep();
  };
  ['#apOn', '#apMes', '#apIni'].forEach((s) => ($(s).onchange = saveAp));
  v.querySelectorAll('[data-rep]').forEach((i) => (i.onchange = saveAp));
  v.querySelectorAll('[data-rep]').forEach((i) => (i.oninput = sumRep)); $('#apMes').oninput = sumRep;

  const savePers = () => {
    const e = Math.round(C.parseNum($('#edad').value)), o = Math.round(C.parseNum($('#edadObj').value)), r = C.parseNum($('#rent').value);
    const cm = $('#cumple').value.trim().match(/^(\d{1,2})[\/-](\d{1,2})$/);
    if (e > 0 && e < 100) { if (e !== c.edad) c.edadRef = today(); c.edad = e; }
    if (o > 0 && o < 100) c.edadObjetivo = o;
    if (r > -20 && r < 60) { c.rentEsperada = r; proj = null; }
    if (cm) { const k = `${cm[2].padStart(2, '0')}-${cm[1].padStart(2, '0')}`; if (C.isIso('2024-' + k)) c.cumple = k; } else if (!$('#cumple').value.trim()) c.cumple = '';
    persist(); toast('Guardado');
  };
  ['#edad', '#cumple', '#edadObj', '#rent'].forEach((s) => ($(s).onchange = savePers));

  $('#exp').onclick = () => {
    const blob = new Blob([S.exportJSON(state)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `mi-cartera-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $('#imp').onclick = () => $('#impf').click();
  $('#impf').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try { const next = S.sanitize(JSON.parse(await file.text())); if (!confirm('Esto reemplaza los datos actuales de este dispositivo. ¿Continuar?')) return; state = next; proj = null; persist(); toast('Copia importada'); render(); }
    catch { toast('El archivo no es una copia válida'); }
  };
  $('#reset').onclick = () => { if (confirm('¿Borrar TODOS los datos de este dispositivo y volver a los valores iniciales?')) { state = S.defaults(); proj = null; persist(); render(); toast('Datos restablecidos'); } };
}

/* ───────────── Arranque ───────────── */
$('#tabs').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; tab = b.dataset.tab; render(); };
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => state.config.tema === 'auto' && applyTheme());

(async function init() {
  await loadNav();
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  // Al volver a abrir la app desde segundo plano, refresca precios.
  document.addEventListener('visibilitychange', async () => { if (document.visibilityState === 'visible') { await loadNav(); if (!$('#modal').innerHTML) { const y = scrollY; const active = document.activeElement; if (!(active && /INPUT|SELECT/.test(active.tagName))) { render(); scrollTo(0, y); } } } });
})();
