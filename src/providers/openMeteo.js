// Open-Meteo forecast provider. No API key. Free for non-commercial use.
// Returns local-time hourly data so time-of-day rules need no timezone maths.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET with a per-attempt timeout and a few retries; surfaces the underlying network error. */
async function getJson(url, fetchImpl, attempts = 4) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'zephyr-zoom (personal project)' } });
      if (res.ok) return await res.json();
      last = new Error(`HTTP ${res.status}`);
      if (res.status < 500 && res.status !== 429) break; // client errors will not improve on retry
    } catch (err) {
      last = new Error(`${err.message}${err.cause ? ` (${err.cause.code ?? err.cause.message})` : ''}`);
    }
    if (i < attempts) await sleep(2000 * i);
  }
  throw new Error(`Open-Meteo request failed: ${last.message}`);
}

export async function fetchForecast({ lat, lon }, forecastDays = 7, fetchImpl = fetch) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation',
    wind_speed_unit: 'kmh',
    daily: 'sunrise,sunset',
    timezone: 'auto',
    forecast_days: String(forecastDays),
  });
  const json = await getJson(`https://api.open-meteo.com/v1/forecast?${params}`, fetchImpl);
  const h = json.hourly;
  const hours = h.time.map((time, i) => ({
    time,
    speed: h.wind_speed_10m[i],
    direction: h.wind_direction_10m[i],
    gust: h.wind_gusts_10m[i],
    precip: h.precipitation[i],
  }));
  const sun = Object.fromEntries(json.daily.time.map((d, i) => [d, { sunrise: json.daily.sunrise[i], sunset: json.daily.sunset[i] }]));
  // Local "now" at the location, as 'YYYY-MM-DDTHH:00'.
  const localNow = new Date(Date.now() + json.utc_offset_seconds * 1000).toISOString().slice(0, 13) + ':00';
  return { hours, sun, localNow, timezone: json.timezone };
}
