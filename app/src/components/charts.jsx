import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ReferenceArea, Cell, ErrorBar, Scatter, LabelList,
} from 'recharts';
import { qShort, qLabel, fmt, fmtAxis, SRC, periodText } from '../lib/engine.js';

// ---------------------------------------------------------------- theme colors
const KEYS = ['bg', 'panel', 'ink', 'ink-2', 'muted', 'line', 'line-2', 'goog', 'meta', 'seg1', 'seg2', 'seg3', 'seg4', 'seg5', 'seg-other', 'vol', 'price', 'accent', 'wash', 'good', 'bad'];
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const o = {}; KEYS.forEach((k) => { o[k] = cs.getPropertyValue('--' + k).trim(); });
  return o;
}
export function useColors() {
  const [c, setC] = useState(readColors);
  useEffect(() => {
    const upd = () => setC(readColors());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener?.('change', upd);
    const mo = new MutationObserver(upd);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    return () => { mq.removeEventListener?.('change', upd); mo.disconnect(); };
  }, []);
  return c;
}
export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// nice axis scale: bars always include zero; lines pad the data range instead of forcing zero
function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(Math.abs(raw) || 1))); const n = raw / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
export function niceScale(vals, kind, unit) {
  const v = vals.filter((x) => x != null && Number.isFinite(x));
  if (!v.length) return { domain: [0, 1], ticks: [0, 1], step: 1 };
  let lo = Math.min(...v), hi = Math.max(...v);
  if (kind === 'line') {
    const span = hi - lo || Math.abs(hi) * 0.1 || 1; lo -= span * 0.15; hi += span * 0.15;
    if (Math.min(...v) >= 0 && lo < 0) lo = 0;
    if (unit === 'pct' && Math.max(...v) <= 1 && hi > 1) hi = 1;
  } else { lo = Math.min(0, lo); hi = Math.max(0, hi); }
  const step = niceStep((hi - lo) / 4 || 1);
  const a = Math.floor(lo / step + 1e-9) * step, b = Math.ceil(hi / step - 1e-9) * step;
  const ticks = []; for (let t = a; t <= b + step / 2; t += step) ticks.push(Math.round(t / step) * step);
  return { domain: [a, b], ticks, step };
}
// ---------------------------------------------------------------- bar with rounded data-end
export function DataEndBar(props) {
  const { x, y, width, height, fill, opacity } = props;
  if (width == null || height == null || Number.isNaN(height)) return null;
  const h = Math.abs(height); if (h < 0.5) return null;
  const top = height >= 0 ? y : y + height; // recharts gives negative height for negative values
  const neg = props.value != null && (Array.isArray(props.value) ? props.value[1] < 0 : props.value < 0);
  const r = Math.min(4, h, width / 2);
  const x0 = x, x1 = x + width, y0 = top, y1 = top + h;
  const d = neg
    ? `M${x0},${y0} H${x1} V${y1 - r} Q${x1},${y1} ${x1 - r},${y1} H${x0 + r} Q${x0},${y1} ${x0},${y1 - r} Z`
    : `M${x0},${y1} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x1 - r} Q${x1},${y0} ${x1},${y0 + r} V${y1} Z`;
  return <path d={d} fill={fill} opacity={opacity} />;
}

// ---------------------------------------------------------------- tooltip
function TipContent({ active, payload, label, series, period, def, unitOverride }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload;
  return (
    <div className="tip" role="status">
      <div className="t-period">{periodText(label, period)}</div>
      {series.map((s) => {
        const cell = row[s.id + '__'];
        if (!cell) return null;
        return (
          <div className="t-row" key={s.id}>
            <span className="key-line" style={{ background: s.color }} />
            <div>
              <div className="t-val">{fmt(cell.v, unitOverride || cell.unit)}</div>
              <div className="t-name">{s.name}</div>
              {cell.note && <div className="t-note">{cell.note}</div>}
              {cell.src && cell.src.length > 0 && <div className="t-src">Source: {cell.src.map((id) => `${SRC[id]?.doc} (${SRC[id]?.date})`).join('; ')}</div>}
            </div>
          </div>
        );
      })}
      {def && <div className="t-def">{def}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- legend
export function Legend({ series, kind, onToggle, hidden = [] }) {
  if (!series || series.length < 2) return null;
  return (
    <div className="legend" aria-label="Legend">
      {series.map((s) => (
        <button key={s.id} type="button" aria-pressed={!hidden.includes(s.id)} onClick={() => onToggle && onToggle(s)} title={onToggle ? `Toggle ${s.name}` : s.name}>
          {kind === 'line' ? <span className="key-line" style={{ background: s.color }} /> : <span className="key-rect" style={{ background: s.color }} />}
          {s.name}
        </button>
      ))}
    </div>
  );
}

/**
 * Quarter chart. series: [{id, name, color, get(q) -> {v, unit, note, src}}]
 * kind: 'bar' | 'line' | 'stack'
 */
export function QChart({ series, quarters, kind = 'bar', unit, focusQ, explicitFocus, onFocus, height = 240, period = 'Q', def, ariaLabel, endLabels = true, zero = true, colorBySign }) {
  const c = useColors();
  const rm = reducedMotion();
  const data = useMemo(() => quarters.map((q) => {
    const row = { q };
    series.forEach((s) => { const cell = s.get(q); row[s.id] = cell.v; row[s.id + '__'] = cell; });
    return row;
  }), [series, quarters]);
  const hasData = data.some((r) => series.some((s) => r[s.id] != null));
  const u = unit || series[0]?.get(quarters[0])?.unit;
  const scale = useMemo(() => {
    if (kind === 'stack') {
      const tot = data.map((r) => series.reduce((a, s) => a + (r[s.id] > 0 ? r[s.id] : 0), 0));
      return niceScale(tot.concat([0]), 'bar');
    }
    return niceScale(data.flatMap((r) => series.map((s) => r[s.id])), kind, u);
  }, [data, series, kind, u]);

  const onKey = useCallback((e) => {
    const i = quarters.indexOf(focusQ);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const n = e.key === 'ArrowRight' ? Math.min(quarters.length - 1, i + 1) : Math.max(0, i - 1);
      onFocus && onFocus(quarters[n < 0 ? quarters.length - 1 : n]);
    } else if (e.key === 'Home') { e.preventDefault(); onFocus && onFocus(quarters[0]); }
    else if (e.key === 'End') { e.preventDefault(); onFocus && onFocus(quarters[quarters.length - 1]); }
  }, [quarters, focusQ, onFocus]);

  if (!hasData) {
    return <div className="empty"><strong>No data for this selection</strong><span>None of the selected companies report this metric for the chosen quarters and view. Try another period view, metric or company.</span></div>;
  }
  const last = quarters.length - 1;
  const dim = (q) => (explicitFocus && focusQ && q !== focusQ ? 0.38 : 1);
  const endLabel = (s) => (props) => {
    const { x, y, index, value } = props;
    if (!endLabels || index !== last || value == null) return null;
    return <text x={x + 8} y={y} dy={4} fontSize={11} fill={c.ink} fontFamily="IBM Plex Mono, monospace">{fmt(value, u)}</text>;
  };
  return (
    <div className="chart-wrap" tabIndex={0} role="group" aria-label={`${ariaLabel || 'Chart'}. Use left and right arrow keys to move the focused quarter.`} onKeyDown={onKey}>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 10, right: kind === 'line' && endLabels ? 64 : 12, bottom: 0, left: 0 }}
          onClick={(e) => { if (e && e.activeLabel && onFocus) onFocus(e.activeLabel, true); }} barGap={2} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={c.line} />
          {explicitFocus && focusQ && <ReferenceArea x1={focusQ} x2={focusQ} fill={c.wash} fillOpacity={1} stroke="none" ifOverflow="extendDomain" />}
          <XAxis dataKey="q" tickFormatter={qShort} tick={{ fill: c.muted, fontSize: 11 }} axisLine={{ stroke: c["line-2"] }} tickLine={false} interval={quarters.length <= 4 ? 0 : "preserveStartEnd"} minTickGap={6} />
          <YAxis tickFormatter={(v) => fmtAxis(v, u, scale.step)} tick={{ fill: c.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={54} domain={scale.domain} ticks={scale.ticks} interval={0} />
          {zero && <ReferenceLine y={0} stroke={c['line-2']} />}
          <Tooltip content={<TipContent series={series} period={period} def={def} />} cursor={{ stroke: c['line-2'], strokeWidth: 1 }} isAnimationActive={false} wrapperStyle={{ zIndex: 10, outline: 'none' }} allowEscapeViewBox={{ x: false, y: true }} />
          {series.map((s) => (kind === 'line' ? (
            <Line key={s.id} type="linear" dataKey={s.id} name={s.name} stroke={s.color} strokeWidth={2} connectNulls={false}
              dot={{ r: 4, fill: s.color, stroke: c.panel, strokeWidth: 2 }} activeDot={{ r: 5, fill: s.color, stroke: c.panel, strokeWidth: 2 }} isAnimationActive={false}>
              <LabelList dataKey={s.id} content={endLabel(s)} />
            </Line>
          ) : (
            <Bar key={s.id} dataKey={s.id} name={s.name} fill={s.color} maxBarSize={24} stackId={kind === 'stack' ? 'a' : undefined}
              shape={kind === 'stack' ? undefined : <DataEndBar />} isAnimationActive={false} stroke={kind === 'stack' ? c.panel : undefined} strokeWidth={kind === 'stack' ? 1 : 0}>
              {data.map((r) => <Cell key={r.q} fill={colorBySign ? (r[s.id] >= 0 ? colorBySign[0] : colorBySign[1]) : s.color} opacity={dim(r.q)} />)}
            </Bar>
          )))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Always-visible readout of the focused quarter (keyboard/hover-free access to values). */
export function Readout({ q, series, period, unit }) {
  if (!q) return null;
  return (
    <div className="readout" aria-live="polite">
      <span className="q">{period === 'Q' ? qLabel(q) : periodText(q, period)}</span>
      {series.map((s) => { const cell = s.get(q); return (
        <span key={s.id}><span className="key-line" style={{ background: s.color, marginRight: 6, verticalAlign: 3 }} />{s.name} <b>{fmt(cell.v, unit || cell.unit)}</b>{cell.v == null && cell.note ? ` (${cell.note})` : ''}</span>
      ); })}
    </div>
  );
}

/** Compact table twin of a chart. */
export function TableView({ series, quarters, unit, focusQ }) {
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><th scope="col">Series</th>{quarters.map((q) => <th key={q} scope="col">{qShort(q)}</th>)}<th scope="col">Source</th></tr></thead>
        <tbody>
          {series.map((s) => {
            const srcs = new Set(); quarters.forEach((q) => (s.get(q).src || []).forEach((x) => srcs.add(x)));
            return (
              <tr key={s.id}>
                <td>{s.name}</td>
                {quarters.map((q) => { const cell = s.get(q); return <td key={q} className={cell.v == null ? 'na' : ''} title={cell.note || ''} style={q === focusQ ? { background: 'var(--wash)' } : undefined}>{fmt(cell.v, unit || cell.unit)}</td>; })}
                <td style={{ fontFamily: 'var(--font-ui)' }}>{[...srcs].slice(0, 3).map((id, i) => <React.Fragment key={id}>{i > 0 && ', '}<a href={SRC[id]?.url} target="_blank" rel="noreferrer">{id}</a></React.Fragment>)}{srcs.size > 3 ? ` +${srcs.size - 3}` : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Source links under a chart: the focused quarter's documents first, the rest on demand. */
const shortDoc = (s) => `${s.type.startsWith('Secondary') ? '' : s.co === 'GOOGL' ? 'Alphabet' : s.co === 'META' ? 'Meta' : ''} ${s.doc.replace(/ earnings release| results press release/i, ' release').replace(/^Form /, '')}`.trim();
export function SourceLine({ ids, focusIds, focusLabel }) {
  const [open, setOpen] = useState(false);
  const all = [...new Set(ids || [])].filter((id) => SRC[id]);
  const foc = [...new Set(focusIds || [])].filter((id) => SRC[id]);
  if (!all.length && !foc.length) return null;
  const show = foc.length ? foc : all.slice(0, 3);
  const hidden = all.filter((id) => !show.includes(id));
  const link = (id) => <a key={id} href={SRC[id].url} target="_blank" rel="noreferrer" title={`${SRC[id].doc} · ${SRC[id].type} · published ${SRC[id].date}`}>{shortDoc(SRC[id])} ({SRC[id].date})</a>;
  return (
    <div className="srcline">
      <span>{foc.length ? `Source, ${focusLabel}:` : 'Sources:'}</span>
      {show.map(link)}
      {open && hidden.map(link)}
      {hidden.length > 0 && <button type="button" className="linkbtn" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Show fewer' : `All periods (+${hidden.length})`}</button>}
    </div>
  );
}

// ---------------------------------------------------------------- range chart (guidance)
export function RangeChart({ rows, height = 230, unit = 'usd', colorFor, onPick, ariaLabel, divider, dividerLabel }) {
  const c = useColors();
  // rows: [{x, label, mid, err:[lo, hi], actual, co, note}]
  return (
    <div className="chart-wrap" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={rows} margin={{ top: 10, right: 12, left: 0, bottom: 0 }} onClick={(e) => e && e.activeLabel && onPick && onPick(e.activeLabel)}>
          <CartesianGrid vertical={false} stroke={c.line} />
          <XAxis dataKey="x" tick={{ fill: c.muted, fontSize: 11 }} axisLine={{ stroke: c['line-2'] }} tickLine={false} interval={0} />
          <YAxis tickFormatter={(v) => fmtAxis(v, unit)} tick={{ fill: c.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={50} domain={['auto', 'auto']} />
          <Tooltip isAnimationActive={false} cursor={{ fill: c.wash }} content={({ active, payload }) => {
            if (!active || !payload?.length) return null; const r = payload[0].payload;
            return <div className="tip"><div className="t-period">{r.tipHead}</div>{r.tipRows.map((t, i) => <div key={i}><span className="t-val">{t.v}</span> <span className="t-name">{t.k}</span></div>)}{r.src && <div className="t-src">Source: {SRC[r.src]?.doc} ({SRC[r.src]?.date})</div>}</div>;
          }} />
          {divider && <ReferenceLine x={divider} stroke={c['line-2']} label={{ value: dividerLabel, position: 'insideTopLeft', fill: c.muted, fontSize: 11 }} />}
          <Scatter dataKey="mid" fill={colorFor ? colorFor(rows[0]) : c.accent} shape={(p) => (p.payload.mid == null ? null : <rect x={p.cx - 5} y={p.cy - 1} width={10} height={2} fill={c.ink} />)} isAnimationActive={false}>
            <ErrorBar dataKey="err" width={10} strokeWidth={2} stroke={colorFor ? colorFor(rows[0]) : c.accent} direction="y" />
          </Scatter>
          <Scatter dataKey="actual" isAnimationActive={false} shape={(p) => (p.payload.actual == null ? null : <circle cx={p.cx} cy={p.cy} r={5} fill={c.ink} stroke={c.panel} strokeWidth={2} />)} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
