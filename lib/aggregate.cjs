/*
 * valuemyprop — market aggregation core
 * Turns raw DLD open-data rows (sales transactions + Ejari rent contracts)
 * into a compact market.json of median AED-per-sq-ft by building and area.
 * Runs in Node (nightly job) and in a browser (for one-off seeding).
 */
const SQFT = 10.7639;

const norm = (s) => (s || "").toString().trim().replace(/\s+/g, " ").toUpperCase();

function bedsFromSales(r) {
  const t = (r.ROOMS_EN || "").toLowerCase();
  if (t.includes("studio")) return "S";
  const m = t.match(/(\d+)/);
  if (m) return Math.min(parseInt(m[1], 10), 5) + "";
  if ((r.PROP_SB_TYPE_EN || "").toLowerCase().includes("studio")) return "S";
  return null;
}

function bedsFromRent(r) {
  if ((r.PROP_SUB_TYPE_EN || "").toLowerCase().includes("studio")) return "S";
  const n = parseInt(r.ROOMS, 10);
  if (!isNaN(n) && n > 0) return Math.min(n, 5) + "";
  return null;
}

// Size bands (sq ft) — used when bedroom count is unknown
function band(sqft) {
  if (sqft < 600) return "b0";
  if (sqft < 1000) return "b1";
  if (sqft < 1600) return "b2";
  if (sqft < 2600) return "b3";
  if (sqft < 4500) return "b4";
  return "b5";
}

const RESI = /flat|villa|apartment|penthouse|townhouse|duplex|studio|hotel/i;

function cleanSale(r) {
  if (+r.GROUP_ID !== 1) return null;
  const proc = r.PROCEDURE_EN || "";
  if (!/sell|sale/i.test(proc) || /mortgage|lease/i.test(proc)) return null;
  if (!RESI.test(r.PROP_SB_TYPE_EN || "")) return null;
  const sqm = +r.ACTUAL_AREA || +r.PROCEDURE_AREA;
  const val = +r.TRANS_VALUE;
  if (!sqm || sqm < 15 || sqm > 5000 || !val || val < 150000) return null;
  const sqft = sqm * SQFT;
  const psf = val / sqft;
  if (psf < 250 || psf > 25000) return null;
  return {
    id: r.TRANSACTION_NUMBER || "",
    d: (r.INSTANCE_DATE || "").slice(0, 10),
    a: norm(r.AREA_EN),
    // Older towers (Marina Crown, JBR, JLT…) have no DLD project name: use the building name learned from the land parcel
    p: norm(r.PROJECT_EN) || PARCEL_NAMES[r.PARCEL_ID] || "",
    m: norm(r.MASTER_PROJECT_EN),
    t: /villa|townhouse/i.test(r.PROP_SB_TYPE_EN) ? "V" : "A",
    st: +r.IS_OFFPLAN === 1 ? "O" : "R",
    b: bedsFromSales(r),
    sq: Math.round(sqft),
    v: Math.round(val),
    psf,
  };
}

function cleanRent(r) {
  const sub = r.PROP_SUB_TYPE_EN || "";
  if (!RESI.test(sub)) return null;
  const sqm = +r.ACTUAL_AREA;
  const amt = +r.ANNUAL_AMOUNT || +r.CONTRACT_AMOUNT;
  if (!sqm || sqm < 15 || sqm > 3000 || !amt || amt < 10000) return null;
  const sqft = sqm * SQFT;
  const psf = amt / sqft;
  if (psf < 15 || psf > 1000) return null;
  return {
    id: r.CONTRACT_NUMBER || "",
    d: (r.REGISTRATION_DATE || "").slice(0, 10),
    a: norm(r.AREA_EN),
    p: norm(r.PROJECT_EN),
    m: norm(r.MASTER_PROJECT_EN),
    t: /villa|townhouse/i.test(sub) ? "V" : "A",
    nw: /^new/i.test((r.VERSION_EN || "").trim()),
    b: bedsFromRent(r),
    sq: Math.round(sqft),
    v: Math.round(amt),
    psf,
  };
}

// Dedupe key for the rolling archive
function rowKey(x) {
  return x.id ? x.id : [x.d, x.a, x.p, x.sq, x.v, x.b || ""].join("|");
}

// Merge freshly fetched rows into the archive, dedupe, and drop rows older than `months`
function mergeArchive(archive, fresh, months, today) {
  const cut = new Date(today || Date.now());
  cut.setMonth(cut.getMonth() - months);
  const c = cut.toISOString().slice(0, 10);
  const map = new Map();
  for (const x of archive) if (x.d >= c) map.set(rowKey(x), x);
  for (const x of fresh) if (x.d >= c) map.set(rowKey(x), x);
  return [...map.values()];
}

function median(arr) {
  const s = [...arr].sort((x, y) => x - y);
  const n = s.length;
  if (!n) return 0;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

// Median with outlier trimming: drop anything below 0.6x or above 1.6x the raw median
function robust(psfs) {
  const m0 = median(psfs);
  const kept = psfs.filter((x) => x >= m0 * 0.6 && x <= m0 * 1.6);
  return [Math.round(median(kept)), kept.length];
}

function addTo(map, key, psf, date) {
  (map[key] || (map[key] = [])).push([psf, date]);
}

/*
 * Stat keys:
 *   sales: "s:{R|O|A}:{beds|band|*}"    e.g. "s:R:2", "s:A:b1", "s:A:*"
 *   rents: "r:{beds|band|*}"            e.g. "r:1", "r:b2", "r:*"
 * Each value: [medianPsf, sampleSize, windowMonths]
 * Uses the recent window (6m sales / 3m rents) when it has >= minN deals, else the full window.
 */
function finalise(groups, today, windows, minN) {
  // Try the most recent window first (e.g. 6 months), widen step by step (12 months), then use everything.
  const cuts = windows.map((w) => {
    const c = new Date(today);
    c.setMonth(c.getMonth() - w);
    return [w, c.toISOString().slice(0, 10)];
  });
  const out = {};
  for (const [k, rows] of Object.entries(groups)) {
    let done = false;
    for (const [w, c] of cuts) {
      const recent = rows.filter((r) => r[1] >= c).map((r) => r[0]);
      if (recent.length >= minN) {
        const [m, n] = robust(recent);
        if (n >= 2) { out[k] = [m, n, w]; done = true; break; }
      }
    }
    if (!done && rows.length >= 2) {
      const [m, n] = robust(rows.map((r) => r[0]));
      if (n >= 2) out[k] = [m, n, 0]; // 0 = full history
    }
  }
  return out;
}

// Land parcel id -> building name, for sales registered without a project name (data/seed/parcel-names.json)
let PARCEL_NAMES = {};
function setParcelNames(m) { PARCEL_NAMES = m || {}; }

function buildMarket(rawSales, rawRents, opts = {}) {
  const today = opts.today || new Date().toISOString().slice(0, 10);
  // Pass opts.cleaned = true when rows were already run through cleanSale / cleanRent
  const sales = opts.cleaned ? rawSales : rawSales.map(cleanSale).filter(Boolean);
  let rents = opts.cleaned ? rawRents : rawRents.map(cleanRent).filter(Boolean);

  const B = {}; // building key -> { area, type, s: groups, r: groups, last: [] }
  const A = {}; // area -> groups
  const bkey = (x) => (x.p ? x.p + "||" + x.a : null);

  for (const x of sales) {
    const keys = [`s:${x.st}:${x.b || "*x"}`, `s:${x.st}:${band(x.sq)}`, `s:${x.st}:*`, `s:A:${x.b || "*x"}`, `s:A:${band(x.sq)}`, `s:A:*`]
      .filter((k) => !k.endsWith("*x"));
    const area = A[x.a] || (A[x.a] = { g: {}, t: {} });
    area.t[x.t] = (area.t[x.t] || 0) + 1;
    keys.forEach((k) => addTo(area.g, k, x.psf, x.d));
    const bk = bkey(x);
    if (bk) {
      const b = B[bk] || (B[bk] = { g: {}, t: {}, last: [] });
      b.t[x.t] = (b.t[x.t] || 0) + 1;
      keys.forEach((k) => addTo(b.g, k, x.psf, x.d));
      b.last.push([x.d, x.b || "", x.sq, x.v, x.st]);
    }
  }

  // Rents: prefer NEW contracts (renewals are capped by the RERA index and lag the market)
  const newOnly = rents.filter((x) => x.nw);
  if (newOnly.length > rents.length * 0.15) rents = newOnly;

  // DLD files Ejari contracts under land-registry area names (e.g. MARSA DUBAI, AL BARSHA SOUTH FOURTH)
  // but sales under popular names (DUBAI MARINA, JUMEIRAH VILLAGE CIRCLE). Link them through building names:
  //  - each rent goes to the sales building with the same name (the one with the most sales)
  //  - each rent area is mapped to the sales area most of its buildings belong to
  const nameToKey = {};
  for (const [k, b] of Object.entries(B)) {
    const name = k.split("||")[0];
    const n = b.last.length;
    if (!nameToKey[name] || n > nameToKey[name].n) nameToKey[name] = { k, n };
  }
  const votes = {};
  for (const x of rents) {
    const hit = x.p && nameToKey[x.p];
    if (!hit) continue;
    const salesArea = hit.k.split("||")[1];
    if (salesArea === x.a) continue;
    const v = votes[x.a] || (votes[x.a] = {});
    v[salesArea] = (v[salesArea] || 0) + 1;
  }
  const areaMap = {};
  for (const [ra, v] of Object.entries(votes)) {
    const total = Object.values(v).reduce((a, n) => a + n, 0);
    const [best, n] = Object.entries(v).sort((a, b) => b[1] - a[1])[0];
    if (total >= 20 && n / total >= 0.5) areaMap[ra] = best;
  }
  for (const x of rents) {
    const keys = [`r:${x.b || "*x"}`, `r:${band(x.sq)}`, `r:*`].filter((k) => !k.endsWith("*x"));
    const areaNames = [x.a];
    if (areaMap[x.a]) areaNames.push(areaMap[x.a]);
    for (const an of areaNames) {
      const area = A[an] || (A[an] = { g: {}, t: {} });
      keys.forEach((k) => addTo(area.g, k, x.psf, x.d));
    }
    const hit = x.p && nameToKey[x.p];
    const bk = hit ? hit.k : bkey(x);
    if (bk) {
      const b = B[bk] || (B[bk] = { g: {}, t: {}, last: [] });
      keys.forEach((k) => addTo(b.g, k, x.psf, x.d));
    }
  }

  const fin = (g) => {
    const s = {}, r = {};
    for (const [k, v] of Object.entries(g)) (k[0] === "s" ? s : r)[k] = v;
    return { ...finalise(s, today, [6, 12], 5), ...finalise(r, today, [3, 6], 5) };
  };
  const domType = (t) => ((t.V || 0) > (t.A || 0) ? "V" : "A");

  const areas = {};
  for (const [name, a] of Object.entries(A)) {
    const st = fin(a.g);
    if (Object.keys(st).length) areas[name] = { t: domType(a.t), st };
  }
  const buildings = [];
  for (const [k, b] of Object.entries(B)) {
    const st = fin(b.g);
    if (!Object.keys(st).length) continue;
    const [name, area] = k.split("||");
    const last = b.last.sort((x, y) => (x[0] < y[0] ? 1 : -1)).slice(0, 4);
    const entry = { n: name, a: area, t: domType(b.t), st, last };
    // Off-plan project: most of its recent registered sales were off-plan
    const op = st["s:O:*"] ? st["s:O:*"][1] : 0, rd = st["s:R:*"] ? st["s:R:*"][1] : 0;
    if (op > rd) entry.op = 1;
    // Other names owners know the project by (its individual towers), so they can find it in the search box
    const al = opts.aliases && opts.aliases[name];
    if (al && al.length) entry.al = al;
    buildings.push(entry);
  }
  // Directory of every registered project/building (DLD units register): names with no recent deals still
  // appear in the search and are valued from their area. Tower names become search aliases.
  if (opts.directory) {
    const byName = new Map();
    for (const b of buildings) { byName.set(b.n, b); for (const a of b.al || []) if (!byName.has(a)) byName.set(a, b); }
    for (const d of opts.directory) {
      const hit = byName.get(d.n);
      if (hit) {
        hit.u = d.u;
        const al = new Set(hit.al || []);
        for (const a of d.al || []) if (a !== hit.n) al.add(a);
        if (al.size) hit.al = [...al].slice(0, 30);
        continue;
      }
      if (!areas[d.a]) continue; // can't value it without area data
      const e = { n: d.n, a: d.a, t: d.t || "A", u: d.u, dir: 1 };
      if (d.al && d.al.length) e.al = d.al;
      buildings.push(e);
      byName.set(d.n, e);
    }
  }
  buildings.sort((x, y) => (x.n < y.n ? -1 : 1));

  return {
    source: "Dubai Land Department open data (registered sales + Ejari rent contracts)",
    updated: today,
    counts: { sales: sales.length, rents: rents.length, buildings: buildings.length, valued: buildings.filter((b) => b.st).length, areas: Object.keys(areas).length },
    areas,
    buildings,
  };
}

if (typeof module !== "undefined") module.exports = { buildMarket, setParcelNames, cleanSale, cleanRent, band, median, mergeArchive, rowKey };
