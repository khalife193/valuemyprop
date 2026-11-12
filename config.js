/* =====================================================================
   valuemyprop — YOUR SETTINGS
   Edit the numbers below. Everything is a percentage (+ raises, − lowers).
   Adjustments stack multiplicatively on top of the DLD market value.
   ===================================================================== */
window.VMP_CONFIG = {
  brand: {
    name: "valuemyprop",
    tagline: "Know what your Dubai property is worth — in 60 seconds.",
    whatsapp: "971503359875",                 // digits only, no +
    phone: "+971 50 335 9875",
    email: "ahmad.khalifa@propertylegacy.com",
    company: "Property Legacy Premier Real Estate LLC",
  },

  /* Email the valuation to the client automatically (free: EmailJS, 200 emails/month).
     Leave blank to switch off. Setup steps are in README.md. */
  emailjs: {
    serviceId: "",     // e.g. "service_ab12cd3"
    templateId: "",    // e.g. "template_xy98zt"
    publicKey: "",     // EmailJS → Account → Public key
  },

  // Range shown around the estimate (e.g. 0.05 = ±5%)
  rangeSpread: { strong: 0.05, medium: 0.08, weak: 0.12 },

  /* ---------------- SALE adjustments ---------------- */
  sale: {
    vacant: 3,                 // vacant on transfer
    tenanted: -5,              // tenanted (base)
    tenantedLongLease: -3,     // EXTRA if lease runs more than 12 months from today
    tenantedShortLease: 0,     // EXTRA if lease ends within 3 months
    furnished: 2,
    partlyFurnished: 1,
    unfurnished: 0,
    offplanVsReady: 0,         // extra tweak on top of off-plan market data (data already split ready/off-plan)
  },

  /* ---------------- RENT adjustments ---------------- */
  rent: {
    furnished: 15,
    partlyFurnished: 7,
    unfurnished: 0,
  },

  /* ---------------- UPGRADES (both sale & rent) ----------------
     Value applied per item, scaled by how recent the upgrade is. */
  upgrades: {
    items: {
      kitchen: { label: "Kitchen", value: 3 },
      bathrooms: { label: "Bathrooms", value: 2 },
      flooring: { label: "Flooring", value: 2 },
      lighting: { label: "Lighting / smart home", value: 1 },
      wardrobes: { label: "Built-in wardrobes", value: 1 },
      paint: { label: "Fresh paint", value: 0.5 },
      landscaping: { label: "Garden / landscaping", value: 2 },
      pool: { label: "Private pool added", value: 5 },
      full: { label: "Full renovation", value: 8 },
    },
    // How much of the upgrade value counts, by age of the upgrade
    ageFactor: { lt1: 1, "1to3": 0.75, "3to5": 0.4, gt5: 0 },
    maxTotal: 12,              // cap on total upgrade uplift (%)

    // SALE: when the owner enters the amount paid, value added = amount × costRecovery × ageFactor
    // (buyers rarely pay back 100% of renovation cost). If no amount is given, the % above is used.
    costRecovery: 0.6,
    // RENT: amount paid is recorded for the lead but the rent uplift uses the % values above
    useAmountForRent: false,
  },
};
