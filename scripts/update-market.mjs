/*
 * Nightly job: DLD open data -> rolling archive -> market.json -> Netlify Blobs
 * (No site redeploy, so it uses no Netlify deploy credits.)
 *
 *   node scripts/update-market.mjs            # needs NETLIFY_SITE_ID + NETLIFY_AUTH_TOKEN
 *   node scripts/update-market.mjs --local    # archive + output kept in ./data and public/data
 *
 * Why an archive: DLD's public feed only serves the current calendar year. We keep every
 * cleaned row we've seen for 12 months, so January estimates still use last year's deals.
 */
import { createRequire } from "node:module";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
const require = createRequire(import.meta.url);
const { buildMarket, cleanSale, cleanRent, mergeArchive, setParcelNames } = require("../lib/aggregate.cjs");
const readSeedJson = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {});
setParcelNames(readSeedJson("data/seed/parcel-names.json")); // building names for sales with no DLD project
const ALIASES = readSeedJson("data/seed/building-aliases.json"); // project -> tower names, for search
const { fetchAll } = require("../lib/dld.cjs");

const SALES_MONTHS = 24; // keep 2 years of sales history in the archive
const RENT_MONTHS = 24; // keep 2 years of rent history in the archive
const REFETCH_DAYS = 60; // re-pull recent weeks each night to catch late registrations
const LOCAL = process.argv.includes("--local");
const log = (m) => console.log(new Date().toISOString().slice(11, 19), m);
const today = new Date().toISOString().slice(0, 10);

/* ---------- storage (Netlify Blobs or local files) ---------- */
let store = null;
if (!LOCAL) {
  const { getStore } = await import("@netlify/blobs");
  store = getStore({ name: "market", siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
}
async function load(key) {
  let rows = [];
  if (LOCAL) rows = existsSync(`data/${key}.json`) ? JSON.parse(readFileSync(`data/${key}.json`, "utf8")) : [];
  else rows = (await store.get(key, { type: "json" })) || [];
  // First run: start from the seed history shipped in the repo (2025–2026 from data.dubai + DLD)
  const seed = `data/seed/${key}.json.gz`;
  if (!rows.length && existsSync(seed)) {
    rows = JSON.parse(gunzipSync(readFileSync(seed)).toString("utf8"));
    log(`Loaded seed history ${seed}: ${rows.length} rows`);
  }
  for (const x of rows) if (x.psf == null && x.sq) x.psf = x.v / x.sq; // seed rows are stored without psf
  return rows;
}
async function save(key, val) {
  const s = typeof val === "string" ? val : JSON.stringify(val);
  if (LOCAL) { mkdirSync("data", { recursive: true }); writeFileSync(`data/${key}.json`, s); return; }
  await store.set(key, s);
}

/* ---------- fetch ---------- */
const to = new Date(); to.setDate(to.getDate() - 1);
let salesArc = await load("archive-sales");
let rentsArc = await load("archive-rents");
log(`Archive: ${salesArc.length} sales, ${rentsArc.length} rents`);

const from = (months, arc) => {
  const d = new Date(to);
  if (arc.length) d.setDate(d.getDate() - REFETCH_DAYS); // incremental
  else { d.setMonth(d.getMonth() - months); d.setDate(1); } // first run: as far back as DLD allows
  return d;
};

log("Fetching DLD sales…");
const sales = await fetchAll("sales", from(SALES_MONTHS, salesArc), to, log, cleanSale);
log("Fetching DLD rents (Ejari, freehold)…");
const rents = await fetchAll("rents", from(RENT_MONTHS, rentsArc), to, log, cleanRent);

if (!sales.length) throw new Error("DLD returned no sales — keeping yesterday's data.");

salesArc = mergeArchive(salesArc, sales, SALES_MONTHS, today);
rentsArc = mergeArchive(rentsArc, rents, RENT_MONTHS, today);
await save("archive-sales", salesArc);
await save("archive-rents", rentsArc);
log(`Archive now: ${salesArc.length} sales, ${rentsArc.length} rents`);

/* ---------- build + publish ---------- */
const market = buildMarket(salesArc, rentsArc, { today, cleaned: true, aliases: ALIASES });
const json = JSON.stringify(market);
log(`Built market: ${JSON.stringify(market.counts)} · ${(json.length / 1024).toFixed(0)} KB`);

mkdirSync("public/data", { recursive: true });
writeFileSync("public/data/market.json", json);
if (!LOCAL) {
  await store.set("latest", json, { metadata: { updated: today } });
  log("Published to Netlify Blobs → /api/market");
}
