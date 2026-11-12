/*
 * DLD open-data fetcher — public, no login, no API key.
 * Same endpoints the dubailand.gov.ae "Real Estate Data" page uses.
 */
const BASE = "https://gateway.dubailand.gov.ae/open-data";
const PAGE = 2000;

const fmt = (d) => `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;

async function post(path, body, tries = 5) {
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(`${BASE}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Origin: "https://dubailand.gov.ae", Referer: "https://dubailand.gov.ae/" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      return (j.response && j.response.result) || [];
    } catch (e) {
      if (i === tries) throw new Error(`${path} failed after ${tries} tries: ${e.message}`);
      await new Promise((res) => setTimeout(res, 2000 * i));
    }
  }
}

// Split [from, to] into calendar-month chunks so pagination stays shallow
function monthChunks(from, to) {
  const out = [];
  let s = new Date(from);
  while (s <= to) {
    const e = new Date(s.getFullYear(), s.getMonth() + 1, 0);
    out.push([new Date(s), e > to ? new Date(to) : e]);
    s = new Date(s.getFullYear(), s.getMonth() + 1, 1);
  }
  return out;
}

// Run async jobs with limited concurrency
async function pool(jobs, n) {
  const out = new Array(jobs.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, async () => {
    while (i < jobs.length) { const k = i++; out[k] = await jobs[k](); }
  }));
  return out;
}

function body(kind, s, e, skip) {
  return kind === "sales"
    ? { P_FROM_DATE: fmt(s), P_TO_DATE: fmt(e), P_GROUP_ID: "1", P_IS_OFFPLAN: "", P_IS_FREE_HOLD: "", P_AREA_ID: "", P_USAGE_ID: "", P_PROP_TYPE_ID: "", P_TAKE: String(PAGE), P_SKIP: String(skip), P_SORT: "TRANSACTION_NUMBER_ASC" }
    : { P_FROM_DATE: fmt(s), P_TO_DATE: fmt(e), P_DATE_TYPE: "0", P_IS_FREE_HOLD: "1", P_AREA_ID: "", P_PROP_TYPE_ID: "", P_USAGE_ID: "", P_VERSION: "1", P_TAKE: String(PAGE), P_SKIP: String(skip), P_SORT: "DEFAULT_SORT_ASC" };
}

// Rents: P_VERSION "1" = NEW Ejari contracts only (renewals are capped by the RERA index and lag the market)
// `map` cleans each raw row as it arrives (keeps memory low); return null to drop a row.
// Pages within each month are fetched 4 at a time.
async function fetchAll(kind, from, to, log = () => {}, map = (x) => x, concurrency = 4) {
  const path = kind === "sales" ? "transactions" : "rents";
  const rows = [];
  const keep = (page) => { for (const r of page) { const c = map(r); if (c) rows.push(c); } };
  for (const [s, e] of monthChunks(from, to)) {
    const first = await post(path, body(kind, s, e, 0));
    if (!first.length) { log(`${kind} ${fmt(s)}: no data`); continue; }
    keep(first);
    const total = +first[0].TOTAL || 0;
    const jobs = [];
    for (let skip = PAGE; skip < total; skip += PAGE) jobs.push(() => post(path, body(kind, s, e, skip)));
    (await pool(jobs, concurrency)).forEach(keep);
    log(`${kind} ${fmt(s)}: ${total} registered, ${rows.length} kept so far`);
  }
  return rows;
}

if (typeof module !== "undefined") module.exports = { fetchAll, fmt };
