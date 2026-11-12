/* valuemyprop — valuation engine (pure functions, no network) */
(function (root) {
  function band(sqft) {
    if (sqft < 600) return "b0";
    if (sqft < 1000) return "b1";
    if (sqft < 1600) return "b2";
    if (sqft < 2600) return "b3";
    if (sqft < 4500) return "b4";
    return "b5";
  }

  // Find the best market figure: building first, then area; most specific key first.
  function lookup(input, market) {
    const b = input.beds, bd = band(input.sqft);
    let keys;
    if (input.mode === "rent") {
      keys = [`r:${b}`, `r:${bd}`, `r:*`];
    } else {
      const st = input.status === "O" ? "O" : "R";
      keys = [`s:${st}:${b}`, `s:${st}:${bd}`, `s:A:${b}`, `s:A:${bd}`, `s:${st}:*`, `s:A:*`];
    }
    const sources = [];
    if (input.building && input.building.st) sources.push({ level: "building", name: input.building.n, st: input.building.st, minN: 3 });
    const areaName = input.area || (input.building && input.building.a);
    const area = areaName && market.areas[areaName];
    if (area) sources.push({ level: "area", name: areaName, st: area.st, minN: 5 });

    for (const src of sources) {
      for (const k of keys) {
        const v = src.st[k];
        if (v && v[1] >= src.minN) return { level: src.level, name: src.name, key: k, psf: v[0], n: v[1], months: v[2] || 24 };
      }
    }
    // last resort: accept thinner samples
    for (const src of sources) {
      for (const k of keys) {
        const v = src.st[k];
        if (v && v[1] >= 2) return { level: src.level, name: src.name, key: k, psf: v[0], n: v[1], months: v[2] || 24, thin: true };
      }
    }
    return null;
  }

  function monthsUntil(isoMonth) {
    if (!isoMonth) return null;
    const [y, m] = isoMonth.split("-").map(Number);
    const now = new Date();
    return (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth());
  }

  function adjustments(input, cfg, baseValue) {
    const out = [];
    const add = (label, pct) => { if (pct) out.push({ label, pct }); };
    if (input.mode === "sale") {
      const s = cfg.sale;
      if (input.occupancy === "vacant") add("Vacant on transfer", s.vacant);
      if (input.occupancy === "tenanted") {
        add("Tenanted", s.tenanted);
        const left = monthsUntil(input.leaseEnd);
        if (left != null && left > 12) add("Lease runs 12+ months", s.tenantedLongLease);
        if (left != null && left <= 3) add("Lease ends within 3 months", s.tenantedShortLease);
      }
      if (input.status === "O") add("Off-plan", s.offplanVsReady);
      add(furnLabel(input.furnishing), s[input.furnishing] || 0);
    } else {
      add(furnLabel(input.furnishing), cfg.rent[input.furnishing] || 0);
    }
    if (input.upgraded && input.upgrades && input.upgrades.length) {
      const u = cfg.upgrades;
      const f = input.upgradeDate ? (u.ageFactor[ageBucket(input.upgradeDate)] ?? 0) : (u.undatedFactor ?? 0.75);
      const useAmount = (input.mode === "sale" || u.useAmountForRent) && input.upgradeAmount > 0 && baseValue > 0;
      let pct = useAmount
        ? (input.upgradeAmount * u.costRecovery * f / baseValue) * 100
        : input.upgrades.reduce((a, k) => a + (u.items[k] ? u.items[k].value : 0), 0) * f;
      pct = Math.round(Math.min(pct, u.maxTotal) * 10) / 10;
      const bits = [input.upgrades.map((k) => (u.items[k] ? u.items[k].label : k)).join(", ")];
      if (input.upgradeAmount > 0) bits.push("AED " + Math.round(input.upgradeAmount).toLocaleString("en-US"));
      if (input.upgradeDate) bits.push(fmtMonth(input.upgradeDate));
      out.push({ label: "Upgrades: " + bits.join(" · ") + (pct === 0 ? " (fully depreciated)" : ""), pct });
    }
    return out;
  }

  // Age bucket from "YYYY-MM" completion date
  function ageBucket(ym) {
    if (!ym) return "gt5";
    const [y, m] = ym.split("-").map(Number);
    const now = new Date();
    const months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
    return months < 12 ? "lt1" : months < 36 ? "1to3" : months < 60 ? "3to5" : "gt5";
  }
  function fmtMonth(ym) {
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  }

  function furnLabel(f) {
    return f === "furnished" ? "Furnished" : f === "partlyFurnished" ? "Partly furnished" : "Unfurnished";
  }

  function roundTo(v, step) { return Math.round(v / step) * step; }

  function estimate(input, market, cfg) {
    const basis = lookup(input, market);
    if (!basis) return null;
    const base = basis.psf * input.sqft;
    const adj = adjustments(input, cfg, base);
    const factor = adj.reduce((f, a) => f * (1 + a.pct / 100), 1);
    const value = base * factor;
    const conf = basis.thin ? "weak"
      : basis.level === "building" && basis.n >= 8 ? "strong"
      : basis.level === "building" || basis.n >= 15 ? "medium" : "weak";
    const spread = cfg.rangeSpread[conf];
    const step = input.mode === "rent" ? 1000 : value > 5e6 ? 50000 : 5000;
    return {
      mode: input.mode,
      value: roundTo(value, step),
      low: roundTo(value * (1 - spread), step),
      high: roundTo(value * (1 + spread), step),
      psf: Math.round(basis.psf * factor),
      marketPsf: basis.psf,
      base: roundTo(base, step),
      basis, adjustments: adj, confidence: conf,
    };
  }

  const api = { estimate, lookup, adjustments, band };
  if (typeof module !== "undefined") module.exports = api;
  else root.VMP = api;
})(typeof window !== "undefined" ? window : globalThis);
