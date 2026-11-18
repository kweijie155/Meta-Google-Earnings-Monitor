import React, { useState } from 'react';
import { qLabel } from '../lib/engine.js';
import { TableView, SourceLine } from './charts.jsx';

export class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.err) this.setState({ err: null }); }
  render() {
    if (this.state.err) return <div className="errbox" role="alert"><strong>This section could not be drawn.</strong><span>{String(this.state.err.message || this.state.err)}</span><span>Reset the filters to redraw it with the default view.</span><div><button className="btn small" onClick={this.props.onReset}>Reset filters</button></div></div>;
    return this.props.children;
  }
}

// ------------------------------------------------------------------ small UI pieces
export function Seg({ label, value: v, options, onChange, name, compact = false }) {
  const group = (
      <div className={compact ? 'seg sm' : 'seg'} role="radiogroup" {...(compact ? { 'aria-label': label } : { 'aria-labelledby': `lbl-${name}` })}>
        {options.map((o) => (
          <button key={o.v} type="button" role="radio" aria-checked={v === o.v} disabled={o.disabled} title={o.title || ''}
            onClick={() => onChange(o.v)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
              e.preventDefault(); const opts = options.filter((x) => !x.disabled); const i = opts.findIndex((x) => x.v === v);
              const n = opts[(i + (e.key === 'ArrowRight' ? 1 : opts.length - 1)) % opts.length]; onChange(n.v);
              const parent = e.currentTarget.parentElement;
              requestAnimationFrame(() => parent?.querySelector('[aria-checked="true"]')?.focus());
            }}
            tabIndex={v === o.v ? 0 : -1}>
            {o.dot && <span className="dot" style={{ background: o.dot }} />}{o.label}
          </button>
        ))}
      </div>
  );
  if (compact) return group;
  return (
    <div className="ctl">
      <span className="lbl" id={`lbl-${name}`}>{label}</span>
      {group}
    </div>
  );
}

export function Card({ title, sub, warn, span = 6, children, series, quarters, unit, focusQ, sources, id, legend, extra, views }) {
  const [table, setTable] = useState(false);
  return (
    <div className={`card span-${span}`} id={id}>
      <div className="card-head">
        <div><h3>{title}</h3>{sub && <p className="sub">{sub}</p>}</div>
        {series && <div className="card-tools"><button type="button" className="btn small ghost" aria-pressed={table} onClick={() => setTable(!table)}>{table ? 'Chart' : 'Table'}</button></div>}
      </div>
      {views && <div className="views">{views}</div>}
      {legend}
      {table && series ? <TableView series={series} quarters={quarters} unit={unit} focusQ={focusQ} /> : children}
      {extra}
      {warn && <div className="warn srcline"><span>Note:</span><span>{warn}</span></div>}
      {sources && <SourceLine ids={sources} focusIds={series && focusQ ? series.flatMap((x) => x.get(focusQ).src || []) : null} focusLabel={focusQ ? qLabel(focusQ) : ''} />}
    </div>
  );
}

export const pctCls = (v, goodUp = true) => (v == null ? '' : (v > 0) === goodUp ? 'up' : v === 0 ? '' : 'down');

