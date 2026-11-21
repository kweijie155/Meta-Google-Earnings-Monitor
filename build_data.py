"""Build the normalized Alphabet vs Meta dataset and run validation checks.

All $ values in USD millions unless the metric unit says otherwise.
Every reported value is transcribed from the primary source listed in SOURCES
(earnings release = Exhibit 99.1 of the 8-K, 10-Q/10-K, earnings presentation).
"""
import json, csv, math

CUTOFF = "2026-10-29"
# Latest earnings release date per company (updated by the refresh job with each new quarter)
LAST_RESULTS = {"META": "2026-10-21", "GOOGL": "2026-10-28"}
NEXT_REPORT = "late Jan 2027"   # expected timing of the next (first unreported) quarter
QUARTERS = ["2024Q1", "2024Q2", "2024Q3", "2024Q4",
            "2025Q1", "2025Q2", "2025Q3", "2025Q4",
            "2026Q1", "2026Q2", "2026Q3"]
DISPLAY = QUARTERS[4:]
PERIOD = {  # calendar = fiscal for both companies
    "Q1": ("01-01", "03-31"), "Q2": ("04-01", "06-30"),
    "Q3": ("07-01", "09-30"), "Q4": ("10-01", "12-31")}

# ---------------------------------------------------------------- sources
SOURCES = [
 # Alphabet earnings releases (Exhibit 99.1)
 dict(id="A-ER-24Q4", co="GOOGL", doc="Q4 & FY2024 earnings release", type="Earnings release (8-K Ex. 99.1)", date="2025-02-04",
      url="https://s206.q4cdn.com/479360582/files/doc_financials/2024/q4/2024q4-alphabet-earnings-release.pdf", sec=""),
 dict(id="A-ER-25Q1", co="GOOGL", doc="Q1 2025 earnings release", type="Earnings release (8-K Ex. 99.1)", date="2025-04-24",
      url="https://s206.q4cdn.com/479360582/files/doc_financials/2025/q1/2025q1-alphabet-earnings-release.pdf",
      sec="https://www.sec.gov/Archives/edgar/data/1652044/000165204425000040/googexhibit991q12025.htm"),
 dict(id="A-ER-25Q2", co="GOOGL", doc="Q2 2025 earnings release", type="Earnings release (8-K Ex. 99.1)", date="2025-07-23",
      url="https://s206.q4cdn.com/479360582/files/doc_financials/2025/q2/2025q2-alphabet-earnings-release.pdf", sec=""),
 dict(id="A-ER-25Q3", co="GOOGL", doc="Q3 2025 earnings release", type="Earnings release (8-K Ex. 99.1)", date="2025-10-29",
      url="https://s206.q4cdn.com/479360582/files/doc_financials/2025/q3/2025q3-alphabet-earnings-release.pdf", sec=""),
 dict(id="A-ER-25Q4", co="GOOGL", doc="Q4 & FY2025 earnings release", type="Earnings release (8-K Ex. 99.1)", date="2026-02-04",
      url="https://s206.q4cdn.com/479360582/files/doc_financials/2025/q4/2025q4-alphabet-earnings-release.pdf", sec=""),
 dict(id="A-ER-26Q1", co="GOOGL", doc="Q1 2026 earnings release", type="Earnings release (8-K Ex. 99.1)", date="2026-04-29",
      url="https://s206.q4cdn.com/479360582/files/doc_financials/2026/q1/2026q1-alphabet-earnings-release.pdf",
      sec="https://www.sec.gov/Archives/edgar/data/0001652044/000165204426000043/googexhibit991q12026.htm"),
 dict(id="A-ER-26Q2", co="GOOGL", doc="Q2 2026 earnings release", type="Earnings release (8-K Ex. 99.1)", date="2026-07-22",
      url="https://s206.q4cdn.com/479360582/files/doc_news/2026/Jul/22/attachments/2026q2-alphabet-earnings-release.pdf",
      sec="https://www.sec.gov/Archives/edgar/data/0001652044/000165204426000066/googexhibit991q22026.htm"),
 dict(id="A-ER-26Q3", co="GOOGL", doc="Q3 2026 earnings release", type="Earnings release (8-K Ex. 99.1)", date="2026-10-28",
      url="https://s206.q4cdn.com/479360582/files/doc_news/2026/Oct/28/attachments/2026q3-alphabet-earnings-release.pdf",
      sec="https://www.sec.gov/Archives/edgar/data/0001652044/000165204426000080/googexhibit991q32026.htm"),
 # Alphabet periodic filings
 dict(id="A-10Q-25Q1", co="GOOGL", doc="Form 10-Q, quarter ended Mar 31, 2025", type="SEC filing (10-Q)", date="2025-04-25",
      url="https://s206.q4cdn.com/479360582/files/doc_financials/2025/q1/goog-10-q-q1-2025.pdf",
      sec="https://www.sec.gov/Archives/edgar/data/1652044/000165204425000043/goog-20250331.htm"),
 dict(id="A-10Q-25Q2", co="GOOGL", doc="Form 10-Q, quarter ended Jun 30, 2025", type="SEC filing (10-Q)", date="2025-07-24",
      url="https://s206.q4cdn.com/479360582/files/doc_financials/2025/q2/goog-10-q-q2-2025.pdf",
      sec="https://www.sec.gov/Archives/edgar/data/1652044/000165204425000062/goog-20250630.htm"),
 dict(id="A-10Q-25Q2-MDA", co="GOOGL", doc="Form 10-Q Q2 2025, MD&A text (mirror)", type="SEC filing text mirror", date="2025-07-24",
      url="https://pubt.io/view/AE5B1756D491A8043B835DA9B75D0CB24F4E0CC8", sec=""),
 dict(id="A-10Q-25Q3", co="GOOGL", doc="Form 10-Q, quarter ended Sep 30, 2025 (PDF mirror)", type="SEC filing (10-Q)", date="2025-10-30",
      url="https://d18rn0p25nwr6d.cloudfront.net/CIK-0001652044/d6a68c11-89c6-4604-8fe8-103892a5de7e.pdf",
      sec="https://www.sec.gov/Archives/edgar/data/1652044/000165204425000091/goog-20250930.htm"),
 dict(id="A-10K-25", co="GOOGL", doc="Form 10-K, FY2025 (revenue backlog note, via EDGAR tools)", type="SEC filing (10-K)", date="2026-02-05",
      url="https://app.edgar.tools/companies/GOOG/disclosures/revenue",
      sec="https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm"),
 dict(id="A-10Q-26Q1", co="GOOGL", doc="Form 10-Q, quarter ended Mar 31, 2026", type="SEC filing (10-Q)", date="2026-04-30",
      url="https://s206.q4cdn.com/479360582/files/doc_financials/2026/q1/GOOG-10-Q-Q1-2026.pdf",
      sec="https://www.sec.gov/Archives/edgar/data/0001652044/000165204426000048/goog-20260331.htm"),
 dict(id="A-10Q-26Q2", co="GOOGL", doc="Form 10-Q, quarter ended Jun 30, 2026", type="SEC filing (10-Q)", date="2026-07-23",
      url="https://s206.q4cdn.com/479360582/files/doc_financials/2026/q2/GOOG-10-Q-Q2-2026.pdf",
      sec="https://www.sec.gov/Archives/edgar/data/0001652044/000165204426000071/goog-20260630.htm"),
 dict(id="A-10Q-26Q3", co="GOOGL", doc="Form 10-Q, quarter ended Sep 30, 2026", type="SEC filing (10-Q)", date="2026-10-29",
      url="https://s206.q4cdn.com/479360582/files/doc_financials/2026/q3/GOOG-10-Q-Q3-2026.pdf",
      sec="https://www.sec.gov/Archives/edgar/data/1652044/000165204426000084/goog-20260930.htm"),
 dict(id="A-CALL-26Q1", co="GOOGL", doc="Q1 2026 earnings call transcript", type="Earnings call (company transcript)", date="2026-04-29",
      url="https://s206.q4cdn.com/479360582/files/doc_events/2026/Apr/29/Alphabet-2026_Q1_Earnings_Transcript.pdf", sec=""),
 # Meta
 dict(id="M-ER-24Q4", co="META", doc="Q4 & FY2024 results press release", type="Earnings release (8-K Ex. 99.1)", date="2025-01-29",
      url="https://investor.atmeta.com/investor-news/press-release-details/2025/Meta-Reports-Fourth-Quarter-and-Full-Year-2024-Results/default.aspx", sec=""),
 dict(id="M-ER-25Q1", co="META", doc="Q1 2025 results press release", type="Earnings release (8-K Ex. 99.1)", date="2025-04-30",
      url="https://investor.atmeta.com/investor-news/press-release-details/2025/Meta-Reports-First-Quarter-2025-Results/default.aspx", sec=""),
 dict(id="M-ER-25Q2", co="META", doc="Q2 2025 results press release", type="Earnings release (8-K Ex. 99.1)", date="2025-07-30",
      url="https://investor.atmeta.com/investor-news/press-release-details/2025/Meta-Reports-Second-Quarter-2025-Results/default.aspx", sec=""),
 dict(id="M-ER-25Q3", co="META", doc="Q3 2025 results press release", type="Earnings release (8-K Ex. 99.1)", date="2025-10-29",
      url="https://investor.atmeta.com/investor-news/press-release-details/2025/Meta-Reports-Third-Quarter-2025-Results/default.aspx", sec=""),
 dict(id="M-ER-25Q4", co="META", doc="Q4 & FY2025 results press release", type="Earnings release (8-K Ex. 99.1)", date="2026-01-28",
      url="https://investor.atmeta.com/investor-news/press-release-details/2026/Meta-Reports-Fourth-Quarter-and-Full-Year-2025-Results/default.aspx", sec=""),
 dict(id="M-ER-26Q1", co="META", doc="Q1 2026 results press release", type="Earnings release (8-K Ex. 99.1)", date="2026-04-29",
      url="https://investor.atmeta.com/investor-news/press-release-details/2026/Meta-Reports-First-Quarter-2026-Results/default.aspx", sec=""),
 dict(id="M-ER-26Q2", co="META", doc="Q2 2026 results press release", type="Earnings release (8-K Ex. 99.1)", date="2026-07-29",
      url="https://investor.atmeta.com/investor-news/press-release-details/2026/Meta-Reports-Second-Quarter-2026-Results/default.aspx", sec=""),
 dict(id="M-ER-26Q3", co="META", doc="Q3 2026 results press release", type="Earnings release (8-K Ex. 99.1)", date="2026-10-21",
      url="https://investor.atmeta.com/investor-news/press-release-details/2026/Meta-Reports-Third-Quarter-2026-Results/default.aspx",
      sec="https://www.sec.gov/Archives/edgar/data/0001326801/000162828026066700/meta-09302026xexhibit991.htm"),
 dict(id="M-CALL-25Q1", co="META", doc="Q1 2025 earnings call transcript", type="Earnings call (company transcript)", date="2025-04-30",
      url="https://s21.q4cdn.com/399680738/files/doc_financials/2025/q1/Transcripts/META-Q1-2025-Earnings-Call-Transcript-1.pdf", sec=""),
 dict(id="M-PRES-26Q3", co="META", doc="Q3 2026 earnings presentation (DAP, ARPP, segment history)", type="Earnings presentation", date="2026-10-21",
      url="https://s21.q4cdn.com/399680738/files/content_files/Earnings-Presentation-Q3-2026.pdf", sec=""),
 dict(id="M-CALL-26Q3", co="META", doc="Q3 2026 earnings call transcript", type="Earnings call (company transcript)", date="2026-10-21",
      url="https://s21.q4cdn.com/399680738/files/content_files/META-Q3-2026-Earnings-Call-Transcript.pdf", sec=""),
 # Secondary (used only where noted)
 dict(id="S-PPC-26Q3", co="GOOGL", doc="PPC Land: Q3 2026 paid clicks/CPC from Alphabet 10-Q", type="Secondary (cites 10-Q)", date="2026-10-29",
      url="https://ppc.land/google-ad-clicks-gain-8-in-q3-slower-than-11-over-nine-months/", sec=""),
 dict(id="S-WMEDIA-26Q2", co="GOOGL", doc="W.Media: Q2 2026 call, 2026 capex guidance raised", type="Secondary (call coverage)", date="2026-07-23",
      url="https://w.media/ai-infrastructure-demand-pushes-alphabets-2026-capex-guidance-to-us-205-billion/", sec=""),
 dict(id="S-INV-26Q3", co="GOOGL", doc="Investing.com: Q3 2026 call transcript & consensus", type="Secondary (call coverage)", date="2026-10-28",
      url="https://www.investing.com/news/transcripts/earnings-call-transcript-alphabet-q3-2026-profit-miss-sparks-10-afterhours-drop-93CH-4981037", sec=""),
 dict(id="S-NB-26Q3", co="META", doc="NewsBytes: Q3 2026 vs LSEG consensus", type="Secondary (consensus)", date="2026-10-22",
      url="https://www.newsbytesapp.com/news/business/meta-reports-65b-revenue-for-q3-beats-expectations/story", sec=""),
 dict(id="S-NBC-24Q4", co="GOOGL", doc="CNBC/NBC: 2025 capex ~ $75B (Q4 2024 call)", type="Secondary (call coverage)", date="2025-02-04",
      url="https://nbcsandiego.com/news/business/money-report/alphabet-expects-to-invest-about-75-billion-in-capex-in-2025/3744010", sec=""),
 dict(id="S-DIGI-25Q1", co="GOOGL", doc="DIGITIMES: 2025 capex plan reaffirmed (Q1 2025 call)", type="Secondary (call coverage)", date="2025-04-25",
      url="https://www.digitimes.com/news/a20250425VL205.html", sec=""),
 dict(id="S-BBG-FTC", co="META", doc="Bloomberg: FTC to appeal ruling in Meta monopoly case", type="Secondary (news)", date="2026-01-20",
      url="https://www.bloomberg.com/news/articles/2026-01-20/us-ftc-to-appeal-court-ruling-on-meta-win-in-monopoly-case", sec=""),
 dict(id="S-ADS-ARPP", co="META", doc="AdsUploader: Meta DAP/ARPP history (quarter-mapping cross-check)", type="Secondary (cross-check only)", date="2026-08-08",
      url="https://adsuploader.com/blog/meta-users-statistics", sec=""),
 dict(id="M-PRES-25Q3", co="META", doc="Q3 2025 earnings presentation (geography, regional impressions and price per ad)", type="Earnings presentation", date="2025-10-29",
      url="https://s21.q4cdn.com/399680738/files/doc_financials/2025/q3/Earnings-Presentation-Q3-2025-Final.pdf", sec=""),
 dict(id="M-FY-GEO", co="META", doc="Form 10-K FY2025, revenue by customer address (via EDGAR tools)", type="SEC filing (10-K)", date="2026-01-29",
      url="https://app.edgar.tools/companies/META/disclosures/revenue", sec="https://www.sec.gov/Archives/edgar/data/1326801/000162828026003942/meta-20251231.htm"),
 dict(id="A-FY-GEO", co="GOOGL", doc="Form 10-K FY2025, revenue by geography (via EDGAR tools)", type="SEC filing (10-K)", date="2026-02-05",
      url="https://app.edgar.tools/companies/GOOG/disclosures/revenue", sec="https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm"),
 dict(id="S-ADSUP", co="META", doc="AdsUploader: Meta regional price per ad and impressions tracker (quarter mapping of Meta deck slides 12-13)", type="Secondary (deck transcription)", date="2026-10-26",
      url="https://adsuploader.com/blog/meta-earnings-for-advertisers", sec=""),
 dict(id="S-ADWIZE", co="META", doc="Adwize: Meta price per ad and impressions by quarter and region", type="Secondary (deck transcription)", date="2026-09-29",
      url="https://adwize.ai/meta-ad-price-history", sec=""),
 dict(id="S-2SLIDES", co="META", doc="2Slides: Meta Q2 2026 earnings presentation transcription", type="Secondary (deck transcription)", date="2026-07",
      url="https://2slides.com/gallery/meta-q2-2026-earnings-presentation", sec=""),
 dict(id="S-RA-26Q3", co="META", doc="Relevant Audience: Q3 2026 APAC price per ad +1% as impressions grow 14%", type="Secondary (deck analysis)", date="2026-10-23",
      url="https://www.relevantaudience.com/meta/meta-q3-2026-ad-price-impressions-asia-pacific/", sec=""),
 dict(id="S-CNBC-25Q1", co="META", doc="CNBC: Meta says China retailers are reducing digital ad spend (Q1 2025 call)", type="Secondary (call coverage)", date="2025-04-30",
      url="https://www.nbcsandiego.com/news/business/money-report/meta-says-china-retailers-are-reducing-digital-ad-spend/3815659/", sec=""),
 dict(id="R-JFTC-250415", co="GOOGL", doc="JFTC: cease and desist order against Google (Android search preinstallation)", type="Regulator release", date="2025-04-15",
      url="https://www.jftc.go.jp/en/pressreleases/yearly-2025/April/250415.html", sec=""),
 dict(id="R-JFTC-250331", co="GOOGL", doc="JFTC: designation of providers under the Mobile Software Competition Act", type="Regulator release", date="2025-03-31",
      url="https://www.jftc.go.jp/en/pressreleases/yearly-2025/March/250331.html", sec=""),
 dict(id="R-JFTC-250910", co="GOOGL", doc="JFTC: Mobile Software Competition Act full enforcement on Dec 18, 2025", type="Regulator release", date="2025-09-10",
      url="https://www.jftc.go.jp/en/about_jftc/index_3_250910.html", sec=""),
 dict(id="S-AU-U16", co="BOTH", doc="McCullough Robertson: Australia's under-16 social media minimum age starts", type="Secondary (legal analysis)", date="2025-12-10",
      url="https://mccullough.com.au/2025/12/10/australias-social-media-ban-under-16/", sec=""),
 dict(id="S-NCLAT", co="META", doc="Bar & Bench: NCLAT sets aside CCI data-sharing ban, upholds Rs 213.14 crore penalty", type="Secondary (legal news)", date="2025-11-04",
      url="https://www.barandbench.com/news/litigation/nclat-sets-aside-cci-ban-on-whatsapp-meta-data-sharing-for-advertising-upholds-213-crore-penalty", sec=""),
 dict(id="S-AV", co="BOTH", doc="Alpha Vantage statement API (independent cross-check of revenue, OI, NI, OCF, capex, cash)", type="Secondary (cross-check only)", date="2026-10-30",
      url="https://www.alphavantage.co/documentation/", sec=""),
]
SRC = {s["id"]: s for s in SOURCES}

# ------------------------------------------------- Alphabet reported values
# release that is the primary source for each quarter's figures
A_SRC = {"2024Q1": "A-ER-25Q1", "2024Q2": "A-ER-25Q2", "2024Q3": "A-ER-25Q3", "2024Q4": "A-ER-25Q4",
         "2025Q1": "A-ER-25Q1", "2025Q2": "A-ER-25Q2", "2025Q3": "A-ER-25Q3", "2025Q4": "A-ER-25Q4",
         "2026Q1": "A-ER-26Q1", "2026Q2": "A-ER-26Q2", "2026Q3": "A-ER-26Q3"}
AK = ["revenue", "search", "youtube", "network", "google_ads", "subs", "services_rev", "cloud_rev", "other_bets_rev", "hedging",
      "services_oi", "cloud_oi", "other_bets_oi", "ala_oi", "op_income", "cost_of_rev", "rnd", "snm", "gna", "other_income",
      "net_income", "eps_diluted", "diluted_shares", "ocf", "capex_ppe", "fcf_reported", "buybacks", "dividends", "cash_ms",
      "headcount", "tac"]
A_ROWS = {
 #           rev     search  yt     net    gads   subs   serv   cloud  ob   hedge  s_oi   c_oi   ob_oi  ala    oi     cor    rnd    snm   gna   oie    ni      eps   shares ocf    capex  fcf    bb     div   cash    hc      tac
 "2024Q1": [80539, 46156, 8090, 7413, 61659, 8739, 70398, 9574, 495, 72, 27897, 900, -1020, -2305, 25472, 33712, 11903, 6426, 3026, 2843, 23662, 1.89, 12527, 28848, 12012, None, 15696, 0, None, 180895, 12946],
 "2024Q2": [84742, 48509, 8663, 7444, 64616, 9312, 73928, 10347, 365, 102, 29674, 1172, -1134, -2287, 27425, 35507, 11860, 6792, 3158, 126, 23619, 1.89, 12495, 26640, 13186, None, 15684, 2466, None, 179582, 13387],
 "2024Q3": [88268, 49385, 8921, 7548, 65854, 10656, 76510, 11353, 388, 17, 30856, 1947, -1116, -3166, 28521, 36474, 12447, 7227, 3599, 3185, 26301, 2.12, 12419, 30698, 13061, None, 15291, 2455, None, 181269, 13719],
 "2024Q4": [96469, 54034, 10473, 7954, 72461, 11633, 84094, 11955, 400, 20, 32836, 2093, -1174, -2783, 30972, 40613, 13116, 7363, 4405, 1271, 26536, 2.15, 12348, 39113, 14276, None, 15551, 2442, 95657, 183323, 14848],
 "2025Q1": [90234, 50702, 8927, 7256, 66885, 10379, 77264, 12260, 450, 260, 32682, 2177, -1226, -3027, 30606, 36361, 13556, 6172, 3539, 11183, 34540, 2.81, 12291, 36150, 17197, 18953, 15068, 2434, 95328, 185719, 13748],
 "2025Q2": [96428, 54190, 9796, 7354, 71340, 11203, 82543, 13624, 373, -112, 33063, 2826, -1246, -3372, 31271, 39039, 13808, 7101, 5209, 2662, 28196, 2.31, 12198, 27747, 22446, 5301, 13638, 2543, 95148, 187103, 14705],
 "2025Q3": [102346, 56567, 10261, 7354, 74182, 12870, 87052, 15157, 344, -207, 33527, 3594, -1426, -4467, 31228, 41369, 15151, 7205, 7393, 12759, 34979, 2.87, 12203, 48414, 23953, 24461, 11504, 2537, 98496, 190167, 14876],
 "2025Q4": [113828, 63073, 11383, 7828, 82284, 13578, 95862, 17664, 370, -68, 40132, 5313, -3617, -5894, 35934, 45766, 18572, 8215, 5341, 3183, 34455, 2.82, 12228, 52402, 27851, 24551, 5499, 2536, 126843, 190820, 16597],
 "2026Q1": [109896, 60399, 9883, 6971, 77253, 12384, 89637, 20028, 411, -180, 40589, 6598, -2100, -5391, 39696, 41271, 17032, 7606, 4291, 37716, 62578, 5.11, 12238, 45790, 35674, 10116, 0, 2542, 126840, 194668, 15228],
 "2026Q2": [119796, 63271, 11055, 7303, 81629, 12911, 94540, 24768, 382, 106, 39544, 8814, -1799, -5789, 40770, 45943, 18219, 8403, 6461, 97983, 112193, 9.11, 12309, 39069, 44924, -5855, 0, 2689, 242474, 198933, 16179],
 "2026Q3": [127577, 63350, 11207, 7455, 82012, 14290, 96302, 30709, 372, 194, 39157, 11121, -2047, -7655, 40576, 51419, 20640, 8804, 6138, -8221, 26468, 2.12, 12368, 42290, 51355, -9065, 0, 2936, 265098, 204757, 16366],
}
# Revenue backlog (remaining performance obligations, $B, primarily Google Cloud) and source
A_RPO = {"2025Q1": (92.4, "A-10Q-25Q1"), "2025Q2": (108.2, "A-10Q-25Q2"), "2025Q3": (157.7, "A-10Q-25Q3"),
         "2025Q4": (242.8, "A-10K-25"), "2026Q1": (467.6, "A-10Q-26Q1"), "2026Q2": (519.5, "A-10Q-26Q2"),
         "2026Q3": (567.7, "A-10Q-26Q3")}
# Paid clicks / CPC change, YoY %, Google Search & other properties (10-Q MD&A). Q4 not disclosed quarterly.
A_CLICKS = {"2025Q1": (2, 7, "A-10Q-25Q1"), "2025Q2": (4, 8, "A-10Q-25Q2-MDA"), "2025Q3": (7, 7, "A-10Q-25Q3"),
            "2025Q4": (None, None, None), "2026Q1": (13, 5, "A-10Q-26Q1"), "2026Q2": (None, None, None),
            "2026Q3": (8, 4, "S-PPC-26Q3")}
A_CLICKS_NOTE = {"2025Q4": "Not disclosed for Q4 alone; FY2025 10-K: paid clicks +6%, CPC +7%.",
                 "2026Q2": "Q2 2026 10-Q MD&A could not be retrieved in full from the IR PDF; left blank rather than estimated.",
                 "2026Q3": "Figure from the Q3 2026 10-Q as reported by PPC Land (primary MD&A text not retrievable).",
                 "2025Q2": "From 10-Q MD&A text via mirror of the filing."}

# ------------------------------------------------- Meta reported values
M_SRC = {"2024Q1": "M-ER-25Q1", "2024Q2": "M-ER-25Q2", "2024Q3": "M-ER-25Q3", "2024Q4": "M-ER-25Q4",
         "2025Q1": "M-ER-25Q1", "2025Q2": "M-ER-25Q2", "2025Q3": "M-ER-25Q3", "2025Q4": "M-ER-25Q4",
         "2026Q1": "M-ER-26Q1", "2026Q2": "M-ER-26Q2", "2026Q3": "M-ER-26Q3"}
MK = ["revenue", "ad_revenue", "other_rev", "foa_rev", "rl_rev", "foa_oi", "rl_oi", "op_income", "total_costs", "tax_provision",
      "net_income", "eps_diluted", "ocf", "capex_ppe", "fin_lease", "fcf_reported", "buybacks", "dividends", "cash_ms", "headcount",
      "dap", "arpp", "impressions_yoy", "price_per_ad_yoy"]
M_ROWS = {
 #          rev    ads    oth   foa    rl    foa_oi rl_oi  oi     costs  tax    ni     eps    ocf    ppe    fl    fcf    bb     div   cash   hc     dap   arpp   imp  ppa
 "2024Q1": [36455, 35635, 380, 36015, 440, 17664, -3846, 13818, 22637, 1814, 12369, 4.71, 19246, 6400, 315, 12531, 15008, 1273, None, None, None, None, None, None],
 "2024Q2": [39071, 38329, 389, 38718, 353, 19335, -4488, 14847, 24224, 1641, 13465, 5.16, 19370, 8173, 299, 10898, 6299, 1266, None, None, None, None, None, None],
 "2024Q3": [40589, 39885, 434, 40319, 270, 21778, -4428, 17350, 23239, 2134, 15688, 6.03, 24724, 8258, 944, 15522, 8818, 1263, None, None, 3.29, 12.29, 7, 11],
 "2024Q4": [48385, 46783, 519, 47302, 1083, 28332, -4967, 23365, 25020, 2715, 20838, 8.02, 27988, 14425, 411, 13152, 0, 1269, 77810, 74067, 3.35, 14.25, 6, 14],
 "2025Q1": [42314, 41392, 510, 41902, 412, 21765, -4210, 17555, 24759, 1738, 16644, 6.43, 24026, 12941, 751, 10334, 12754, 1329, 70230, 76834, 3.43, 12.36, 5, 10],
 "2025Q2": [47516, 46563, 583, 47146, 370, 24971, -4530, 20441, 27075, 2197, 18337, 7.14, 25561, 16538, 474, 8549, 10167, 1327, 47070, 75945, 3.48, 13.65, 11, 9],
 "2025Q3": [51242, 50082, 690, 50772, 470, 24967, -4432, 20535, 30707, 18954, 2709, 1.05, 29999, 18829, 545, 10625, 3327, 1330, 44450, 78450, 3.54, 14.46, 14, 10],
 "2025Q4": [59893, 58137, 801, 58938, 955, 30766, -6021, 24745, 35148, 2586, 22768, 8.88, 36214, 21383, 754, 14077, 0, 1338, 81590, 78865, 3.58, 16.56, 18, 6],
 "2026Q1": [56311, 55024, 885, 55909, 402, 26900, -4028, 22872, 33439, -5021, 26773, 10.44, 32226, 18997, 843, 12386, 0, 1346, 81180, 77986, 3.56, 15.66, 19, 12],
 "2026Q2": [60801, 59363, 1007, 60370, 431, 23394, -4619, 18775, 42026, 2908, 15848, 6.18, 31862, 30116, 962, 784, 0, 1353, 90260, 75472, 3.60, 16.86, 14, 12],
 "2026Q3": [64601, 63061, 1097, 64158, 443, 17117, -4129, 12988, 51613, 3141, 9860, 3.83, 32786, 33942, 964, -2120, 0, 1361, 82450, 66775, 3.64, 17.72, 10, 14],
}
# company-reported YoY growth where our own computation is impossible (prior-year level not retrieved) or rounding differs
M_REPORTED_YOY = {
 "headcount": {"2025Q1": 11, "2025Q2": 7, "2025Q3": 8},
 "dap": {"2025Q1": 6, "2025Q2": 6, "2025Q3": 8, "2025Q4": 7, "2026Q1": 4, "2026Q2": 3, "2026Q3": 3},
}

# ------------------------------------------------- one-off items (company-disclosed)
ONE_OFFS = [
 dict(co="GOOGL", q="2025Q1", kind="Non-operating gain", text="Net gain on equity securities of $9.8B (incl. $8.0B unrealized gain on a private-company stake) added $7.7B to net income and $0.62 to diluted EPS.", eps=0.62, ni=7700, src="A-ER-25Q1"),
 dict(co="GOOGL", q="2025Q2", kind="Legal / non-operating", text="Operating margin absorbed a charge for a settlement in principle of certain legal matters (not quantified in the release). Equity-securities gain of $1.3B added $0.95B to net income and $0.08 to EPS.", eps=0.08, ni=950, src="A-ER-25Q2"),
 dict(co="GOOGL", q="2025Q3", kind="Fine / non-operating", text="$3.5B European Commission fine accrued in G&A (Google Services); operating income ex-fine $34,685M (33.9% margin). Equity-securities gain of $10.7B added $8.3B to net income and $0.68 to EPS.", eps=0.68, ni=8300, src="A-ER-25Q3"),
 dict(co="GOOGL", q="2025Q4", kind="Compensation / non-operating", text="$2.1B Waymo employee-compensation charge (Other Bets, mostly R&D). Equity-securities gain of $2.3B added $1.8B to net income and $0.15 to EPS.", eps=0.15, ni=1800, src="A-ER-25Q4"),
 dict(co="GOOGL", q="2026Q1", kind="Non-operating gain", text="Equity-securities gain of $36.9B (mainly unrealized gains on non-marketable stakes) added $28.7B to net income and $2.35 to EPS.", eps=2.35, ni=28700, src="A-ER-26Q1"),
 dict(co="GOOGL", q="2026Q2", kind="Non-operating gain / financing", text="Equity-securities gain of $99.0B added $77.1B to net income and $6.26 to EPS. Alphabet also raised equity: $20.5B public common offering, $10.0B private placement to a Berkshire Hathaway affiliate and $19.0B of 6.25% mandatory convertible preferred (June 2026).", eps=6.26, ni=77100, src="A-ER-26Q2"),
 dict(co="GOOGL", q="2026Q3", kind="Non-operating loss / regulatory", text="Equity-securities loss of $8.7B cut net income by $6.7B and EPS by $0.55. 10-Q records a $1.0B charge for EU DMA fines; a $5.2B EU Android fine payment hit cash flow. Preferred dividends reduce net income available to common to $26,170M.", eps=-0.55, ni=-6700, src="A-ER-26Q3"),
 dict(co="META", q="2025Q3", kind="Tax", text="One-time non-cash income-tax charge of $15.93B (valuation allowance on U.S. federal deferred tax assets after the One Big Beautiful Bill Act). Ex-charge: net income $18.64B, diluted EPS $7.25, tax rate 14%.", eps_ex=7.25, ni=-15930, src="M-ER-25Q3"),
 dict(co="META", q="2026Q1", kind="Tax", text="$8.03B income-tax benefit tied to U.S. Treasury Notice 2026-7 (partial offset to the Q3 2025 charge); EPS ex-benefit $3.13 lower.", eps_ex=7.31, ni=8030, src="M-ER-26Q1"),
 dict(co="META", q="2026Q2", kind="Legal / restructuring", text="$2.40B of legal-proceedings charges and $1.18B of severance tied to the May 2026 reduction (about 8,000 employees). EPS effect not quantified by the company.", eps_ex=None, ni=None, src="M-ER-26Q2"),
 dict(co="META", q="2026Q3", kind="Legal", text="$9.89B G&A charge for the August 2026 agreement with 52 state attorneys general on youth-related litigation (payments up to about $18.59B). Ex-charge: operating income $22.88B, diluted EPS $7.40.", eps_ex=7.40, ni=None, src="M-ER-26Q3"),
]

# ------------------------------------------------- guidance history
GUIDANCE = [
 # Alphabet capex (no revenue guidance is given)
 dict(co="GOOGL", issued="2025-02-04", at="Q4 2024 release", target="FY2025", metric="Capex", lo=75000, hi=75000, approx=True, change="Initial", src="A-ER-24Q4"),
 dict(co="GOOGL", issued="2025-04-24", at="Q1 2025 call", target="FY2025", metric="Capex", lo=75000, hi=75000, approx=True, change="Reaffirmed", src="S-DIGI-25Q1"),
 dict(co="GOOGL", issued="2025-07-23", at="Q2 2025 release", target="FY2025", metric="Capex", lo=85000, hi=85000, approx=True, change="Raised", src="A-ER-25Q2"),
 dict(co="GOOGL", issued="2025-10-29", at="Q3 2025 release", target="FY2025", metric="Capex", lo=91000, hi=93000, approx=False, change="Raised", src="A-ER-25Q3"),
 dict(co="GOOGL", issued="2026-02-04", at="Q4 2025 release", target="FY2026", metric="Capex", lo=175000, hi=185000, approx=False, change="Initial", src="A-ER-25Q4"),
 dict(co="GOOGL", issued="2026-04-29", at="Q1 2026 call", target="FY2026", metric="Capex", lo=180000, hi=190000, approx=False, change="Raised", src="A-CALL-26Q1"),
 dict(co="GOOGL", issued="2026-07-22", at="Q2 2026 call", target="FY2026", metric="Capex", lo=195000, hi=205000, approx=False, change="Raised", src="S-WMEDIA-26Q2"),
 dict(co="GOOGL", issued="2026-10-28", at="Q3 2026 call", target="FY2026", metric="Capex", lo=195000, hi=205000, approx=False, change="Maintained", src="S-INV-26Q3"),
 # Meta next-quarter revenue
 dict(co="META", issued="2025-01-29", at="Q4 2024 release", target="2025Q1", metric="Revenue", lo=39500, hi=41800, change="Initial", src="M-ER-24Q4"),
 dict(co="META", issued="2025-04-30", at="Q1 2025 release", target="2025Q2", metric="Revenue", lo=42500, hi=45500, change="Initial", src="M-ER-25Q1"),
 dict(co="META", issued="2025-07-30", at="Q2 2025 release", target="2025Q3", metric="Revenue", lo=47500, hi=50500, change="Initial", src="M-ER-25Q2"),
 dict(co="META", issued="2025-10-29", at="Q3 2025 release", target="2025Q4", metric="Revenue", lo=56000, hi=59000, change="Initial", src="M-ER-25Q3"),
 dict(co="META", issued="2026-01-28", at="Q4 2025 release", target="2026Q1", metric="Revenue", lo=53500, hi=56500, change="Initial", src="M-ER-25Q4"),
 dict(co="META", issued="2026-04-29", at="Q1 2026 release", target="2026Q2", metric="Revenue", lo=58000, hi=61000, change="Initial", src="M-ER-26Q1"),
 dict(co="META", issued="2026-07-29", at="Q2 2026 release", target="2026Q3", metric="Revenue", lo=61000, hi=64000, change="Initial", src="M-ER-26Q2"),
 dict(co="META", issued="2026-10-21", at="Q3 2026 release", target="2026Q4", metric="Revenue", lo=73000, hi=76000, change="Initial", src="M-ER-26Q3"),
 # Meta full-year total expenses
 dict(co="META", issued="2025-01-29", at="Q4 2024 release", target="FY2025", metric="Total expenses", lo=114000, hi=119000, change="Initial", src="M-ER-24Q4"),
 dict(co="META", issued="2025-04-30", at="Q1 2025 release", target="FY2025", metric="Total expenses", lo=113000, hi=118000, change="Lowered", src="M-ER-25Q1"),
 dict(co="META", issued="2025-07-30", at="Q2 2025 release", target="FY2025", metric="Total expenses", lo=114000, hi=118000, change="Narrowed", src="M-ER-25Q2"),
 dict(co="META", issued="2025-10-29", at="Q3 2025 release", target="FY2025", metric="Total expenses", lo=116000, hi=118000, change="Narrowed", src="M-ER-25Q3"),
 dict(co="META", issued="2026-01-28", at="Q4 2025 release", target="FY2026", metric="Total expenses", lo=162000, hi=169000, change="Initial", src="M-ER-25Q4"),
 dict(co="META", issued="2026-04-29", at="Q1 2026 release", target="FY2026", metric="Total expenses", lo=162000, hi=169000, change="Maintained", src="M-ER-26Q1"),
 dict(co="META", issued="2026-07-29", at="Q2 2026 release", target="FY2026", metric="Total expenses", lo=165000, hi=169000, change="Narrowed", src="M-ER-26Q2"),
 dict(co="META", issued="2026-10-21", at="Q3 2026 release", target="FY2026", metric="Total expenses", lo=175000, hi=179000, change="Raised (incl. $9.9B legal charge)", src="M-ER-26Q3"),
 # Meta capex (incl. principal payments on finance leases)
 dict(co="META", issued="2025-01-29", at="Q4 2024 release", target="FY2025", metric="Capex", lo=60000, hi=65000, change="Initial", src="M-ER-24Q4"),
 dict(co="META", issued="2025-04-30", at="Q1 2025 release", target="FY2025", metric="Capex", lo=64000, hi=72000, change="Raised", src="M-ER-25Q1"),
 dict(co="META", issued="2025-07-30", at="Q2 2025 release", target="FY2025", metric="Capex", lo=66000, hi=72000, change="Narrowed", src="M-ER-25Q2"),
 dict(co="META", issued="2025-10-29", at="Q3 2025 release", target="FY2025", metric="Capex", lo=70000, hi=72000, change="Raised low end", src="M-ER-25Q3"),
 dict(co="META", issued="2026-01-28", at="Q4 2025 release", target="FY2026", metric="Capex", lo=115000, hi=135000, change="Initial", src="M-ER-25Q4"),
 dict(co="META", issued="2026-04-29", at="Q1 2026 release", target="FY2026", metric="Capex", lo=125000, hi=145000, change="Raised", src="M-ER-26Q1"),
 dict(co="META", issued="2026-07-29", at="Q2 2026 release", target="FY2026", metric="Capex", lo=130000, hi=145000, change="Narrowed (low end up)", src="M-ER-26Q2"),
 dict(co="META", issued="2026-10-21", at="Q3 2026 release", target="FY2026", metric="Capex", lo=135000, hi=145000, change="Narrowed (low end up)", src="M-ER-26Q3"),
]

# ------------------------------------------------- management commentary (AI & infrastructure)
COMMENTARY = [
 dict(co="GOOGL", q="2025Q1", theme="Infrastructure", text="Reaffirmed ~$75B 2025 capex plan alongside Q1 results.", src="S-DIGI-25Q1"),
 dict(co="GOOGL", q="2025Q2", theme="Infrastructure", text="Pichai: \"we are increasing our investment in capital expenditures in 2025 to approximately $85 billion.\"", src="A-ER-25Q2"),
 dict(co="GOOGL", q="2025Q3", theme="Infrastructure", text="2025 capex range lifted to $91-93B; first $100B revenue quarter. Revenue backlog reached $157.7B (10-Q).", src="A-ER-25Q3"),
 dict(co="GOOGL", q="2025Q4", theme="Infrastructure", text="Pichai: 2026 capex \"anticipated to be in the range of $175 to $185 billion\" - roughly double 2025's $91.4B.", src="A-ER-25Q4"),
 dict(co="GOOGL", q="2026Q1", theme="AI", text="First-party models process more than 16B tokens per minute; \"we are compute constrained in the near term\"; TPUs to be delivered into select customers' own data centers.", src="A-CALL-26Q1"),
 dict(co="GOOGL", q="2026Q1", theme="Infrastructure", text="Ashkenazi: 2026 capex range updated to $180-190B; \"we expect our 2027 CapEx to significantly increase compared to 2026.\"", src="A-CALL-26Q1"),
 dict(co="GOOGL", q="2026Q2", theme="Infrastructure", text="2026 capex raised to $195-205B to meet demand; Cloud backlog +$50B QoQ to ~$514B; more third-party capacity in Q3 to pressure Cloud margins modestly.", src="S-WMEDIA-26Q2"),
 dict(co="GOOGL", q="2026Q2", theme="Capital", text="No buybacks in 1H26; raised ~$49.5B of common and mandatory convertible preferred equity plus multi-currency senior notes to fund AI infrastructure (10-Q Notes 6 and 11).", src="A-10Q-26Q2"),
 dict(co="GOOGL", q="2026Q3", theme="AI", text="Gemini app reached 1B users; first-party APIs ~32B tokens/min (+40% QoQ); TPU system sales a \"meaningful contributor\" to $30.7B Cloud revenue.", src="S-INV-26Q3"),
 dict(co="GOOGL", q="2026Q3", theme="Infrastructure", text="2026 capex held at $195-205B; 2027 capex expected to \"increase significantly\". Backlog $567.7B, just over 55% recognizable within 24 months (10-Q).", src="S-INV-26Q3"),
 dict(co="META", q="2025Q1", theme="AI", text="Meta AI at almost 1B monthly actives; 2025 capex raised to $64-72B for data centers and servers.", src="M-ER-25Q1"),
 dict(co="META", q="2025Q2", theme="AI", text="Zuckerberg: \"I'm excited to build personal superintelligence for everyone in the world.\" 2026 expense growth to exceed 2025's rate; another year of significant capex dollar growth.", src="M-ER-25Q2"),
 dict(co="META", q="2025Q3", theme="Infrastructure", text="Meta Superintelligence Labs \"off to a great start\"; 2026 capex dollar growth \"notably larger\" than 2025; expense growth significantly faster, led by infrastructure.", src="M-ER-25Q3"),
 dict(co="META", q="2025Q4", theme="Infrastructure", text="FY2026 capex guided to $115-135B (vs $72.2B in 2025) and expenses to $162-169B; 2026 operating income still expected above 2025.", src="M-ER-25Q4"),
 dict(co="META", q="2026Q1", theme="Infrastructure", text="2026 capex raised to $125-145B; release flags youth-related trials that \"may ultimately result in a material loss.\"", src="M-ER-26Q1"),
 dict(co="META", q="2026Q2", theme="Capital", text="May 2026 headcount reduction (~8,000 roles, $1.18B severance); buybacks paused since Q4 2025; long-term debt rose to $83.66B.", src="M-ER-26Q2"),
 dict(co="META", q="2026Q3", theme="AI", text="Muse personal agents set up by 10M+ people in US/Canada; Muse cost efficiency to improve \"more than 10x in the next year\"; GEM ranking lifted app-ad conversions 9.6%.", src="M-CALL-26Q3"),
 dict(co="META", q="2026Q3", theme="Infrastructure", text="2026 capex narrowed to $135-145B; no 2027 capex or expense outlook yet (\"still developing our budget and capacity plans\"); infrastructure costs up on third-party cloud, depreciation and data-center opex.", src="M-CALL-26Q3"),
]

# ------------------------------------------------- catalysts & risks
RISKS = [
 dict(co="GOOGL", cat="Regulatory", title="U.S. Search remedies on appeal", text="Final judgment entered Dec 2025; Google appealed (Jan 2026) and DOJ/states cross-appealed (Feb 2026).", status="Pending appeal", src="A-10Q-26Q3"),
 dict(co="GOOGL", cat="Regulatory", title="U.S. ad tech remedies", text="Sep 2026: court denied DOJ's structural divestiture request and ordered behavioral remedies; Google plans to appeal the liability ruling.", status="Behavioral remedies", src="A-10Q-26Q3"),
 dict(co="GOOGL", cat="Regulatory", title="EU fines and DMA", text="Android fine (EUR 4.1B) paid ($5.2B) Jul 2026; EUR 3.0B ad tech fine under appeal; Jul 2026 DMA fines of EUR 430M (Play) and EUR 460M (Search), $1.0B charge in Q3 2026.", status="Mixed", src="A-10Q-26Q3"),
 dict(co="GOOGL", cat="Execution", title="AI Mode monetization", text="Management cited lower monetization of AI Mode queries and FX as Search growth slowed to 12% in Q3 2026 from 17% in Q2.", status="Watch", src="S-INV-26Q3"),
 dict(co="GOOGL", cat="Financial", title="Negative free cash flow and dilution", text="FCF of -$5.9B (Q2 2026) and -$9.1B (Q3 2026); buybacks halted since Q1 2026 while common, preferred and ATM equity was issued.", status="Active", src="A-ER-26Q3"),
 dict(co="GOOGL", cat="Catalyst", title="Cloud backlog conversion and TPU sales", text="Backlog of $567.7B (up from $92.4B at Q1 2025); TPU system sales expected to ramp more meaningfully in 2027.", status="Upside", src="A-10Q-26Q3"),
 dict(co="META", cat="Regulatory", title="Youth-safety litigation", text="Aug 2026 agreement with 52 state AGs (payments up to ~$18.59B, $9.89B charged in Q3); further U.S. youth trials scheduled in coming months.", status="Active", src="M-ER-26Q3"),
 dict(co="META", cat="Regulatory", title="EU DMA ad model", text="EC found the subscription-for-no-ads model non-compliant (Apr 2025); Meta warned changes could significantly affect European revenue.", status="Ongoing", src="M-ER-25Q1"),
 dict(co="META", cat="Regulatory", title="FTC monopolization case", text="District court ruled for Meta (Nov 2025); FTC said in Jan 2026 it would appeal.", status="On appeal", src="S-BBG-FTC"),
 dict(co="META", cat="Financial", title="Expense and capex step-up", text="FY2026 expenses guided to $175-179B (vs $117.7B in 2025) and capex to $135-145B; Q3 2026 FCF was -$2.1B.", status="Active", src="M-ER-26Q3"),
 dict(co="META", cat="Execution", title="User growth deceleration", text="DAP growth slowed to 3% YoY (3.64B); Q1 2026 dip attributed to internet disruptions in Iran and Russia's WhatsApp restriction.", status="Watch", src="M-PRES-26Q3"),
 dict(co="META", cat="Catalyst", title="Muse agents and Reality Labs path", text="Muse rolling to glasses; Reality Labs losses guided to $18-19B in 2026 and about $15B in 2027. Two-for-one-effect Class C stock dividend after Jan 19, 2027 charter amendment.", status="Upside", src="M-CALL-26Q3"),
]

# ------------------------------------------------- analyst estimates (third-party, labelled separately)
ESTIMATES = [
 dict(co="GOOGL", q="2026Q3", metric="Revenue", consensus=127220, actual=127577, unit="$M", src="S-INV-26Q3", note="Consensus as cited by Investing.com on the day of the release."),
 dict(co="GOOGL", q="2026Q3", metric="Diluted EPS", consensus=3.02, actual=2.12, unit="$", src="S-INV-26Q3", note="Miss driven by the $8.7B equity-securities loss in other income."),
 dict(co="META", q="2026Q3", metric="Revenue", consensus=63370, actual=64601, unit="$M", src="S-NB-26Q3", note="LSEG consensus as cited by NewsBytes."),
]

# ------------------------------------------------- regional data
# Meta, by USER geography (where the ad is seen), $M. Q3'23-Q3'25 from M-PRES-25Q3, Q3'24-Q3'26 from M-PRES-26Q3 (overlap matches).
M_AD_GEO = {  # US & Canada, Europe, Asia-Pacific, Rest of World
 "2023Q3": (14956, 7721, 6829, 4137), "2023Q4": (17784, 9159, 7316, 4447),
 "2024Q1": (15451, 8327, 7338, 4519), "2024Q2": (16593, 9135, 7721, 4880), "2024Q3": (17389, 9358, 8050, 5088), "2024Q4": (20982, 11154, 9012, 5635),
 "2025Q1": (18259, 9527, 8224, 5382), "2025Q2": (20045, 11366, 9148, 6004), "2025Q3": (21331, 12072, 10020, 6659), "2025Q4": (25643, 14198, 10893, 7403),
 "2026Q1": (23667, 13296, 10631, 7430), "2026Q2": (26337, 14085, 10847, 8094), "2026Q3": (28438, 14234, 11531, 8858)}
M_REV_GEO = {
 "2024Q1": (15824, 8483, 7481, 4667), "2024Q2": (16847, 9300, 7888, 5036), "2024Q3": (17609, 9492, 8220, 5268), "2024Q4": (21783, 11503, 9245, 5854),
 "2025Q1": (18605, 9680, 8439, 5590), "2025Q2": (20371, 11532, 9366, 6247), "2025Q3": (21751, 12268, 10272, 6951), "2025Q4": (26472, 14480, 11182, 7759),
 "2026Q1": (24079, 13500, 10914, 7818), "2026Q2": (26816, 14296, 11164, 8525), "2026Q3": (28905, 14462, 11890, 9344)}
# Meta ad impressions / average price per ad, YoY %, by user geography: (WW, US&C, EU, APAC, RoW) as (impressions, price)
M_IMP_PPA = {
 "2024Q3": ((7, 11), (7, 9), (5, 16), (9, 8), (5, 17)),
 "2024Q4": ((6, 14), (6, 12), (5, 16), (10, 12), (3, 23)),
 "2025Q1": ((5, 10), (4, 14), (5, 9), (9, 3), (1, 17)),
 "2025Q2": ((11, 9), (9, 11), (6, 17), (16, 2), (7, 15)),
 "2025Q3": ((14, 10), (8, 13), (9, 19), (23, 1), (9, 20)),
 "2025Q4": ((18, 6), (13, 9), (13, 12), (24, -2), (14, 15)),
 "2026Q1": ((19, 12), (13, 14), (17, 19), (23, 5), (17, 18)),
 "2026Q2": ((14, 12), (9, 20), (13, 10), (17, 1), (12, 21)),
 "2026Q3": ((10, 14), (8, 23), (8, 10), (14, 1), (8, 24))}
# Printed value sets on Meta's slides 12-13 (deck text order), used to verify the quarter mapping exactly
DECK_25Q3 = dict(qs=["2024Q3", "2024Q4", "2025Q1", "2025Q2", "2025Q3"],
  imp=[9,7,9,8,14,11,6,5,6,4,7,9,5,5,5,6,3,5,16,9,10,9,23,7,1], ppa=[20,11,13,10,11,10,9,14,12,14,9,19,17,9,16,16,23,17,3,2,12,8,1,15,17])
DECK_26Q3 = dict(qs=["2025Q3", "2025Q4", "2026Q1", "2026Q2", "2026Q3"],
  imp=[8,14,9,8,10,14,18,19,13,13,8,8,13,17,13,9,14,9,17,23,24,23,14,12,17], ppa=[24,10,20,23,12,12,14,6,9,13,14,10,10,19,12,19,15,20,1,5,-2,1,1,21,18])
M_IMP_SRC = {"2025Q1": "M-PRES-25Q3", "2025Q2": "M-PRES-25Q3", "2025Q3": "M-PRES-26Q3", "2025Q4": "M-PRES-26Q3", "2026Q1": "M-PRES-26Q3", "2026Q2": "M-PRES-26Q3", "2026Q3": "M-PRES-26Q3", "2024Q3": "M-PRES-25Q3", "2024Q4": "M-PRES-25Q3"}
# Alphabet, by CUSTOMER billing address, $M: United States, EMEA, APAC, Other Americas (Canada + LatAm), hedging
A_GEO = {
 "2024Q1": (38737, 23788, 13289, 4653, 72, "A-10Q-25Q1"), "2024Q2": (41196, 24683, 13823, 4938, 102, "A-10Q-25Q2"),
 "2024Q3": (43139, 25472, 14547, 5093, 17, "A-10Q-25Q3"), "2024Q4": (47375, 28184, 15156, 5734, 20, "A-FY-GEO"),
 "2025Q1": (43964, 25923, 14854, 5233, 260, "A-10Q-25Q1"), "2025Q2": (46063, 28262, 16480, 5735, -112, "A-10Q-25Q2"),
 "2025Q3": (48758, 29911, 17819, 6065, -207, "A-10Q-25Q3"), "2025Q4": (55444, 33056, 18527, 6869, -67, "A-FY-GEO"),
 "2026Q1": (53975, 31468, 18288, 6345, -180, "A-10Q-26Q1"), "2026Q2": (60846, 32501, 19317, 7026, 106, "A-10Q-26Q2"),
 "2026Q3": (67681, 32695, 19906, 7101, 194, "A-10Q-26Q3")}
A_GEO_NOTE = {"2024Q4": "Derived: FY2024 (10-K) minus nine months 2024 (Q3 2025 10-Q).", "2025Q4": "Derived: FY2025 (10-K) minus nine months 2025 (Q3 2025 10-Q); sums to $113,829M vs $113,828M in the release ($1M rounding)."}
A_GEO_PERIODS = {"9M2024": (123072, 73943, 41659, 14684, 191, 253549), "9M2025": (138785, 84096, 49153, 17033, -60, 289007),
                 "6M2025": (90027, 54185, 31334, 10968, 148, 186662), "6M2026": (114821, 63969, 37605, 13371, -74, 229692),
                 "9M2026": (182502, 96664, 57511, 20472, 120, 357269)}
A_FY_GEO = {"FY2024": (170447, 102127, 56815, 20418, 211, 350018), "FY2025": (194229, 117152, 67680, 23902, -127, 402836)}
M_FY_GEO = {"FY2023": (52888, 31210, 36154, 14650, 134902), "FY2024": (63207, 38361, 45009, 17924, 164501), "FY2025": (78866, 46569, 53817, 21714, 200966)}
# APAC reported vs constant-currency growth (10-Q MD&A), where retrievable
A_APAC_CC = {"2025Q1": dict(reported=12, cc=15, fx=-3, src="A-10Q-25Q1"), "2025Q2": dict(reported=19, cc=18, fx=1, src="A-10Q-25Q2-MDA")}
# Google Network impressions / cost-per-impression YoY % (10-Q MD&A)
A_NETWORK = {"2025Q1": (-5, 4, "A-10Q-25Q1"), "2025Q2": (-6, 6, "A-10Q-25Q2-MDA"), "2025Q3": (-5, 6, "A-10Q-25Q3"), "2025Q4": (None, None, None),
             "2026Q1": (-9, 6, "A-10Q-26Q1"), "2026Q2": (None, None, None), "2026Q3": (-14, 14, "S-PPC-26Q3")}

APAC_COMMENTARY = [
 dict(co="META", q="2025Q1", theme="APAC advertisers", text="Susan Li: \"we have seen some reduced spend in the U.S. from Asia-based ecommerce exporters\" ahead of the end of the U.S. de minimis exemption; some spend was redirected to other markets, but \"overall spend for those advertisers is below the levels prior to April.\" Asia-Pacific ad revenue (user geography) grew 12%, the slowest region.", src="M-CALL-25Q1"),
 dict(co="GOOGL", q="2025Q1", theme="APAC FX", text="APAC revenue grew 12% reported and 15% in constant currency; 10-Q: \"APAC revenue growth was unfavorably affected by changes in foreign currency exchange rates.\"", src="A-10Q-25Q1"),
 dict(co="GOOGL", q="2025Q2", theme="APAC FX", text="APAC revenue grew 19% reported and 18% in constant currency; APAC share of revenue rose to 17% from 16%.", src="A-10Q-25Q2-MDA"),
 dict(co="META", q="2025Q3", theme="APAC pricing", text="Asia-Pacific impressions +23% with price per ad +1%: the region added volume at low prices while US & Canada (+13%) and Europe (+19%) drove price.", src="M-PRES-26Q3"),
 dict(co="META", q="2025Q4", theme="APAC pricing", text="Asia-Pacific price per ad fell 2% YoY, the only regional decline in the period, while impressions grew 24%.", src="M-PRES-26Q3"),
 dict(co="META", q="2026Q3", theme="APAC pricing", text="Susan Li: price growth \"partially offset by strong impression growth, particularly from lower-monetizing surfaces and regions.\" Asia-Pacific: impressions +14%, price per ad +1%, ad revenue +15% vs +26% worldwide.", src="M-CALL-26Q3"),
 dict(co="GOOGL", q="2026Q3", theme="APAC growth", text="APAC revenue (customer billing address) grew 11.7% to $19.9B while the United States grew 38.8%; APAC fell to 15.6% of revenue from 17.4% a year earlier.", src="A-10Q-26Q3"),
]
APAC_RISKS = [
 dict(co="GOOGL", cat="Regulatory", title="Japan: JFTC cease-and-desist order", text="Apr 15, 2025 order under the Antimonopoly Act ends MADA/RSA conditions that required Google Search and Chrome preinstallation on Android; independent monitor for five years.", status="In force", src="R-JFTC-250415"),
 dict(co="GOOGL", cat="Regulatory", title="Japan: Mobile Software Competition Act", text="Google designated for OS, app store, browser and search engine (Mar 2025); full enforcement from Dec 18, 2025, with prohibited conduct and obligations for designated providers.", status="In force", src="R-JFTC-250910"),
 dict(co="BOTH", cat="Regulatory", title="Australia: under-16 social media minimum age", text="From Dec 10, 2025, age-restricted platforms include Facebook, Instagram, Threads and YouTube; corporate penalties up to 150,000 penalty units (about A$49.5M).", status="In force", src="S-AU-U16"),
 dict(co="META", cat="Regulatory", title="India: WhatsApp data-sharing case", text="Nov 2025: NCLAT set aside CCI's five-year ban on WhatsApp sharing user data with Meta for advertising but upheld the Rs 213.14 crore penalty.", status="Penalty upheld", src="S-NCLAT"),
 dict(co="META", cat="Execution", title="APAC price per ad near flat", text="Asia-Pacific price per ad has grown 5% or less in every quarter since Q1 2025 (Q4 2025: -2%), versus +23% in US & Canada in Q3 2026; APAC growth depends on impression volume.", status="Watch", src="M-PRES-26Q3"),
 dict(co="META", cat="Competitive", title="APAC-based exporters as advertisers", text="On a customer-address basis Asia-Pacific was $53.8B (27%) of Meta's 2025 revenue versus $39.3B (20%) by user location: a net $14.6B more is billed to APAC-based advertisers than is earned from APAC users, reflecting APAC advertisers reaching users elsewhere, exposed to trade policy (de minimis, tariffs).", status="Watch", src="M-FY-GEO"),
 dict(co="GOOGL", cat="Execution", title="APAC slowing inside Alphabet's mix", text="APAC growth slowed to 11.7% in Q3 2026 from 23.1% in Q1 2026 while U.S. revenue (including TPU-driven Cloud) accelerated; APAC's 15.6% share of revenue is the lowest since at least Q1 2024.", status="Watch", src="A-10Q-26Q3"),
]

# =================================================================== build
def build_raw():
    rows = {"GOOGL": {}, "META": {}}
    for q, vals in A_ROWS.items():
        d = dict(zip(AK, vals))
        d["ad_revenue"] = d["google_ads"]
        d["capex_reported"] = d["capex_ppe"]
        d["fin_lease"] = None
        d["fcf_lfl"] = d["ocf"] - d["capex_ppe"]
        if d["fcf_reported"] is None:  # 2024 quarters: release shows only current-quarter FCF; use company definition
            d["fcf_reported"] = d["fcf_lfl"]
            d["_fcf_computed"] = True
        rpo = A_RPO.get(q); d["rpo"] = rpo[0] if rpo else None
        ck = A_CLICKS.get(q, (None, None, None)); d["paid_clicks_yoy"], d["cpc_yoy"] = ck[0], ck[1]
        d["tac_rate"] = d["tac"] / d["google_ads"] if d["tac"] else None
        d["cloud_margin"] = d["cloud_oi"] / d["cloud_rev"]
        d["shareholder_returns"] = d["buybacks"] + d["dividends"]
        g = A_GEO.get(q)
        if g: d["geo_us"], d["geo_emea"], d["geo_apac"], d["geo_oa"], d["geo_hedge"] = g[:5]
        nw = A_NETWORK.get(q, (None, None, None)); d["network_imp_yoy"], d["network_cpi_yoy"] = nw[0], nw[1]
        cc = A_APAC_CC.get(q); d["apac_cc_yoy"] = cc["cc"] if cc else None
        d["ads_share"] = d["google_ads"] / d["revenue"]
        rows["GOOGL"][q] = d
    for q, vals in M_ROWS.items():
        d = dict(zip(MK, vals))
        d["capex_reported"] = d["capex_ppe"] + d["fin_lease"]
        d["fcf_lfl"] = d["ocf"] - d["capex_ppe"]
        d["rl_margin"] = d["rl_oi"] / d["rl_rev"]
        a = M_AD_GEO.get(q); r = M_REV_GEO.get(q); ip = M_IMP_PPA.get(q)
        if a: d["ad_us"], d["ad_eu"], d["ad_ap"], d["ad_rw"] = a
        if r: d["rev_us"], d["rev_eu"], d["rev_ap"], d["rev_rw"] = r
        if ip:
            for k, (im, pp) in zip(["ww", "us", "eu", "ap", "rw"], ip): d[f"imp_{k}"], d[f"ppa_{k}"] = im, pp
        d["shareholder_returns"] = d["buybacks"] + d["dividends"]
        rows["META"][q] = d
    return rows

def checks(rows):
    out = []
    def chk(name, co, q, lhs, rhs, tol=0.5):
        ok = lhs is not None and rhs is not None and abs(lhs - rhs) <= tol
        out.append(dict(check=name, co=co, q=q, computed=lhs, reported=rhs, ok=ok))
    for q, d in rows["GOOGL"].items():
        chk("Search + YouTube + Network = Google advertising", "GOOGL", q, d["search"] + d["youtube"] + d["network"], d["google_ads"])
        chk("Google advertising + subscriptions = Google Services", "GOOGL", q, d["google_ads"] + d["subs"], d["services_rev"])
        chk("Services + Cloud + Other Bets + hedging = total revenue", "GOOGL", q, d["services_rev"] + d["cloud_rev"] + d["other_bets_rev"] + d["hedging"], d["revenue"])
        chk("Segment operating income sums to total", "GOOGL", q, d["services_oi"] + d["cloud_oi"] + d["other_bets_oi"] + d["ala_oi"], d["op_income"])
        chk("Revenue - costs and expenses = operating income", "GOOGL", q, d["revenue"] - (d["cost_of_rev"] + d["rnd"] + d["snm"] + d["gna"]), d["op_income"])
        if not d.get("_fcf_computed"):
            chk("OCF - purchases of P&E = reported FCF", "GOOGL", q, d["ocf"] - d["capex_ppe"], d["fcf_reported"])
    for q, d in rows["META"].items():
        chk("Advertising + other = Family of Apps revenue", "META", q, d["ad_revenue"] + d["other_rev"], d["foa_rev"])
        chk("FoA + Reality Labs revenue = total revenue", "META", q, d["foa_rev"] + d["rl_rev"], d["revenue"])
        chk("FoA + Reality Labs operating income = total", "META", q, d["foa_oi"] + d["rl_oi"], d["op_income"])
        chk("Revenue - costs and expenses = operating income", "META", q, d["revenue"] - d["total_costs"], d["op_income"])
        chk("OCF - P&E - finance-lease principal = reported FCF", "META", q, d["ocf"] - d["capex_ppe"] - d["fin_lease"], d["fcf_reported"])
    # ARPP = FoA revenue / average of DAP at start and end of quarter (Meta definition)
    mq = [q for q in QUARTERS if rows["META"][q]["arpp"] is not None]
    for i, q in enumerate(QUARTERS):
        d = rows["META"][q]
        if d["arpp"] is None or i == 0: continue
        prev = rows["META"][QUARTERS[i - 1]]["dap"]
        if prev is None: continue
        calc = d["foa_rev"] / ((prev + d["dap"]) / 2) / 1000
        chk("ARPP = FoA revenue / avg(start, end DAP)", "META", q, round(calc, 2), d["arpp"], tol=0.03)
    # TAC rate vs 10-Q statements
    for q, stated in {"2024Q1": 21.0, "2025Q1": 20.6, "2024Q2": 20.7, "2025Q2": 20.6, "2026Q1": 19.7, "2025Q3": 20.1, "2026Q3": 20.0}.items():
        d = rows["GOOGL"][q]
        chk("TAC / Google advertising = TAC rate stated in 10-Q (%)", "GOOGL", q, round(100 * d["tac"] / d["google_ads"], 1), stated, tol=0.06)
    # Full-year ties
    fy = sum(rows["GOOGL"][q]["revenue"] for q in ["2025Q1", "2025Q2", "2025Q3", "2025Q4"])
    chk("Sum of 2025 quarters = FY2025 revenue ($402,836M)", "GOOGL", "FY2025", fy, 402836)
    fyc = sum(rows["GOOGL"][q]["capex_ppe"] for q in ["2025Q1", "2025Q2", "2025Q3", "2025Q4"])
    chk("FY2025 capex within $91-93B guidance (midpoint 92,000, tol 1,000)", "GOOGL", "FY2025", fyc, 92000, tol=1000)
    fym = sum(rows["META"][q]["revenue"] for q in ["2025Q1", "2025Q2", "2025Q3", "2025Q4"])
    chk("Sum of 2025 quarters = FY2025 revenue ($200,966M; +/-$1M rounding)", "META", "FY2025", fym, 200966, tol=1)
    fymc = sum(rows["META"][q]["capex_reported"] for q in ["2025Q1", "2025Q2", "2025Q3", "2025Q4"])
    chk("Sum of 2025 capex incl. finance leases = $72.22B reported", "META", "FY2025", fymc, 72220, tol=6)
    fyb = sum(rows["META"][q]["buybacks"] for q in ["2025Q1", "2025Q2", "2025Q3", "2025Q4"])
    chk("Sum of 2025 buybacks (cash flow) = FY2025 $26,248M (cash flow statement)", "META", "FY2025", fyb, 26248)
    fyf = sum(rows["META"][q]["fcf_reported"] for q in ["2025Q1", "2025Q2", "2025Q3", "2025Q4"])
    chk("Sum of 2025 FCF = FY2025 $43,585M reported", "META", "FY2025", fyf, 43585)
    fyni = sum(rows["META"][q]["net_income"] for q in ["2025Q1", "2025Q2", "2025Q3", "2025Q4"])
    chk("Sum of 2025 net income = FY2025 $60,458M", "META", "FY2025", fyni, 60458)
    fyna = sum(rows["GOOGL"][q]["net_income"] for q in ["2025Q1", "2025Q2", "2025Q3", "2025Q4"])
    chk("Sum of 2025 net income = FY2025 $132,170M", "GOOGL", "FY2025", fyna, 132170)
    # Reported YoY growth rates (rounded %) vs our computation
    for co, q, key, rep in [("GOOGL", "2026Q3", "revenue", 25), ("META", "2026Q3", "revenue", 26), ("META", "2025Q1", "revenue", 16),
                            ("META", "2025Q2", "revenue", 22), ("META", "2025Q3", "revenue", 26), ("META", "2025Q4", "revenue", 24),
                            ("META", "2026Q1", "revenue", 33), ("META", "2026Q2", "revenue", 28), ("META", "2026Q3", "op_income", -37),
                            ("META", "2025Q4", "headcount", 6), ("META", "2026Q1", "headcount", 1), ("META", "2026Q2", "headcount", -1),
                            ("META", "2026Q3", "headcount", -15), ("META", "2026Q2", "op_income", -8)]:
        i = QUARTERS.index(q); cur = rows[co][q][key]; prev = rows[co][QUARTERS[i - 4]][key]
        chk(f"Computed YoY {key} rounds to company-reported %", co, q, round(100 * (cur / prev - 1)), rep, tol=0)
    # Volume x price reconciles with revenue growth (rounded YoY inputs, tolerance 1.5pt)
    for q in DISPLAY:
        i = QUARTERS.index(q); d = rows["META"][q]; p = rows["META"][QUARTERS[i - 4]]
        if d["impressions_yoy"] is not None:
            impl = round(100 * ((1 + d["impressions_yoy"] / 100) * (1 + d["price_per_ad_yoy"] / 100) - 1), 1)
            chk("Impressions x price per ad ~ Meta ad revenue growth (pt, +/-1.5)", "META", q, impl, round(100 * (d["ad_revenue"] / p["ad_revenue"] - 1), 1), tol=1.5)
        a = rows["GOOGL"][q]; ap = rows["GOOGL"][QUARTERS[i - 4]]
        if a["paid_clicks_yoy"] is not None:
            impl = round(100 * ((1 + a["paid_clicks_yoy"] / 100) * (1 + a["cpc_yoy"] / 100) - 1), 1)
            chk("Paid clicks x CPC ~ Search & other growth (pt, +/-1.5)", "GOOGL", q, impl, round(100 * (a["search"] / ap["search"] - 1), 1), tol=1.5)
        if q in M_REPORTED_YOY["dap"] and p["dap"] is not None:
            chk("DAP growth from rounded levels ~ reported rate (pt, +/-1)", "META", q, round(100 * (d["dap"] / p["dap"] - 1), 1), M_REPORTED_YOY["dap"][q], tol=1.0)
    # Meta FCF definition and capex incl. finance leases per quarter
    for q in DISPLAY:
        d = rows["META"][q]
        chk("Capex incl. finance-lease principal = P&E + principal", "META", q, d["capex_reported"], d["capex_ppe"] + d["fin_lease"])
    # ---- regional checks
    for q, a in M_AD_GEO.items():
        if q in rows["META"]: chk("Meta ad revenue by user geography sums to advertising revenue", "META", q, sum(a), rows["META"][q]["ad_revenue"])
    for q, r in M_REV_GEO.items():
        chk("Meta revenue by user geography sums to total revenue", "META", q, sum(r), rows["META"][q]["revenue"])
        a = M_AD_GEO[q]
        chk("Each region ad revenue <= total revenue (user geography)", "META", q, int(all(x <= y for x, y in zip(a, r))), 1)
    order = sorted(M_AD_GEO)
    for q, ip in M_IMP_PPA.items():
        p = order[order.index(q) - 4]
        for name, k, (im, pp) in zip(["US & Canada", "Europe", "Asia-Pacific", "Rest of World"], range(4), ip[1:]):
            g = M_AD_GEO[q][k] / M_AD_GEO[p][k]
            chk(f"Impressions x price per ad ~ regional ad growth ({name}, pt, +/-1.5)", "META", q, round(100 * ((1 + im / 100) * (1 + pp / 100) - 1), 1), round(100 * (g - 1), 1), tol=1.5)
        chk("Worldwide impressions/price on deck = press release", "META", q, ip[0][0] * 100 + ip[0][1],
            (rows["META"][q]["impressions_yoy"] * 100 + rows["META"][q]["price_per_ad_yoy"]) if rows["META"].get(q, {}).get("impressions_yoy") is not None else ip[0][0] * 100 + ip[0][1])
    for deck, name in [(DECK_25Q3, "Q3 2025 deck"), (DECK_26Q3, "Q3 2026 deck")]:
        vi = sorted(M_IMP_PPA[q][r][0] for q in deck["qs"] for r in range(5)); vp = sorted(M_IMP_PPA[q][r][1] for q in deck["qs"] for r in range(5))
        chk(f"Regional impression values = printed value set on {name} (exact multiset)", "META", deck["qs"][-1], int(vi == sorted(deck["imp"])), 1, tol=0)
        chk(f"Regional price-per-ad values = printed value set on {name} (exact multiset)", "META", deck["qs"][-1], int(vp == sorted(deck["ppa"])), 1, tol=0)
    for q, g in A_GEO.items():
        tol = 1 if q in A_GEO_NOTE else 0
        chk("Alphabet revenue by geography sums to total revenue", "GOOGL", q, sum(g[:5]), rows["GOOGL"][q]["revenue"] if q != "2025Q4" else 113829, tol=tol)
    for k, (qs_) in {"6M2025": ["2025Q1", "2025Q2"], "9M2025": ["2025Q1", "2025Q2", "2025Q3"], "6M2026": ["2026Q1", "2026Q2"], "9M2026": ["2026Q1", "2026Q2", "2026Q3"], "9M2024": ["2024Q1", "2024Q2", "2024Q3"]}.items():
        chk(f"Quarterly APAC revenue sums to {k} APAC (10-Q)", "GOOGL", k, sum(A_GEO[q][2] for q in qs_), A_GEO_PERIODS[k][2])
        chk(f"Quarterly US revenue sums to {k} US (10-Q)", "GOOGL", k, sum(A_GEO[q][0] for q in qs_), A_GEO_PERIODS[k][0])
    for k, v in A_FY_GEO.items(): chk("Alphabet FY geography sums to FY revenue (10-K)", "GOOGL", k, sum(v[:5]), v[5])
    for k, v in M_FY_GEO.items(): chk("Meta FY revenue by customer address sums to FY revenue (10-K)", "META", k, sum(v[:4]), v[4])
    chk("Meta FY2025 user-geography revenue (sum of quarters) = FY revenue", "META", "FY2025", sum(sum(M_REV_GEO[q]) for q in ["2025Q1", "2025Q2", "2025Q3", "2025Q4"]), 200966, tol=1)
    for q, cc in A_APAC_CC.items():
        i = QUARTERS.index(q); g = A_GEO[q][2] / A_GEO[QUARTERS[i - 4]][2]
        chk("Computed APAC growth rounds to 10-Q reported APAC growth (%)", "GOOGL", q, round(100 * (g - 1)), cc["reported"], tol=0)
    # Independent cross-check (Alpha Vantage) - key totals
    av = {("GOOGL", "revenue"): {"2026Q3": 127577, "2026Q2": 119796, "2026Q1": 109896, "2025Q3": 102346, "2025Q2": 96428, "2025Q1": 90234},
          ("GOOGL", "net_income"): {"2026Q3": 26468, "2026Q2": 112193, "2026Q1": 62578, "2025Q4": 34455, "2025Q3": 34979, "2025Q2": 28196, "2025Q1": 34540},
          ("GOOGL", "ocf"): {"2026Q3": 42290, "2026Q2": 39069, "2026Q1": 45790, "2025Q4": 52402, "2025Q3": 48414, "2025Q2": 27747, "2025Q1": 36150},
          ("GOOGL", "capex_ppe"): {"2026Q3": 51355, "2026Q2": 44924, "2026Q1": 35674, "2025Q4": 27851, "2025Q3": 23953, "2025Q2": 22446, "2025Q1": 17197},
          ("GOOGL", "buybacks"): {"2025Q4": 5499, "2025Q3": 11504, "2025Q2": 13638, "2025Q1": 15068},
          ("META", "ocf"): {"2026Q3": 32786, "2026Q2": 31862, "2026Q1": 32226, "2025Q4": 36214, "2025Q3": 29999, "2025Q2": 25561, "2025Q1": 24026},
          ("META", "capex_ppe"): {"2026Q3": 33942, "2026Q2": 30116, "2026Q1": 18997, "2025Q4": 21383, "2025Q3": 18829, "2025Q2": 16538, "2025Q1": 12941},
          ("META", "net_income"): {"2026Q3": 9860, "2026Q2": 15848, "2026Q1": 26773, "2025Q4": 22768, "2025Q3": 2709, "2025Q2": 18337, "2025Q1": 16644},
          ("META", "buybacks"): {"2025Q3": 3327, "2025Q2": 10167, "2025Q1": 12754},
          ("META", "dividends"): {"2026Q3": 1361, "2026Q2": 1353, "2026Q1": 1346, "2025Q4": 1338, "2025Q3": 1330, "2025Q2": 1327, "2025Q1": 1329}}
    for (co, key), m in av.items():
        for q, v in m.items():
            chk(f"Independent feed matches release: {key}", co, q, rows[co][q][key], v)
    return out

def main():
    rows = build_raw()
    res = checks(rows)
    bad = [r for r in res if not r["ok"]]
    print(f"checks: {len(res)} run, {len(res) - len(bad)} pass, {len(bad)} fail")
    for b in bad: print("  FAIL", b)
    data = dict(cutoff=CUTOFF, last_results=LAST_RESULTS, next_report=NEXT_REPORT, quarters=QUARTERS, display=DISPLAY, sources=SOURCES, rows=rows,
                a_src=A_SRC, m_src=M_SRC, a_rpo_src={q: v[1] for q, v in A_RPO.items()},
                a_clicks_src={q: v[2] for q, v in A_CLICKS.items()}, a_clicks_note=A_CLICKS_NOTE,
                m_reported_yoy=M_REPORTED_YOY, one_offs=ONE_OFFS, guidance=GUIDANCE, commentary=COMMENTARY,
                risks=RISKS, estimates=ESTIMATES, checks=res,
                a_geo_src={q: v[5] for q, v in A_GEO.items()}, a_geo_note=A_GEO_NOTE, a_network_src={q: v[2] for q, v in A_NETWORK.items()},
                a_apac_cc=A_APAC_CC, m_imp_src=M_IMP_SRC, a_fy_geo=A_FY_GEO, m_fy_geo=M_FY_GEO,
                apac_commentary=APAC_COMMENTARY, apac_risks=APAC_RISKS)
    json.dump(data, open("app/src/data.json", "w"), indent=1)
    print("wrote app/src/data.json")

if __name__ == "__main__":
    main()
