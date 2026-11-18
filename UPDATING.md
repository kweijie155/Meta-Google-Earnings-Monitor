# Full data update runbook (for the Claude update job)

This file is the standing instruction for the Claude job that refreshes the dashboard.
It runs when the owner presses **Update now** on the Claude page, and on the earnings-week
check schedule. Follow it exactly. Never use the en dash character anywhere: use "-".

## 0. Setup
1. Attach the repo with push access (`add_repo` owner `kweijie155`, repo `Meta-Google-Earnings-Monitor`, access `push`), clone it, `cd` into it.
2. `cd app && npm ci && cd ..`

## 1. Decide whether anything is new (keep this cheap)
- Dashboard latest quarter: last entry of `QUARTERS` in `build_data.py` (also `app/src/data.json` -> `display[-1]`).
- Read `app/public/sec_latest.json` (written daily for free by GitHub Actions): `companies.*.new_quarters` and `new_filings`.
- Check the two investor-relations pages for a newer earnings release:
  - Alphabet: https://abc.xyz/investor/ (earnings release PDF, 10-Q/10-K PDF)
  - Meta: https://investor.atmeta.com/ (press release, earnings slides PDF, 10-Q/10-K)
- **Add a quarter only when BOTH companies have reported it.** Until then the app's "Fresh results"
  panel shows the first company's SEC headline figures.
- If there is no new quarter for both companies, and no newly filed 10-Q/10-K detail for the latest
  quarter that is still missing in the data (for example paid clicks, network, constant-currency APAC, RPO):
  **stop here.** Do not commit, do not republish. Report "No new results; dashboard already current
  through <quarter>." This keeps the run small.

## 2. Collect primary sources (new quarter)
SEC EDGAR is blocked from Claude sessions: use the IR-hosted PDFs. For each company collect the
earnings release, the slides (Meta), and the 10-Q / 10-K. Record each as a `SOURCES` entry
(id pattern `A-ER-26Q4`, `A-10Q-26Q4`, `M-ER-26Q4`, `M-PRES-26Q4`, `M-10Q-26Q4`; fields as existing entries:
title, publisher, date, url, kind).

## 3. Edit `build_data.py`
- `QUARTERS`: append the new quarter. `CUTOFF`: today's date. `LAST_RESULTS`: both release dates.
  `NEXT_REPORT`: expected timing of the following quarter (e.g. "late Apr 2027").
- `A_ROWS` / `M_ROWS`: one new row each, same field order as `AK` / `MK`, values in USD millions
  (EPS in USD, headcount as reported). Q4 values that are only reported annually are derived as
  FY (10-K) minus nine months (Q3 10-Q), with a note, exactly like `A_GEO_NOTE`.
- `A_SRC` / `M_SRC`, `A_RPO`, `A_CLICKS` (+ note), `A_NETWORK`, `A_APAC_CC` where disclosed.
- Regional: `M_AD_GEO`, `M_REV_GEO`, `M_IMP_PPA` (+ `M_IMP_SRC`), `A_GEO` (+ note); after a 10-K also
  `A_FY_GEO`, `M_FY_GEO`, `A_GEO_PERIODS`. Meta deck regional charts extract with scrambled labels:
  resolve the mapping and confirm with the multiset check (step 4).
- `GUIDANCE`: add new guidance issued with the release; the app grades past guidance automatically.
- `ONE_OFFS`, `COMMENTARY`, `RISKS`, `APAC_COMMENTARY`, `APAC_RISKS`: add or retire items with sources.
- `ESTIMATES`: only third-party figures you can source; label clearly; never show estimates as actuals.
- If the new quarter starts a new year, check hard-coded FY references in `app/src/components/regional.jsx`
  (e.g. FY2025 billed-vs-seen tiles use `M_FY_GEO.FY2025` and the 200966 total) and move them to the
  latest full year only once its 10-K figures are in.

## 4. Validate (must be 100%)
`bash scripts/build_all.sh` runs `build_data.py` (351+ checks: segment/region sums tie to totals,
FCF and capex reconcile, ARPP reproduces, TAC rate, FY ties, volume x price vs ad growth, deck multiset)
and builds everything. **If any check fails, fix the data, never the check** (only documented
rounding tolerances are allowed). Then run the UI tests:
```
node test_ui.js app/dist-artifact/index.html g && node test_ui.js app/dist-artifact-apac/index.html a
node test_interact.js && node test_click.js && node test_apac.js
```
All must report no page errors and no horizontal overflow.
Also compare the new quarter's revenue, operating income, net income, OCF and purchases of P&E with
`app/public/sec_latest.json` (if present for that quarter): they must agree within 0.5%.

If sources are incomplete or checks cannot pass, do not publish a partial quarter: stop and report what is missing.

## 5. Publish
1. Commit and push to `main` (message: "Data: add <quarter>"). GitHub Actions rebuilds and deploys the
   installable app at https://kweijie155.github.io/Meta-Google-Earnings-Monitor/ (about 2 minutes).
2. Republish both Claude pages (read each first with the Artifact tool, then publish to the same URL):
   - `publish/alphabet-meta-monitor.html` -> https://claude.ai/artifact/SVeFZ3nwUZfVmnFEaidU86
   - `publish/alphabet-meta-apac-monitor.html` -> https://claude.ai/artifact/WmWhzcMJo5ze2cNzV316Jn
   Omit `capabilities` so the stored declaration (downloads, user, mcp: Claude Code Remote fire_trigger + list_triggers) carries forward.
3. Report in 3-5 lines: quarter added, headline numbers per company, checks passed, links.
