# valuemyprop — automatic daily DLD updates

Instant Dubai sale & rent estimates from Dubai Land Department data, refreshed every night.

**Data inside (seed history, as of 12 Nov 2026):**
- Sales: every registered DLD residential sale, 1 Jan 2025 – 11 Nov 2026 (2025 from data.dubai, 2026 from DLD open data). 2025 prices adjusted to today's level per area.
- Rents: new freehold Ejari contracts, 1 Jan 2025 – 11 Nov 2026.
- After setup, a nightly job adds each day's new DLD deals automatically.

---

## Setup (about 15 minutes, one time)

### 1. Put the project on GitHub
1. github.com → **New repository** → name `valuemyprop` → **Private** → Create.
2. On the empty repo page click **"uploading an existing file"**.
3. Open this unzipped folder, select **everything inside it** (including the `.github` folder) and drag it into the browser. Commit.
   - Windows hides nothing here, but if you don't see `.github`, enable *View → Show → Hidden items*.

### 2. Connect the existing Netlify site to GitHub
1. app.netlify.com → **valuemyprop** → **Project configuration → Build & deploy → Continuous deployment → Link repository** → GitHub → pick `valuemyprop`.
2. Build settings fill in from `netlify.toml` (publish directory `public`). Save — Netlify deploys the site from GitHub.

### 3. Give the nightly job access to Netlify
In GitHub: repo → **Settings → Secrets and variables → Actions → New repository secret**, add two:
| Name | Value |
|---|---|
| `NETLIFY_SITE_ID` | `2be0d3ed-bd89-4d77-b1a6-f685b0d3cdcb` |
| `NETLIFY_AUTH_TOKEN` | Netlify → your avatar → **User settings → Applications → New access token** → copy |

### 4. First run
GitHub → **Actions** tab → enable workflows if asked → **Nightly DLD market update → Run workflow**.
It loads the seed history, adds the latest DLD deals and publishes. From then on it runs every night at 03:17 Dubai time.

**Check:** the footer of valuemyprop.netlify.app shows "updated <yesterday's date>".

---

## Changing your settings
Edit `public/config.js` on GitHub (pencil icon) → Commit. Netlify redeploys automatically (one deploy = 15 Netlify credits; the nightly data refresh does **not** redeploy and uses no deploy credits).

## If the nightly job fails
GitHub emails you. If the log shows connection errors to `gateway.dubailand.gov.ae`, DLD is blocking servers outside the UAE — run the same job from any always-on computer in the UAE (Windows Task Scheduler running `npm install && npm run update-market` with the two secrets set as environment variables), or a small UAE cloud server.

## Client emails (EmailJS) and lead alerts
See `EMAIL-SETUP.md`.

## How the estimate works
1. Market AED/sq ft = median of DLD deals in the same building + same bedrooms → same building + similar size → the area. Outliers removed.
2. Most recent window first: sales last 6 months (≥5 deals), else 12 months, else full history. Rents 3 → 6 months → full history.
3. Sales split ready vs off-plan. Rents use new Ejari contracts only.
4. × your adjustments from `config.js` → shown as a range.
