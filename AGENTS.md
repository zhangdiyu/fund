# AGENTS.md - Fund Tracker

Personal finance portfolio tracker with dividend tracking, price updates, and allocation simulation.

## Architecture

**Type:** Node.js/Express backend + Vanilla JS frontend  
**Data:** JSON files (no database)  
**Hosting:** GitHub Pages (static export)

```
├── server.js           # Express server (dev/local use)
├── lib/
│   ├── portfolio.js    # CRUD for assets, dividends
│   ├── price-fetcher.js # Yahoo Finance + Sina fallback
│   └── snapshot.js     # Net worth snapshots
├── public/             # Frontend (served static)
│   ├── index.html
│   ├── app.js          # ~2000 lines vanilla JS
│   └── style.css
├── data/               # JSON data files (committed)
│   ├── portfolio.json
│   ├── snapshots.json
│   └── dividends.json
└── scripts/
    └── update-prices.js # GitHub Actions entry point
```

## Key Commands

```bash
# Start dev server (port 3000)
npm start

# Manual price update
node scripts/update-prices.js
```

No build step, no test command, no lint config.

## Data Model

**Asset fields:**
```javascript
{
  id: string (uuid),
  name: string,
  ticker: string,        // e.g. "600036.SS", "AAPL"
  category: string,      // domestic-* | overseas-sg | overseas-hk | overseas-us
  currency: string,      // CNY | USD | HKD | SGD
  shares: number,
  costPrice: number,
  currentPrice: number,
  currentValue: number,
  estimatedDividendYield: number,  // e.g. 0.05 for 5%
  dividendMonths: number[],        // [3, 6, 9, 12]
  isManual: boolean,             // skip auto price update
  lastUpdated: string              // "YYYY-MM-DD"
}
```

**Category prefixes matter** for allocation charts:
- `domestic-*` → domestic
- `overseas-*` → overseas

## Price Fetching

Primary: Yahoo Finance (yahoo-finance2)  
Fallback: Sina Finance (sinaquote)

Rate limiting: 2000ms between requests  
Timeout: 10 seconds

**Ticker formats:**
- A-shares: `600036.SS` (Shanghai), `000001.SZ` (Shenzhen)
- HK: `2318.HK`
- US: `AAPL`, `QQQI`

## GitHub Actions

**Deploy** (`.github/workflows/deploy.yml`):
- Trigger: push to `main` or manual
- Copies static files to `_site/`, deploys to GitHub Pages
- Includes data files (portfolio.json, snapshots.json, etc.)

**Update Prices** (`.github/workflows/update-prices.yml`):
- Schedule: Monday 8:17am UTC
- Runs `scripts/update-prices.js`
- Auto-commits changes

## Frontend Notes

- Vanilla JS, no framework, ~2000 lines in `app.js`
- Chart.js for visualizations
- LocalStorage for auth token and settings
- Password protection overlay (simple hash check)
- Optional browser-side GitHub sync still exists via personal access token, but hosted price updates should use the GitHub Actions workflow page instead of browser dispatch

## Important Conventions

1. **Currency always stored in original currency**, converted on display
2. **Date format:** `YYYY-MM-DD` everywhere
3. **Dividend yield:** stored as decimal (0.05 = 5%)
4. **UUIDs:** v4 for all IDs
5. **JSON files:** always pretty-printed (2 spaces)

## Testing

No test suite. Manual testing workflow:
1. `npm start`
2. Add test asset via UI
3. Run "Update Prices" button
4. Check `data/portfolio.json` updates

Local-dev gotcha:
- `npm start` now serves both `public/` and `/data`. On `localhost` / `127.0.0.1`, `public/app.js` prefers local `/api/portfolio`, `/api/snapshots`, `/api/dividends`, and `/api/update-prices` so local debugging uses repo data by default instead of GitHub API state or stale localStorage.

Hosted-mode gotcha:
- On GitHub Pages, the main update button opens `https://github.com/<repo>/actions/workflows/update-prices.yml` for a manual `workflow_dispatch` run instead of calling `repository_dispatch` from the browser. This avoids PAT-related 403s and should be the default troubleshooting path.

## Gotchas

- Yahoo Finance rate limits aggressively - fallback to Sina essential for A-shares
- `data/*.json` files are committed - don't put real sensitive data in public repo
- GitHub Actions needs `contents: write` permission for price updates
- Sina API requires `Referer` header

## Dependencies

- `express` - dev server
- `yahoo-finance2` - price data
- `uuid` - ID generation

No devDependencies, no build tools.
