// Regional (APAC) and advertising deep-dive sections, shared by the global and APAC editions.
import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Cell } from 'recharts';
import {
  DATA, M, CO, SRC, REGIONS, regionLabel, qLabel, qShort, qIdx, Q_ALL, periodText, value, shown, sourcesFor, fmt, fmtAxis,
} from '../lib/engine.js';
import { QChart, Readout, Legend, useColors, DataEndBar, niceScale, SourceLine, withPct } from './charts.jsx';
import { Card, pctCls } from './ui.jsx';

export const regionColor = (c, id) => ({ ap: c.seg1, na: c.seg2, eu: c.seg3, row: c.seg4, ww: c['seg-other'] }[id]);
const MK = Object.fromEntries(REGIONS.map((r) => [r.id, r.mk]));
const GK = Object.fromEntries(REGIONS.map((r) => [r.id, r.gk]));

export function mkSeries(co, id, name, color, mode, ctx, extra = {}) {
  return { id: `${co}-${id}`, co, name, color, metric: id, ...extra, get: (q) => ({ ...shown(co, id, q, ctx, mode), src: sourcesFor(co, id, q, ctx) }) };
}
const allSrc = (series, quarters) => { const s = new Set(); series.forEach((x) => quarters.forEach((q) => (x.get(q).src || []).forEach((i) => s.add(i)))); return [...s]; };

/** Bars over a non-quarter category axis (regions, fiscal years). rows: [{x, label, [seriesId]: value}] */
export function CategoryBars({ rows, series, unit, height = 230, ariaLabel, highlight }) {
  const c = useColors();
  const scale = useMemo(() => niceScale(rows.flatMap((r) => series.map((s) => r[s.id])), 'bar'), [rows, series]);
  return (
    <div className="chart-wrap" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={rows} margin={{ top: 10, right: 12, left: 0, bottom: 0 }} barGap={2} barCategoryGap="24%">
          <CartesianGrid vertical={false} stroke={c.line} />
          <XAxis dataKey="label" tick={{ fill: c.muted, fontSize: 11 }} axisLine={{ stroke: c['line-2'] }} tickLine={false} interval={0} />
          <YAxis tickFormatter={(v) => fmtAxis(v, unit, scale.step)} tick={{ fill: c.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={54} domain={scale.domain} ticks={scale.ticks} interval={0} />
          <ReferenceLine y={0} stroke={c['line-2']} />
          <Tooltip isAnimationActive={false} cursor={{ fill: c.wash }} content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null; const r = payload[0].payload;
            return (<div className="tip"><div className="t-period">{r.tipHead || label}</div>
              {series.map((s) => r[s.id] == null ? null : <div className="t-row" key={s.id}><span className="key-line" style={{ background: s.color }} /><div><div className="t-val">{fmt(r[s.id], unit)}</div><div className="t-name">{s.name}</div></div></div>)}
              {r.note && <div className="t-note">{r.note}</div>}{r.src && <div className="t-src">Source: {r.src.map((id) => `${SRC[id]?.doc} (${SRC[id]?.date})`).join('; ')}</div>}</div>);
          }} />
          {series.map((s) => (
            <Bar key={s.id} dataKey={s.id} name={s.name} fill={s.color} maxBarSize={24} shape={<DataEndBar />} isAnimationActive={false}>
              {rows.map((r) => <Cell key={r.x} fill={s.color} opacity={highlight && r.x !== highlight ? 0.45 : 1} />)}
            </Bar>
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Generic scorecard tile with free-form rows. */
function Tile({ label, caption, rows, foot }) {
  return (
    <div className="score">
      <div className="s-lbl"><span>{label}</span>{caption && <span className="s-cap">{caption}</span>}</div>
      {rows.map((r, i) => (
        <div className="s-row" key={i} title={r.note || ''}>
          <span className="s-co"><span className="dot" style={{ background: r.color }} />{r.label}</span>
          <span className="s-val">{fmt(r.v, r.unit)}</span>
          <span className={`s-delta ${r.dUnit && r.dUnit !== 'pct' ? pctCls(r.d, r.goodUp !== false) : ''}`}>{r.d == null ? (r.dNote || '') : fmt(r.d, r.dUnit)}</span>
        </div>
      ))}
      {foot && <div className="lead">{foot}</div>}
    </div>
  );
}

// helpers on reported values
const yoy = (co, id, q, ctx) => shown(co, id, q, ctx, 'yoy').v;
const val = (co, id, q, ctx) => value(co, id, q, ctx);
const delta = (co, id, q, ctx) => { const i = qIdx(q); const p = Q_ALL[i - 4]; const a = val(co, id, q, ctx), b = p ? val(co, id, p, ctx) : null; return a == null || b == null ? null : a - b; };

// ================================================================== APAC overview
export function ApacOverview({ fq, ctx, cos, f, c, coColor }) {
  const g = cos.includes('GOOGL'), me = cos.includes('META');
  const L = periodText(fq, f.period);
  const qOnly = f.period !== 'Q';
  const apC = regionColor(c, 'ap'), wwC = regionColor(c, 'ww');
  const tiles = [];
  tiles.push({ label: 'APAC revenue', caption: 'YoY', rows: [
    g && { label: 'Alphabet', color: coColor('GOOGL'), v: val('GOOGL', 'geo_apac', fq, ctx), unit: 'usd', d: yoy('GOOGL', 'geo_apac', fq, ctx), dUnit: 'growth', note: 'Customer billing address; all revenue types' },
    me && { label: 'Meta', color: coColor('META'), v: val('META', 'rev_ap', fq, ctx), unit: 'usd', d: yoy('META', 'rev_ap', fq, ctx), dUnit: 'growth', note: 'User location; all revenue types' },
  ].filter(Boolean), foot: <span className="tag">Bases differ: billing address vs user location</span> });
  tiles.push({ label: 'APAC share of company revenue', caption: 'YoY change', rows: [
    g && { label: 'Alphabet', color: coColor('GOOGL'), v: val('GOOGL', 'geo_apac_share', fq, ctx), unit: 'pct', d: shown('GOOGL', 'geo_apac_share', fq, ctx, 'yoy').v, dUnit: 'pp' },
    me && { label: 'Meta', color: coColor('META'), v: val('META', 'rev_ap_share', fq, ctx), unit: 'pct', d: shown('META', 'rev_ap_share', fq, ctx, 'yoy').v, dUnit: 'pp' },
  ].filter(Boolean) });
  const gap = (a, b) => (a == null || b == null ? null : (a - b) * 100);
  const gapA = g ? gap(yoy('GOOGL', 'geo_apac', fq, ctx), yoy('GOOGL', 'revenue', fq, ctx)) : null;
  const gapM = me ? gap(yoy('META', 'rev_ap', fq, ctx), yoy('META', 'revenue', fq, ctx)) : null;
  tiles.push({ label: 'APAC growth vs company growth', caption: 'gap', rows: [
    g && { label: 'Alphabet', color: coColor('GOOGL'), v: yoy('GOOGL', 'geo_apac', fq, ctx), unit: 'growth', d: Number.isFinite(gapA) ? gapA : null, dUnit: 'pp' },
    me && { label: 'Meta', color: coColor('META'), v: yoy('META', 'rev_ap', fq, ctx), unit: 'growth', d: Number.isFinite(gapM) ? gapM : null, dUnit: 'pp' },
  ].filter(Boolean), foot: <span className="tag">APAC YoY, then gap to total revenue YoY</span> });
  const contrib = (co, rid, tid) => { const a = delta(co, rid, fq, ctx), b = delta(co, tid, fq, ctx); return a == null || !b ? null : a / b; };
  tiles.push({ label: 'APAC share of revenue added', caption: 'YoY $ added', rows: [
    g && { label: 'Alphabet', color: coColor('GOOGL'), v: contrib('GOOGL', 'geo_apac', 'revenue'), unit: 'pct', d: delta('GOOGL', 'geo_apac', fq, ctx), dUnit: 'usd', goodUp: true },
    me && { label: 'Meta', color: coColor('META'), v: contrib('META', 'rev_ap', 'revenue'), unit: 'pct', d: delta('META', 'rev_ap', fq, ctx), dUnit: 'usd', goodUp: true },
  ].filter(Boolean) });
  if (me) {
    tiles.push({ label: 'Meta APAC ad revenue', caption: 'YoY', rows: [
      { label: 'APAC', color: apC, v: val('META', 'ad_ap', fq, ctx), unit: 'usd', d: yoy('META', 'ad_ap', fq, ctx), dUnit: 'growth' },
      { label: 'Worldwide', color: wwC, v: val('META', 'ad_revenue', fq, ctx), unit: 'usd', d: yoy('META', 'ad_revenue', fq, ctx), dUnit: 'growth' },
    ] });
    tiles.push({ label: 'Meta ad impressions', caption: qOnly ? `${qLabel(fq)} only` : 'YoY', rows: [
      { label: 'APAC', color: apC, v: DATA.rows.META[fq].imp_ap, unit: 'rate' },
      { label: 'Worldwide', color: wwC, v: DATA.rows.META[fq].imp_ww, unit: 'rate' },
    ] });
    tiles.push({ label: 'Meta average price per ad', caption: qOnly ? `${qLabel(fq)} only` : 'YoY', rows: [
      { label: 'APAC', color: apC, v: DATA.rows.META[fq].ppa_ap, unit: 'rate' },
      { label: 'Worldwide', color: wwC, v: DATA.rows.META[fq].ppa_ww, unit: 'rate' },
    ] });
  }
  if (g) {
    tiles.push({ label: 'Alphabet U.S. vs APAC', caption: 'YoY', rows: [
      { label: 'APAC', color: apC, v: val('GOOGL', 'geo_apac', fq, ctx), unit: 'usd', d: yoy('GOOGL', 'geo_apac', fq, ctx), dUnit: 'growth' },
      { label: 'United States', color: regionColor(c, 'na'), v: val('GOOGL', 'geo_us', fq, ctx), unit: 'usd', d: yoy('GOOGL', 'geo_us', fq, ctx), dUnit: 'growth' },
    ] });
  }
  const fy = (co, y) => (co === 'GOOGL' ? DATA.a_fy_geo[y]?.[2] : DATA.m_fy_geo[y]?.[2]);
  tiles.push({ label: 'FY2025 APAC by billing address', caption: 'YoY', rows: [
    g && { label: 'Alphabet', color: coColor('GOOGL'), v: fy('GOOGL', 'FY2025'), unit: 'usd', d: fy('GOOGL', 'FY2025') / fy('GOOGL', 'FY2024') - 1, dUnit: 'growth' },
    me && { label: 'Meta', color: coColor('META'), v: fy('META', 'FY2025'), unit: 'usd', d: fy('META', 'FY2025') / fy('META', 'FY2024') - 1, dUnit: 'growth' },
  ].filter(Boolean), foot: <span className="tag">Like-for-like basis (10-K), annual only</span> });
  if (me) {
    const seen = ['2025Q1', '2025Q2', '2025Q3', '2025Q4'].reduce((a, q) => a + DATA.rows.META[q].rev_ap, 0);
    const billed = fy('META', 'FY2025');
    tiles.push({ label: 'Meta APAC: billed vs seen, FY2025', caption: 'share of revenue', rows: [
      { label: 'Billed in APAC', color: coColor('META'), v: billed, unit: 'usd', d: billed / 200966, dUnit: 'pct' },
      { label: 'Users in APAC', color: apC, v: seen, unit: 'usd', d: seen / 200966, dUnit: 'pct' },
    ], foot: <span><b>{fmt(billed - seen, 'usd')}</b> from APAC-billed advertisers reaching users elsewhere</span> });
  }
  const shownTiles = tiles.slice(0, 10);
  return (
    <section className="sec" id="overview" aria-labelledby="h-overview">
      <div className="sec-head"><span className="num">01</span><h2 id="h-overview">APAC overview</h2><p>Scorecards for <b>{L}</b>. Click any quarterly chart to move this view. Meta reports Asia-Pacific by user location; Alphabet by customer billing address.</p></div>
      <div className="score-grid">{shownTiles.map((t, i) => <Tile key={i} {...t} />)}</div>
      <ApacInsights fq={fq} ctx={ctx} cos={cos} f={f} />
    </section>
  );
}

function ApacInsights({ fq, ctx, cos, f }) {
  const items = [];
  const L = f.period === 'Q' ? qLabel(fq) : periodText(fq, f.period);
  const me = cos.includes('META'), g = cos.includes('GOOGL');
  const push = (node, lbl) => items.push({ node, lbl: lbl || L });
  if (me) {
    const ap = yoy('META', 'ad_ap', fq, ctx), ww = yoy('META', 'ad_revenue', fq, ctx);
    const r = DATA.rows.META[fq];
    if (ap != null) push(<>Meta APAC ad revenue grew <b>{fmt(ap, 'growth')}</b> versus <b>{fmt(ww, 'growth')} worldwide</b>{f.period === 'Q' ? <>, with impressions <b>{fmt(r.imp_ap, 'rate')}</b> but price per ad only <b>{fmt(r.ppa_ap, 'rate')}</b> (worldwide {fmt(r.ppa_ww, 'rate')})</> : null}. APAC growth is volume-led: inventory is expanding faster than advertiser pricing.</>);
    const sh = val('META', 'ad_ap_share', fq, ctx), shp = shown('META', 'ad_ap_share', fq, ctx, 'yoy').v;
    if (sh != null) push(<>APAC is <b>{fmt(sh, 'pct')} of Meta ad revenue</b> by user location ({shp == null ? 'n/a' : fmt(shp, 'pp')} YoY), while US & Canada price per ad rose {f.period === 'Q' ? fmt(r.ppa_us, 'rate') : 'faster'}: the mix is shifting toward higher-priced US & Canada inventory.</>);
    const billed = DATA.m_fy_geo.FY2025[2]; const seen = ['2025Q1', '2025Q2', '2025Q3', '2025Q4'].reduce((a, q) => a + DATA.rows.META[q].rev_ap, 0);
    push(<>On a billing basis APAC was <b>{fmt(billed, 'usd')}</b> ({fmt(billed / 200966, 'pct')}) of Meta's 2025 revenue versus <b>{fmt(seen, 'usd')}</b> by user location: about <b>{fmt(billed - seen, 'usd')}</b> came from APAC-billed advertisers, largely exporters, reaching users in other regions.</>, 'FY2025');
  }
  if (g) {
    const a = yoy('GOOGL', 'geo_apac', fq, ctx), t = yoy('GOOGL', 'revenue', fq, ctx), us = yoy('GOOGL', 'geo_us', fq, ctx), sh = val('GOOGL', 'geo_apac_share', fq, ctx);
    if (a != null) push(<>Alphabet APAC revenue grew <b>{fmt(a, 'growth')}</b> against <b>{fmt(t, 'growth')}</b> company-wide and <b>{fmt(us, 'growth')}</b> in the U.S.; APAC is <b>{fmt(sh, 'pct')}</b> of revenue. The figure includes Cloud and subscriptions, so it is not an ad-only measure.</>);
  }
  if (me && g) {
    const a = DATA.a_fy_geo, m = DATA.m_fy_geo;
    push(<>Like-for-like (billing address, FY2025): Alphabet APAC <b>{fmt(a.FY2025[2], 'usd')}</b> (+{((a.FY2025[2] / a.FY2024[2] - 1) * 100).toFixed(1)}%) vs Meta APAC <b>{fmt(m.FY2025[2], 'usd')}</b> (+{((m.FY2025[2] / m.FY2024[2] - 1) * 100).toFixed(1)}%). Meta earns {((m.FY2025[2] / m.FY2025[4]) * 100).toFixed(0)}% of revenue from APAC-billed customers; Alphabet {((a.FY2025[2] / a.FY2025[5]) * 100).toFixed(0)}%.</>, 'FY2025');
  }
  if (!items.length) return null;
  return <div className="insights" aria-label="Key APAC insights"><ol>{items.slice(0, 5).map((it, i) => <li key={i}><span>{it.node} <span className="src">· {it.lbl}</span></span></li>)}</ol></div>;
}

// ================================================================== APAC revenue trends
export function ApacTrends({ f, fq, ctx, cos, quarters, explicit, onFocus, c, coColor, viewText, kindFor, toggleCompany, explorer, vf, vc }) {
  const g = cos.includes('GOOGL'), me = cos.includes('META');
  const fRev = vf('apac-rev'), fRevShare = fRev.display === 'margin';
  const chart = (series, opts = {}) => (<>
    <QChart series={series} quarters={quarters} kind={opts.kind || kindFor(series[0].metric, opts.mode || 'value')} focusQ={fq} explicitFocus={explicit} onFocus={onFocus} period={f.period} height={opts.height || 230} def={opts.def || M[series[0].metric].def} ariaLabel={opts.aria} colorBySign={opts.colorBySign} endLabels={opts.endLabels !== false} />
    <Readout q={fq} series={series} period={f.period} />
  </>);
  const apacRev = [
    ...(g ? [mkSeries('GOOGL', fRevShare ? 'geo_apac_share' : 'geo_apac', fRevShare ? 'Alphabet APAC share' : 'Alphabet APAC (billing address)', coColor('GOOGL'), fRev.mode, ctx, { co: 'GOOGL' })] : []),
    ...(me ? [mkSeries('META', fRevShare ? 'rev_ap_share' : 'rev_ap', fRevShare ? 'Meta APAC share' : 'Meta APAC (user location)', coColor('META'), fRev.mode, ctx, { co: 'META' })] : []),
  ].map((sr) => (fRev.mode === 'value' && !fRevShare ? withPct(sr, (q) => value(sr.co, sr.co === 'GOOGL' ? 'geo_apac_share' : 'rev_ap_share', q, ctx)) : sr));
  const vsCo = (co) => [
    mkSeries(co, co === 'GOOGL' ? 'geo_apac' : 'rev_ap', 'APAC', regionColor(c, 'ap'), 'yoy', ctx),
    mkSeries(co, 'revenue', co === 'GOOGL' ? 'Total revenue' : 'Total revenue', regionColor(c, 'ww'), 'yoy', ctx),
  ];
  const contribSeries = cos.map((co) => ({
    id: co, co, name: CO[co].name, color: coColor(co), metric: 'revenue',
    get: (q) => { const rid = co === 'GOOGL' ? 'geo_apac' : 'rev_ap'; const a = delta(co, rid, q, ctx), b = delta(co, 'revenue', q, ctx); const v = a == null || !b ? null : a / b; return { v, unit: 'pct', note: v == null ? 'Needs prior-year quarter' : `APAC added ${fmt(a, 'usd')} of ${fmt(b, 'usd')} YoY`, src: [...sourcesFor(co, rid, q, ctx), ...sourcesFor(co, 'revenue', q, ctx)] }; },
  }));
  // annual like-for-like
  const fyRows = ['FY2023', 'FY2024', 'FY2025'].map((y) => ({ x: y, label: y, GOOGL: g ? DATA.a_fy_geo[y]?.[2] ?? null : null, META: me ? DATA.m_fy_geo[y]?.[2] ?? null : null, src: ['A-FY-GEO', 'M-FY-GEO'], tipHead: `${y} APAC revenue by customer billing address`, note: y === 'FY2023' ? 'Alphabet FY2023 geography not collected' : null }));
  const fySeries = cos.map((co) => ({ id: co, name: CO[co].name, color: coColor(co) }));
  const seenYear = (y) => ['Q1', 'Q2', 'Q3', 'Q4'].reduce((a, k) => { const r = DATA.rows.META[`${y}${k}`]; return a == null || !r || r.rev_ap == null ? null : a + r.rev_ap; }, 0);
  const bsRows = ['2024', '2025'].map((y) => ({ x: y, label: `FY${y}`, billed: DATA.m_fy_geo[`FY${y}`][2], seen: seenYear(y), src: ['M-FY-GEO', 'M-PRES-25Q3', 'M-PRES-26Q3'], tipHead: `Meta FY${y} Asia-Pacific revenue`, note: `Gap: ${fmt(DATA.m_fy_geo[`FY${y}`][2] - seenYear(y), 'usd')} billed in APAC but earned from users elsewhere` }));
  // regional growth table
  const regRows = [
    ...(g ? REGIONS.map((r) => ({ co: 'GOOGL', id: `geo_${r.gk}`, label: `Alphabet · ${r.googl}`, color: regionColor(c, r.id) })) : []),
    ...(me ? REGIONS.map((r) => ({ co: 'META', id: `rev_${r.mk}`, label: `Meta · ${r.meta}`, color: regionColor(c, r.id) })) : []),
  ];
  return (
    <section className="sec" id="trends" aria-labelledby="h-trends">
      <div className="sec-head"><span className="num">02</span><h2 id="h-trends">APAC revenue trends</h2><p>Each chart has its own Values and Display switches; Period comes from the filter bar.</p></div>
      <div className="grid">
        {explorer}
        <Card span={6} title="APAC revenue" views={vc('apac-rev', { display: 'Share of revenue' })} sub={`${viewText(apacRev[0]?.metric || 'geo_apac', fRev.mode)}${fRevShare ? ' · Share of company revenue' : ''}`} warn="Different bases: Alphabet by customer billing address (all revenue types); Meta by user location. Use the annual billing-address chart for a like-for-like view."
          series={apacRev} quarters={quarters} focusQ={fq} sources={allSrc(apacRev, quarters)} legend={<Legend series={apacRev} kind={kindFor(apacRev[0]?.metric || 'geo_apac', fRev.mode)} onToggle={toggleCompany} />}>
          {apacRev.length ? chart(apacRev, { mode: fRev.mode, aria: 'APAC revenue' }) : null}
        </Card>
        <Card span={6} title="APAC share of revenue added" sub="APAC YoY dollar increase / company YoY dollar increase" series={contribSeries} quarters={quarters} focusQ={fq} sources={allSrc(contribSeries, quarters)} legend={<Legend series={contribSeries} kind="line" onToggle={toggleCompany} />}>
          {chart(contribSeries, { kind: 'line', def: 'APAC share of the year-over-year revenue increase. A share below APAC\'s share of revenue means APAC is diluting growth.', aria: 'APAC contribution to growth' })}
        </Card>
        {me && <Card span={6} title="Meta: APAC vs total revenue growth" sub="YoY, user location" series={vsCo('META')} quarters={quarters} focusQ={fq} sources={allSrc(vsCo('META'), quarters)} legend={<Legend series={vsCo('META')} kind="line" />}>
          {chart(vsCo('META'), { kind: 'line', mode: 'yoy', aria: 'Meta APAC vs total growth' })}
        </Card>}
        {g && <Card span={6} title="Alphabet: APAC vs total revenue growth" sub="YoY, customer billing address" series={vsCo('GOOGL')} quarters={quarters} focusQ={fq} sources={allSrc(vsCo('GOOGL'), quarters)} legend={<Legend series={vsCo('GOOGL')} kind="line" />}
          extra={<div className="srcline">Constant-currency APAC growth (10-Q): Q1 2025 +15% (reported +12%, FX -3pt); Q2 2025 +18% (reported +19%). Later filings' MD&A text was not retrievable.</div>}>
          {chart(vsCo('GOOGL'), { kind: 'line', mode: 'yoy', aria: 'Alphabet APAC vs total growth' })}
        </Card>}
        <Card span={6} title="Like-for-like: APAC revenue by billing address" sub="Annual, from each company's 10-K. The only basis on which the two APAC figures are comparable." sources={['A-FY-GEO', 'M-FY-GEO']}
          extra={<div className="readout">{fyRows.map((r) => <span key={r.x}><span className="q">{r.x}</span>{g && r.GOOGL != null ? <> Alphabet <b>{fmt(r.GOOGL, 'usd')}</b></> : null}{me && r.META != null ? <> Meta <b>{fmt(r.META, 'usd')}</b></> : null}</span>)}</div>}
          legend={<Legend series={fySeries} kind="bar" />}>
          <CategoryBars rows={fyRows} series={fySeries} unit="usd" ariaLabel="APAC revenue by billing address, annual" />
        </Card>
        {me && <Card span={6} title="Meta Asia-Pacific: billed vs seen" sub="Revenue billed to APAC customers vs revenue from APAC users" sources={['M-FY-GEO', 'M-PRES-25Q3', 'M-PRES-26Q3']}
          legend={<Legend series={[{ id: 'billed', name: 'Billed in APAC (customer address)', color: coColor('META') }, { id: 'seen', name: 'Users in APAC (user location)', color: regionColor(c, 'ap') }]} kind="bar" />}
          extra={<div className="readout">{bsRows.map((r) => <span key={r.x}><span className="q">{r.label}</span> gap <b>{fmt(r.billed - r.seen, 'usd')}</b> ({fmt((r.billed - r.seen) / r.billed, 'pct')} of APAC billings)</span>)}</div>}>
          <CategoryBars rows={bsRows} series={[{ id: 'billed', name: 'Billed in APAC', color: coColor('META') }, { id: 'seen', name: 'Users in APAC', color: regionColor(c, 'ap') }]} unit="usd" ariaLabel="Meta APAC billed versus seen" />
        </Card>}
        <div className="card span-12">
          <div className="card-head"><div><h3>Regional revenue growth, YoY</h3><p className="sub">Every disclosed region for both companies ({{ Q: 'quarterly', YTD: 'year-to-date', TTM: 'trailing twelve months' }[f.period]}). Alphabet regions are billing-based; Meta regions are user-based, and Meta's US & Canada includes Canada (Alphabet puts Canada in Other Americas).</p></div></div>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Region</th>{quarters.map((q) => <th key={q}>{qShort(q)}</th>)}<th>Share, {qShort(fq)}</th></tr></thead>
            <tbody>{regRows.map((r) => <tr key={r.co + r.id} className={r.id.endsWith('ap') || r.id.endsWith('apac') ? 'focus' : ''}>
              <td><span className="dot" style={{ background: r.color }} />{r.label}</td>
              {quarters.map((q) => { const v = yoy(r.co, r.id, q, ctx); return <td key={q} className={v == null ? 'na' : ''} style={q === fq ? { fontWeight: 600 } : undefined}>{fmt(v, 'growth')}</td>; })}
              <td>{fmt(val(r.co, `${r.id}_share`, fq, ctx), 'pct')}</td></tr>)}</tbody></table></div>
          <SourceLine ids={[...Object.values(DATA.a_geo_src), 'M-PRES-25Q3', 'M-PRES-26Q3']} />
        </div>
      </div>
    </section>
  );
}

// ================================================================== Ads deep dive (both editions)
export function AdsDeepDive({ edition, f, fq, ctx, cos, quarters, explicit, onFocus, c, coColor, viewText, kindFor, regions, toggleRegion, segOn, toggleSeg, companySeries, toggleCompany, vf, vc }) {
  const g = cos.includes('GOOGL'), me = cos.includes('META'), both = g && me;
  const fMR = vf('ads-metareg'), fMRShare = fMR.display === 'margin';
  const fAL = vf('ads-adlines'), fALShare = fAL.display === 'margin';
  const fGR = vf('ads-googreg'), fGRShare = fGR.display === 'margin';
  const fAS = vf('ads-share');
  const num = edition === 'apac' ? '03' : '04';
  const focusRegion = edition === 'apac' || regions.includes('ap') ? 'ap' : regions[0] || 'ap';
  const chart = (series, opts = {}) => (<>
    <QChart series={series} quarters={quarters} kind={opts.kind || kindFor(series[0].metric, opts.mode || 'value')} focusQ={fq} explicitFocus={explicit} onFocus={onFocus} period={f.period} height={opts.height || 230} def={opts.def || M[series[0].metric].def} ariaLabel={opts.aria} endLabels={opts.endLabels !== false} />
    <Readout q={fq} series={series} period={f.period} />
  </>);
  const qctx = { ...ctx, period: 'Q' };
  const selRegions = REGIONS.filter((r) => regions.includes(r.id));
  // Meta regional ad revenue
  const metaReg = selRegions.map((r) => { const sr = mkSeries('META', fMRShare ? `ad_${r.mk}_share` : `ad_${r.mk}`, r.meta, regionColor(c, r.id), fMR.mode, ctx, { region: r.id }); return fMR.mode === 'value' && !fMRShare ? withPct(sr, (q) => value('META', `ad_${r.mk}_share`, q, ctx)) : sr; });
  if (!fMRShare && fMR.mode !== 'value') metaReg.push(mkSeries('META', 'ad_revenue', 'Worldwide', regionColor(c, 'ww'), fMR.mode, ctx, { region: 'ww' }));
  const regLegend = (list) => <Legend series={list} kind="line" hidden={[]} onToggle={(s) => s.region && s.region !== 'ww' && toggleRegion(s.region)} />;
  // volume vs price by region, focus quarter
  const r = DATA.rows.META[fq];
  const vpRows = [{ x: 'ww', label: 'Worldwide' }, ...selRegions.map((x) => ({ x: x.id, label: x.meta }))].map((row) => {
    const k = row.x === 'ww' ? 'ww' : MK[row.x];
    const adId = row.x === 'ww' ? 'ad_revenue' : `ad_${k}`;
    const gr = yoy('META', adId, fq, qctx);
    return { ...row, imp: r[`imp_${k}`], ppa: r[`ppa_${k}`], ad: gr == null ? null : Math.round(gr * 1000) / 10, tipHead: `${row.label} · ${qLabel(fq)} · YoY`, src: [DATA.m_imp_src[fq], 'S-ADSUP'], note: gr == null ? null : `Ad revenue ${fmt(gr, 'growth')}; implied by volume x price ${fmt(((1 + r[`imp_${k}`] / 100) * (1 + r[`ppa_${k}`] / 100) - 1), 'growth')}` };
  });
  const vpSeries = [{ id: 'imp', name: 'Ad impressions', color: c.vol }, { id: 'ppa', name: 'Average price per ad', color: c.price }, { id: 'ad', name: 'Ad revenue', color: c.accent }];
  // focus region decomposition over time
  const fk = MK[focusRegion];
  const decomp = [
    mkSeries('META', `imp_${fk}`, 'Ad impressions', c.vol, 'value', qctx),
    mkSeries('META', `ppa_${fk}`, 'Average price per ad', c.price, 'value', qctx),
    { id: 'META-adgr', co: 'META', name: 'Ad revenue growth', color: regionColor(c, focusRegion), metric: `ad_${fk}`, get: (q) => { const v = yoy('META', `ad_${fk}`, q, qctx); return { v: v == null ? null : Math.round(v * 1000) / 10, unit: 'rate', note: null, src: sourcesFor('META', `ad_${fk}`, q, qctx) }; } },
  ];
  // Alphabet ad lines
  const lineColor = { search: c.seg1, youtube: c.seg2, network: c.seg3 };
  const adLines = ['search', 'youtube', 'network'].filter((k) => segOn(k)).map((k) => { const sr = mkSeries('GOOGL', fALShare ? `${k}_ad_share` : k, M[k].label, lineColor[k], fAL.mode, ctx, { seg: k }); return fAL.mode === 'value' && !fALShare ? withPct(sr, (q) => value('GOOGL', k, q, ctx) / ['search', 'youtube', 'network'].filter((x) => segOn(x)).reduce((a, x) => a + (value('GOOGL', x, q, ctx) || 0), 0)) : sr; });
  const network = [mkSeries('GOOGL', 'network_imp_yoy', 'Network impressions', c.vol, 'value', qctx), mkSeries('GOOGL', 'network_cpi_yoy', 'Cost per impression', c.price, 'value', qctx)];
  const clicks = [mkSeries('GOOGL', 'paid_clicks_yoy', 'Paid clicks', c.vol, 'value', qctx), mkSeries('GOOGL', 'cpc_yoy', 'Cost per click', c.price, 'value', qctx)];
  const googReg = selRegions.map((x) => { const sr = mkSeries('GOOGL', fGRShare ? `geo_${x.gk}_share` : `geo_${x.gk}`, x.googl, regionColor(c, x.id), fGR.mode, ctx, { region: x.id }); return fGR.mode === 'value' && !fGRShare ? withPct(sr, (q) => value('GOOGL', `geo_${x.gk}_share`, q, ctx)) : sr; });
  const adsShare = companySeries ? companySeries('ads_share', { mode: fAS.mode, display: 'abs' }) : [];
  // monetization table rows
  const monRows = g ? [
    { label: 'Google Search & other', id: 'search', mode: 'yoy' }, { label: 'Paid clicks', id: 'paid_clicks_yoy' }, { label: 'Cost per click', id: 'cpc_yoy' },
    { label: 'YouTube ads', id: 'youtube', mode: 'yoy' }, { label: 'Google Network', id: 'network', mode: 'yoy' }, { label: 'Network impressions', id: 'network_imp_yoy' }, { label: 'Network cost per impression', id: 'network_cpi_yoy' },
    { label: 'TAC rate (level)', id: 'tac_rate', level: true },
  ] : [];
  const matrixRegions = [{ id: 'ww', k: 'ww', label: 'Worldwide' }, ...REGIONS.map((x) => ({ id: x.id, k: x.mk, label: x.meta }))];
  return (
    <section className="sec" id="ads" aria-labelledby="h-ads">
      <div className="sec-head"><span className="num">{num}</span><h2 id="h-ads">Ads deep dive</h2><p>Regional ad revenue, volume and price for Meta; ad lines, clicks, Network and TAC for Alphabet{edition === 'apac' ? '; Asia-Pacific is highlighted throughout' : ''}. The Regions filter scopes these cards.</p></div>
      <div className="grid">
        {me && <Card span={6} title="Meta ad revenue by user region" views={vc('ads-metareg', { display: 'Share of ad revenue' })} sub={`${viewText(metaReg[0]?.metric || 'ad_ap', fMR.mode)}${fMRShare ? ' · Share of ad revenue' : ''}`} series={metaReg.length ? metaReg : null} quarters={quarters} focusQ={fq} sources={allSrc(metaReg, quarters)} legend={regLegend(metaReg)}>
          {metaReg.length ? chart(metaReg, { kind: 'line', mode: fMR.mode, aria: 'Meta ad revenue by region' }) : <div className="empty"><strong>No regions selected</strong><span>Pick regions in the Regions filter.</span></div>}
        </Card>}
        {me && <Card span={6} title={`Meta volume vs price by region, ${qLabel(fq)}`} sub="YoY: ad impressions, average price per ad and ad revenue (user geography). Single-quarter measure." sources={[DATA.m_imp_src[fq], 'S-ADSUP', 'S-ADWIZE']}
          legend={<Legend series={vpSeries} kind="bar" />}
          extra={<div className="readout">{vpRows.map((x) => <span key={x.x}><span className="q">{x.label}</span> imp <b>{fmt(x.imp, 'rate')}</b> · price <b>{fmt(x.ppa, 'rate')}</b> · ads <b>{x.ad == null ? 'n/a' : fmt(x.ad / 100, 'growth')}</b></span>)}</div>}>
          <CategoryBars rows={vpRows} series={vpSeries} unit="rate" ariaLabel="Meta impressions, price per ad and ad revenue growth by region" highlight={edition === 'apac' ? 'ap' : null} />
        </Card>}
        {me && <Card span={6} title={`Meta ${regionLabel('META', focusRegion)}: what drives ad growth`} sub="Reported YoY impressions and price per ad, with ad revenue growth computed from regional ad revenue" series={decomp} quarters={quarters} focusQ={fq} sources={allSrc(decomp, quarters)} legend={<Legend series={decomp} kind="bar" />}
          warn={f.period !== 'Q' ? 'Volume and price are single-quarter measures; this card always shows quarterly values.' : null}>
          {chart(decomp, { kind: 'bar', def: '(1 + impressions growth) x (1 + price growth) - 1 reproduces regional ad revenue growth within 1.5pt in every quarter (validation tests).', aria: 'Regional ad growth decomposition' })}
        </Card>}
        {me && adsShare.length > 0 && <Card span={6} title="Advertising share of revenue" views={vc('ads-share')} sub="Ad revenue / total revenue; Alphabet's falls as Cloud grows" series={adsShare} quarters={quarters} focusQ={fq} sources={allSrc(adsShare, quarters)} legend={<Legend series={adsShare} kind="line" onToggle={toggleCompany} />}>
          {chart(adsShare, { kind: 'line', mode: fAS.mode, aria: 'Advertising share of revenue' })}
        </Card>}
        {me && <div className="card span-12">
          <div className="card-head"><div><h3>Meta regional ad matrix</h3><p className="sub">YoY %, user geography: ad revenue (computed), impressions and price per ad (reported). Column = quarter.</p></div></div>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Region · metric</th>{quarters.map((q) => <th key={q}>{qShort(q)}</th>)}</tr></thead>
            <tbody>{matrixRegions.map((x) => (
              <React.Fragment key={x.id}>
                <tr className="grp"><td colSpan={quarters.length + 1}><span className="dot" style={{ background: regionColor(c, x.id) }} />{x.label}</td></tr>
                {[['Ad revenue', x.id === 'ww' ? 'ad_revenue' : `ad_${x.k}`, 'yoy'], ['Impressions', `imp_${x.k}`], ['Price per ad', `ppa_${x.k}`]].map(([lbl, id, mode]) => (
                  <tr key={id} className={x.id === 'ap' && edition === 'apac' ? 'focus' : ''}><td>{lbl}</td>{quarters.map((q) => { const v = mode ? yoy('META', id, q, qctx) : DATA.rows.META[q][id]; return <td key={q} className={v == null ? 'na' : ''} style={q === fq ? { fontWeight: 600 } : undefined}>{mode ? fmt(v, 'growth') : fmt(v, 'rate')}</td>; })}</tr>
                ))}
              </React.Fragment>
            ))}</tbody></table></div>
          <SourceLine ids={['M-PRES-25Q3', 'M-PRES-26Q3', 'S-ADSUP', 'S-ADWIZE', 'S-2SLIDES', 'S-RA-26Q3']} />
        </div>}

        {g && <Card span={6} title="Google advertising by line" views={vc('ads-adlines', { display: 'Share of advertising' })} sub={`${viewText(adLines[0]?.metric || 'search', fAL.mode)}${fALShare ? ' · Share of Google advertising' : ''}`} series={adLines.length ? adLines : null} quarters={quarters} focusQ={fq} sources={allSrc(adLines, quarters)}
          legend={<Legend series={adLines} kind="line" />}>
          {adLines.length ? chart(adLines, { kind: fAL.mode === 'value' && !fALShare ? 'bar' : 'line', mode: fAL.mode, aria: 'Google advertising by line' }) : <div className="empty"><strong>Search, YouTube and Network are filtered out</strong><span>Re-enable them in Segments.</span></div>}
        </Card>}
        {g && <Card span={6} title="Google Network: impressions vs cost per impression" sub="Reported YoY change (10-Q). Not disclosed for Q4; Q2 2026 MD&A not retrievable." series={network} quarters={quarters} focusQ={fq} sources={quarters.map((q) => DATA.a_network_src[q]).filter(Boolean)} legend={<Legend series={network} kind="bar" />}>
          {chart(network, { kind: 'bar', aria: 'Google Network impressions and cost per impression' })}
        </Card>}
        {g && <div className="card span-6">
          <div className="card-head"><div><h3>Alphabet ad monetization table</h3><p className="sub">YoY % unless noted; volume and price lines are reported changes (Search & other properties; Network partner properties).</p></div></div>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Line</th>{quarters.map((q) => <th key={q}>{qShort(q)}</th>)}</tr></thead>
            <tbody>{monRows.map((m) => <tr key={m.id}><td>{m.label}</td>{quarters.map((q) => { const v = m.level ? value('GOOGL', m.id, q, qctx) : m.mode ? yoy('GOOGL', m.id, q, qctx) : DATA.rows.GOOGL[q][m.id]; const s = m.level ? fmt(v, 'pct') : m.mode ? fmt(v, 'growth') : fmt(v, 'rate'); return <td key={q} className={v == null ? 'na' : ''} style={q === fq ? { fontWeight: 600 } : undefined} title={v == null ? shown('GOOGL', m.id, q, qctx, 'value').note || '' : ''}>{s}</td>; })}</tr>)}</tbody></table></div>
          <SourceLine ids={[...quarters.map((q) => DATA.a_clicks_src[q]), ...quarters.map((q) => DATA.a_network_src[q]), ...quarters.map((q) => DATA.a_src[q])].filter(Boolean)} />
        </div>}
        {g && <Card span={6} title="Alphabet revenue by billing region" views={vc('ads-googreg', { display: 'Share of revenue' })} sub={`${viewText(googReg[0]?.metric || 'geo_apac', fGR.mode)}${fGRShare ? ' · Share of revenue' : ''} · All revenue types`} warn={DATA.a_geo_note[fq] && f.period === 'Q' ? DATA.a_geo_note[fq] : null} series={googReg.length ? googReg : null} quarters={quarters} focusQ={fq} sources={allSrc(googReg, quarters)} legend={regLegend(googReg)}>
          {googReg.length ? chart(googReg, { kind: 'line', mode: fGR.mode, aria: 'Alphabet revenue by region' }) : <div className="empty"><strong>No regions selected</strong><span>Pick regions in the Regions filter.</span></div>}
        </Card>}
        {!me && adsShare.length > 0 && <Card span={6} title="Advertising share of revenue" views={vc('ads-share')} sub="Ad revenue / total revenue; Alphabet's falls as Cloud grows" series={adsShare} quarters={quarters} focusQ={fq} sources={allSrc(adsShare, quarters)} legend={<Legend series={adsShare} kind="line" onToggle={toggleCompany} />}>
          {chart(adsShare, { kind: 'line', mode: fAS.mode, aria: 'Advertising share of revenue' })}
        </Card>}
        {both && edition === 'apac' && (() => {
          const s = [mkSeries('META', 'ad_ap', 'Meta APAC ad revenue (user location)', coColor('META'), 'yoy', ctx), mkSeries('GOOGL', 'geo_apac', 'Alphabet APAC revenue (billing, all types)', coColor('GOOGL'), 'yoy', ctx)];
          return <Card span={12} title="APAC growth: Meta ads vs Alphabet total" sub="YoY. Indicative only: different scope and geography basis" warn="Alphabet does not split advertising by region. Its APAC line includes Cloud and subscriptions billed in APAC." series={s} quarters={quarters} focusQ={fq} sources={allSrc(s, quarters)} legend={<Legend series={s} kind="line" />}>
            {chart(s, { kind: 'line', mode: 'yoy', aria: 'APAC growth comparison' })}
          </Card>;
        })()}
      </div>
    </section>
  );
}

// ================================================================== APAC outlook & risks
export function ApacOutlook({ cos, quarters, coColor, c }) {
  const comm = DATA.apac_commentary.filter((x) => cos.includes(x.co) && quarters.includes(x.q)).sort((a, b) => (a.q < b.q ? 1 : -1));
  const risks = DATA.apac_risks.filter((x) => x.co === 'BOTH' || cos.includes(x.co));
  const g = DATA.guidance;
  const last = (co, metric) => g.filter((x) => x.co === co && x.metric === metric).slice(-1)[0];
  const dot = (co) => (co === 'BOTH' ? <><span className="dot" style={{ background: coColor('GOOGL') }} /><span className="dot" style={{ background: coColor('META') }} /></> : <span className="dot" style={{ background: coColor(co) }} />);
  const coName = (co) => (co === 'BOTH' ? 'Both' : CO[co].name);
  return (
    <section className="sec" id="outlook" aria-labelledby="h-outlook">
      <div className="sec-head"><span className="num">04</span><h2 id="h-outlook">APAC outlook and risks</h2><p>Neither company guides by region. Company-wide guidance is shown for context; APAC commentary and regulatory items follow.</p></div>
      <div className="grid">
        <div className="card span-5">
          <div className="card-head"><div><h3>Latest company-wide guidance</h3><p className="sub">No regional guidance is issued by either company. Unreported periods appear only as guidance.</p></div></div>
          <div className="tbl-wrap"><table className="tbl left"><thead><tr><th>Company</th><th>Target</th><th>Metric</th><th>Range</th><th>Issued</th></tr></thead>
            <tbody>{[cos.includes('META') && last('META', 'Revenue'), cos.includes('META') && last('META', 'Capex'), cos.includes('META') && last('META', 'Total expenses'), cos.includes('GOOGL') && last('GOOGL', 'Capex')].filter(Boolean).map((x, i) => (
              <tr key={i}><td>{dot(x.co)}{CO[x.co].name}</td><td>{x.target.startsWith('20') ? qLabel(x.target) : x.target}</td><td>{x.metric}</td><td className="tnum">{fmt(x.lo, 'usd')} - {fmt(x.hi, 'usd')}</td><td><a href={SRC[x.src].url} target="_blank" rel="noreferrer">{x.issued}</a></td></tr>
            ))}</tbody></table></div>
        </div>
        <div className="card span-7">
          <div className="card-head"><div><h3>APAC commentary and disclosures</h3><p className="sub">Newest first. Quotes are verbatim; figures are from the cited filing or deck. Follows the quarter range and company filters.</p></div></div>
          {comm.length ? <div className="feed">{comm.map((x, i) => (
            <article key={i}><div className="meta"><b>{qLabel(x.q)}</b><span>{dot(x.co)}{coName(x.co)}</span><span className="pill">{x.theme}</span></div>
              <div><p>{x.text}</p><div className="srcline"><a href={SRC[x.src].url} target="_blank" rel="noreferrer">{SRC[x.src].doc} ({SRC[x.src].date})</a></div></div></article>
          ))}</div> : <div className="empty"><strong>No APAC commentary in this range</strong><span>Widen the quarter range.</span></div>}
        </div>
        <div className="card span-12">
          <div className="card-head"><div><h3>APAC regulatory, competitive and execution risks</h3><p className="sub">Status as of the data cutoff.</p></div></div>
          <div className="risk-grid">{risks.map((r, i) => (
            <div className="risk" key={i}><div className="r-top"><span className="cat">{r.cat}</span><span>{dot(r.co)}{coName(r.co)} · <span className="pill">{r.status}</span></span></div>
              <h4>{r.title}</h4><p>{r.text}</p><div className="srcline"><a href={SRC[r.src].url} target="_blank" rel="noreferrer">{SRC[r.src].doc} ({SRC[r.src].date})</a></div></div>
          ))}</div>
        </div>
      </div>
    </section>
  );
}
