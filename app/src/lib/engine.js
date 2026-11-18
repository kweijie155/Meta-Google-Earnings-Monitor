// Metric engine: one place that turns reported quarterly values into every
// view the dashboard shows (quarterly / YTD / TTM, value / YoY / QoQ,
// absolute / margin, reported / like-for-like basis).
import DATA from '../data.json';

export { DATA };
export const Q_ALL = DATA.quarters;            // 2024Q1 .. 2026Q3 (2024 = comparison base only)
export const Q_DISPLAY = DATA.display;         // 2025Q1 .. latest reported
export const LATEST = Q_DISPLAY[Q_DISPLAY.length - 1];
export const SRC = Object.fromEntries(DATA.sources.map((s) => [s.id, s]));
export const COS = ['GOOGL', 'META'];
export const CO = {
  GOOGL: { name: 'Alphabet', ticker: 'GOOGL', colorKey: 'goog' },
  META: { name: 'Meta', ticker: 'META', colorKey: 'meta' },
};

const MONTH = { Q1: ['Jan 1', 'Mar 31'], Q2: ['Apr 1', 'Jun 30'], Q3: ['Jul 1', 'Sep 30'], Q4: ['Oct 1', 'Dec 31'] };
const ISO = { Q1: ['01-01', '03-31'], Q2: ['04-01', '06-30'], Q3: ['07-01', '09-30'], Q4: ['10-01', '12-31'] };
export const qLabel = (q) => `${q.slice(4)} ${q.slice(0, 4)}`;
export const qShort = (q) => `${q.slice(4)} '${q.slice(2, 4)}`;
export const qIdx = (q) => Q_ALL.indexOf(q);
export const qYear = (q) => q.slice(0, 4);
export const qNum = (q) => Number(q.slice(5));

/** Human period label for a quarter under the chosen period view. */
export function periodText(q, period) {
  const y = qYear(q), n = qNum(q);
  if (period === 'YTD') return n === 1 ? `Q1 ${y} (Jan 1 - Mar 31, ${y})` : `YTD Q1-Q${n} ${y} (Jan 1 - ${MONTH['Q' + n][1]}, ${y})`;
  if (period === 'TTM') {
    const i = qIdx(q); const first = Q_ALL[i - 3];
    if (!first) return `TTM to ${qLabel(q)}`;
    return `TTM ${qLabel(first)} - ${qLabel(q)}`;
  }
  const [a, b] = MONTH[q.slice(4)];
  return `${qLabel(q)} (${a} - ${b}, ${y})`;
}
export function periodBounds(q, period) {
  const y = qYear(q), n = qNum(q);
  const end = `${y}-${ISO['Q' + n][1]}`;
  if (period === 'YTD') return [`${y}-01-01`, end];
  if (period === 'TTM') { const f = Q_ALL[qIdx(q) - 3]; return [f ? `${qYear(f)}-${ISO[f.slice(4)][0]}` : '', end]; }
  return [`${y}-${ISO['Q' + n][0]}`, end];
}

const raw = (co, q, k) => { const r = DATA.rows[co][q]; return r == null ? null : (r[k] ?? null); };

// ------------------------------------------------------------------ catalog
// unit: usd ($M), eps ($/share), pct (ratio 0-1), rate (already a % YoY, e.g. 8 = +8%),
//       count, usdb ($B), bn (billions of people), usdk ($K), arpp ($)
// agg: flow (sums across periods), stock (period-end), ratio (num/den of aggregated flows),
//      perEmp (aggregated flow / period-end headcount), qonly (quarterly only)
export const M = {};
const BOTH = ['GOOGL', 'META'];
const A = ['GOOGL'], ME = ['META'];
function def(id, o) { M[id] = { id, cos: BOTH, agg: 'flow', unit: 'usd', srcKind: 'er', ...o }; }

def('revenue', { label: 'Revenue', key: 'revenue', group: 'Income statement', def: 'Total revenues (GAAP), as reported.', formula: 'Reported' });
def('op_income', { label: 'Operating income', key: 'op_income', margin: 'op_margin', group: 'Income statement', def: 'Income from operations (GAAP).', formula: 'Reported', warn: 'Includes company-disclosed one-off charges (fines, legal settlements, severance). See one-off log.' });
def('op_margin', { label: 'Operating margin', unit: 'pct', agg: 'ratio', num: 'op_income', den: 'revenue', group: 'Income statement', def: 'Operating income as a share of revenue.', formula: 'Operating income / Revenue' });
def('net_income', { label: 'Net income', key: 'net_income', margin: 'net_margin', group: 'Income statement', def: 'GAAP net income.', formula: 'Reported', warn: 'Not like-for-like: Alphabet includes large unrealized gains and losses on equity stakes; Meta includes one-time tax items (Q3 2025 charge, Q1 2026 benefit).' });
def('net_margin', { label: 'Net margin', unit: 'pct', agg: 'ratio', num: 'net_income', den: 'revenue', group: 'Income statement', def: 'Net income as a share of revenue.', formula: 'Net income / Revenue', warn: 'Distorted by non-operating items; see Net income.' });
def('eps_diluted', { label: 'Diluted EPS', unit: 'eps', key: 'eps_diluted', group: 'Income statement', def: 'GAAP diluted net income per share. YTD and TTM views sum the quarterly figures.', formula: 'Reported; YTD/TTM = sum of quarterly diluted EPS', warn: 'Alphabet EPS uses net income available to common holders from Q2 2026 (after preferred dividends).' });
def('eps_ex', {
  label: 'Diluted EPS ex. disclosed one-offs', unit: 'eps', group: 'Income statement', srcKind: 'er+oneoff',
  def: 'GAAP diluted EPS minus the per-share effects the companies themselves quantified (Alphabet: equity-securities gains/losses; Meta: Q3 2025 tax charge, Q1 2026 tax benefit, Q3 2026 legal charge). Items without a disclosed EPS effect stay in.',
  formula: 'Alphabet: EPS - disclosed equity-securities EPS effect. Meta: company-stated EPS excluding the item',
  warn: 'Analytical view built only from company-quantified effects. Alphabet\'s EC fine (Q3 2025), Waymo charge (Q4 2025) and Meta\'s Q2 2026 legal/severance charges are not removed.',
  calc: (co, q) => {
    if (qIdx(q) < 4) return null;
    const eps = raw(co, q, 'eps_diluted');
    const o = DATA.one_offs.find((x) => x.co === co && x.q === q);
    if (co === 'GOOGL') return o && o.eps != null ? round2(eps - o.eps) : eps;
    return o && o.eps_ex != null ? o.eps_ex : eps;
  },
});
def('ocf', { label: 'Operating cash flow', key: 'ocf', group: 'Cash flow', def: 'Net cash provided by operating activities.', formula: 'Reported' });
def('capex', {
  label: 'Capital expenditures', group: 'Cash flow', margin: 'capex_intensity', basisDependent: true,
  key: (co, basis) => (basis === 'lfl' ? 'capex_ppe' : 'capex_reported'),
  def: 'Reported basis: Alphabet = purchases of property & equipment; Meta = purchases of property & equipment + principal payments on finance leases (Meta\'s own definition). Like-for-like basis: purchases of property & equipment for both.',
  formula: 'Reported (company definition) or purchases of P&E',
  warn: 'Company definitions differ: Meta\'s reported capex includes finance-lease principal ($0.3-1.0B a quarter). Switch to Like-for-like to compare on purchases of P&E only.',
});
def('capex_intensity', { label: 'Capex intensity', unit: 'pct', agg: 'ratio', num: 'capex', den: 'revenue', basisDependent: true, group: 'Cash flow', def: 'Capital expenditures as a share of revenue.', formula: 'Capex / Revenue' });
def('fcf', {
  label: 'Free cash flow', group: 'Cash flow', margin: 'fcf_margin', basisDependent: true,
  key: (co, basis) => (basis === 'lfl' ? 'fcf_lfl' : 'fcf_reported'),
  def: 'Reported basis: Alphabet FCF = OCF - purchases of P&E; Meta FCF = OCF - purchases of P&E - principal payments on finance leases (each company\'s non-GAAP definition). Like-for-like: OCF - purchases of P&E for both.',
  formula: 'OCF - Capex (basis as selected)',
  warn: 'Company FCF definitions differ (Meta also deducts finance-lease principal). Use Like-for-like for a strict comparison.',
});
def('fcf_margin', { label: 'FCF margin', unit: 'pct', agg: 'ratio', num: 'fcf', den: 'revenue', basisDependent: true, group: 'Cash flow', def: 'Free cash flow as a share of revenue.', formula: 'Free cash flow / Revenue' });
def('cash_ms', { label: 'Cash & marketable securities', key: 'cash_ms', agg: 'stock', group: 'Balance sheet & capital', def: 'Cash, cash equivalents and marketable securities at period end.', formula: 'Reported (period end)', warn: 'Alphabet\'s marketable securities include marketable equity stakes ($90.4B at Q3 2026 per call coverage). Meta figures are reported to $0.01B. Gross of debt: both companies issued large amounts of debt in 2025-2026.' });
def('headcount', { label: 'Headcount', unit: 'count', key: 'headcount', agg: 'stock', group: 'Balance sheet & capital', def: 'Full-time employees at period end (Alphabet: "number of employees"; Meta: "headcount").', formula: 'Reported (period end)' });
def('buybacks', { label: 'Share repurchases', key: 'buybacks', group: 'Balance sheet & capital', def: 'Cash paid for repurchases of common stock, from the cash flow statement.', formula: 'Reported (cash flow statement)', warn: 'Meta\'s press-release highlight uses trade-date value (e.g. $13.40B in Q1 2025) and can differ from cash paid ($12.75B). Cash-flow basis used for both.' });
def('dividends', { label: 'Dividends paid', key: 'dividends', group: 'Balance sheet & capital', def: 'Dividend (and dividend-equivalent) payments from the cash flow statement. Alphabet includes preferred dividends from Q3 2026.', formula: 'Reported' });
def('shareholder_returns', { label: 'Total capital returned', key: 'shareholder_returns', group: 'Balance sheet & capital', def: 'Share repurchases plus dividends paid (cash flow basis).', formula: 'Repurchases + Dividends' });
def('rev_per_employee', { label: 'Revenue per employee', unit: 'usdk', agg: 'perEmp', num: 'revenue', group: 'Productivity', def: 'Revenue for the period divided by period-end headcount. Quarterly view = one quarter of revenue; TTM view = annual run-rate.', formula: 'Revenue / Period-end headcount' });
def('oi_per_employee', { label: 'Operating income per employee', unit: 'usdk', agg: 'perEmp', num: 'op_income', group: 'Productivity', def: 'Operating income for the period divided by period-end headcount.', formula: 'Operating income / Period-end headcount' });
def('ad_revenue', { label: 'Advertising revenue', key: 'ad_revenue', group: 'Advertising', segment: 'ads', def: 'Alphabet: Google advertising (Search & other + YouTube ads + Google Network). Meta: Family of Apps advertising.', formula: 'Reported', warn: 'Alphabet\'s Google Network ads run on partner properties and carry high TAC; Meta ad revenue is on owned apps.' });
// Alphabet drivers
def('search', { label: 'Google Search & other', key: 'search', cos: A, group: 'Alphabet drivers', segment: 'search', def: 'Revenue from Google Search and other owned properties (Gmail, Maps, Play).', formula: 'Reported' });
def('youtube', { label: 'YouTube ads', key: 'youtube', cos: A, group: 'Alphabet drivers', segment: 'youtube', def: 'YouTube advertising revenue (excludes YouTube subscriptions).', formula: 'Reported' });
def('network', { label: 'Google Network', key: 'network', cos: A, group: 'Alphabet drivers', segment: 'network', def: 'Ads on partner properties (AdMob, AdSense, Google Ad Manager).', formula: 'Reported' });
def('subs', { label: 'Subscriptions, platforms & devices', key: 'subs', cos: A, group: 'Alphabet drivers', segment: 'subs', def: 'YouTube and Google One subscriptions, Play, devices.', formula: 'Reported' });
def('cloud_rev', { label: 'Google Cloud revenue', key: 'cloud_rev', cos: A, group: 'Alphabet drivers', segment: 'cloud', margin: 'cloud_margin', def: 'Google Cloud Platform, Workspace and other enterprise services, including TPU system sales.', formula: 'Reported' });
def('cloud_oi', { label: 'Google Cloud operating income', key: 'cloud_oi', cos: A, group: 'Alphabet drivers', segment: 'cloud', margin: 'cloud_margin', def: 'Google Cloud segment operating income.', formula: 'Reported (segment)' });
def('cloud_margin', { label: 'Google Cloud operating margin', unit: 'pct', agg: 'ratio', num: 'cloud_oi', den: 'cloud_rev', cos: A, group: 'Alphabet drivers', segment: 'cloud', def: 'Cloud operating income / Cloud revenue.', formula: 'Cloud OI / Cloud revenue' });
def('other_bets_rev', { label: 'Other Bets revenue', key: 'other_bets_rev', cos: A, group: 'Alphabet drivers', segment: 'otherbets', def: 'Waymo, Verily and other early-stage businesses.', formula: 'Reported' });
def('other_bets_oi', { label: 'Other Bets operating loss', key: 'other_bets_oi', cos: A, group: 'Alphabet drivers', segment: 'otherbets', def: 'Other Bets segment operating income (loss).', formula: 'Reported (segment)' });
def('tac', { label: 'Traffic acquisition costs', key: 'tac', cos: A, group: 'Alphabet drivers', margin: 'tac_rate', def: 'Payments to distribution and Network partners (TAC).', formula: 'Reported' });
def('tac_rate', { label: 'TAC rate', unit: 'pct', agg: 'ratio', num: 'tac', den: 'ad_revenue', cos: A, group: 'Alphabet drivers', def: 'TAC as a share of Google advertising revenue (matches the 10-Q stated rate to 0.1pt in every quarter checked).', formula: 'TAC / Google advertising revenue' });
def('rpo', { label: 'Revenue backlog (RPO)', unit: 'usdb', agg: 'stock', key: 'rpo', cos: A, group: 'Alphabet drivers', segment: 'cloud', srcKind: 'rpo', def: 'Remaining performance obligations, primarily Google Cloud, from the 10-Q/10-K revenue note.', formula: 'Reported (period end)' });
def('paid_clicks_yoy', { label: 'Paid clicks, YoY', unit: 'rate', agg: 'qonly', key: 'paid_clicks_yoy', cos: A, group: 'Alphabet drivers', segment: 'search', srcKind: 'clicks', isRate: true, def: 'Year-over-year change in paid clicks on Google Search & other properties (10-Q MD&A).', formula: 'Reported % change' });
def('cpc_yoy', { label: 'Cost per click, YoY', unit: 'rate', agg: 'qonly', key: 'cpc_yoy', cos: A, group: 'Alphabet drivers', segment: 'search', srcKind: 'clicks', isRate: true, def: 'Year-over-year change in average cost per click on Google Search & other properties (10-Q MD&A).', formula: 'Reported % change' });
// Meta drivers
def('foa_rev', { label: 'Family of Apps revenue', key: 'foa_rev', cos: ME, group: 'Meta drivers', margin: 'foa_margin', def: 'Facebook, Instagram, Messenger, WhatsApp and other services.', formula: 'Reported (segment)' });
def('foa_oi', { label: 'Family of Apps operating income', key: 'foa_oi', cos: ME, group: 'Meta drivers', margin: 'foa_margin', def: 'Family of Apps segment income from operations (includes Q3 2026 $9.89B legal charge).', formula: 'Reported (segment)' });
def('foa_margin', { label: 'Family of Apps operating margin', unit: 'pct', agg: 'ratio', num: 'foa_oi', den: 'foa_rev', cos: ME, group: 'Meta drivers', def: 'FoA operating income / FoA revenue.', formula: 'FoA OI / FoA revenue' });
def('other_rev', { label: 'Other revenue (FoA)', key: 'other_rev', cos: ME, group: 'Meta drivers', segment: 'metaother', def: 'Mainly WhatsApp paid messaging and Meta Verified / subscriptions.', formula: 'Reported' });
def('rl_rev', { label: 'Reality Labs revenue', key: 'rl_rev', cos: ME, group: 'Meta drivers', segment: 'rl', def: 'Quest headsets, AI glasses and related content.', formula: 'Reported (segment)' });
def('rl_oi', { label: 'Reality Labs operating loss', key: 'rl_oi', cos: ME, group: 'Meta drivers', segment: 'rl', def: 'Reality Labs segment loss from operations.', formula: 'Reported (segment)' });
def('dap', { label: 'Daily active people (DAP)', unit: 'bn', agg: 'stock', key: 'dap', cos: ME, group: 'Meta drivers', srcKind: 'pres', def: 'Family daily active people, average for the last month of the quarter (billions).', formula: 'Reported; YoY growth uses the company-reported rate' });
def('arpp', { label: 'Average revenue per person (ARPP)', unit: 'arpp', agg: 'qonly', key: 'arpp', cos: ME, group: 'Meta drivers', srcKind: 'pres', def: 'Family of Apps revenue / average of DAP at the start and end of the quarter (Meta definition). Reproduced from FoA revenue and DAP to within $0.01 for every quarter.', formula: 'FoA revenue / avg(DAP start, DAP end)' });
def('impressions_yoy', { label: 'Ad impressions, YoY', unit: 'rate', agg: 'qonly', key: 'impressions_yoy', cos: ME, group: 'Meta drivers', isRate: true, def: 'Year-over-year change in ad impressions delivered across the Family of Apps.', formula: 'Reported % change' });
def('price_per_ad_yoy', { label: 'Average price per ad, YoY', unit: 'rate', agg: 'qonly', key: 'price_per_ad_yoy', cos: ME, group: 'Meta drivers', isRate: true, def: 'Year-over-year change in average price per ad.', formula: 'Reported % change' });

function round2(x) { return Math.round(x * 100) / 100; }

// ------------------------------------------------------------------ values
function quarterly(co, id, q, basis) {
  const m = M[id];
  if (!m.cos.includes(co)) return null;
  if (m.calc) return m.calc(co, q, basis);
  const k = typeof m.key === 'function' ? m.key(co, basis) : m.key;
  return raw(co, q, k);
}
function windowQs(q, period) {
  const i = qIdx(q);
  if (period === 'Q') return [q];
  if (period === 'YTD') return Q_ALL.slice(i - (qNum(q) - 1), i + 1);
  if (period === 'TTM') return i >= 3 ? Q_ALL.slice(i - 3, i + 1) : null;
  return [q];
}

/** Value of a metric for a company/quarter under {period, basis}. Returns number or null. */
export function value(co, id, q, ctx) {
  const m = M[id];
  if (!m || !m.cos.includes(co) || qIdx(q) < 0) return null;
  const { period = 'Q', basis = 'reported' } = ctx || {};
  switch (m.agg) {
    case 'stock': return quarterly(co, id, q, basis);
    case 'qonly': return period === 'Q' ? quarterly(co, id, q, basis) : null;
    case 'ratio': {
      const n = value(co, m.num, q, ctx), d = value(co, m.den, q, ctx);
      return n == null || d == null || d === 0 ? null : n / d;
    }
    case 'perEmp': {
      const n = value(co, m.num, q, ctx), h = raw(co, q, 'headcount');
      return n == null || !h ? null : (n * 1000) / h; // $M -> $K per employee
    }
    default: {
      const qs = windowQs(q, period);
      if (!qs) return null;
      let s = 0;
      for (const x of qs) { const v = quarterly(co, id, x, basis); if (v == null) return null; s += v; }
      return m.unit === 'eps' ? round2(s) : s;
    }
  }
}

/**
 * Value after the value-mode transform. Returns {v, unit, note}.
 * value: as is; yoy / qoq: growth vs same window one year / one quarter earlier.
 * Ratios move in percentage points; already-YoY reported rates pass through.
 */
export function shown(co, id, q, ctx, mode) {
  const m = M[id];
  const v = value(co, id, q, ctx);
  if (mode === 'value' || !mode) {
    const geoNote = (id.startsWith('geo_') && (ctx?.period || 'Q') === 'Q') ? DATA.a_geo_note?.[q] : null;
    return { v, unit: m.unit, note: v == null ? unavailableNote(co, id, q, ctx) : (geoNote || null) };
  }
  const period = ctx?.period || 'Q';
  if (m.isRate) {
    if (mode === 'yoy') return { v, unit: 'rate', note: v == null ? unavailableNote(co, id, q, ctx) : 'Already a year-over-year measure' };
    return { v: null, unit: 'rate', note: 'Reported only as year-over-year change' };
  }
  if (mode === 'qoq' && period === 'YTD') return { v: null, unit: 'growth', note: 'QoQ growth is not meaningful for year-to-date windows' };
  const i = qIdx(q); const pq = Q_ALL[i - (mode === 'yoy' ? 4 : 1)];
  // company-reported growth overrides (Meta DAP and early headcount)
  const rep = co === 'META' && mode === 'yoy' && period === 'Q' ? DATA.m_reported_yoy[id]?.[q] : undefined;
  if (rep != null && (id === 'dap' || value(co, id, pq || q, ctx) == null)) return { v: rep / 100, unit: 'growth', note: 'Company-reported growth rate (rounded)' };
  if (!pq) return { v: null, unit: m.unit === 'pct' ? 'pp' : 'growth', note: 'Prior period outside the collected data' };
  const p = value(co, id, pq, ctx);
  if (m.unit === 'pct') return { v: v == null || p == null ? null : (v - p) * 100, unit: 'pp', note: v == null || p == null ? 'Prior period unavailable' : null };
  if (v == null || p == null) return { v: null, unit: 'growth', note: p == null ? 'Prior period not collected (pre-2024 or not disclosed)' : unavailableNote(co, id, q, ctx) };
  if (p <= 0 || v < 0) return { v: null, unit: 'growth', note: 'n/m: negative or zero base' };
  return { v: v / p - 1, unit: 'growth', note: null };
}

function unavailableNote(co, id, q, ctx) {
  const m = M[id];
  if (!m.cos.includes(co)) return `${CO[co].name} does not report this metric`;
  if (m.agg === 'qonly' && ctx?.period !== 'Q') return 'Reported for single quarters only';
  if (id === 'paid_clicks_yoy' || id === 'cpc_yoy') return DATA.a_clicks_note[q] || 'Not disclosed';
  if (id === 'network_imp_yoy' || id === 'network_cpi_yoy') return q.endsWith('Q4') ? 'Not disclosed for Q4 alone' : 'Q2 2026 10-Q MD&A not retrievable; left blank';
  if (id === 'apac_cc_yoy') return 'Constant-currency APAC growth not in the retrievable filing text';
  if (ctx?.period === 'TTM' && qIdx(q) < 3) return 'TTM needs four quarters of data';
  return 'Not disclosed for this period';
}

/** Source ids behind a shown value. */
export function sourcesFor(co, id, q, ctx) {
  const m = M[id]; if (!m || !m.cos.includes(co)) return [];
  const ids = new Set();
  const add = (qq, kind) => {
    const k = kind || m.srcKind;
    if (k === 'rpo') { const s = DATA.a_rpo_src[qq]; if (s) ids.add(s); return; }
    if (k === 'clicks') { const s = DATA.a_clicks_src[qq]; if (s) ids.add(s); return; }
    if (k === 'pres') { ids.add('M-PRES-26Q3'); return; }
    if (k === 'mgeo') { ids.add(qIdx(qq) >= qIdx('2024Q3') ? 'M-PRES-26Q3' : 'M-PRES-25Q3'); return; }
    if (k === 'mimp') { const s = DATA.m_imp_src[qq]; if (s) { ids.add(s); ids.add('S-ADSUP'); } return; }
    if (k === 'ageo') { const s = DATA.a_geo_src[qq]; if (s) { ids.add(s); if (s === 'A-FY-GEO') ids.add('A-10Q-25Q3'); } return; }
    if (k === 'network') { const s = DATA.a_network_src[qq]; if (s) ids.add(s); return; }
    if (k === 'apaccc') { const s = DATA.a_apac_cc[qq]; if (s) ids.add(s.src); return; }
    ids.add((co === 'GOOGL' ? DATA.a_src : DATA.m_src)[qq]);
    if (k === 'er+oneoff') { const o = DATA.one_offs.find((x) => x.co === co && x.q === qq); if (o) ids.add(o.src); }
  };
  const expand = (mid) => {
    const mm = M[mid];
    if (mm.agg === 'ratio') { expand(mm.num); expand(mm.den); return; }
    if (mm.agg === 'perEmp') { expand(mm.num); add(q, 'er'); return; }
    const qs = mm.agg === 'stock' || mm.agg === 'qonly' ? [q] : (windowQs(q, ctx?.period || 'Q') || [q]);
    qs.forEach((x) => add(x, mm.srcKind));
  };
  expand(id);
  return [...ids].filter(Boolean);
}

export function metricsFor(cos) {
  return Object.values(M).filter((m) => m.cos.some((c) => cos.includes(c)));
}
export function marginOf(id) { return M[id]?.margin || null; }

// ------------------------------------------------------------------ formatting
export function fmt(v, unit, opts = {}) {
  if (v == null || Number.isNaN(v)) return 'n/a';
  const sign = opts.sign && v > 0 ? '+' : '';
  switch (unit) {
    case 'usd': {
      const a = Math.abs(v); const s = v < 0 ? '-' : sign;
      if (a >= 1000) return `${s}$${(a / 1000).toFixed(1)}B`;
      return `${s}$${a.toFixed(0)}M`;
    }
    case 'usdb': return `${sign}$${v.toFixed(1)}B`;
    case 'eps': return `${v < 0 ? '-' : sign}$${Math.abs(v).toFixed(2)}`;
    case 'arpp': return `$${v.toFixed(2)}`;
    case 'pct': return `${sign}${(v * 100).toFixed(1)}%`;
    case 'growth': return `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
    case 'rate': return `${v > 0 ? '+' : ''}${v}%`;
    case 'pp': return `${v > 0 ? '+' : ''}${v.toFixed(1)}pp`;
    case 'count': return v >= 1000 ? `${(v / 1000).toFixed(1)}K` : `${v}`;
    case 'bn': return `${v.toFixed(2)}B`;
    case 'usdk': return `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(0)}K`;
    default: return String(v);
  }
}
export function fmtAxis(v, unit, step) {
  if (v == null) return '';
  const neg = v < 0 ? '-' : ''; const a = Math.abs(v);
  const dec = (x) => (x >= 1 || !x ? 0 : Math.min(2, Math.ceil(-Math.log10(x) - 1e-9)));
  switch (unit) {
    case 'usd': return a >= 1000 || (step && step >= 1000) ? `${neg}$${(a / 1000).toFixed(step ? dec(step / 1000) : 0)}B` : `${neg}$${a.toFixed(0)}M`;
    case 'usdb': return `${neg}$${a.toFixed(step ? dec(step) : 0)}B`;
    case 'eps': case 'arpp': return `${neg}$${a.toFixed(step ? dec(step) : 0)}`;
    case 'pct': case 'growth': return `${neg}${(a * 100).toFixed(step ? dec(step * 100) : 0)}%`;
    case 'rate': return `${neg}${a.toFixed(step ? dec(step) : 0)}%`;
    case 'pp': return `${neg}${a.toFixed(step ? dec(step) : 0)}pp`;
    case 'count': return `${neg}${(a / 1000).toFixed(step ? dec(step / 1000) : 0)}K`;
    case 'bn': return `${neg}${a.toFixed(step ? dec(step) : 2)}B`;
    case 'usdk': return `${neg}$${a.toFixed(0)}K`;
    default: return String(v);
  }
}
export function fmtExact(v, unit) {
  if (v == null) return '';
  if (unit === 'usd') return `$${v.toLocaleString('en-US')}M`;
  if (unit === 'count') return v.toLocaleString('en-US');
  return fmt(v, unit);
}

// ------------------------------------------------------------------ CSV
export const SEGMENTS = [
  { id: 'search', co: 'GOOGL', label: 'Search & other' },
  { id: 'youtube', co: 'GOOGL', label: 'YouTube ads' },
  { id: 'network', co: 'GOOGL', label: 'Google Network' },
  { id: 'subs', co: 'GOOGL', label: 'Subscriptions, platforms & devices' },
  { id: 'cloud', co: 'GOOGL', label: 'Google Cloud' },
  { id: 'otherbets', co: 'GOOGL', label: 'Other Bets' },
  { id: 'ads', co: 'META', label: 'Advertising' },
  { id: 'metaother', co: 'META', label: 'Other revenue' },
  { id: 'rl', co: 'META', label: 'Reality Labs' },
];
const csvCell = (x) => { const s = x == null ? '' : String(x); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function buildCsv({ cos, quarters, period, basis, segments, metricFilter }) {
  const head = ['company', 'ticker', 'period_view', 'fiscal_quarter', 'period_start', 'period_end', 'metric_id', 'metric', 'value', 'unit',
    'yoy_change', 'yoy_unit', 'qoq_change', 'qoq_unit', 'capex_fcf_basis', 'formula', 'note', 'source_ids', 'source_documents', 'source_dates', 'source_urls', 'data_cutoff'];
  const lines = [head.join(',')];
  const ctx = { period, basis };
  const unitName = { usd: 'USD millions', eps: 'USD per share', pct: 'ratio', rate: 'percent YoY', count: 'employees', usdb: 'USD billions', bn: 'billions of people', usdk: 'USD thousands per employee', arpp: 'USD per person', growth: 'ratio', pp: 'percentage points' };
  for (const co of cos) {
    for (const m of metricsFor([co])) {
      if (!m.cos.includes(co)) continue;
      if (metricFilter && !metricFilter(m)) continue;
      if (m.segment && m.segment !== 'ads' && !segments.includes(m.segment)) continue;
      for (const q of quarters) {
        const v = value(co, m.id, q, ctx);
        const y = shown(co, m.id, q, ctx, 'yoy');
        const qq = shown(co, m.id, q, ctx, 'qoq');
        const src = sourcesFor(co, m.id, q, ctx).map((s) => SRC[s]).filter(Boolean);
        const [ps, pe] = periodBounds(q, period);
        const out = m.unit === 'pct' && v != null ? Math.round(v * 1e6) / 1e6 : v;
        const g = (r) => (r.v == null ? '' : (r.unit === 'growth' ? Math.round(r.v * 1e6) / 1e6 : Math.round(r.v * 1000) / 1000));
        lines.push([CO[co].name, co, period, q, ps, pe, m.id, m.label, out, unitName[m.unit],
          g(y), y.v == null ? '' : unitName[y.unit], g(qq), qq.v == null ? '' : unitName[qq.unit],
          m.basisDependent ? (basis === 'lfl' ? 'like-for-like' : 'company-reported') : '',
          m.formula, v == null ? (shown(co, m.id, q, ctx, 'value').note || '') : (m.warn || ''),
          src.map((s) => s.id).join(' | '), src.map((s) => s.doc).join(' | '), src.map((s) => s.date).join(' | '), src.map((s) => s.url).join(' | '), DATA.cutoff,
        ].map(csvCell).join(','));
      }
    }
  }
  return lines.join('\n');
}

// ------------------------------------------------------------------ regional and ad deep-dive metrics
// Region keys are shared across companies for filtering, but definitions differ (see REGIONS).
export const REGIONS = [
  { id: 'na', meta: 'US & Canada', googl: 'United States', mk: 'us', gk: 'us' },
  { id: 'eu', meta: 'Europe', googl: 'EMEA', mk: 'eu', gk: 'emea' },
  { id: 'ap', meta: 'Asia-Pacific', googl: 'APAC', mk: 'ap', gk: 'apac' },
  { id: 'row', meta: 'Rest of World', googl: 'Other Americas', mk: 'rw', gk: 'oa' },
];
export const regionLabel = (co, id) => { const r = REGIONS.find((x) => x.id === id); return id === 'ww' ? 'Worldwide' : co === 'GOOGL' ? r.googl : r.meta; };
const MGEO_DEF = 'Meta, by user geography: apportioned by the estimated location of the user when the revenue-generating activity happens (not where the advertiser is billed).';
const AGEO_DEF = 'Alphabet, by customer billing address. Includes all revenue (ads, Cloud, subscriptions, devices), not only advertising.';
REGIONS.forEach((r) => {
  def(`ad_${r.mk}`, { label: `Ad revenue: ${r.meta}`, key: `ad_${r.mk}`, cos: ME, group: 'Meta regional ads', srcKind: 'mgeo', region: r.id, def: `Family of Apps advertising revenue from users in ${r.meta}. ${MGEO_DEF}`, formula: 'Reported (earnings presentation)' });
  def(`ad_${r.mk}_share`, { label: `${r.meta} share of ad revenue`, unit: 'pct', agg: 'ratio', num: `ad_${r.mk}`, den: 'ad_revenue', cos: ME, group: 'Meta regional ads', region: r.id, def: `${r.meta} ad revenue / total advertising revenue (user geography).`, formula: `Ad revenue ${r.meta} / Advertising revenue` });
  def(`rev_${r.mk}`, { label: `Revenue: ${r.meta} (user geography)`, key: `rev_${r.mk}`, cos: ME, group: 'Meta regional ads', srcKind: 'mgeo', region: r.id, def: `Total Meta revenue from users in ${r.meta}. ${MGEO_DEF}`, formula: 'Reported (earnings presentation)' });
  def(`rev_${r.mk}_share`, { label: `${r.meta} share of revenue (user geography)`, unit: 'pct', agg: 'ratio', num: `rev_${r.mk}`, den: 'revenue', cos: ME, group: 'Meta regional ads', region: r.id, def: `${r.meta} revenue / total revenue (user geography).`, formula: `Revenue ${r.meta} / Revenue` });
  def(`geo_${r.gk}`, { label: `Revenue: ${r.googl}`, key: `geo_${r.gk}`, cos: A, group: 'Alphabet geography', srcKind: 'ageo', region: r.id, def: `Alphabet revenue billed to customers in ${r.googl}${r.gk === 'oa' ? ' (Canada and Latin America)' : r.gk === 'emea' ? ' (Europe, Middle East and Africa)' : ''}. ${AGEO_DEF}`, formula: 'Reported (10-Q/10-K Note 2); Q4 = FY minus nine months', warn: r.gk === 'apac' ? 'Total revenue, not ads: Cloud and subscriptions billed in APAC are included. Not comparable with Meta APAC ad revenue by user location.' : undefined });
  def(`geo_${r.gk}_share`, { label: `${r.googl} share of revenue`, unit: 'pct', agg: 'ratio', num: `geo_${r.gk}`, den: 'revenue', cos: A, group: 'Alphabet geography', region: r.id, def: `${r.googl} revenue / total revenue (customer billing address).`, formula: `${r.googl} revenue / Total revenue` });
});
['ww', ...REGIONS.map((r) => r.mk)].forEach((k) => {
  const nm = k === 'ww' ? 'Worldwide' : REGIONS.find((r) => r.mk === k).meta;
  def(`imp_${k}`, { label: `Ad impressions, YoY: ${nm}`, unit: 'rate', agg: 'qonly', key: `imp_${k}`, cos: ME, group: 'Meta regional ads', isRate: true, srcKind: 'mimp', region: k === 'ww' ? 'ww' : REGIONS.find((r) => r.mk === k).id, def: `YoY change in ad impressions delivered to users in ${nm} (earnings presentation slide 12).`, formula: 'Reported % change' });
  def(`ppa_${k}`, { label: `Average price per ad, YoY: ${nm}`, unit: 'rate', agg: 'qonly', key: `ppa_${k}`, cos: ME, group: 'Meta regional ads', isRate: true, srcKind: 'mimp', region: k === 'ww' ? 'ww' : REGIONS.find((r) => r.mk === k).id, def: `YoY change in average price per ad for users in ${nm} (earnings presentation slide 13).`, formula: 'Reported % change' });
});
def('network_imp_yoy', { label: 'Google Network impressions, YoY', unit: 'rate', agg: 'qonly', key: 'network_imp_yoy', cos: A, group: 'Alphabet drivers', isRate: true, srcKind: 'network', segment: 'network', def: 'YoY change in impressions on Google Network partner properties (AdMob, AdSense, Ad Manager), 10-Q MD&A.', formula: 'Reported % change' });
def('network_cpi_yoy', { label: 'Google Network cost per impression, YoY', unit: 'rate', agg: 'qonly', key: 'network_cpi_yoy', cos: A, group: 'Alphabet drivers', isRate: true, srcKind: 'network', segment: 'network', def: 'YoY change in Network cost per impression (impression- and click-based revenue / impressions), 10-Q MD&A.', formula: 'Reported % change' });
def('apac_cc_yoy', { label: 'APAC revenue growth, constant currency', unit: 'rate', agg: 'qonly', key: 'apac_cc_yoy', cos: A, group: 'Alphabet geography', isRate: true, srcKind: 'apaccc', region: 'ap', def: 'APAC revenue growth excluding FX effects (10-Q MD&A); disclosed in the retrievable filings for Q1 and Q2 2025 only.', formula: 'Reported % change (constant currency)' });
def('ads_share', { label: 'Advertising share of revenue', unit: 'pct', agg: 'ratio', num: 'ad_revenue', den: 'revenue', group: 'Advertising', def: 'Advertising revenue / total revenue.', formula: 'Advertising revenue / Revenue' });
['search', 'youtube', 'network'].forEach((k) => def(`${k}_ad_share`, { label: `${M[k].label} share of Google advertising`, unit: 'pct', agg: 'ratio', num: k, den: 'ad_revenue', cos: A, group: 'Alphabet drivers', segment: k, def: `${M[k].label} / Google advertising revenue.`, formula: `${M[k].label} / Google advertising` }));
