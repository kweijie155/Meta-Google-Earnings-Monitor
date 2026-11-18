import { buildCsv, Q_DISPLAY, SEGMENTS } from './src/lib/engine.js';
import fs from 'fs';
const seg = SEGMENTS.map((s) => s.id);
const APAC_GROUPS = ['Meta regional ads', 'Alphabet geography', 'Advertising', 'Alphabet drivers', 'Meta drivers'];
const apac = (m) => !!m.region || APAC_GROUPS.includes(m.group) || ['revenue', 'op_margin'].includes(m.id);
const jobs = [['Q', 'reported', 'quarterly', null], ['TTM', 'reported', 'ttm', null], ['Q', 'lfl', 'quarterly_like_for_like', null], ['Q', 'reported', 'apac_ads_quarterly', apac]];
for (const [period, basis, name, metricFilter] of jobs) {
  fs.writeFileSync(`../publish/alphabet_meta_${name}_2025Q1-2026Q3.csv`, buildCsv({ cos: ['GOOGL', 'META'], quarters: Q_DISPLAY, period, basis, segments: seg, metricFilter }));
}
