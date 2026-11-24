# Zephyr Zoom

Mobile-first static page with a card per cycling spot: current wind and rating, the next good-wind window, and a 7-day red/amber/green strip. Tapping a card opens the spot on Windy (zoom 16) for the full forecast. Free to run: GitHub Actions refreshes the data every 3 hours and deploys to GitHub Pages. Forecasts come from [Open-Meteo](https://open-meteo.com) (no key, non-commercial use).

## Configure

Edit `config/locations.json`. Per location: `lat`, `lon`, optional `windyUrl` (otherwise a windy.com link at zoom 16 is generated), and `conditions`:

- `speedMinKmh`: minimum wind speed in km/h. There are no maximums; stronger wind is never penalised.
- `greatMarginKmh` (optional, default from `defaults.greatMarginKmh`, 10): how far above the minimum counts as great.
- `directions`: list of `[from, to]` degree ranges for where the wind comes from. Ranges may wrap through north, e.g. `[330, 30]`.
- `hours` (optional, default all day): `{ "start": 7, "end": 19 }` local riding hours (end is exclusive).
- `minDurationHours`: consecutive good hours needed for a window.

Status per hour: purple (great) = direction met and speed at least minimum + `greatMarginKmh`, green = speed and direction met, amber = one slightly outside (margins in `defaults.amber`, overridable per location with an `amber` block), red = otherwise. A day is green only if it has a window of at least `minDurationHours`, and purple if it has a run of great hours that long. Great hours count towards good windows; a window is tagged Great if it contains such a run.

Rain is display-only: a rain icon shows when it is raining now at the location, and on the next window or a day when any rain is forecast in it. It never changes the rating.

Time of day is also display-only. The next window shows icons for the phases it spans: 🌅 dawn, ☀️ daytime, 🌇 dusk, 🌙 dark. Each hourly slot is judged at its midpoint using Open-Meteo sunrise and sunset: within 45 minutes of sunrise is dawn, within 45 minutes of sunset is dusk, between them is day, otherwise dark. Use `hours` if you want to exclude dark hours from the rating itself.

## Run locally

    npm test
    npm run build     # writes site/results.json
    npm run serve     # http://localhost:8080

## Deploy (GitHub Pages)

1. Push to a GitHub repo (free Pages requires a public repo).
2. Settings > Pages > Source: **GitHub Actions**.
3. The workflow in `.github/workflows/pages.yml` runs on push, every 3 hours, and manually.

Scheduled workflows in public repos are paused after 60 days without repo activity. Re-enable from the Actions tab, or push a commit.

## Later

- Notifications: add a step after `build` that reads the windows in `results.json`.
- Moving to Cloudflare Pages: all site paths are relative, so only the deploy step changes.
