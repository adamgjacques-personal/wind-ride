// Reads config/locations.json, fetches forecasts, evaluates rules, writes site/results.json.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchForecast } from './providers/openMeteo.js';
import { evaluateLocation, dayPhase } from './evaluator.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function windyLink(loc) {
  return loc.windyUrl || `https://www.windy.com/${loc.lat}/${loc.lon}?${loc.lat},${loc.lon},16`;
}

export function validateLocation(loc) {
  const c = loc.conditions;
  const problems = [];
  if (!loc.id || !loc.name) problems.push('id and name are required');
  if (typeof loc.lat !== 'number' || typeof loc.lon !== 'number') problems.push('lat/lon must be numbers');
  if (!c) problems.push('conditions missing');
  else {
    if (typeof c.speedMinKmh !== 'number') problems.push('speedMinKmh must be a number');
    if (!Array.isArray(c.directions) || c.directions.length === 0) problems.push('directions must be a non-empty array of [from,to]');
    if (c.hours && !(c.hours.start < c.hours.end)) problems.push('hours.start must be < hours.end');
  }
  if (problems.length) throw new Error(`Invalid location "${loc.id ?? '?'}": ${problems.join('; ')}`);
}

async function main() {
  const config = JSON.parse(await readFile(join(root, 'config/locations.json'), 'utf8'));
  const forecastDays = config.defaults?.forecastDays ?? 7;
  const amber = config.defaults?.amber;
  const out = [];

  for (const loc of config.locations) {
    validateLocation(loc);
    try {
      const { hours, sun, localNow } = await fetchForecast(loc, forecastDays);
      const upcoming = hours
        .filter((h) => h.time >= localNow)
        .map((h) => ({ ...h, phase: dayPhase(h.time, sun[h.time.slice(0, 10)]) }));
      const result = evaluateLocation(upcoming, loc.conditions, { ...amber, ...loc.amber });
      out.push({ id: loc.id, name: loc.name, windyUrl: windyLink(loc), now: result.now, nextWindow: result.nextWindow, days: result.days, error: null });
    } catch (err) {
      // One failing location should not blank the whole page.
      console.error(`Failed for ${loc.id}: ${err.message}`);
      out.push({ id: loc.id, name: loc.name, windyUrl: windyLink(loc), now: null, nextWindow: null, days: [], error: err.message });
    }
  }

  if (out.length && out.every((l) => l.error)) throw new Error('All locations failed; not overwriting results.json');

  const results = { generatedAt: new Date().toISOString(), locations: out };
  await mkdir(join(root, 'site'), { recursive: true });
  await writeFile(join(root, 'site/results.json'), JSON.stringify(results, null, 2));
  console.log(`Wrote site/results.json for ${out.length} location(s).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
