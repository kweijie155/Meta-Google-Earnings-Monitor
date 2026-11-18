# Alphabet vs Meta Monitor

Installable web app comparing Alphabet and Meta quarterly results from Q1 2025 to the latest reported quarter,
with a **Global / APAC** switch, an ads deep dive, and primary-source links for every figure.

**Open the app:** https://kweijie155.github.io/Meta-Google-Earnings-Monitor/
(on a phone: open the link, then *Add to Home Screen* / *Install app*)

## How it stays current
| What | When | Cost |
|---|---|---|
| Opening the app | Always loads the latest published version (works offline from the saved copy) | free |
| **Update now** in the app | Pulls the newest published version immediately | free |
| SEC check (GitHub Actions) | Daily. New 8-K earnings releases and 10-Q/10-K XBRL headline figures appear as **Fresh results** within 1-2 days | free |
| Full update (Claude) | Owner's **Update now** on the Claude page, plus short checks in earnings weeks. Adds the quarter with segments, APAC and ads detail after 351+ validation checks | owner's Claude plan |

## Project layout
- `build_data.py` - all source records and reported figures, validation checks, writes `app/src/data.json`
- `app/` - React app (Vite). `src/Shell.jsx` app shell (edition switch, status bar, install, update), `src/App.jsx` dashboard,
  `src/components/` charts and regional/ads sections, `src/lib/engine.js` metric engine, `public/` PWA files
- `scripts/sec_check.py` - free daily SEC check; `scripts/build_all.sh` - build everything
- `UPDATING.md` - runbook the Claude update job follows
- `.github/workflows/site.yml` - SEC check + GitHub Pages deploy

## Build locally
```
bash scripts/build_all.sh        # data checks + app + Claude pages
cd app && npx vite --host        # dev server (VITE_TARGET=pages by default)
```
Not investment advice. Figures from company filings and earnings materials; third-party estimates are labelled.
