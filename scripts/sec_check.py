#!/usr/bin/env python3
"""Free SEC check, run daily by GitHub Actions (no Claude usage).

1. Looks for earnings releases (8-K item 2.02) and 10-Q/10-K filings newer than the dashboard data.
2. Pulls headline figures for any newer quarter from SEC XBRL "companyfacts".
3. Self-test: recomputes the dashboard's latest quarter from SEC data and requires it to match
   the validated dashboard figures (within 0.5%) before trusting the extraction.
Writes app/public/sec_latest.json, which the app shows as "Fresh results" until the full
Claude update adds the quarter (segments, APAC, ads) to the dashboard itself.
Values are USD millions (EPS in USD).
"""
import json, sys, datetime as dt, urllib.request, os, time

UA = os.environ.get("SEC_USER_AGENT", "meta-google-earnings-monitor kweijie155@users.noreply.github.com")
CIK = {"GOOGL": 1652044, "META": 1326801}
NAME = {"GOOGL": "Alphabet", "META": "Meta"}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = json.load(open(os.path.join(ROOT, "app/src/data.json")))
OUT = os.path.join(ROOT, "app/public/sec_latest.json")
LATEST = DATA["display"][-1]                       # e.g. 2026Q3
CONCEPTS = {
    "revenue": ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax"],
    "op_income": ["OperatingIncomeLoss"],
    "net_income": ["NetIncomeLoss"],
    "eps_diluted": ["EarningsPerShareDiluted"],
    "ocf": ["NetCashProvidedByUsedInOperatingActivities"],
    "capex_ppe": ["PaymentsToAcquirePropertyPlantAndEquipment"],
}
STATEMENT_YTD = {"ocf", "capex_ppe"}               # cash flow facts are year-to-date

def get(url):
    for i in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            if i == 3: raise
            time.sleep(3 * (i + 1))

def q_end(q):
    y, n = int(q[:4]), int(q[5])
    return dt.date(y, 3 * n, 31 if n in (1, 4) else 30)
def q_next(q):
    y, n = int(q[:4]), int(q[5]); return f"{y + 1}Q1" if n == 4 else f"{y}Q{n + 1}"
def q_prev(q, k=1):
    y, n = int(q[:4]), int(q[5])
    for _ in range(k): y, n = (y - 1, 4) if n == 1 else (y, n - 1)
    return f"{y}Q{n}"
def d(s): return dt.date.fromisoformat(s)

def facts_for(cf, names, unit):
    for nm in names:
        f = cf["facts"].get("us-gaap", {}).get(nm)
        if f and unit in f["units"]: yield nm, f["units"][unit]

def quarter_value(cf, metric, q):
    unit = "USD/shares" if metric == "eps_diluted" else "USD"
    end = q_end(q); jan1 = dt.date(end.year, 1, 1)
    for nm, rows in facts_for(cf, CONCEPTS[metric], unit):
        rows = [r for r in rows if r.get("end") and r.get("start") and d(r["end"]) == end and r.get("form") in ("10-Q", "10-K", "10-Q/A", "10-K/A")]
        if not rows: continue
        rows.sort(key=lambda r: r.get("filed", ""))
        direct = [r for r in rows if 80 <= (d(r["end"]) - d(r["start"])).days <= 100]
        if direct:
            r = direct[-1]; return r["val"], nm, r
        if metric == "eps_diluted": continue          # EPS cannot be derived by differencing
        ytd = [r for r in rows if d(r["start"]) == jan1]
        if not ytd: continue
        r = ytd[-1]
        if q.endswith("Q1"): return r["val"], nm, r
        prev_end = q_end(q_prev(q))
        for _, rows2 in facts_for(cf, [nm], unit):
            p = sorted([x for x in rows2 if x.get("start") and d(x["start"]) == jan1 and d(x["end"]) == prev_end], key=lambda x: x.get("filed", ""))
            if p: return r["val"] - p[-1]["val"], nm, r
    return None, None, None

def m(v): return None if v is None else (round(v / 1e6) if abs(v) > 1000 else v)

def headline(cf, q):
    out, meta = {}, None
    for k in CONCEPTS:
        v, nm, r = quarter_value(cf, k, q)
        out[k] = m(v) if k != "eps_diluted" else v
        if r and (meta is None or r.get("filed", "") > meta["filed"]): meta = {"form": r["form"], "filed": r["filed"], "accn": r["accn"]}
    if out.get("ocf") is not None and out.get("capex_ppe") is not None: out["fcf_lfl"] = out["ocf"] - out["capex_ppe"]
    if out.get("op_income") is not None and out.get("revenue"): out["op_margin"] = round(out["op_income"] / out["revenue"], 4)
    return out, meta

def releases(sub, after):
    """8-K earnings releases (item 2.02) and periodic reports filed after a date."""
    r = sub["filings"]["recent"]; res = []
    for i, form in enumerate(r["form"]):
        filed = r["filingDate"][i]
        if filed <= after: continue
        items = r.get("items", [""] * len(r["form"]))[i] or ""
        if (form == "8-K" and "2.02" in items) or form in ("10-Q", "10-K"):
            accn = r["accessionNumber"][i]
            res.append({"form": form, "filed": filed, "report_date": r["reportDate"][i] or None, "accn": accn,
                        "url": f"https://www.sec.gov/Archives/edgar/data/{sub['cik'].lstrip('0')}/{accn.replace('-', '')}/{r['primaryDocument'][i]}"})
    return sorted(res, key=lambda x: x["filed"])

def main():
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    last = DATA.get("last_results", {})
    out = {"checked_at": now, "dashboard_latest": LATEST, "source": "SEC EDGAR (submissions + XBRL companyfacts)", "companies": {}, "selftest": {}}
    ok_all = True
    for co, cik in CIK.items():
        sub = get(f"https://data.sec.gov/submissions/CIK{cik:010d}.json")
        cf = get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json")
        # self-test against the validated dashboard quarter
        mine, _ = headline(cf, LATEST)
        ref = DATA["rows"][co][LATEST]; diffs = {}
        for k in ("revenue", "op_income", "net_income", "ocf", "capex_ppe"):
            a, b = mine.get(k), ref.get(k)
            if a is None or b is None: diffs[k] = "missing"; continue
            diffs[k] = round(abs(a - b) / abs(b), 5)
        ok = all(isinstance(v, float) and v <= 0.005 for v in diffs.values())
        out["selftest"][co] = {"quarter": LATEST, "ok": ok, "rel_diff": diffs}
        ok_all &= ok
        # newer quarters with XBRL data
        newq = []
        q = q_next(LATEST)
        while q_end(q) < dt.date.today():
            h, meta = headline(cf, q)
            if h.get("revenue") is None: break
            py = q_prev(q, 4); prior, _ = headline(cf, py)
            yoy = {k: (round(h[k] / prior[k] - 1, 4) if h.get(k) is not None and prior.get(k) not in (None, 0) and k in ("revenue", "op_income", "net_income", "eps_diluted") else None) for k in h}
            newq.append({"quarter": q, "figures": h, "prior_year": prior, "yoy": yoy, "filing": meta,
                         "filing_url": None if not meta else f"https://www.sec.gov/Archives/edgar/data/{cik}/{meta['accn'].replace('-', '')}/"})
            q = q_next(q)
        rel = releases(sub, last.get(co, DATA["cutoff"]))
        out["companies"][co] = {"name": NAME[co], "cik": cik, "new_quarters": newq if ok else [], "new_filings": rel}
    out["trusted"] = ok_all
    out["has_new"] = any(c["new_quarters"] or any(f["form"] == "8-K" for f in c["new_filings"]) for c in out["companies"].values())
    prev = None
    if os.path.exists(OUT):
        try: prev = json.load(open(OUT))
        except Exception: prev = None
    # only rewrite when the content (not the timestamp) changes, or once a day for "checked" freshness
    body = {k: v for k, v in out.items() if k != "checked_at"}
    pbody = {k: v for k, v in (prev or {}).items() if k != "checked_at"}
    stale = not prev or prev.get("checked_at", "")[:10] != now[:10]
    if body != pbody or stale:
        json.dump(out, open(OUT, "w"), indent=1)
        print("updated", OUT)
    print(json.dumps({"has_new": out["has_new"], "trusted": ok_all, "selftest": out["selftest"]}, indent=1))
    if not ok_all:
        print("WARNING: self-test failed; new-quarter figures withheld", file=sys.stderr)

if __name__ == "__main__":
    main()
