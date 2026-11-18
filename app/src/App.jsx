import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  DATA, Q_DISPLAY, Q_ALL, LATEST, SRC, CO, M, SEGMENTS, qLabel, qShort, qIdx, periodText,
  value, shown, sourcesFor, fmt, fmtExact, buildCsv, metricsFor,
} from './lib/engine.js';
import { QChart, Readout, TableView, SourceLine, Legend, useColors, RangeChart } from './components/charts.jsx';
import { Boundary, Seg, Card, pctCls } from './components/ui.jsx';
import { ApacOverview, ApacTrends, AdsDeepDive, ApacOutlook } from './components/regional.jsx';
import { REGIONS } from './lib/engine.js';

const APAC_GROUPS = ['Meta regional ads', 'Alphabet geography', 'Advertising', 'Alphabet drivers', 'Meta drivers'];
const apacMetric = (m) => !!m.region || APAC_GROUPS.includes(m.group) || ['revenue', 'op_margin'].includes(m.id);

// ------------------------------------------------------------------ defaults & persistence (per edition)
const defaultsFor = (ed) => ({ from: Q_DISPLAY[0], to: LATEST, company: 'both', metric: ed === 'apac' ? 'geo_apac' : 'revenue', mode: 'value', display: 'abs', period: 'Q', basis: 'reported', segments: SEGMENTS.map((s) => s.id), regions: REGIONS.map((r) => r.id) });
const storeKey = (ed) => `goog-meta-monitor-filters-v2-${ed}`;
function loadFilters(ed) {
  const D = defaultsFor(ed);
  try { const s = JSON.parse(localStorage.getItem(storeKey(ed)) || 'null'); if (s && Q_DISPLAY.includes(s.from) && Q_DISPLAY.includes(s.to) && M[s.metric]) return { ...D, ...s }; } catch (e) { /* storage unavailable */ }
  return D;
}
function saveFilters(ed, f) { try { localStorage.setItem(storeKey(ed), JSON.stringify(f)); } catch (e) { /* ignore */ } }
const fmtDate = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const nextQ = (q) => (q.endsWith('Q4') ? `${+q.slice(0, 4) + 1}Q1` : `${q.slice(0, 5)}${+q.slice(5) + 1}`);
export const CUTOFF_LABEL = fmtDate(DATA.cutoff);

// shared UI pieces live in components/ui.jsx

// ------------------------------------------------------------------ the app
export default function App({ edition = 'global', switcher = null, statusBar = null }) {
  const APAC = edition === 'apac';
  const DEFAULTS = useMemo(() => defaultsFor(edition), [edition]);
  const [f, setF] = useState(() => loadFilters(edition));
  const [focus, setFocus] = useState(null);       // cross-filter: clicked quarter
  const [railOpen, setRailOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [csvText, setCsvText] = useState('');
  const [dl, setDl] = useState(undefined);         // undefined = resolving, null = unavailable
  const [resetKey, setResetKey] = useState(0);
  const c = useColors();
  useEffect(() => saveFilters(edition, f), [f]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3200); return () => clearTimeout(t); }, [toast]);
  useEffect(() => {
    let alive = true;
    const cl = window.claude;
    if (cl && typeof cl.use === 'function') cl.use('downloads').then((ns) => { if (alive) setDl(ns || null); }).catch(() => alive && setDl(null));
    else setDl(null);
    return () => { alive = false; };
  }, []);

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const reset = useCallback(() => { setF(DEFAULTS); setFocus(null); setCsvText(''); setResetKey((k) => k + 1); setToast('Filters reset to defaults'); }, []);

  const cos = f.company === 'both' ? ['GOOGL', 'META'] : [f.company];
  const fromI = Q_DISPLAY.indexOf(f.from), toI = Q_DISPLAY.indexOf(f.to);
  const quarters = fromI <= toI ? Q_DISPLAY.slice(fromI, toI + 1) : [];
  const fq = focus && quarters.includes(focus) ? focus : quarters[quarters.length - 1];
  const explicit = !!(focus && quarters.includes(focus));
  const ctx = useMemo(() => ({ period: f.period, basis: f.basis }), [f.period, f.basis]);
  const coColor = (co) => (co === 'GOOGL' ? c.goog : c.meta);
  const onFocus = useCallback((q, fromClick) => { setFocus((prev) => (fromClick && prev === q ? null : q)); }, []);
  const toggleCompany = (s) => {
    const co = s.co; if (!co) return;
    if (f.company === 'both') set('company', co === 'GOOGL' ? 'META' : 'GOOGL'); else set('company', 'both');
  };
  const regions = f.regions || DEFAULTS.regions;
  const toggleRegion = (id) => set('regions', regions.includes(id) ? regions.filter((x) => x !== id) : REGIONS.map((r) => r.id).filter((x) => x === id || regions.includes(x)));
  const segOn = (id) => f.segments.includes(id);
  const toggleSeg = (id) => set('segments', segOn(id) ? f.segments.filter((x) => x !== id) : [...f.segments, id]);

  // series factory: one series per company for a metric under the global view
  const companySeries = useCallback((id, opts = {}) => {
    const mode = opts.mode ?? f.mode;
    const useMargin = opts.display ?? f.display;
    const mid = useMargin === 'margin' && M[id].margin ? M[id].margin : id;
    return cos.filter((co) => M[mid].cos.includes(co)).map((co) => ({
      id: co, co, name: CO[co].name, color: coColor(co), metric: mid,
      get: (q) => ({ ...shown(co, mid, q, ctx, mode), src: sourcesFor(co, mid, q, ctx) }),
    }));
  }, [cos.join(), f.mode, f.display, ctx, c]);

  const kindFor = (mid, mode) => (mode === 'value' && ['usd', 'count', 'usdk', 'eps', 'usdb', 'arpp'].includes(M[mid].unit) ? 'bar' : 'line');
  const viewText = (mid, mode) => {
    const p = { Q: 'Quarterly', YTD: 'Year-to-date', TTM: 'Trailing twelve months' }[f.period];
    const m = mode || f.mode; const mm = M[mid];
    const t = mm.isRate ? 'Reported YoY change' : m === 'value' ? (mm.unit === 'pct' ? 'Ratio' : 'Value') : m === 'yoy' ? (mm.unit === 'pct' ? 'YoY change (pp)' : 'YoY growth') : (mm.unit === 'pct' ? 'QoQ change (pp)' : 'QoQ growth');
    return `${p} · ${t}${mm.basisDependent ? (f.basis === 'lfl' ? ' · Like-for-like basis' : ' · Company-reported basis') : ''}`;
  };
  const srcIds = (series) => { const s = new Set(); series.forEach((x) => quarters.forEach((q) => (x.get(q).src || []).forEach((i) => s.add(i)))); return [...s]; };

  // ---------------------------------------------------------------- CSV
  const csvArgs = { cos, quarters, period: f.period, basis: f.basis, segments: f.segments, metricFilter: APAC ? apacMetric : undefined };
  const fileName = `alphabet-meta${APAC ? '-apac' : ''}_${f.period.toLowerCase()}_${f.from}-${f.to}${f.basis === 'lfl' ? '_lfl' : ''}.csv`;
  const copyCsv = async (text) => {
    try { await navigator.clipboard.writeText(text); setToast('CSV copied to clipboard'); }
    catch (e) { setCsvText(text); setToast('Clipboard blocked: CSV shown below the data table to copy'); }
  };
  const downloadCsv = async () => {
    if (!quarters.length) { setToast('Nothing to export: the quarter range is empty'); return; }
    const text = buildCsv(csvArgs);
    if (!dl) { await copyCsv(text); return; }
    try { await dl.save({ filename: fileName, data: text }); setToast(`Saved ${fileName}`); }
    catch (e) {
      const code = e && e.code;
      if (code === 'declined') setToast('Download cancelled');
      else if (code === 'rate_limited') setToast('A download prompt is already open');
      else { setToast('Download unavailable in this view; copying the CSV instead'); copyCsv(text); }
    }
  };

  // ---------------------------------------------------------------- empty selection
  const emptyRange = quarters.length === 0;
  const metricOptions = useMemo(() => {
    const groups = {};
    Object.values(M).forEach((m) => { if (!m.cos.some((co) => cos.includes(co))) return; if (APAC && !apacMetric(m)) return; (groups[m.group] ||= []).push(m); });
    return groups;
  }, [cos.join()]);
  useEffect(() => { if (!M[f.metric].cos.some((co) => cos.includes(co))) set('metric', APAC ? (cos.includes('GOOGL') ? 'geo_apac' : 'ad_ap') : 'revenue'); }, [f.company]);

  const xfChips = [];
  if (explicit) xfChips.push({ k: 'q', label: `Focused quarter: ${qLabel(fq)}`, clear: () => setFocus(null) });
  if (f.company !== 'both') xfChips.push({ k: 'co', label: `Company: ${CO[f.company].name} only`, clear: () => set('company', 'both') });
  if (regions.length < REGIONS.length) xfChips.push({ k: 'reg', label: `Regions: ${regions.length} of ${REGIONS.length}`, clear: () => set('regions', DEFAULTS.regions) });
  if (f.segments.length < SEGMENTS.length) xfChips.push({ k: 'seg', label: `Segments: ${f.segments.length} of ${SEGMENTS.length}`, clear: () => set('segments', DEFAULTS.segments) });

  return (
    <>
      <header className="mast">
        <div className="wrap">
          <div className="mast-top">{switcher}<div className="eyebrow">{APAC ? 'Equity research monitor · Asia-Pacific edition · USD, calendar quarters' : 'Equity research monitor · U.S. internet platforms · USD, calendar quarters'}</div></div>
          <h1>Alphabet <span className="vs">vs</span> Meta Platforms{APAC ? <span className="ed"> · Asia-Pacific</span> : null}</h1>
          <div className="mast-meta">
            <span className="cutoff">Data cutoff: {CUTOFF_LABEL}</span>
            <span>Coverage: <b>Q1 2025 - {qLabel(LATEST)}</b> (latest reported)</span>
            <span>Last results: <b>Meta {fmtDate(DATA.last_results.META)}</b> · <b>Alphabet {fmtDate(DATA.last_results.GOOGL)}</b></span>
            <span>{qLabel(nextQ(LATEST))} is unreported: guidance and estimates are labelled, never shown as actuals</span>
            {APAC && <span>Neither company reports below the Asia-Pacific level: no country or Southeast Asia split is disclosed</span>}
          </div>
          <nav className="toc" aria-label="Sections">
            {(APAC ? [['overview', 'APAC overview'], ['trends', 'APAC revenue trends'], ['ads', 'Ads deep dive'], ['outlook', 'APAC outlook & risks'], ['method', 'Sources & methodology']]
              : [['overview', 'Executive overview'], ['trends', 'Financial trends'], ['segments', 'Segment performance'], ['ads', 'Ads deep dive'], ['outlook', 'Outlook'], ['method', 'Sources & methodology']]).map(([h, t], i) => <a key={h} href={`#${h}`}><span>{i + 1}</span>{t}</a>)}
          </nav>
          {statusBar}
        </div>
      </header>

      <div className="rail" data-open={railOpen ? 'true' : 'false'}>
        <div className="wrap" role="region" aria-label="Dashboard filters">
          <button type="button" className="btn rail-toggle" aria-expanded={railOpen} onClick={() => setRailOpen(!railOpen)}>{railOpen ? 'Hide filters' : `Filters · ${f.company === 'both' ? 'Both' : CO[f.company].name} · ${qShort(f.from)}-${qShort(f.to)}`}</button>
          <div className="ctl">
            <span className="lbl">Quarters</span>
            <div className="range">
              <select id="q-from" aria-label="From quarter" value={f.from} onChange={(e) => set('from', e.target.value)}>{Q_DISPLAY.map((q) => <option key={q} value={q}>{qLabel(q)}</option>)}</select>
              <span>to</span>
              <select id="q-to" aria-label="To quarter" value={f.to} onChange={(e) => set('to', e.target.value)}>{Q_DISPLAY.map((q) => <option key={q} value={q}>{qLabel(q)}</option>)}</select>
            </div>
          </div>
          <Seg name="co" label="Company" value={f.company} onChange={(v) => set('company', v)} options={[{ v: 'both', label: 'Both' }, { v: 'GOOGL', label: 'Alphabet', dot: c.goog }, { v: 'META', label: 'Meta', dot: c.meta }]} />
          <div className="ctl">
            <label className="lbl" htmlFor="metric">Metric (explorer)</label>
            <select id="metric" value={f.metric} onChange={(e) => set('metric', e.target.value)}>
              {Object.entries(metricOptions).map(([g, ms]) => <optgroup key={g} label={g}>{ms.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>)}
            </select>
          </div>
          <Seg name="mode" label="Values" value={f.mode} onChange={(v) => set('mode', v)} options={[{ v: 'value', label: 'Value' }, { v: 'yoy', label: 'YoY' }, { v: 'qoq', label: 'QoQ', disabled: f.period === 'YTD', title: f.period === 'YTD' ? 'QoQ is not meaningful for YTD windows' : '' }]} />
          <Seg name="disp" label="Display" value={f.display} onChange={(v) => set('display', v)} options={[{ v: 'abs', label: 'Absolute' }, { v: 'margin', label: APAC ? 'Share of total' : 'Margin / % of revenue' }]} />
          <Seg name="period" label="Period" value={f.period} onChange={(v) => { set('period', v); if (v === 'YTD' && f.mode === 'qoq') set('mode', 'yoy'); }} options={[{ v: 'Q', label: 'Quarterly' }, { v: 'YTD', label: 'YTD' }, { v: 'TTM', label: 'TTM' }]} />
          {!APAC && <Seg name="basis" label="Capex & FCF basis" value={f.basis} onChange={(v) => set('basis', v)} options={[{ v: 'reported', label: 'Reported', title: 'Each company\'s own definition' }, { v: 'lfl', label: 'Like-for-like', title: 'Purchases of P&E for both' }]} />}
          <div className="ctl">
            <span className="lbl">Regions</span>
            <details className="segpick">
              <summary>{regions.length === REGIONS.length ? 'All regions' : `${regions.length} of ${REGIONS.length} selected`}</summary>
              <div className="menu">
                <fieldset><legend>Meta (user location) / Alphabet (billing address)</legend>
                  {REGIONS.map((r) => <label key={r.id}><input id={`reg-${r.id}`} type="checkbox" checked={regions.includes(r.id)} onChange={() => toggleRegion(r.id)} />{r.meta} / {r.googl}</label>)}
                </fieldset>
                <div className="menu-actions"><button className="btn small" type="button" onClick={() => set('regions', DEFAULTS.regions)}>Select all</button><button className="btn small" type="button" onClick={() => set('regions', ['ap'])}>APAC only</button></div>
              </div>
            </details>
          </div>
          <div className="ctl">
            <span className="lbl">Segments</span>
            <details className="segpick">
              <summary>{f.segments.length === SEGMENTS.length ? 'All segments' : `${f.segments.length} of ${SEGMENTS.length} selected`}</summary>
              <div className="menu">
                {['GOOGL', 'META'].map((co) => (
                  <fieldset key={co}><legend>{CO[co].name}</legend>
                    {SEGMENTS.filter((s) => s.co === co).map((s) => <label key={s.id}><input id={`seg-${s.id}`} type="checkbox" checked={segOn(s.id)} onChange={() => toggleSeg(s.id)} />{s.label}</label>)}
                  </fieldset>
                ))}
                <div className="menu-actions"><button className="btn small" type="button" onClick={() => set('segments', DEFAULTS.segments)}>Select all</button><button className="btn small" type="button" onClick={() => set('segments', [])}>Clear</button></div>
              </div>
            </details>
          </div>
          <div className="rail-actions">
            <button type="button" className="btn" onClick={reset}>Reset filters</button>
            {dl ? <button type="button" className="btn primary" onClick={downloadCsv}>Download CSV</button> : null}
            <button type="button" className={dl ? 'btn' : 'btn primary'} onClick={() => (quarters.length ? copyCsv(buildCsv(csvArgs)) : setToast('Nothing to copy: the quarter range is empty'))}>Copy CSV</button>
          </div>
          <div className="xf" aria-live="polite">
            {xfChips.length > 0 && <span>Active cross-filters:</span>}
            {xfChips.map((x) => <span className="chip" key={x.k}>{x.label}<button type="button" aria-label={`Clear ${x.label}`} onClick={x.clear}>×</button></span>)}
          </div>
        </div>
      </div>

      <main>
        <div className="wrap">
          {emptyRange ? (
            <div className="empty" role="alert"><strong>The quarter range is empty</strong><span>"From" ({qLabel(f.from)}) is after "To" ({qLabel(f.to)}). Pick an earlier start quarter or reset the filters.</span><button className="btn" onClick={reset}>Reset filters</button></div>
          ) : (
            <>
              {APAC ? <>
                <Boundary resetKey={resetKey} onReset={reset}><ApacOverview {...{ fq, ctx, cos, f, c, coColor }} /></Boundary>
                <Boundary resetKey={resetKey} onReset={reset}><ApacTrends {...{ f, fq, ctx, cos, quarters, explicit, onFocus, c, coColor, viewText, kindFor, toggleCompany }} explorer={<Explorer {...{ f, fq, quarters, explicit, onFocus, companySeries, kindFor, viewText, srcIds, toggleCompany }} />} /></Boundary>
                <Boundary resetKey={resetKey} onReset={reset}><AdsDeepDive edition="apac" {...{ f, fq, ctx, cos, quarters, explicit, onFocus, c, coColor, viewText, kindFor, regions, toggleRegion, segOn, toggleSeg, companySeries, toggleCompany }} /></Boundary>
                <Boundary resetKey={resetKey} onReset={reset}><ApacOutlook {...{ cos, quarters, coColor, c }} /></Boundary>
              </> : <>
                <Boundary resetKey={resetKey} onReset={reset}><Overview {...{ fq, ctx, cos, f, coColor, quarters, explicit }} /></Boundary>
                <Boundary resetKey={resetKey} onReset={reset}><Trends {...{ f, fq, ctx, cos, quarters, explicit, onFocus, companySeries, kindFor, viewText, srcIds, toggleCompany }} /></Boundary>
                <Boundary resetKey={resetKey} onReset={reset}><Segments {...{ f, fq, ctx, cos, quarters, explicit, onFocus, companySeries, kindFor, viewText, srcIds, toggleCompany, segOn, toggleSeg, c, coColor }} /></Boundary>
                <Boundary resetKey={resetKey} onReset={reset}><AdsDeepDive edition="global" {...{ f, fq, ctx, cos, quarters, explicit, onFocus, c, coColor, viewText, kindFor, regions, toggleRegion, segOn, toggleSeg, companySeries, toggleCompany }} /></Boundary>
                <Boundary resetKey={resetKey} onReset={reset}><Outlook {...{ f, cos, quarters, fq, c, coColor, onFocus }} /></Boundary>
              </>}
              <Boundary resetKey={resetKey} onReset={reset}><Method {...{ APAC, f, fq, ctx, cos, quarters, csvText, setCsvText, downloadCsv, copyCsv, csvArgs, dl }} /></Boundary>
            </>
          )}
          <p className="foot">Built from company filings and earnings materials; every reported figure links to its source. Not investment advice. Analyst consensus figures are third-party and labelled as such. Data cutoff {CUTOFF_LABEL} (U.S. time).</p>
        </div>
      </main>
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

// ================================================================== 1. Overview
function Overview({ fq, ctx, cos, f, coColor }) {
  const both = cos.length === 2;
  const get = (co, id, mode = 'value') => shown(co, id, fq, ctx, mode);
  const tiles = [
    { id: 'revenue', label: 'Revenue', delta: { id: 'revenue', mode: 'yoy', label: 'YoY' }, lead: { id: 'revenue', mode: 'yoy', text: 'faster growth' } },
    { id: 'op_margin', label: 'Operating margin', delta: { id: 'op_margin', mode: 'yoy', label: 'YoY' }, lead: { id: 'op_margin', text: 'higher margin' } },
    { id: 'net_income', label: 'Net income', delta: { id: 'net_income', mode: 'yoy', label: 'YoY' }, lead: { id: 'net_margin', text: 'higher net margin' } },
    { id: 'eps_diluted', label: 'Diluted EPS', delta: { id: 'eps_diluted', mode: 'yoy', label: 'YoY' }, lead: { id: 'eps_diluted', mode: 'yoy', text: 'faster EPS growth' } },
    { id: 'fcf', label: 'Free cash flow', delta: { id: 'fcf_margin', label: 'FCF margin' }, lead: { id: 'fcf_margin', text: 'higher FCF margin' } },
    { id: 'capex', label: 'Capital expenditures', delta: { id: 'capex_intensity', label: '% of revenue' }, lead: { id: 'capex_intensity', text: 'higher capex intensity', neutral: true } },
    { id: 'cash_ms', label: 'Cash & marketable securities', delta: { id: 'cash_ms', mode: 'qoq', label: 'QoQ' }, lead: { id: 'cash_ms', text: 'larger balance', neutral: true } },
    { id: 'headcount', label: 'Headcount', delta: { id: 'headcount', mode: 'yoy', label: 'YoY' }, lead: { id: 'rev_per_employee', text: 'higher revenue per employee' } },
    { id: 'ad_revenue', label: 'Advertising revenue', delta: { id: 'ad_revenue', mode: 'yoy', label: 'YoY' }, lead: { id: 'ad_revenue', mode: 'yoy', text: 'faster ad growth' } },
    { id: 'shareholder_returns', label: 'Capital returned', delta: { id: 'buybacks', label: 'of which buybacks' }, lead: { id: 'shareholder_returns', text: 'more returned', neutral: true } },
  ];
  const periodLbl = periodText(fq, f.period);
  return (
    <section className="sec" id="overview" aria-labelledby="h-overview">
      <div className="sec-head"><span className="num">01</span><h2 id="h-overview">Executive overview</h2><p>Scorecards for <b>{periodLbl}</b>. Click any chart below to move this view to another quarter.</p></div>
      <div className="score-grid">
        {tiles.map((t) => {
          let leader = null;
          if (both) {
            const a = get('GOOGL', t.lead.id, t.lead.mode || 'value').v, b = get('META', t.lead.id, t.lead.mode || 'value').v;
            if (a != null && b != null && a !== b) leader = a > b ? 'GOOGL' : 'META';
          }
          return (
            <div className="score" key={t.id}>
              <div className="s-lbl"><span>{t.label}</span><span className="s-cap">{t.delta.label}</span></div>
              {cos.map((co) => {
                const v = get(co, t.id); const d = get(co, t.delta.id, t.delta.mode || 'value');
                const dUnit = d.unit; const goodUp = !['capex_intensity'].includes(t.delta.id);
                return (
                  <div className="s-row" key={co} title={v.note || ''}>
                    <span className="s-co"><span className="dot" style={{ background: coColor(co) }} />{CO[co].name}</span>
                    <span className="s-val">{fmt(v.v, v.unit)}</span>
                    <span className={`s-delta ${t.delta.mode ? pctCls(d.v, goodUp) : ''}`} title={d.note || ''}>{d.v == null ? (d.note && d.note.startsWith('n/m') ? 'n/m' : 'n/a') : fmt(d.v, dUnit)}</span>
                  </div>
                );
              })}
              {both && <div className="lead"><span className="tag">{t.lead.neutral ? 'Higher' : 'Leader'}</span>{leader ? <span><b>{CO[leader].name}</b> · {t.lead.text}</span> : <span>n/a</span>}</div>}
            </div>
          );
        })}
      </div>
      <Insights fq={fq} ctx={ctx} cos={cos} f={f} />
    </section>
  );
}

const MARGIN_NOTES = {
  GOOGL: { '2025Q2': 'includes a legal-settlement charge (not quantified)', '2025Q3': 'includes the $3.5B EC fine; ex-fine 33.9%', '2025Q4': 'includes a $2.1B Waymo compensation charge' },
  META: { '2026Q2': 'includes $2.40B of legal charges and $1.18B of severance', '2026Q3': 'includes the $9.89B youth-litigation charge; ex-charge 35.4% on the company-disclosed $22.88B' },
};
function Insights({ fq, ctx, cos, f }) {
  const both = cos.length === 2;
  const v = (co, id, mode = 'value') => shown(co, id, fq, ctx, mode).v;
  const L = f.period === 'Q' ? qLabel(fq) : periodText(fq, f.period);
  const items = [];
  if (both) {
    const ga = v('GOOGL', 'ad_revenue', 'yoy'), ma = v('META', 'ad_revenue', 'yoy'), gs = v('GOOGL', 'search', 'yoy');
    if (ga != null && ma != null) {
      const imp = f.period === 'Q' ? v('META', 'impressions_yoy') : null, ppa = f.period === 'Q' ? v('META', 'price_per_ad_yoy') : null;
      const pc = f.period === 'Q' ? v('GOOGL', 'paid_clicks_yoy') : null, cpc = f.period === 'Q' ? v('GOOGL', 'cpc_yoy') : null;
      items.push(<>Advertising: <b>Meta ad revenue grew {fmt(ma, 'growth')}</b> against <b>{fmt(ga, 'growth')} for Google advertising</b>, a {fmt((ma - ga) * 100, 'pp')} gap{gs != null ? <> (Google Search & other {fmt(gs, 'growth')})</> : null}.{imp != null && ppa != null ? <> Meta was {ppa > imp ? 'price-led' : 'volume-led'}: impressions {fmt(imp, 'rate')}, price per ad {fmt(ppa, 'rate')}.</> : null}{pc != null && cpc != null ? <> Google paid clicks {fmt(pc, 'rate')}, CPC {fmt(cpc, 'rate')}.</> : null}</>);
    }
    const gm = v('GOOGL', 'op_margin'), mm = v('META', 'op_margin');
    if (gm != null && mm != null) {
      const gn = f.period === 'Q' ? MARGIN_NOTES.GOOGL[fq] : null, mn = f.period === 'Q' ? MARGIN_NOTES.META[fq] : null;
      items.push(<>Margins: operating margin was <b>{fmt(gm, 'pct')} at Alphabet</b>{gn ? ` (${gn})` : ''} and <b>{fmt(mm, 'pct')} at Meta</b>{mn ? ` (${mn})` : ''}; a year earlier it was {fmt(gm - (v('GOOGL', 'op_margin', 'yoy') ?? NaN) / 100, 'pct')} and {fmt(mm - (v('META', 'op_margin', 'yoy') ?? NaN) / 100, 'pct')}.</>);
    }
    const gi = v('GOOGL', 'capex_intensity'), mi = v('META', 'capex_intensity'), gf = v('GOOGL', 'fcf'), mf = v('META', 'fcf');
    if (gi != null && mi != null) items.push(<>Infrastructure: capex absorbed <b>{fmt(gi, 'pct')} of revenue at Alphabet</b> and <b>{fmt(mi, 'pct')} at Meta</b>; free cash flow was <b>{fmt(gf, 'usd')}</b> and <b>{fmt(mf, 'usd')}</b> ({f.basis === 'lfl' ? 'like-for-like' : 'company-reported'} basis).</>);
  }
  if (cos.includes('GOOGL')) {
    const cr = v('GOOGL', 'cloud_rev'), cg = v('GOOGL', 'cloud_rev', 'yoy'), cm = v('GOOGL', 'cloud_margin'), rpo = value('GOOGL', 'rpo', fq, ctx);
    const rl = cos.includes('META') ? v('META', 'rl_oi') : null, rr = cos.includes('META') ? v('META', 'rl_rev') : null;
    if (cr != null) items.push(<>Cloud vs Reality Labs: Google Cloud revenue reached <b>{fmt(cr, 'usd')}</b> ({fmt(cg, 'growth')} YoY) at a <b>{fmt(cm, 'pct')} operating margin</b> with a <b>{fmt(rpo, 'usdb')} backlog</b>{rl != null && rr != null ? <>; Reality Labs lost <b>{fmt(-rl, 'usd')}</b> on <b>{fmt(rr, 'usd')}</b> of revenue</> : null}.</>);
  }
  const streak = (co) => { let n = 0; for (let i = qIdx(fq); i >= 0; i--) { if (DATA.rows[co][Q_ALL[i]].buybacks === 0) n++; else break; } return n; };
  const parts = cos.map((co) => ({ co, n: streak(co) })).filter((x) => x.n > 0);
  if (parts.length) items.push(<>Capital returns: {parts.map((p, i) => <React.Fragment key={p.co}>{i > 0 && ' and '}<b>{CO[p.co].name} made no buybacks for {p.n} straight quarter{p.n > 1 ? 's' : ''}</b></React.Fragment>)} through {qLabel(fq)} while capex outran operating cash flow{cos.includes('GOOGL') && qIdx(fq) >= qIdx('2026Q2') ? '; Alphabet also raised about $49.5B of common and preferred equity in June 2026' : ''}.</>);
  if (!items.length) return null;
  return (
    <div className="insights" aria-label="Key insights">
      <ol>{items.slice(0, 5).map((it, i) => <li key={i}><span>{it} <span className="src">· {L}</span></span></li>)}</ol>
    </div>
  );
}

// ================================================================== 2. Financial trends
function Explorer({ f, fq, quarters, explicit, onFocus, companySeries, kindFor, viewText, srcIds, toggleCompany }) {
  const exSeries = companySeries(f.metric);
  const exMid = exSeries[0]?.metric || f.metric;
  const exKind = M[exMid].isRate ? 'bar' : kindFor(exMid, f.mode);
  return (
    <Card span={12} title={`Metric explorer: ${M[exMid].label}`} sub={`${viewText(exMid)} · Choose the metric in the filter bar`} warn={M[exMid].warn || M[f.metric].warn}
      series={exSeries} quarters={quarters} unit={exSeries[0]?.get(fq).unit} focusQ={fq} sources={srcIds(exSeries)}
      legend={<Legend series={exSeries} kind={exKind} onToggle={toggleCompany} />}>
      {exSeries.length ? <>
        <QChart series={exSeries} quarters={quarters} kind={exKind} focusQ={fq} explicitFocus={explicit} onFocus={onFocus} period={f.period} height={280} def={`${M[exMid].def} Formula: ${M[exMid].formula}.`} ariaLabel={M[exMid].label} />
        <Readout q={fq} series={exSeries} period={f.period} />
      </> : <div className="empty"><strong>Metric not reported by the selected company</strong><span>Choose another metric or set Company to Both.</span></div>}
    </Card>
  );
}

function Trends({ f, fq, ctx, cos, quarters, explicit, onFocus, companySeries, kindFor, viewText, srcIds, toggleCompany }) {
  const card = (id, title, span, extraSub) => {
    const series = companySeries(id);
    if (!series.length) return null;
    const mid = series[0].metric; const m = M[mid];
    const kind = kindFor(mid, f.mode);
    const unitShown = series[0].get(fq).unit;
    const noMarginNote = f.display === 'margin' && !M[id].margin ? ' · Margin view not applicable' : '';
    return (
      <Card key={id} span={span} title={mid === id ? title : m.label} sub={`${viewText(mid)}${noMarginNote}${extraSub ? ' · ' + extraSub : ''}`} warn={m.warn || M[id].warn}
        series={series} quarters={quarters} unit={unitShown} focusQ={fq} sources={srcIds(series)}
        legend={<Legend series={series} kind={kind} onToggle={toggleCompany} />}>
        <QChart series={series} quarters={quarters} kind={kind} focusQ={fq} explicitFocus={explicit} onFocus={onFocus} period={f.period} def={`${m.def} Formula: ${m.formula}.`} ariaLabel={`${m.label}, ${viewText(mid)}`} />
        <Readout q={fq} series={series} period={f.period} />
      </Card>
    );
  };
  return (
    <section className="sec" id="trends" aria-labelledby="h-trends">
      <div className="sec-head"><span className="num">02</span><h2 id="h-trends">Financial trends</h2><p>All cards follow the Values, Display, Period and Basis controls. Bars are dollar amounts; lines are rates.</p></div>
      <div className="grid">
        <Explorer {...{ f, fq, quarters, explicit, onFocus, companySeries, kindFor, viewText, srcIds, toggleCompany }} />
        {card('revenue', 'Revenue', 6)}
        {card('op_income', 'Operating income', 6)}
        {card('net_income', 'Net income', 4)}
        {card('eps_diluted', 'Diluted EPS (GAAP)', 4)}
        {card('eps_ex', 'Diluted EPS ex. disclosed one-offs', 4)}
        {card('fcf', 'Free cash flow', 6)}
        {card('capex', 'Capital expenditures', 6)}
        {card('cash_ms', 'Cash & marketable securities', 4)}
        {card('shareholder_returns', 'Capital returned (buybacks + dividends)', 4)}
        {card('rev_per_employee', 'Revenue per employee', 4)}
      </div>
      <OneOffLog cos={cos} quarters={quarters} />
    </section>
  );
}

function OneOffLog({ cos, quarters }) {
  const rows = DATA.one_offs.filter((o) => cos.includes(o.co) && quarters.includes(o.q));
  if (!rows.length) return null;
  return (
    <details className="card more">
      <summary>One-off items log ({rows.length}) - company-disclosed charges, gains and tax items that distort comparisons</summary>
      <div className="tbl-wrap" style={{ marginTop: 8 }}>
        <table className="tbl left"><thead><tr><th>Quarter</th><th>Company</th><th>Type</th><th>Item</th><th>Source</th></tr></thead>
          <tbody>{rows.map((o, i) => <tr key={i}><td>{qLabel(o.q)}</td><td>{CO[o.co].name}</td><td>{o.kind}</td><td>{o.text}</td><td><a href={SRC[o.src].url} target="_blank" rel="noreferrer">{SRC[o.src].doc}</a></td></tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}

// ================================================================== 3. Segments
function Segments({ f, fq, ctx, cos, quarters, explicit, onFocus, companySeries, kindFor, viewText, srcIds, toggleCompany, segOn, toggleSeg, c, coColor }) {
  const both = cos.length === 2;
  const mk = (co, id, name, color, mode = f.mode, ctxx = ctx) => ({ id: `${co}-${id}`, co, name, color, metric: id, get: (q) => ({ ...shown(co, id, q, ctxx, mode), src: sourcesFor(co, id, q, ctxx) }) });
  const chart = (series, opts = {}) => {
    const kind = opts.kind || kindFor(series[0].metric, opts.mode || f.mode);
    return <>
      <QChart series={series} quarters={quarters} kind={kind} focusQ={fq} explicitFocus={explicit} onFocus={onFocus} period={f.period} height={opts.height || 230} def={opts.def || `${M[series[0].metric].def}`} ariaLabel={opts.aria} colorBySign={opts.colorBySign} endLabels={opts.endLabels !== false} />
      <Readout q={fq} series={series} period={f.period} />
    </>;
  };
  // advertising
  const ads = companySeries('ad_revenue', { display: 'abs' });
  const gap = both ? [{
    id: 'gap', name: 'Meta minus Alphabet ad growth', color: c.meta, metric: 'ad_revenue',
    get: (q) => { const a = shown('GOOGL', 'ad_revenue', q, ctx, 'yoy'), b = shown('META', 'ad_revenue', q, ctx, 'yoy'); const v = a.v == null || b.v == null ? null : (b.v - a.v) * 100; return { v, unit: 'pp', note: v == null ? (a.note || b.note) : (v >= 0 ? 'Meta growing faster' : 'Alphabet growing faster'), src: [...sourcesFor('GOOGL', 'ad_revenue', q, ctx), ...sourcesFor('META', 'ad_revenue', q, ctx)] }; },
  }] : [];
  // cloud vs RL
  const useMargin = f.display === 'margin';
  const cloudOn = segOn('cloud') && cos.includes('GOOGL'), rlOn = segOn('rl') && cos.includes('META');
  const oiSeries = [
    ...(cloudOn ? [mk('GOOGL', useMargin ? 'cloud_margin' : 'cloud_oi', useMargin ? 'Google Cloud operating margin' : 'Google Cloud operating income', c.goog)] : []),
    ...(rlOn && !useMargin ? [mk('META', 'rl_oi', 'Reality Labs operating loss', c.meta)] : []),
  ];
  const cloudRev = cloudOn ? [mk('GOOGL', 'cloud_rev', 'Google Cloud revenue', c.goog)] : [];
  const rlRev = rlOn ? [mk('META', 'rl_rev', 'Reality Labs revenue', c.meta)] : [];
  // revenue mix
  const segColor = { search: c.seg1, youtube: c.seg2, network: c.seg3, subs: c.seg4, cloud: c.seg5, otherbets: c['seg-other'], ads: c.seg1, metaother: c.seg2, rl: c.seg3 };
  const segMetric = { search: 'search', youtube: 'youtube', network: 'network', subs: 'subs', cloud: 'cloud_rev', otherbets: 'other_bets_rev', ads: 'ad_revenue', metaother: 'other_rev', rl: 'rl_rev' };
  const mixSeries = (co) => SEGMENTS.filter((s) => s.co === co).map((s) => {
    const id = segMetric[s.id];
    const base = { id: s.id, co, seg: s.id, name: s.label, color: segColor[s.id], metric: id };
    if (f.mode === 'value' && useMargin) return { ...base, get: (q) => { const a = value(co, id, q, ctx), r = value(co, 'revenue', q, ctx); return { v: a == null || !r ? null : a / r, unit: 'pct', note: null, src: sourcesFor(co, id, q, ctx) }; } };
    return { ...base, get: (q) => ({ ...shown(co, id, q, ctx, f.mode), src: sourcesFor(co, id, q, ctx) }) };
  });
  const mixKind = f.mode === 'value' ? 'stack' : 'line';
  const mixCard = (co) => {
    const all = mixSeries(co); const on = all.filter((s) => segOn(s.seg));
    return (
      <Card span={6} title={`${CO[co].name} revenue mix`} sub={`${viewText('revenue')}${useMargin && f.mode === 'value' ? ' · Share of total revenue' : ''}${co === 'GOOGL' ? ' · Excludes hedging gains/losses' : ''}`}
        series={on} quarters={quarters} focusQ={fq} sources={srcIds(on)}
        legend={<Legend series={all} kind={mixKind === 'stack' ? 'bar' : 'line'} hidden={all.filter((s) => !segOn(s.seg)).map((s) => s.id)} onToggle={(s) => toggleSeg(s.seg)} />}>
        {on.length ? chart(on, { kind: mixKind, endLabels: false, def: 'Click a legend item to filter segments across the dashboard.', aria: `${CO[co].name} revenue by segment` }) : <div className="empty"><strong>All {CO[co].name} segments are filtered out</strong><span>Turn segments back on from the legend or the Segments filter.</span></div>}
      </Card>
    );
  };
  const g = cos.includes('GOOGL'), me = cos.includes('META');
  return (
    <section className="sec" id="segments" aria-labelledby="h-segments">
      <div className="sec-head"><span className="num">03</span><h2 id="h-segments">Segment performance</h2><p>Advertising, Google Cloud against Reality Labs, revenue mix, and the engagement and pricing drivers each company discloses.</p></div>
      <div className="grid">
        {segOn('ads') || segOn('search') ? (
          <Card span={6} title="Advertising revenue" sub={`${viewText('ad_revenue')} · Google advertising vs Meta advertising`} warn={M.ad_revenue.warn} series={ads} quarters={quarters} focusQ={fq} sources={srcIds(ads)} legend={<Legend series={ads} kind={kindFor('ad_revenue', f.mode)} onToggle={toggleCompany} />}>
            {chart(ads, { aria: 'Advertising revenue' })}
          </Card>
        ) : null}
        <Card span={6} title="Advertising growth gap" sub={`Meta ad revenue YoY minus Google advertising YoY, percentage points · ${{ Q: 'Quarterly', YTD: 'YTD', TTM: 'TTM' }[f.period]}`} series={gap.length ? gap : null} quarters={quarters} focusQ={fq} sources={gap.length ? srcIds(gap) : null}
          legend={gap.length ? <div className="legend"><span><span className="key-rect" style={{ background: c.meta, marginRight: 6 }} />Meta faster</span><span><span className="key-rect" style={{ background: c.goog, marginRight: 6 }} />Alphabet faster</span></div> : null}>
          {gap.length ? chart(gap, { kind: 'bar', mode: 'yoy', colorBySign: [c.meta, c.goog], def: 'Gap = Meta advertising YoY growth - Google advertising YoY growth.', aria: 'Advertising growth gap' })
            : <div className="empty"><strong>Needs both companies</strong><span>Set Company to Both to compare advertising growth.</span></div>}
        </Card>

        <Card span={6} title="Google Cloud vs Reality Labs: profitability" sub={`${useMargin ? 'Operating margin (Reality Labs margin is n/m: losses run about 10x revenue)' : 'Segment operating income (loss)'} · ${viewText(useMargin ? 'cloud_margin' : 'cloud_oi')}`}
          series={oiSeries.length ? oiSeries : null} quarters={quarters} focusQ={fq} sources={srcIds(oiSeries)} legend={<Legend series={oiSeries} kind={kindFor(oiSeries[0]?.metric || 'cloud_oi', f.mode)} />}>
          {oiSeries.length ? chart(oiSeries, { aria: 'Cloud versus Reality Labs operating income' }) : <div className="empty"><strong>Cloud and Reality Labs are filtered out</strong><span>Re-enable them in Segments or set Company to Both.</span></div>}
        </Card>
        <Card span={3} title="Google Cloud revenue" sub={viewText('cloud_rev')} series={cloudRev.length ? cloudRev : null} quarters={quarters} focusQ={fq} sources={srcIds(cloudRev)}>
          {cloudRev.length ? chart(cloudRev, { height: 200, aria: 'Google Cloud revenue' }) : <div className="empty"><span>Google Cloud filtered out</span></div>}
        </Card>
        <Card span={3} title="Reality Labs revenue" sub={viewText('rl_rev')} series={rlRev.length ? rlRev : null} quarters={quarters} focusQ={fq} sources={srcIds(rlRev)}>
          {rlRev.length ? chart(rlRev, { height: 200, aria: 'Reality Labs revenue' }) : <div className="empty"><span>Reality Labs filtered out</span></div>}
        </Card>

        {g && mixCard('GOOGL')}
        {me && mixCard('META')}

        {me && <>
          <Card span={4} title="Meta daily active people" sub="Billions, last-month average · YoY uses company-reported rate" series={[mk('META', 'dap', 'Family DAP', c.meta)]} quarters={quarters} focusQ={fq} sources={['M-PRES-26Q3']}>
            {chart([mk('META', 'dap', 'Family DAP', c.meta)], { kind: 'line', aria: 'Meta DAP' })}
          </Card>
          <Card span={4} title="Meta average revenue per person" sub="ARPP, quarterly only" series={[mk('META', 'arpp', 'Family ARPP', c.meta, f.mode, { ...ctx, period: 'Q' })]} quarters={quarters} focusQ={fq} sources={['M-PRES-26Q3']}>
            {chart([mk('META', 'arpp', 'Family ARPP', c.meta, f.mode, { ...ctx, period: 'Q' })], { aria: 'Meta ARPP' })}
          </Card>
          <Card span={4} title="Meta volume vs price" sub="Reported YoY change, Family of Apps" series={[mk('META', 'impressions_yoy', 'Ad impressions', c.vol, 'value', { ...ctx, period: 'Q' }), mk('META', 'price_per_ad_yoy', 'Average price per ad', c.price, 'value', { ...ctx, period: 'Q' })]} quarters={quarters} focusQ={fq} sources={DATA.display.map((q) => DATA.m_src[q])}
            legend={<Legend series={[{ id: 'i', name: 'Ad impressions', color: c.vol }, { id: 'p', name: 'Average price per ad', color: c.price }]} kind="bar" />}>
            {chart([mk('META', 'impressions_yoy', 'Ad impressions', c.vol, 'value', { ...ctx, period: 'Q' }), mk('META', 'price_per_ad_yoy', 'Average price per ad', c.price, 'value', { ...ctx, period: 'Q' })], { kind: 'bar', aria: 'Meta impressions and price per ad' })}
          </Card>
        </>}
        {g && <>
          <Card span={4} title="Google Search volume vs price" sub="Paid clicks and cost per click, reported YoY change" warn="Q4 is not disclosed on its own (FY2025: clicks +6%, CPC +7%); Q2 2026 MD&A text could not be retrieved, so it is left blank." series={[mk('GOOGL', 'paid_clicks_yoy', 'Paid clicks', c.vol, 'value', { ...ctx, period: 'Q' }), mk('GOOGL', 'cpc_yoy', 'Cost per click', c.price, 'value', { ...ctx, period: 'Q' })]} quarters={quarters} focusQ={fq}
            sources={quarters.map((q) => DATA.a_clicks_src[q]).filter(Boolean)} legend={<Legend series={[{ id: 'i', name: 'Paid clicks', color: c.vol }, { id: 'p', name: 'Cost per click', color: c.price }]} kind="bar" />}>
            {chart([mk('GOOGL', 'paid_clicks_yoy', 'Paid clicks', c.vol, 'value', { ...ctx, period: 'Q' }), mk('GOOGL', 'cpc_yoy', 'Cost per click', c.price, 'value', { ...ctx, period: 'Q' })], { kind: 'bar', aria: 'Paid clicks and CPC' })}
          </Card>
          <Card span={4} title="Traffic acquisition cost rate" sub="TAC as % of Google advertising revenue" series={[mk('GOOGL', 'tac_rate', 'TAC rate', c.goog, 'value')]} quarters={quarters} focusQ={fq} sources={srcIds([mk('GOOGL', 'tac_rate', '', c.goog, 'value')])}>
            {chart([mk('GOOGL', 'tac_rate', 'TAC rate', c.goog, 'value')], { kind: 'line', aria: 'TAC rate' })}
          </Card>
          <Card span={4} title="Google revenue backlog" sub="Remaining performance obligations, primarily Cloud, $B at period end" series={[mk('GOOGL', 'rpo', 'Revenue backlog', c.goog)]} quarters={quarters} focusQ={fq} sources={quarters.map((q) => DATA.a_rpo_src[q])}>
            {chart([mk('GOOGL', 'rpo', 'Revenue backlog', c.goog)], { aria: 'Google revenue backlog' })}
          </Card>
        </>}
      </div>
    </section>
  );
}

// ================================================================== 4. Outlook
function Outlook({ f, cos, quarters, fq, c, coColor }) {
  const g = DATA.guidance.filter((x) => cos.includes(x.co));
  const actualFor = (x) => {
    if (x.metric === 'Revenue' && /Q/.test(x.target)) { const r = DATA.rows[x.co][x.target]; return r ? r.revenue : null; }
    if (x.target === 'FY2025') {
      const qs = ['2025Q1', '2025Q2', '2025Q3', '2025Q4'];
      if (x.metric === 'Capex') return qs.reduce((s, q) => s + DATA.rows[x.co][q][x.co === 'META' ? 'capex_reported' : 'capex_ppe'], 0);
      if (x.metric === 'Total expenses') return 117690;
    }
    return null;
  };
  const verdict = (x, a) => (a == null ? null : a > x.hi ? 'Above range' : a < x.lo ? 'Below range' : 'Within range');
  const capexRows = (co) => {
    const rows = DATA.guidance.filter((x) => x.co === co && x.metric === 'Capex').map((x) => {
      const mid = (x.lo + x.hi) / 2;
      const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(x.issued.slice(5, 7)) - 1];
      return { x: `${mon} '${x.issued.slice(2, 4)}`, mid, err: [mid - x.lo, x.hi - mid], src: x.src,
        tipHead: `${x.target} capex guidance issued ${x.issued} (${x.at})`, tipRows: [{ v: x.lo === x.hi ? `~${fmt(x.lo, 'usd')}` : `${fmt(x.lo, 'usd')} - ${fmt(x.hi, 'usd')}`, k: x.change }] };
    });
    const act = actualFor({ co, target: 'FY2025', metric: 'Capex' });
    rows.push({ x: 'FY25 act.', actual: act, src: co === 'GOOGL' ? 'A-ER-25Q4' : 'M-ER-25Q4', tipHead: 'FY2025 actual capex (sum of quarters)', tipRows: [{ v: fmt(act, 'usd'), k: co === 'META' ? 'incl. finance-lease principal' : 'purchases of P&E' }] });
    return rows;
  };
  const metaRev = DATA.guidance.filter((x) => x.co === 'META' && x.metric === 'Revenue').map((x) => {
    const mid = (x.lo + x.hi) / 2; const a = actualFor(x);
    return { x: qShort(x.target), mid, err: [mid - x.lo, x.hi - mid], actual: a, src: x.src, tipHead: `${qLabel(x.target)} revenue guidance (issued ${x.issued})`,
      tipRows: [{ v: `${fmt(x.lo, 'usd')} - ${fmt(x.hi, 'usd')}`, k: 'range' }, { v: a == null ? 'Unreported' : fmt(a, 'usd'), k: a == null ? `${qLabel(nextQ(LATEST))} reports ~${DATA.next_report}` : `actual · ${verdict(x, a)}` }] };
  });
  const [allComm, setAllComm] = useState(false);
  const comm = DATA.commentary.filter((x) => cos.includes(x.co) && quarters.includes(x.q)).sort((a, b) => (a.q < b.q ? 1 : a.q > b.q ? -1 : a.co.localeCompare(b.co)));
  const risks = DATA.risks.filter((x) => cos.includes(x.co));
  const est = DATA.estimates.filter((x) => cos.includes(x.co));
  const prevOf = (x, i, arr) => { for (let j = i - 1; j >= 0; j--) if (arr[j].co === x.co && arr[j].metric === x.metric && arr[j].target === x.target) return arr[j]; return null; };
  return (
    <section className="sec" id="outlook" aria-labelledby="h-outlook">
      <div className="sec-head"><span className="num">05</span><h2 id="h-outlook">Outlook</h2><p>Company guidance as issued, how each range moved, and what management said about AI and infrastructure. Unreported periods are guidance only.</p></div>
      <div className="grid">
        {cos.includes('GOOGL') && <Card span={6} title="Alphabet capex guidance path" sub="Range at each update (bar), midpoint (tick), FY2025 actual (dot). 2025 updates target FY2025; 2026 updates target FY2026. Alphabet gives no revenue guidance." sources={DATA.guidance.filter((x) => x.co === 'GOOGL').map((x) => x.src)}>
          <RangeChart rows={capexRows('GOOGL')} colorFor={() => c.goog} ariaLabel="Alphabet capex guidance by update" divider="Feb '26" dividerLabel="FY2026 target" />
        </Card>}
        {cos.includes('META') && <Card span={6} title="Meta capex guidance path" sub="Includes finance-lease principal (Meta definition). 2025 updates target FY2025, 2026 updates FY2026; dot = FY2025 actual." sources={DATA.guidance.filter((x) => x.co === 'META' && x.metric === 'Capex').map((x) => x.src)}>
          <RangeChart rows={capexRows('META')} colorFor={() => c.meta} ariaLabel="Meta capex guidance by update" divider="Jan '26" dividerLabel="FY2026 target" />
        </Card>}
        {cos.includes('META') && <Card span={6} title="Meta revenue guidance vs actual" sub={`Next-quarter range (bar) and reported revenue (dot). ${qLabel(nextQ(LATEST))} shows guidance only.`} sources={DATA.guidance.filter((x) => x.co === 'META' && x.metric === 'Revenue').map((x) => x.src)}>
          <RangeChart rows={metaRev} colorFor={() => c.meta} ariaLabel="Meta revenue guidance versus actual" />
          <div className="readout">{metaRev.map((r, i) => <span key={i}><span className="q">{r.x}</span> {r.actual == null ? <span className="pill">Guidance only</span> : <span className={`pill ${r.actual > r.mid + r.err[1] ? 'beat' : r.actual < r.mid - r.err[0] ? 'miss' : ''}`}>{r.actual > r.mid + r.err[1] ? 'Above' : r.actual < r.mid - r.err[0] ? 'Below' : 'Within'}</span>}</span>)}</div>
        </Card>}
        <Card span={cos.includes('META') ? 6 : 12} title="Analyst estimates (third-party, not company data)" sub={`Shown separately from actuals. Consensus for unreported ${qLabel(nextQ(LATEST))} was not verifiable from a primary source and is not shown.`}>
          <div className="est">
            <span className="badge">Estimate vs reported · {qLabel('2026Q3')}</span>
            <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Company / metric</th><th>Consensus</th><th>Reported</th><th>Surprise</th><th>Source</th></tr></thead>
              <tbody>{est.map((e, i) => { const s = e.actual / e.consensus - 1; return <tr key={i}><td>{CO[e.co].name} · {e.metric}</td><td>{fmt(e.consensus, e.unit === '$M' ? 'usd' : 'eps')}</td><td>{fmt(e.actual, e.unit === '$M' ? 'usd' : 'eps')}</td><td className={s >= 0 ? 'up' : 'down'}>{fmt(s, 'growth')}</td><td style={{ fontFamily: 'var(--font-ui)' }}><a href={SRC[e.src].url} target="_blank" rel="noreferrer">{SRC[e.src].doc.split(':')[0]}</a></td></tr>; })}</tbody></table></div>
            {cos.includes('META') && (() => {
              const nq = nextQ(LATEST); const pq = `${+nq.slice(0, 4) - 1}${nq.slice(4)}`;
              const g = DATA.guidance.find((x) => x.co === 'META' && x.metric === 'Revenue' && x.target === nq);
              const prior = value('META', 'revenue', pq, { period: 'Q', basis: 'reported' });
              if (!g) return null; const mid = (g.lo + g.hi) / 2;
              return <span style={{ fontSize: 12.5 }}>Next quarter (company guidance, not an estimate): <b>Meta {qLabel(nq)} revenue {fmt(g.lo, 'usd')}-{fmt(g.hi, 'usd')}</b>, midpoint {fmt(mid, 'usd')}{prior ? <>, {fmt(mid / prior - 1, 'growth')} YoY vs {qLabel(pq)} ({fmt(prior, 'usd')})</> : null}.</span>;
            })()}
          </div>
        </Card>
        <div className="card span-12">
          <div className="card-head"><div><h3>Guidance changes</h3><p className="sub">Every range issued since the Q4 2024 report, with the move versus the prior range for the same target.</p></div></div>
          <div className="tbl-wrap"><table className="tbl left">
            <thead><tr><th>Issued</th><th>Company</th><th>Target</th><th>Metric</th><th>Range</th><th>Change</th><th>Midpoint move</th><th>Outcome</th><th>Source</th></tr></thead>
            <tbody>{g.map((x, i, arr) => {
              const p = prevOf(x, i, arr); const mid = (x.lo + x.hi) / 2; const pm = p ? (p.lo + p.hi) / 2 : null; const a = actualFor(x);
              const cls = /Raised|low end up/i.test(x.change) ? 'raised' : /Lowered/i.test(x.change) ? 'lowered' : '';
              return <tr key={i}><td className="tnum">{x.issued}</td><td><span className="dot" style={{ background: coColor(x.co) }} />{CO[x.co].name}</td><td>{x.target.startsWith('20') ? qLabel(x.target) : x.target}</td><td>{x.metric}</td>
                <td className="tnum">{x.lo === x.hi ? `~${fmt(x.lo, 'usd')}` : `${fmt(x.lo, 'usd')} - ${fmt(x.hi, 'usd')}`}</td><td><span className={`pill ${cls}`}>{x.change}</span></td>
                <td className="tnum">{pm == null ? '' : `${mid - pm >= 0 ? '+' : '-'}$${(Math.abs(mid - pm) / 1000).toFixed(1)}B`}</td>
                <td>{a == null ? (x.target === nextQ(LATEST) || x.target === `FY${nextQ(LATEST).slice(0, 4) - (nextQ(LATEST).endsWith('Q1') ? 1 : 0)}` ? 'Pending' : '') : `${fmt(a, 'usd')} · ${verdict(x, a)}`}</td>
                <td><a href={SRC[x.src].url} target="_blank" rel="noreferrer">{SRC[x.src].type.startsWith('Secondary') ? 'Call coverage' : SRC[x.src].doc.replace(/ results press release| earnings release/i, '')}</a></td></tr>;
            })}</tbody></table></div>
        </div>
        <div className="card span-7">
          <div className="card-head"><div><h3>AI and infrastructure commentary</h3><p className="sub">Management statements by quarter, newest first; quotes are verbatim, the rest paraphrased. Follows the quarter range and company filters.</p></div></div>
          {comm.length ? <><div className="feed">{(allComm ? comm : comm.slice(0, 8)).map((x, i) => (
            <article key={i}><div className="meta"><b>{qLabel(x.q)}</b><span><span className="dot" style={{ background: coColor(x.co) }} />{CO[x.co].name}</span><span className="pill">{x.theme}</span></div>
              <div><p>{x.text}</p><div className="srcline"><a href={SRC[x.src].url} target="_blank" rel="noreferrer">{SRC[x.src].doc} ({SRC[x.src].date})</a></div></div></article>
          ))}</div>{comm.length > 8 && <div><button type="button" className="btn small" aria-expanded={allComm} onClick={() => setAllComm(!allComm)}>{allComm ? 'Show latest 8' : `Show all ${comm.length} statements`}</button></div>}</> : <div className="empty"><strong>No commentary in this range</strong><span>Widen the quarter range.</span></div>}
        </div>
        <div className="card span-5">
          <div className="card-head"><div><h3>Catalysts and risks</h3><p className="sub">Regulatory, competitive, execution and financial items with current status.</p></div></div>
          <div className="risk-grid" style={{ gridTemplateColumns: '1fr' }}>
            {risks.map((r, i) => (
              <div className="risk" key={i}>
                <div className="r-top"><span className="cat">{r.cat}</span><span><span className="dot" style={{ background: coColor(r.co) }} />{CO[r.co].name} · <span className="pill">{r.status}</span></span></div>
                <h4>{r.title}</h4><p>{r.text}</p>
                <div className="srcline"><a href={SRC[r.src].url} target="_blank" rel="noreferrer">{SRC[r.src].doc} ({SRC[r.src].date})</a></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ================================================================== 5. Sources & methodology
function Method({ APAC, f, fq, ctx, cos, quarters, csvText, setCsvText, downloadCsv, copyCsv, csvArgs, dl }) {
  const both = cos.length === 2;
  const co0 = cos[0];
  const n = (co, id, q = fq, cx = ctx) => value(co, id, q, cx);
  const pq = Q_ALL[qIdx(fq) - 4], qq = Q_ALL[qIdx(fq) - 1];
  const r = (co) => n(co, 'revenue'), rp = (co) => (pq ? n(co, 'revenue', pq) : null), rq = (co) => (qq ? n(co, 'revenue', qq) : null);
  const ex = [];
  cos.forEach((co) => {
    const nm = CO[co].name;
    ex.push({ name: 'YoY growth', co, formula: `Revenue_t / Revenue_(t-4) - 1 = ${fmtExact(r(co), 'usd')} / ${fmtExact(rp(co), 'usd')} - 1`, result: rp(co) ? fmt(r(co) / rp(co) - 1, 'growth') : 'n/a', check: shown(co, 'revenue', fq, ctx, 'yoy').v, calc: rp(co) ? r(co) / rp(co) - 1 : null });
    if (f.period !== 'YTD') ex.push({ name: 'QoQ growth', co, formula: `Revenue_t / Revenue_(t-1) - 1 = ${fmtExact(r(co), 'usd')} / ${fmtExact(rq(co), 'usd')} - 1`, result: rq(co) ? fmt(r(co) / rq(co) - 1, 'growth') : 'n/a', check: shown(co, 'revenue', fq, ctx, 'qoq').v, calc: rq(co) ? r(co) / rq(co) - 1 : null });
    ex.push({ name: 'Operating margin', co, formula: `Operating income / Revenue = ${fmtExact(n(co, 'op_income'), 'usd')} / ${fmtExact(r(co), 'usd')}`, result: fmt(n(co, 'op_margin'), 'pct'), check: n(co, 'op_margin'), calc: n(co, 'op_income') / r(co) });
    ex.push({ name: 'FCF margin', co, formula: `(OCF - Capex) / Revenue = (${fmtExact(n(co, 'ocf'), 'usd')} - ${fmtExact(n(co, 'capex'), 'usd')}${co === 'META' && f.basis !== 'lfl' ? ' [incl. finance-lease principal]' : ''}) / ${fmtExact(r(co), 'usd')}`, result: fmt(n(co, 'fcf_margin'), 'pct'), check: n(co, 'fcf_margin'), calc: (n(co, 'ocf') - n(co, 'capex')) / r(co) });
    ex.push({ name: 'Capex intensity', co, formula: `Capex / Revenue = ${fmtExact(n(co, 'capex'), 'usd')} / ${fmtExact(r(co), 'usd')}`, result: fmt(n(co, 'capex_intensity'), 'pct'), check: n(co, 'capex_intensity'), calc: n(co, 'capex') / r(co) });
    ex.push({ name: 'Revenue per employee', co, formula: `Revenue / Period-end headcount = ${fmtExact(r(co), 'usd')} / ${fmtExact(DATA.rows[co][fq].headcount, 'count')}`, result: fmt(n(co, 'rev_per_employee'), 'usdk'), check: n(co, 'rev_per_employee'), calc: r(co) * 1000 / DATA.rows[co][fq].headcount });
    ex.push({ name: 'Operating income per employee', co, formula: `Operating income / Period-end headcount = ${fmtExact(n(co, 'op_income'), 'usd')} / ${fmtExact(DATA.rows[co][fq].headcount, 'count')}`, result: fmt(n(co, 'oi_per_employee'), 'usdk'), check: n(co, 'oi_per_employee'), calc: n(co, 'op_income') * 1000 / DATA.rows[co][fq].headcount });
  });
  if (both) {
    const a = shown('GOOGL', 'ad_revenue', fq, ctx, 'yoy').v, b = shown('META', 'ad_revenue', fq, ctx, 'yoy').v;
    const ga = n('GOOGL', 'ad_revenue'), gp = pq ? n('GOOGL', 'ad_revenue', pq) : null, ma = n('META', 'ad_revenue'), mp = pq ? n('META', 'ad_revenue', pq) : null;
    ex.push({ name: 'Advertising growth gap', co: 'both', formula: `(Meta ads_t / ads_(t-4) - 1) - (Google ads_t / ads_(t-4) - 1) = (${fmtExact(ma, 'usd')}/${fmtExact(mp, 'usd')} - 1) - (${fmtExact(ga, 'usd')}/${fmtExact(gp, 'usd')} - 1)`, result: a != null && b != null ? fmt((b - a) * 100, 'pp') : 'n/a', check: a != null && b != null ? b - a : null, calc: gp && mp ? (ma / mp - 1) - (ga / gp - 1) : null });
  }
  // regional / ad formulas
  const fq4 = pq;
  if (cos.includes('META')) {
    const rr = DATA.rows.META[fq];
    const ap = n('META', 'ad_ap'), app = fq4 ? n('META', 'ad_ap', fq4) : null;
    const g = app ? ap / app - 1 : null;
    ex.push({ name: 'Volume x price vs ad growth (APAC)', co: 'META', formula: `(1 + impressions) x (1 + price per ad) - 1 = (1 + ${rr.imp_ap}%) x (1 + ${rr.ppa_ap}%) - 1 vs ad revenue ${fmtExact(ap, 'usd')} / ${fmtExact(app, 'usd')} - 1`, result: `${fmt((1 + rr.imp_ap / 100) * (1 + rr.ppa_ap / 100) - 1, 'growth')} vs ${fmt(g, 'growth')}`, check: g, calc: g == null ? null : ((1 + rr.imp_ap / 100) * (1 + rr.ppa_ap / 100) - 1), tol: 0.015 });
    ex.push({ name: 'APAC share of ad revenue', co: 'META', formula: `Ad revenue APAC / Advertising revenue = ${fmtExact(ap, 'usd')} / ${fmtExact(n('META', 'ad_revenue'), 'usd')}`, result: fmt(n('META', 'ad_ap_share'), 'pct'), check: n('META', 'ad_ap_share'), calc: ap / n('META', 'ad_revenue') });
  }
  if (cos.includes('GOOGL')) {
    const a = n('GOOGL', 'geo_apac'), ap = fq4 ? n('GOOGL', 'geo_apac', fq4) : null, t = r('GOOGL'), tp = rp('GOOGL');
    ex.push({ name: 'APAC YoY growth', co: 'GOOGL', formula: `APAC_t / APAC_(t-4) - 1 = ${fmtExact(a, 'usd')} / ${fmtExact(ap, 'usd')} - 1`, result: ap ? fmt(a / ap - 1, 'growth') : 'n/a', check: shown('GOOGL', 'geo_apac', fq, ctx, 'yoy').v, calc: ap ? a / ap - 1 : null });
    ex.push({ name: 'APAC growth gap', co: 'GOOGL', formula: `APAC YoY - total YoY = (${fmtExact(a, 'usd')}/${fmtExact(ap, 'usd')} - 1) - (${fmtExact(t, 'usd')}/${fmtExact(tp, 'usd')} - 1)`, result: ap && tp ? fmt(((a / ap) - (t / tp)) * 100, 'pp') : 'n/a', check: ap && tp ? shown('GOOGL', 'geo_apac', fq, ctx, 'yoy').v - shown('GOOGL', 'revenue', fq, ctx, 'yoy').v : null, calc: ap && tp ? (a / ap - 1) - (t / tp - 1) : null });
    ex.push({ name: 'APAC share of revenue added', co: 'GOOGL', formula: `(APAC_t - APAC_(t-4)) / (Revenue_t - Revenue_(t-4)) = ${fmtExact(a - ap, 'usd')} / ${fmtExact(t - tp, 'usd')}`, result: ap && tp ? fmt((a - ap) / (t - tp), 'pct') : 'n/a', check: ap && tp ? (a - ap) / (t - tp) : null, calc: ap && tp ? (a - ap) / (t - tp) : null });
  }
  if (cos.includes('META')) {
    const billed = DATA.m_fy_geo.FY2025[2]; const seen = ['2025Q1', '2025Q2', '2025Q3', '2025Q4'].reduce((x, q) => x + DATA.rows.META[q].rev_ap, 0);
    ex.push({ name: 'APAC billed vs seen (FY2025)', co: 'META', formula: `APAC by customer address - sum of quarterly APAC by user location = ${fmtExact(billed, 'usd')} - ${fmtExact(seen, 'usd')}`, result: fmt(billed - seen, 'usd'), check: billed - seen, calc: DATA.m_fy_geo.FY2025[2] - seen });
  }
  const checks = DATA.checks; const passed = checks.filter((x) => x.ok).length;
  const groups = {}; checks.forEach((x) => { const k = x.check.replace(/: .*/, ''); (groups[k] ||= { n: 0, ok: 0 }); groups[k].n++; if (x.ok) groups[k].ok++; });
  const metrics = metricsFor(cos).filter((m) => !APAC || apacMetric(m));
  const [tab, setTab] = useState(co0);
  useEffect(() => { if (!cos.includes(tab)) setTab(co0); }, [cos.join()]);
  const tableMetrics = metricsFor([tab]).filter((m) => m.cos.includes(tab) && (!APAC || apacMetric(m)) && (!m.segment || m.segment === 'ads' || f.segments.includes(m.segment)));
  let lastGroup = '';
  return (
    <section className="sec" id="method" aria-labelledby="h-method">
      <div className="sec-head"><span className="num">{APAC ? '05' : '06'}</span><h2 id="h-method">Sources and methodology</h2><p>Primary sources, definitions, live formula checks for {periodText(fq, f.period)}, and the data-integrity tests run on the dataset.</p></div>
      <div className="grid">
        <div className="card span-7">
          <div className="card-head"><div><h3>Formulas, shown with live inputs</h3><p className="sub">Recomputed from reported inputs and compared with the value the dashboard displays ({f.basis === 'lfl' ? 'like-for-like' : 'company-reported'} capex basis).</p></div></div>
          <div className="tbl-wrap"><table className="tbl left"><thead><tr><th>Measure</th><th>Company</th><th>Formula and inputs</th><th>Result</th><th>Check</th></tr></thead>
            <tbody>{ex.map((e, i) => { const ok = e.calc != null && e.check != null && Math.abs(e.calc - e.check) < (e.tol || 1e-9 * Math.max(1, Math.abs(e.calc))); return <tr key={i}><td>{e.name}</td><td>{e.co === 'both' ? 'Both' : CO[e.co].name}</td><td><div className="formula wrap-f">{e.formula}</div></td><td className="tnum">{e.result}</td><td>{e.calc == null ? <span className="na">n/a</span> : ok ? <span className="ok">Matches</span> : <span className="fail">Mismatch</span>}</td></tr>; })}</tbody></table></div>
        </div>
        <div className="card span-5">
          <div className="card-head"><div><h3>Data integrity tests</h3><p className="sub"><b>{passed} of {checks.length} passed.</b> Run when the dataset was built from the filings.</p></div></div>
          <div className="tbl-wrap"><table className="tbl left"><thead><tr><th>Test</th><th>Passed</th></tr></thead>
            <tbody>{Object.entries(groups).map(([k, v]) => <tr key={k}><td>{k}</td><td className={v.ok === v.n ? 'ok' : 'fail'}>{v.ok}/{v.n}</td></tr>)}</tbody></table></div>
          <details className="more"><summary>Show every test result</summary>
            <div className="tbl-wrap" style={{ maxHeight: 280, marginTop: 6 }}><table className="tbl"><thead><tr><th>Test</th><th>Co.</th><th>Period</th><th>Computed</th><th>Reported</th><th>OK</th></tr></thead>
              <tbody>{checks.map((x, i) => <tr key={i}><td style={{ whiteSpace: 'normal', minWidth: 220 }}>{x.check}</td><td>{x.co}</td><td>{x.q}</td><td>{String(x.computed)}</td><td>{String(x.reported)}</td><td className={x.ok ? 'ok' : 'fail'}>{x.ok ? 'Yes' : 'No'}</td></tr>)}</tbody></table></div>
          </details>
        </div>

        <div className="card span-6">
          <div className="card-head"><div><h3>Comparability limitations</h3></div></div>
          {APAC && <ul className="method-list">
            <li><b>Two geography bases.</b> Meta's quarterly regions are by <b>user location</b> (where the ad is seen); Alphabet's are by <b>customer billing address</b>. Meta also discloses revenue by customer address, but only annually (10-K). The annual billing-address chart is the only like-for-like APAC comparison.</li>
            <li><b>Scope differs.</b> Alphabet does not split advertising by region: its APAC figure includes Cloud, subscriptions, Play and devices. Meta's regional figures are advertising (and total revenue) by user location.</li>
            <li><b>Region definitions differ.</b> Meta's US & Canada includes Canada; Alphabet's Other Americas is Canada plus Latin America. Meta's Rest of World includes Latin America, the Middle East and Africa; Alphabet's EMEA includes the Middle East and Africa.</li>
            <li><b>No country detail.</b> Neither company discloses Southeast Asia, India, Japan or China revenue in its quarterly filings, so no sub-APAC cut is shown.</li>
            <li><b>Billed vs seen.</b> APAC-billed revenue exceeds APAC user revenue at Meta ($53.8B vs $39.3B in 2025): advertisers billed in APAC (largely exporters) buy reach in other regions. Trade-policy changes hit this billed revenue even when APAC user metrics look healthy.</li>
            <li><b>Regional volume and price.</b> Meta's regional impressions and price-per-ad changes are read from its earnings-presentation charts (slides 12-13). Quarter-level mapping follows two independent transcriptions and is verified two ways: the values exactly match the set printed on each deck, and (1 + impressions) x (1 + price) reproduces each region's ad revenue growth within 1.5pt.</li>
            <li><b>Derived Q4 geography for Alphabet.</b> Q4 regional revenue = full-year (10-K) minus nine months (Q3 10-Q); Q4 2025 sums to $1M above the release total due to rounding.</li>
            <li><b>FX.</b> Constant-currency APAC growth is shown only where the 10-Q text was retrievable (Q1 and Q2 2025). Reported USD growth for APAC can be swung several points by FX.</li>
          </ul>}
          {!APAC && <ul className="method-list">
            <li><b>Regional ad data (Ads deep dive).</b> Meta regions are by user location, Alphabet regions by billing address and include all revenue types; see the APAC edition for the full comparability notes.</li>
            <li><b>Capex and FCF definitions differ.</b> Meta adds principal payments on finance leases to capex and deducts them from FCF; Alphabet does not. Use the Like-for-like basis (purchases of P&E only) for strict comparison.</li>
            <li><b>Net income and EPS are not like-for-like.</b> Alphabet's other income swings with marks on equity stakes (+$99.0B gain in Q2 2026, -$8.7B loss in Q3 2026); Meta booked a $15.93B tax charge (Q3 2025) and an $8.03B benefit (Q1 2026). See the one-off log and the "EPS ex. disclosed one-offs" view.</li>
            <li><b>Advertising is not the same business.</b> Google advertising includes Network revenue earned on partner sites with high TAC; Meta's is on owned apps. Ad growth gap compares reported revenue growth only.</li>
            <li><b>Cloud vs Reality Labs</b> are different-stage segments: Cloud is a $120B+ run-rate business with TPU sales and a $568B backlog; Reality Labs is pre-profit hardware. Revenue charts use separate axes for that reason.</li>
            <li><b>Volume/price metrics differ.</b> Alphabet discloses paid clicks and CPC for Search & other properties (no Q4 standalone figure); Meta discloses Family-of-Apps ad impressions and price per ad. Both are reported YoY changes, rounded to whole percents.</li>
            <li><b>Share repurchases use cash-flow basis.</b> Meta's press-release highlight can differ from cash paid (Q1 2025: $13.40B trade-date vs $12.75B cash).</li>
            <li><b>Headcount reductions.</b> Meta's 15% YoY headcount decline (Q3 2026) inflates revenue per employee versus Alphabet, whose headcount grew 8%.</li>
            <li><b>Rounding.</b> Meta cash balances are reported to $0.01B; Meta's FY2025 revenue differs from the sum of quarters by $1M. Growth rates computed here can differ from company-rounded rates by under 0.5pt.</li>
            <li><b>Equity issuance.</b> Alphabet's Q2 2026 common and mandatory convertible preferred issuance raises diluted share count and introduces preferred dividends that reduce net income available to common holders.</li>
          </ul>}
        </div>
        <div className="card span-6">
          <div className="card-head"><div><h3>Period views and growth rules</h3></div></div>
          <ul className="method-list">
            <li><b>Quarterly</b>: the reported quarter. <b>YTD</b>: sum from Q1 of the same calendar year. <b>TTM</b>: sum of the latest four quarters (2024 quarters are used only as the base for TTM and YoY).</li>
            <li>Flows (revenue, income, cash flows, capex, buybacks) are summed; balances (cash, headcount, DAP, backlog) are taken at period end; ratios are recomputed from summed numerators and denominators, never averaged.</li>
            <li><b>YoY</b> compares with the same window one year earlier; <b>QoQ</b> with the window one quarter earlier (not offered for YTD). Ratios move in percentage points. Growth on a zero or negative base is shown as n/m.</li>
            <li>Meta DAP growth uses the company-reported rate because DAP is published rounded to 0.01B. Meta headcount YoY for Q1-Q3 2025 uses the reported rate (2024 levels not in the collected releases).</li>
            <li>Paid clicks, CPC, impressions, price per ad and ARPP are single-quarter measures; they show n/a in YTD and TTM views.</li>
            <li>No unreported quarter appears as an actual. {qLabel(nextQ(LATEST))} appears only as Meta revenue guidance in the Outlook section.</li>
          </ul>
        </div>

        <div className="card span-12">
          <div className="card-head"><div><h3>Metric definitions</h3><p className="sub">Hover any chart for the same definitions in context.</p></div></div>
          <div className="tbl-wrap"><table className="tbl left"><thead><tr><th>Metric</th><th>Applies to</th><th>Definition</th><th>Formula</th><th>Comparability note</th></tr></thead>
            <tbody>{metrics.map((m) => <tr key={m.id}><td><b>{m.label}</b></td><td>{m.cos.map((x) => CO[x].name).join(', ')}</td><td>{m.def}</td><td><span className="formula" style={{ whiteSpace: 'normal', display: 'inline-block' }}>{m.formula}</span></td><td>{m.warn || ''}</td></tr>)}</tbody></table></div>
        </div>

        <div className="card span-12">
          <div className="card-head"><div><h3>Sources</h3><p className="sub">Primary documents first. Secondary sources are used only where noted (call coverage for two Alphabet guidance points, Q3 2026 paid clicks, consensus, one news item) and as cross-checks.</p></div></div>
          <div className="tbl-wrap"><table className="tbl left"><thead><tr><th>ID</th><th>Company</th><th>Document</th><th>Type</th><th>Published</th><th>Links</th></tr></thead>
            <tbody>{DATA.sources.filter((s) => s.co === 'BOTH' || cos.includes(s.co)).map((s) => <tr key={s.id}><td className="tnum">{s.id}</td><td>{s.co === 'BOTH' ? 'Both' : CO[s.co].name}</td><td>{s.doc}</td><td>{s.type}</td><td className="tnum">{s.date}</td><td><a href={s.url} target="_blank" rel="noreferrer">Document</a>{s.sec ? <> · <a href={s.sec} target="_blank" rel="noreferrer">SEC EDGAR</a></> : null}</td></tr>)}</tbody></table></div>
        </div>

        <div className="card span-12" id="data">
          <div className="card-head">
            <div><h3>Normalized dataset</h3><p className="sub">Current filters applied: {quarters.length} quarters, {{ Q: 'quarterly', YTD: 'year-to-date', TTM: 'trailing-twelve-month' }[f.period]} view, {f.basis === 'lfl' ? 'like-for-like' : 'company-reported'} capex basis. The CSV is long-format with units, growth, formula, source IDs, URLs and dates per row.</p></div>
            <div className="card-tools">{dl ? <button className="btn small primary" onClick={downloadCsv}>Download CSV</button> : null}<button className="btn small" onClick={() => copyCsv(buildCsv(csvArgs))}>Copy CSV</button></div>
          </div>
          {cos.length > 1 && <div className="seg" role="tablist" aria-label="Company table" style={{ width: 'fit-content' }}>{cos.map((co) => <button key={co} role="tab" aria-selected={tab === co} aria-pressed={tab === co} onClick={() => setTab(co)}>{CO[co].name}</button>)}</div>}
          <div className="tbl-wrap" style={{ maxHeight: 520 }}>
            <table className="tbl"><thead><tr><th>Metric ({CO[tab].name})</th>{quarters.map((q) => <th key={q}>{qShort(q)}</th>)}</tr></thead>
              <tbody>{tableMetrics.map((m) => {
                const rows = [];
                if (m.group !== lastGroup) { lastGroup = m.group; rows.push(<tr className="grp" key={`g-${m.group}`}><td colSpan={quarters.length + 1}>{m.group}</td></tr>); }
                rows.push(<tr key={m.id}><td title={m.def}>{m.label}</td>{quarters.map((q) => { const v = value(tab, m.id, q, ctx); return <td key={q} className={v == null ? 'na' : ''} style={q === fq ? { background: 'var(--wash)' } : undefined} title={v == null ? shown(tab, m.id, q, ctx, 'value').note : `${sourcesFor(tab, m.id, q, ctx).join(', ')}`}>{v == null ? 'n/a' : m.unit === 'usd' ? v.toLocaleString('en-US') : fmt(v, m.unit)}</td>; })}</tr>);
                return rows;
              })}</tbody></table>
          </div>
          <p className="sub" style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Dollar rows in USD millions. {dl === null ? 'File downloads are not available in this view, so Copy CSV places the file contents on your clipboard.' : ''}</p>
          {csvText && <><label htmlFor="csv-out" className="sub">CSV (select all and copy)</label><textarea id="csv-out" className="csv" readOnly value={csvText} onFocus={(e) => e.target.select()} /><div><button className="btn small" onClick={() => setCsvText('')}>Hide CSV</button></div></>}
        </div>
      </div>
    </section>
  );
}
