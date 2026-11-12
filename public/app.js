/* valuemyprop — front-end app */
(function () {
  const CFG = window.VMP_CONFIG;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  // Popular names -> official DLD area names (DLD registers areas under land-registry names)
  const AREA_ALIASES = window.VMP_AREA_ALIASES || {};

  let M = null; // market data
  const S = {
    step: 1, mode: "sale", building: null, area: null, buildingFree: "",
    type: "A", beds: null, sizeUnit: "sqft", status: "R", occupancy: "vacant", leaseEnd: "",
    furnishing: "unfurnished", upgraded: false, upgrades: [], upgradeAmount: 0, upgradeDate: "",
  };

  /* ---------- helpers ---------- */
  const SMALL = new Set(["of", "and", "the", "at", "by", "in", "on"]);
  const title = (s) => (s || "").toLowerCase().replace(/\b([a-z])([a-z']*)/g, (m, a, b, i) => (i && SMALL.has(m) ? m : a.toUpperCase() + b))
    .replace(/\b(Jvc|Jlt|Jvt|Difc|Mbr|Dso|Jbr|Ii|Iii|Iv|Vi|Vii|Viii)\b/g, (m) => m.toUpperCase());
  const areaLabel = (dld) => {
    const pop = Object.keys(AREA_ALIASES).find((k) => AREA_ALIASES[k] === dld);
    return pop ? `${pop}` : title(dld);
  };
  const aed = (n) => "AED " + Math.round(n).toLocaleString("en-US");
  const bedsLabel = (b) => (b === "S" ? "Studio" : b === "5" ? "5+ bed" : b ? `${b} bed` : "—");
  const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const SYN = { blvd: "boulevard", bldg: "building", twr: "tower", twrs: "tower", res: "residence", apts: "apartment", apt: "apartment", st: "street", mkt: "market", ph: "phase", "1st": "first", "2nd": "second" };
  // lower-case, drop punctuation, singular words, expand common abbreviations
  const norm = (s) => (s || "").toLowerCase().replace(/&/g, " and ").replace(/['’`]/g, "").replace(/[^a-z0-9\u0600-\u06FF]+/g, " ").trim()
    .split(/\s+/).map((w) => SYN[w] || w).map((w) => (w.length > 4 && w.endsWith("es") && !w.endsWith("ses") ? w.slice(0, -1) : w))
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w)).join(" ");
  const AREA_ABBR = { "JUMEIRAH VILLAGE CIRCLE": "jvc", "JUMEIRAH VILLAGE TRIANGLE": "jvt", "JUMEIRAH LAKES TOWERS": "jlt", "JUMEIRAH BEACH RESIDENCE": "jbr", "DUBAI SILICON OASIS": "dso", "INTERNATIONAL CITY": "intl", "BUSINESS BAY": "bb", "DUBAI INVESTMENT PARK": "dip", "MOHAMMED BIN RASHID CITY": "mbr", "DUBAI SPORTS CITY": "dsc", "DUBAI CREEK HARBOUR": "dch", "BURJ KHALIFA": "downtown dubai", "ARJAN": "al barsha south", "DUBAI MARINA": "marina" };
  const activity = (st) => Object.entries(st).filter(([k]) => k === "s:A:*" || k === "r:*").reduce((a, [, v]) => a + v[1], 0);

  /* ---------- load data ---------- */
  async function load() {
    const tries = ["api/market", "data/market.json"];
    for (const u of tries) {
      try {
        const r = await fetch(u, { cache: "no-cache" });
        if (r.ok) { M = await r.json(); break; }
      } catch (e) { /* try next */ }
    }
    if (!M) { $("#loading").innerHTML = "Sorry — market data is temporarily unavailable. Please try again shortly."; return; }
    M.buildings.forEach((b) => {
      b._al = b.al || [];
      b._n = norm(b.n); b._aln = b._al.map(norm);
      b._act = b.st ? activity(b.st) : 0; b._area = areaLabel(b.a);
      b._aq = norm(b._area + " " + b.a + " " + (AREA_ABBR[b.a] || ""));
    });
    M._areaList = Object.keys(M.areas).map((a) => ({ a, label: areaLabel(a), q: norm(areaLabel(a) + " " + a + " " + (AREA_ABBR[a] || "")), act: activity(M.areas[a].st) }));
    Object.entries(AREA_ALIASES).forEach(([pop, dld]) => { if (M.areas[dld]) { const x = M._areaList.find((y) => y.a === dld); if (x) x.q += " " + norm(pop); } });
    if (M.demo) {
      const d = document.createElement("div");
      d.style.cssText = "background:#FFF4E0;color:#7A4D00;padding:10px 24px;font-size:13px;font-weight:600;text-align:center";
      d.textContent = "PREVIEW — sample data, not real prices. Live DLD data loads after the first nightly update.";
      $("#app").prepend(d);
    }
    $("#loading").classList.add("hidden");
    $("#wizard").classList.remove("hidden");
    $("#foot").innerHTML = `Market data: Dubai Land Department (DLD open data &amp; data.dubai) · updated ${esc(M.updated)} · ${M.counts.sales.toLocaleString()} sales${M.coverage?" ("+esc(M.coverage.sales)+")":""} &amp; ${M.counts.rents.toLocaleString()} new rent contracts analysed<br>© ${new Date().getFullYear()} ${esc(CFG.brand.name)} · ${esc(CFG.brand.company)}`;
  }

  /* ---------- autocomplete ---------- */
  function autocomplete(input, list, search, onPick) {
    let items = [], hl = -1;
    const render = () => {
      if (!items.length) { list.classList.add("hidden"); return; }
      list.innerHTML = (items.head ? `<div class="ac-head">${esc(items.head)}</div>` : "") +
        items.map((it, i) => it.action
          ? `<div class="ac-item ac-act${i === hl ? " hl" : ""}" data-i="${i}"><span>${esc(it.label)}</span></div>`
          : `<div class="ac-item${i === hl ? " hl" : ""}" data-i="${i}"><span class="ac-main"><b>${esc(it.label)}</b><small>${esc(it.sub)}</small></span>${it.tag ? `<em class="ac-tag ${it.tagCls || ""}">${esc(it.tag)}</em>` : ""}</div>`).join("");
      list.classList.remove("hidden");
    };
    // On phones the keyboard covers half the screen: bring the box to the top and size the list to the space left
    const fit = () => {
      if (window.innerWidth > 720) return;
      const r = input.getBoundingClientRect();
      if (r.top > 160 || r.top < 100) window.scrollBy({ top: r.top - 110, behavior: "smooth" });
      const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      list.style.maxHeight = Math.max(220, vh - 110 - r.height - 16) + "px";
    };
    input.addEventListener("focus", () => setTimeout(fit, 250));
    if (window.visualViewport) window.visualViewport.addEventListener("resize", () => { if (document.activeElement === input) fit(); });
    input.addEventListener("input", () => { items = search(input.value.trim()); hl = -1; render(); list.scrollTop = 0; fit(); });
    input.addEventListener("focus", () => { if (input.value.trim().length >= 2) { items = search(input.value.trim()); render(); } });
    input.addEventListener("keydown", (e) => {
      if (list.classList.contains("hidden")) return;
      if (e.key === "ArrowDown") { hl = Math.min(hl + 1, items.length - 1); render(); scrollHl(); e.preventDefault(); }
      if (e.key === "ArrowUp") { hl = Math.max(hl - 1, 0); render(); scrollHl(); e.preventDefault(); }
      if (e.key === "Enter" && hl >= 0) { pick(hl); e.preventDefault(); }
    });
    list.addEventListener("mousedown", (e) => { const el = e.target.closest(".ac-item"); if (el) pick(+el.dataset.i); });
    input.addEventListener("blur", () => setTimeout(() => list.classList.add("hidden"), 150));
    const scrollHl = () => { const el = list.querySelector(".ac-item.hl"); if (el) el.scrollIntoView({ block: "nearest" }); };
    const pick = (i) => { const it = items[i]; list.classList.add("hidden"); if (it.action) { it.action(input.value.trim()); return; } onPick(it.val); input.value = ""; items = []; };
  }

  // ---- search: forgiving matching (word starts, plurals, common abbreviations), up to 60 results ----
  function searchBuildings(raw) {
    const q = norm(raw);
    if (q.length < 2) return [];
    const words = q.split(" ");
    const has = (txt, w) => (" " + txt).includes(" " + w); // word starts with w
    const hits = [];
    for (const b of M.buildings) {
      let hitName = null, alias = -1;
      if (words.every((w) => has(b._n, w) || has(b._aq, w))) hitName = b._n;
      else {
        alias = b._aln.findIndex((a) => words.every((w) => has(a, w) || has(b._aq, w)));
        if (alias < 0) continue;
        hitName = b._aln[alias];
      }
      const inName = words.filter((w) => has(hitName, w)).length; // 0 = matched on the area name only (e.g. "jvc")
      const score = inName * 1e7 + (hitName.startsWith(q) ? 5e6 : 0) + (hitName === q ? 9e6 : 0) + (b.st ? 1e6 : 0) + b._act + (b.u || 0) / 100;
      hits.push({ b, alias, score });
    }
    hits.sort((x, y) => y.score - x.score);
    const out = hits.slice(0, 60).map(({ b, alias }) => {
      const label = title(alias >= 0 ? b._al[alias] : b.n);
      const sales = b.st && b.st["s:A:*"] ? b.st["s:A:*"][1] : 0;
      const rents = b.st && b.st["r:*"] ? b.st["r:*"][1] : 0;
      const count = sales ? `${sales} sales` : rents ? `${rents} rentals` : "";
      return {
        label,
        sub: (alias >= 0 ? title(b.n) + " · " : "") + b._area,
        tag: b.op ? "Off-plan" + (count ? " · " + count : "") : count || "Area estimate",
        tagCls: b.op ? "op" : count ? "" : "mute",
        val: { b, label },
      };
    });
    out.head = hits.length > 60 ? `${hits.length} matches — showing top 60, keep typing to narrow down` : `${hits.length} match${hits.length === 1 ? "" : "es"}`;
    out.push({ label: `Can't find “${raw}”? Use this name and choose the area →`, action: (txt) => useFreeName(txt) });
    return out;
  }
  function useFreeName(txt) {
    $("#areaField").classList.remove("hidden");
    $("#bFree").value = txt;
    $("#bSearch").value = "";
    $("#aSearch").focus();
  }
  function searchAreas(raw) {
    const q = norm(raw);
    if (q.length < 2) return [];
    return M._areaList.filter((x) => q.split(" ").every((w) => (" " + x.q).includes(" " + w))).sort((x, y) => y.act - x.act).slice(0, 30)
      .map((x) => ({ label: x.label, sub: x.label.toUpperCase() !== x.a ? title(x.a) : "", val: x.a }));
  }

  function showPicked() {
    const bp = $("#bPicked");
    if (S.building) {
      bp.innerHTML = `<div><b>${esc(S.building._picked || title(S.building.n))}</b><small>${esc(S.building._area)}</small></div><button class="link" id="chgB">Change</button>`;
      bp.classList.remove("hidden"); $("#bSearch").classList.add("hidden");
      $("#chgB").onclick = () => { S.building = null; bp.classList.add("hidden"); $("#bSearch").classList.remove("hidden"); $("#bSearch").focus(); };
      if (S.building.t) setSeg("#ptype", S.building.t, "type");
    }
    const ap = $("#aPicked");
    if (S.area && !S.building) {
      ap.innerHTML = `<div><b>${esc(areaLabel(S.area))}</b><small>${esc(title(S.area))}</small></div><button class="link" id="chgA">Change</button>`;
      ap.classList.remove("hidden"); $("#aSearch").classList.add("hidden");
      $("#chgA").onclick = () => { S.area = null; ap.classList.add("hidden"); $("#aSearch").classList.remove("hidden"); };
    }
  }

  /* ---------- controls ---------- */
  function setSeg(sel, v, key) {
    $$(sel + " button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
    S[key] = v;
  }
  function seg(sel, key, after) {
    $$(sel + " button").forEach((b) => b.addEventListener("click", () => { setSeg(sel, b.dataset.v, key); after && after(b.dataset.v); }));
  }
  function chipsSingle(sel, key) {
    $$(sel + " .chip").forEach((c) => c.addEventListener("click", () => {
      $$(sel + " .chip").forEach((x) => x.classList.remove("on")); c.classList.add("on"); S[key] = c.dataset.v;
    }));
  }

  function bind() {
    $$(".mode").forEach((m) => m.addEventListener("click", () => {
      $$(".mode").forEach((x) => x.classList.remove("on")); m.classList.add("on"); S.mode = m.dataset.mode;
    }));
    autocomplete($("#bSearch"), $("#bList"), searchBuildings, (v) => { const b = v.b; b._picked = v.label; S.building = b; S.area = b.a; $("#areaField").classList.add("hidden"); showPicked(); });
    autocomplete($("#aSearch"), $("#aList"), searchAreas, (a) => { S.area = a; showPicked(); });
    $("#noBuilding").onclick = () => { $("#areaField").classList.remove("hidden"); $("#aSearch").focus(); };

    seg("#ptype", "type");
    chipsSingle("#beds", "beds");
    seg("#unitSel", "sizeUnit");
    seg("#status", "status");
    seg("#occ", "occupancy", (v) => $("#leaseBox").classList.toggle("hidden", v !== "tenanted"));
    seg("#furn", "furnishing");
    seg("#upg", "upgradedS", (v) => { S.upgraded = v === "yes"; $("#upgBox").classList.toggle("hidden", !S.upgraded); });

    $("#upgItems").innerHTML = Object.entries(CFG.upgrades.items).map(([k, v]) => `<span class="chip" data-v="${k}">${esc(v.label)}</span>`).join("");
    $$("#upgItems .chip").forEach((c) => c.addEventListener("click", () => {
      c.classList.toggle("on");
      S.upgrades = $$("#upgItems .chip.on").map((x) => x.dataset.v);
    }));
    $("#upgDate").max = thisMonth();
    $("#upgDate").addEventListener("input", (e) => { S.upgradeDate = e.target.value; });
    $("#upgAmount").addEventListener("input", (e) => {
      const n = parseInt(e.target.value.replace(/[^\d]/g, ""), 10) || 0;
      S.upgradeAmount = n;
      e.target.value = n ? n.toLocaleString("en-US") : "";
    });
    $("#cc").addEventListener("change", (e) => $("#ccOther").classList.toggle("hidden", e.target.value !== "other"));

    $$("[data-next]").forEach((b) => b.addEventListener("click", () => { if (validate(S.step)) go(S.step + 1); }));
    $$("[data-back]").forEach((b) => b.addEventListener("click", () => go(S.step - 1)));
    $("#submit").addEventListener("click", submit);

    const wa = `https://wa.me/${CFG.brand.whatsapp}?text=${encodeURIComponent("Hi, I'd like a professional valuation of my property.")}`;
    $("#hdrWa").href = wa;
  }

  /* ---------- upgrade: one total amount + one date ---------- */
  const thisMonth = () => new Date().toISOString().slice(0, 7);
  const fmtMonth = (ym) => (ym ? new Date(ym + "-01").toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "");

  const NAMES = { 1: "Your property", 2: "Property details", 3: "Condition & occupancy", 4: "Your details" };
  function go(n) {
    S.step = n;
    $$(".step").forEach((s) => s.classList.toggle("hidden", +s.dataset.step !== n));
    $("#prog").style.width = n * 25 + "%";
    $("#stepTxt").textContent = `Step ${n} of 4`;
    $("#stepName").textContent = NAMES[n];
    // sale-only fields
    $("#fOcc").classList.toggle("hidden", S.mode !== "sale");
    $("#fStatus").classList.toggle("hidden", S.mode !== "sale");
    window.scrollTo({ top: $("#app").offsetTop - 80, behavior: "smooth" });
  }

  function err(n, msg) { $("#err" + n).textContent = msg || ""; return !msg; }
  function sqft() {
    const v = parseFloat($("#size").value);
    return S.sizeUnit === "sqm" ? v * 10.7639 : v;
  }
  function validate(n) {
    if (n === 1) {
      S.buildingFree = $("#bFree").value.trim();
      if (!S.building && !S.area) return err(1, "Please choose your building, or search by area.");
      return err(1);
    }
    if (n === 2) {
      if (!S.beds) return err(2, "Please select the number of bedrooms.");
      const s = sqft();
      if (!s || s < 150 || s > 40000) return err(2, "Please enter the property size.");
      return err(2);
    }
    if (n === 3) {
      if (S.mode === "sale" && S.occupancy === "tenanted" && !$("#leaseEnd").value) return err(3, "When does the current tenancy end?");
      if (S.upgraded && !S.upgrades.length) return err(3, "Select what was upgraded.");
      if (S.upgraded && !S.upgradeDate) return err(3, "When was the property upgraded?");
      if (S.upgraded && S.upgradeDate > thisMonth()) return err(3, "The upgrade date can't be in the future.");
      if (S.upgraded && S.upgradeAmount > 20000000) return err(3, "Please check the amount paid.");
      return err(3);
    }
    if (n === 4) {
      if ($("#name").value.trim().length < 2) return err(4, "Please enter your name.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test($("#email").value.trim())) return err(4, "Please enter a valid email.");
      const digits = $("#phone").value.replace(/\D/g, "");
      if (digits.length < 7 || digits.length > 13) return err(4, "Please enter a valid mobile number.");
      if ($("#cc").value === "other" && !/^\+?\d{1,4}$/.test($("#ccOther").value.trim())) return err(4, "Please enter your country code.");
      if (!$("#consent").checked) return err(4, "Please tick the box so we can send your valuation.");
      return err(4);
    }
    return true;
  }

  /* ---------- submit ---------- */
  async function submit() {
    if (!validate(4)) return;
    const btn = $("#submit"); btn.disabled = true; btn.textContent = "Calculating…";
    const input = {
      mode: S.mode, building: S.building, area: S.area, type: S.type, beds: S.beds, sqft: Math.round(sqft()),
      status: S.mode === "sale" ? S.status : "R", occupancy: S.occupancy, leaseEnd: $("#leaseEnd").value,
      furnishing: S.furnishing, upgraded: S.upgraded, upgrades: S.upgraded ? S.upgrades : [],
      upgradeAmount: S.upgraded ? S.upgradeAmount : 0, upgradeDate: S.upgraded ? S.upgradeDate : "",
    };
    const est = window.VMP.estimate(input, M, CFG);
    const cc = $("#cc").value === "other" ? $("#ccOther").value.trim().replace(/^(?!\+)/, "+") : $("#cc").value;
    const phone = `${cc} ${$("#phone").value.replace(/\D/g, "").replace(/^0+/, "")}`;
    const buildingName = S.building ? (S.building._picked || title(S.building.n)) : S.buildingFree;

    const lead = {
      "form-name": "valuation-lead",
      mode: S.mode === "sale" ? "Sale" : "Rent",
      building: buildingName || "(not given)",
      area: S.area ? areaLabel(S.area) : "",
      unit_number: $("#unit").value.trim(),
      property_type: S.type === "V" ? "Villa/Townhouse" : "Apartment",
      bedrooms: bedsLabel(S.beds),
      size_sqft: input.sqft,
      status: S.mode === "sale" ? (S.status === "O" ? "Off-plan" : "Ready") : "",
      occupancy: S.mode === "sale" ? S.occupancy : "",
      tenanted_until: S.mode === "sale" && S.occupancy === "tenanted" ? input.leaseEnd : "",
      furnishing: S.furnishing,
      upgraded: S.upgraded ? "Yes" : "No",
      upgrades: S.upgraded ? S.upgrades.map((k) => CFG.upgrades.items[k].label).join(", ") : "",
      upgrade_amount_paid: S.upgraded && S.upgradeAmount ? aed(S.upgradeAmount) : "",
      upgrade_date: S.upgraded ? fmtMonth(S.upgradeDate) : "",
      name: $("#name").value.trim(),
      email: $("#email").value.trim(),
      phone,
      consent: "Yes",
      estimate: est ? aed(est.value) + (S.mode === "rent" ? " /yr" : "") : "No estimate (insufficient data)",
      estimate_range: est ? `${aed(est.low)} – ${aed(est.high)}` : "",
      estimate_basis: est ? `${est.basis.level}: ${title(est.basis.name)} · ${est.basis.n} deals · ${est.basis.key} · AED ${est.marketPsf}/sqft` : "",
      company_website: $("#hp").value,
    };
    const summary = est ? valuationText(est, input, buildingName) : "";
    const clientDigits = phone.replace(/\D/g, "");
    lead.whatsapp_client_link = est ? `https://wa.me/${clientDigits}?text=${encodeURIComponent(`Hi ${lead.name.split(" ")[0]}, ${CFG.brand.name} here. ` + summary)}` : "";
    const emailed = est ? await emailClient(lead, est, input, buildingName) : false;
    lead.email_sent_to_client = emailed ? "Yes" : "No";
    S.contact = { name: lead.name, email: lead.email, digits: clientDigits, emailed, summary };
    try {
      await fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(lead).toString() });
    } catch (e) { /* lead post failed (e.g. preview) — still show result */ }

    renderResult(est, input, buildingName);
  }

  /* ---------- sending the valuation to the client ---------- */
  function valuationText(est, input, buildingName) {
    const isRent = est.mode === "rent";
    const where = [buildingName, S.area ? areaLabel(S.area) : ""].filter(Boolean).join(", ");
    return `Your ${isRent ? "rental" : "sale"} valuation for the ${bedsLabel(input.beds)} ${input.type === "V" ? "villa" : "apartment"} (${input.sqft.toLocaleString()} sq ft) at ${where}:\n` +
      `Estimate: ${aed(est.value)}${isRent ? " per year" : ""}\nLikely range: ${aed(est.low)} – ${aed(est.high)}\n` +
      `Based on ${est.basis.n} registered DLD ${isRent ? "rent contracts" : "sales"}. Reply here for a free professional valuation.`;
  }

  async function emailClient(lead, est, input, buildingName) {
    const e = CFG.emailjs || {};
    if (!e.serviceId || !e.templateId || !e.publicKey) return false;
    const isRent = est.mode === "rent";
    const breakdown = [`<tr><td>Market value (${aed(est.marketPsf)}/sq ft × ${input.sqft.toLocaleString()} sq ft)</td><td align="right">${aed(est.base)}</td></tr>`]
      .concat(est.adjustments.map((a) => `<tr><td>${esc(a.label)}</td><td align="right">${a.pct > 0 ? "+" : ""}${a.pct}%</td></tr>`)).join("");
    const params = {
      to_name: lead.name, to_email: lead.email,
      valuation_type: isRent ? "Rental valuation" : "Sale valuation",
      property: `${bedsLabel(input.beds)} ${input.type === "V" ? "villa/townhouse" : "apartment"} · ${input.sqft.toLocaleString()} sq ft`,
      location: [buildingName, lead.unit_number ? "Unit " + lead.unit_number : "", lead.area].filter(Boolean).join(", "),
      estimate: aed(est.value) + (isRent ? " / year" : ""),
      range: `${aed(est.low)} – ${aed(est.high)}`,
      basis: `${est.basis.n} registered DLD ${isRent ? "rent contracts" : "sales"} in ${est.basis.level === "building" ? title(est.basis.name) : areaLabel(est.basis.name)}`,
      breakdown,
      agent_phone: CFG.brand.phone, agent_email: CFG.brand.email,
      agent_whatsapp: `https://wa.me/${CFG.brand.whatsapp}?text=${encodeURIComponent("Hi, I received my valuemyprop valuation and would like a professional valuation.")}`,
      lead_phone: lead.phone,
    };
    try {
      const r = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_id: e.serviceId, template_id: e.templateId, user_id: e.publicKey, template_params: params }),
      });
      return r.ok;
    } catch (err) { return false; }
  }

  /* ---------- result ---------- */
  function renderResult(est, input, buildingName) {
    $("#wizard").classList.add("hidden");
    const R = $("#result"); R.classList.remove("hidden");
    const where = [buildingName, S.area ? areaLabel(S.area) : ""].filter(Boolean).join(", ");
    const what = `${bedsLabel(input.beds)} ${input.type === "V" ? "villa/townhouse" : "apartment"} · ${input.sqft.toLocaleString()} sq ft`;
    const waText = `Hi, I just used valuemyprop for my ${what} in ${where}${est ? ` (estimate ${aed(est.value)})` : ""}. I'd like a professional valuation.`;
    const wa = `https://wa.me/${CFG.brand.whatsapp}?text=${encodeURIComponent(waText)}`;

    if (!est) {
      R.innerHTML = `<div class="res-top"><div class="kicker">Thank you</div><div class="prop">${esc(what)}<br>${esc(where)}</div>
        <div class="res-val" style="font-size:26px">We need a closer look at this one</div>
        <p class="res-range">There aren't enough recent registered transactions to give an instant estimate. One of our specialists will send you a personal valuation shortly.</p></div>
        ${ctaBox(wa)}`;
      return;
    }
    const isRent = est.mode === "rent";
    const level = est.basis.level === "building" ? title(est.basis.name) : areaLabel(est.basis.name);
    const win = est.basis.months === 12 ? "12 months" : `${est.basis.months} months`;
    const confTxt = { strong: "High confidence", medium: "Good confidence", weak: "Indicative" }[est.confidence];
    const rows = [`<tr><td>Market value (${aed(est.marketPsf)}/sq ft × ${input.sqft.toLocaleString()} sq ft)</td><td class="r">${aed(est.base)}</td></tr>`]
      .concat(est.adjustments.map((a) => `<tr><td>${esc(a.label)}</td><td class="r ${a.pct > 0 ? "pos" : a.pct < 0 ? "neg" : ""}">${a.pct > 0 ? "+" : ""}${a.pct}%</td></tr>`))
      .concat([`<tr><td><b>Your estimate</b></td><td class="r"><b>${aed(est.value)}</b></td></tr>`]).join("");

    let comps = "";
    if (!isRent && S.building && S.building.last && S.building.last.length) {
      comps = `<div class="res-sec"><h3>Latest registered sales in ${esc(title(S.building.n))}</h3><table>
        <tr><th>Date</th><th>Type</th><th class="r">Size</th><th class="r">Price</th></tr>
        ${S.building.last.map((c) => `<tr><td>${new Date(c[0]).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</td><td>${bedsLabel(c[1])}${c[4] === "O" ? " · off-plan" : ""}</td><td class="r">${c[2].toLocaleString()} sq ft</td><td class="r">${aed(c[3])}</td></tr>`).join("")}
      </table></div>`;
    }

    R.innerHTML = `
      <div class="res-top">
        <div class="kicker">${isRent ? "Estimated annual rent" : "Estimated sale value"}</div>
        <div class="prop">${esc(what)}<br>${esc(where)}</div>
        <div class="res-val">${aed(est.value)}${isRent ? " <small>/ year</small>" : ""}</div>
        <div class="res-range">Likely range <b>${aed(est.low)}</b> – <b>${aed(est.high)}</b></div>
        <div class="bar"><i></i></div><div class="bar-l"><span>${aed(est.low)}</span><span>${aed(est.high)}</span></div>
        <span class="badge ${est.confidence}">● ${confTxt} · ${est.basis.n} ${isRent ? "new rent contracts" : "registered sales"} in ${esc(level)} (last ${win})</span>
      </div>
      <div class="res-sec"><h3>How we got there</h3><table>${rows}</table></div>
      ${comps}
      ${sendRow()}
      ${ctaBox(wa)}
      <p class="disc">This is an automated estimate based on Dubai Land Department registered ${isRent ? "Ejari contracts" : "transactions"} and the details you provided. It is not a formal valuation (RICS / DLD-registered valuer) and should not be relied on for lending or legal purposes. Actual ${isRent ? "rent achieved" : "sale price"} depends on view, floor, layout, condition and market timing.</p>
      <p style="text-align:center;margin-top:14px"><button class="link" onclick="location.reload()">Value another property</button></p>`;
    window.scrollTo({ top: $("#app").offsetTop - 80, behavior: "smooth" });
  }

  // Confirmation of the email + a one-tap "send to my WhatsApp" (opens the client's own chat with the summary)
  function sendRow() {
    const c = S.contact || {};
    const ok = c.emailed ? `<span class="send-ok">✓ Sent to ${esc(c.email)}</span>` : "";
    const wa = c.summary ? `<a class="send-wa" href="https://wa.me/${c.digits}?text=${encodeURIComponent(c.summary)}" target="_blank" rel="noopener">Send to my WhatsApp</a>` : "";
    return ok || wa ? `<div class="send-row">${ok}${wa}</div>` : "";
  }

  function ctaBox(wa) {
    return `<div class="cta-box"><h3>Want an exact figure?</h3>
      <p>View, floor and finish can move the price 10–20%. Get a free professional valuation from a Dubai specialist — usually within the hour.</p>
      <div class="cta-btns"><a class="wa" href="${wa}" target="_blank" rel="noopener">WhatsApp a specialist</a><a class="call" href="tel:${CFG.brand.phone.replace(/\s/g, "")}">Call ${esc(CFG.brand.phone)}</a></div></div>`;
  }

  bind();
  load();
})();
