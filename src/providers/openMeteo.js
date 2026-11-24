// Open-Meteo forecast provider. No API key. Free for non-commercial use.
// Returns local-time hourly data so time-of-day rules need no timezone maths.

export async function fetchForecast({ lat, lon }, forecastDays = 7, fetchImpl = fetch) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation',
    wind_speed_unit: 'kmh',
    timezone: 'auto',
    forecast_days: String(forecastDays),
  });
  const res = await fetchImpl(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo returned ${res.status} for ${lat},${lon}`);
  const json = await res.json();
  const h = json.hourly;
  const hours = h.time.map((time, i) => ({
    time,
    speed: h.wind_speed_10m[i],
    direction: h.wind_direction_10m[i],
    gust: h.wind_gusts_10m[i],
    precip: h.precipitation[i],
  }));
  // Local "now" at the location, as 'YYYY-MM-DDTHH:00'.
  const localNow = new Date(Date.now() + json.utc_offset_seconds * 1000).toISOString().slice(0, 13) + ':00';
  return { hours, localNow, timezone: json.timezone };
}
