// App shell: Global/APAC switch, update status bar, install prompt, owner refresh.
import React, { useEffect, useState, useCallback } from 'react';
import App, { CUTOFF_LABEL } from './App.jsx';
import { DATA, LATEST, qLabel } from './lib/engine.js';

/* global __DEFAULT_EDITION__, __BUILD_ID__, __BUILD_TIME__, __TARGET__, __TRIGGER_ID__, __CLAUDE_URL__ */
const BUILD_ID = __BUILD_ID__;
const BUILD_TIME = __BUILD_TIME__;
const TARGET = __TARGET__;            // 'pages' (GitHub Pages app) or 'artifact' (Claude page)
const TRIGGER_ID = __TRIGGER_ID__;    // owner's on-demand Claude update job (runs only when fired)
const CLAUDE_URL = __CLAUDE_URL__;    // Claude-hosted copy, where the owner's Update now button lives
const ED_KEY = 'gmm-edition';
const TITLES = { global: 'Alphabet vs Meta Monitor', apac: 'Alphabet vs Meta APAC Monitor' };

function initialEdition() {
  try {
    const q = new URLSearchParams(location.search).get('edition');
    if (q === 'apac' || q === 'global') return q;
    const s = localStorage.getItem(ED_KEY);
    if (s === 'apac' || s === 'global') return s;
  } catch (e) { /* storage or URL unavailable */ }
  return __DEFAULT_EDITION__;
}

const ago = (iso) => {
  if (!iso) return '';
  const d = new Date(iso); if (Number.isNaN(+d)) return '';
  const m = Math.round((Date.now() - d) / 60000);
  if (m < 2) return 'just now'; if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 36) return `${h} h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const fmtStamp = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); };

export function EditionSwitch({ edition, onChange }) {
  const opts = [{ v: 'global', label: 'Global' }, { v: 'apac', label: 'APAC' }];
  return (
    <div className="edswitch" role="radiogroup" aria-label="Edition">
      {opts.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={edition === o.v} onClick={() => onChange(o.v)}
          onKeyDown={(e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); onChange(edition === 'global' ? 'apac' : 'global'); } }}
          tabIndex={edition === o.v ? 0 : -1}>{o.label}</button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ "Update now" on the GitHub Pages app
// Pulls the latest published build (data refreshed by the owner's Claude update job).
function usePagesUpdate() {
  const [st, setSt] = useState({ phase: 'idle', msg: '' });
  const check = useCallback(async (manual) => {
    if (TARGET !== 'pages') return;
    setSt({ phase: 'checking', msg: manual ? 'Checking for a newer version...' : '' });
    try {
      const r = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
      const v = r.ok ? await r.json() : null;
      if (!v) throw new Error('offline');
      if (v.build && v.build !== BUILD_ID) {
        if (manual) { setSt({ phase: 'update', msg: 'Newer data found. Reloading...' }); applyUpdate(); }
        else setSt({ phase: 'update', msg: `Newer data available (updated ${fmtStamp(v.time)}).` });
      } else setSt({ phase: 'ok', msg: manual ? 'You already have the latest version.' : '' });
    } catch (e) {
      setSt({ phase: 'offline', msg: manual ? 'Offline: showing the saved copy.' : '' });
    }
  }, []);
  useEffect(() => {
    check(false);
    const onVis = () => { if (document.visibilityState === 'visible') check(false); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [check]);
  return [st, check];
}

async function applyUpdate() {
  try {
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (reg) { await reg.update(); if (reg.waiting) reg.waiting.postMessage('skipWaiting'); }
  } catch (e) { /* no service worker */ }
  setTimeout(() => location.reload(), 300);
}

// Owner mode on the Pages app: opening the app once with ?owner=1 shows a shortcut to the
// Claude page, where the real data refresh runs (it needs the owner's Claude sign-in).
function useOwnerFlag() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    try {
      const q = new URLSearchParams(location.search).get('owner');
      if (q === '1') localStorage.setItem('gmm-owner', '1');
      if (q === '0') localStorage.removeItem('gmm-owner');
      setOn(localStorage.getItem('gmm-owner') === '1');
    } catch (e) { /* ignore */ }
  }, []);
  return on;
}

// ------------------------------------------------------------------ free SEC check results (GitHub Pages app)
function useSecLatest() {
  const [sec, setSec] = useState(null);
  useEffect(() => {
    if (TARGET !== 'pages') return;
    fetch(`./sec_latest.json?t=${Date.now()}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then(setSec).catch(() => setSec(null));
  }, []);
  return sec;
}
const fmtM = (v) => (v == null ? 'n/a' : Math.abs(v) >= 1000 ? `${v < 0 ? '-' : ''}$${(Math.abs(v) / 1000).toFixed(1)}B` : `${v < 0 ? '-' : ''}$${Math.abs(v)}M`);
const fmtG = (v) => (v == null ? '' : ` (${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}% YoY)`);
const fmtD = (iso) => (iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '');
const ql = (q) => `${q.slice(4)} ${q.slice(0, 4)}`;

export function FreshResults({ sec }) {
  if (!sec || !sec.companies) return null;
  const blocks = [];
  ['GOOGL', 'META'].forEach((co) => {
    const c = sec.companies[co]; if (!c) return;
    (c.new_quarters || []).filter((x) => x.quarter > LATEST).forEach((x) => {
      const f = x.figures, y = x.yoy || {};
      blocks.push(
        <li key={co + x.quarter} className={`fr-item co-${co}`}>
          <div className="fr-h"><b>{c.name} {ql(x.quarter)}</b> <span className="tag">SEC {x.filing ? `${x.filing.form} filed ${fmtD(x.filing.filed)}` : 'filing'}</span></div>
          <dl className="fr-grid">
            <div><dt>Revenue</dt><dd>{fmtM(f.revenue)}<span>{fmtG(y.revenue)}</span></dd></div>
            <div><dt>Operating income</dt><dd>{fmtM(f.op_income)}<span>{f.op_margin != null ? ` (${(f.op_margin * 100).toFixed(1)}% margin)` : ''}</span></dd></div>
            <div><dt>Net income</dt><dd>{fmtM(f.net_income)}<span>{fmtG(y.net_income)}</span></dd></div>
            <div><dt>Diluted EPS</dt><dd>{f.eps_diluted != null ? `$${f.eps_diluted.toFixed(2)}` : 'n/a'}<span>{fmtG(y.eps_diluted)}</span></dd></div>
            <div><dt>Operating cash flow</dt><dd>{fmtM(f.ocf)}</dd></div>
            <div><dt>Purchases of P&E</dt><dd>{fmtM(f.capex_ppe)}</dd></div>
            <div><dt>FCF (OCF - P&E)</dt><dd>{fmtM(f.fcf_lfl)}</dd></div>
          </dl>
          {x.filing_url && <a href={x.filing_url} target="_blank" rel="noopener">Source: SEC filing</a>}
        </li>,
      );
    });
    const shown = new Set((c.new_quarters || []).map((x) => x.quarter));
    const rel = (c.new_filings || []).filter((f) => f.form === '8-K');
    if (rel.length && !(c.new_quarters || []).some((x) => x.quarter > LATEST)) {
      const r = rel[rel.length - 1];
      blocks.push(<li key={co + r.accn} className={`fr-item co-${co}`}><div className="fr-h"><b>{c.name} released new results on {fmtD(r.filed)}</b> <span className="tag">8-K</span></div><p>Headline figures appear here once the quarterly report (10-Q / 10-K) is filed with the SEC, usually within a few days. <a href={r.url} target="_blank" rel="noopener">Earnings release filing</a></p></li>);
    }
    void shown;
  });
  if (!blocks.length) return null;
  return (
    <section className="fresh" aria-label="Fresh results">
      <div className="fr-top"><b>Fresh results</b> <span>reported after the dashboard's last full update. Headline figures come straight from SEC XBRL data (USD); segment, APAC and ads detail is added in the next full update.</span></div>
      <ul>{blocks}</ul>
    </section>
  );
}

// ------------------------------------------------------------------ install prompt
function useInstall() {
  const [evt, setEvt] = useState(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    if (TARGET !== 'pages') return undefined;
    try { if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) setInstalled(true); } catch (e) { /* ignore */ }
    const onPrompt = (e) => { e.preventDefault(); setEvt(e); };
    const onDone = () => { setInstalled(true); setEvt(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onDone);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onDone); };
  }, []);
  const ios = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
  return { canPrompt: !!evt, installed, ios, prompt: async () => { if (!evt) return; evt.prompt(); try { await evt.userChoice; } catch (e) { /* ignore */ } setEvt(null); } };
}

// ------------------------------------------------------------------ owner "Update now" (Claude page only)
// Fires the owner's on-demand Claude job, which re-reads new filings, re-runs the checks,
// and republishes both this page and the GitHub app.
const RUN_LIMIT_MS = 75 * 60 * 1000;
function useOwnerRefresh() {
  const [s, setS] = useState({ owner: false, mcp: null, last: null, busy: false, startedAt: null, msg: '' });
  useEffect(() => {
    if (TARGET !== 'artifact' || !TRIGGER_ID || !window.claude || typeof window.claude.use !== 'function') return undefined;
    let alive = true;
    (async () => {
      const user = await window.claude.use('user').catch(() => null);
      if (!(user && user.isOwner && user.isOwner())) return;
      const mcp = await window.claude.use('mcp').catch(() => null);
      if (alive && mcp) setS((p) => ({ ...p, owner: true, mcp }));
    })();
    return () => { alive = false; };
  }, []);
  const loadLast = useCallback(async (mcp) => {
    try {
      const r = await mcp.callTool('Claude Code Remote', 'list_triggers', { limit: 100, include_completed: true }, { cache: false });
      const p = r && r.payload; const list = (p && (p.triggers || p.items || p.data)) || (Array.isArray(p) ? p : []);
      const t = list.find((x) => x && (x.id === TRIGGER_ID || x.trigger_id === TRIGGER_ID));
      const last = t ? (t.last_run || null) : null;
      setS((x) => ({ ...x, last }));
      return last;
    } catch (e) { return null; }
  }, []);
  // poll the job while it runs
  useEffect(() => {
    if (!s.busy || !s.mcp) return undefined;
    const id = setInterval(async () => {
      const last = await loadLast(s.mcp);
      const st = last && String(last.status || '').toUpperCase();
      const fresh = last && last.fired_at && new Date(last.fired_at) >= new Date(s.startedAt - 120000);
      if (fresh && last.finished_at && st && st !== 'RUNNING') {
        setS((p) => ({ ...p, busy: false, msg: st === 'SUCCEEDED' ? 'Update job finished. This page reloads by itself when a new version is published.' : `Update job ended: ${st.toLowerCase()}.` }));
      } else if (Date.now() - s.startedAt > RUN_LIMIT_MS) setS((p) => ({ ...p, busy: false, msg: 'The update job is taking longer than usual. Check back later.' }));
    }, 60000);
    return () => clearInterval(id);
  }, [s.busy, s.mcp, s.startedAt, loadLast]);
  useEffect(() => { if (s.mcp) loadLast(s.mcp); }, [s.mcp, loadLast]);
  const run = useCallback(async () => {
    if (!s.mcp || s.busy) return;
    setS((p) => ({ ...p, busy: true, startedAt: Date.now(), msg: 'Starting the update job...' }));
    try {
      await s.mcp.callTool('Claude Code Remote', 'fire_trigger', { trigger_id: TRIGGER_ID, text: `Update requested from the dashboard button at ${new Date().toISOString()}.` }, { cache: false });
      setS((p) => ({ ...p, msg: 'Update running: checking SEC filings and company releases. Usually 10-40 minutes; you can close this page.' }));
    } catch (e) {
      const code = e && e.code;
      const msg = code === 'not_granted' || code === 'denied' ? 'Connector access was not allowed. Allow Claude Code Remote in this page\'s Permissions menu, then try again.'
        : code === 'not_in_manifest' || code === 'blocked_by_policy' ? 'Update is not available for this account.'
        : `Could not start the update (${code || 'error'}).`;
      setS((p) => ({ ...p, busy: false, msg }));
    }
  }, [s.mcp, s.busy]);
  return { ...s, run };
}

export function StatusBar() {
  const [st, check] = usePagesUpdate();
  const inst = useInstall();
  const own = useOwnerRefresh();
  const ownerFlag = useOwnerFlag();
  const sec = useSecLatest();
  const tone = st.phase === 'update' || own.busy ? 'new' : st.phase === 'offline' ? 'warn' : 'ok';
  const lastRun = own.last && own.last.fired_at ? `${String(own.last.status || '').toLowerCase() || 'unknown'}, ${fmtStamp(own.last.finished_at || own.last.fired_at)}` : null;
  const msg = own.msg || st.msg;
  return (
    <div className={`statusbar tone-${tone}`} role="status" aria-live="polite">
      <span className="dot" aria-hidden="true" />
      <span className="msg"><b>Last updated {fmtStamp(BUILD_TIME)}</b> <span className="ago">({ago(BUILD_TIME)})</span> · Data through {qLabel(LATEST)} · cutoff {CUTOFF_LABEL}{sec && sec.checked_at ? <> · SEC filings checked {ago(sec.checked_at)}</> : null}</span>
      <span className="acts">
        {TARGET === 'pages' && <button type="button" className="btn small primary" disabled={st.phase === 'checking'} onClick={() => (st.phase === 'update' ? applyUpdate() : check(true))}>{st.phase === 'checking' ? 'Checking...' : 'Update now'}</button>}
        {TARGET === 'pages' && ownerFlag && CLAUDE_URL && <a className="btn small" href={CLAUDE_URL} target="_blank" rel="noopener">Refresh data from filings</a>}
        {TARGET === 'pages' && !inst.installed && inst.canPrompt && <button type="button" className="btn small" onClick={inst.prompt}>Install app</button>}
        {TARGET === 'pages' && !inst.installed && !inst.canPrompt && inst.ios && <span className="hint">Install: tap Share, then "Add to Home Screen"</span>}
        {own.owner && <button type="button" className="btn small primary" disabled={own.busy} onClick={own.run} title="Only you (the owner) see this button">{own.busy ? 'Updating...' : 'Update now'}</button>}
      </span>
      {(msg || lastRun) && <span className="sub">{msg}{msg && lastRun ? ' ' : ''}{lastRun && !own.busy ? `Last update job: ${lastRun}.` : ''}</span>}
      <FreshResults sec={sec} />
    </div>
  );
}

export default function Shell() {
  const [edition, setEdition] = useState(initialEdition);
  useEffect(() => {
    document.title = TITLES[edition];
    try { localStorage.setItem(ED_KEY, edition); } catch (e) { /* ignore */ }
    try { const u = new URL(location.href); u.searchParams.set('edition', edition); history.replaceState(null, '', u); } catch (e) { /* sandboxed */ }
  }, [edition]);
  const change = (v) => { if (v === edition) return; setEdition(v); window.scrollTo({ top: 0 }); };
  return <App key={edition} edition={edition} switcher={<EditionSwitch edition={edition} onChange={change} />} statusBar={<StatusBar />} />;
}
