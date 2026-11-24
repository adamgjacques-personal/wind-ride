# Ride Wind Outlook

Static page listing known cycling locations, the next day and time with good wind, and a 7-day red/amber/green strip. Links out to Windy for full forecasts. Free to run: GitHub Actions refreshes the data every 3 hours and deploys to GitHub Pages. Forecasts come from [Open-Meteo](https://open-meteo.com) (no key, non-commercial use).

## Configure

Edit `config/locations.json`. Per location: `lat`, `lon`, optional `windyUrl` (otherwise a windy.com link is generated), and `conditions`:

- `speedMinKmh`: minimum wind speed in km/h. There are no maximums; stronger wind is never penalised.
- `directions`: list of `[from, to]` degree ranges for where the wind comes from. Ranges may wrap through north, e.g. `[330, 30]`.
- `hours` (optional, default all day): `{ "start": 7, "end": 19 }` local riding hours (end is exclusive).
- `minDurationHours`: consecutive good hours needed for a window.

Status per hour: green = speed and direction met, amber = one slightly outside (margins in `defaults.amber`, overridable per location with an `amber` block), red = otherwise. A day is green only if it has a window of at least `minDurationHours`.

Rain is display-only: a rain icon shows when it is raining now at the location, and on the next window or a day when any rain is forecast in it. It never changes the rating.

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
