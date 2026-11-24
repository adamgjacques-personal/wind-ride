// Pure rule evaluation. No network or file access, so it is easy to test.

export const GREEN = 'green';
export const AMBER = 'amber';
export const RED = 'red';

const RANK = { [RED]: 0, [AMBER]: 1, [GREEN]: 2 };

export function worst(a, b) {
  return RANK[a] <= RANK[b] ? a : b;
}
export function best(a, b) {
  return RANK[a] >= RANK[b] ? a : b;
}

/** Smallest angle between two compass bearings, 0..180. */
export function angularDistance(a, b) {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}

/** Degrees outside the range [from, to] (0 if inside). Handles ranges that wrap through north. */
export function distanceToRange(deg, [from, to]) {
  const d = ((deg % 360) + 360) % 360;
  const f = ((from % 360) + 360) % 360;
  const t = ((to % 360) + 360) % 360;
  const inside = f <= t ? d >= f && d <= t : d >= f || d <= t;
  if (inside) return 0;
  return Math.min(angularDistance(d, f), angularDistance(d, t));
}

/** Minimum-only check: green at or above min, amber within marginPct below it, otherwise red. */
function minStatus(value, min, marginPct) {
  if (value >= min) return GREEN;
  return min - value <= (min * marginPct) / 100 ? AMBER : RED;
}

/**
 * Classify one forecast hour.
 * hour: { time: 'YYYY-MM-DDTHH:00', speed, direction, gust, precip }
 */
export function classifyHour(hour, conditions, amber) {
  const { start, end } = conditions.hours ?? { start: 0, end: 24 };
  const h = Number(hour.time.slice(11, 13));
  if (h < start || h >= end) return RED;

  let status = minStatus(hour.speed, conditions.speedMinKmh, amber.speedMarginPct);

  const dirMiss = Math.min(...conditions.directions.map((r) => distanceToRange(hour.direction, r)));
  return worst(status, dirMiss === 0 ? GREEN : dirMiss <= amber.directionMarginDeg ? AMBER : RED);
}

/** Rain is display-only and never affects the status. */
export function isRaining(hour) {
  return hour != null && hour.precip > 0;
}

/** Merge consecutive green hours (same day) into windows of at least minDurationHours. */
export function buildWindows(classified, minDurationHours) {
  const windows = [];
  let run = [];
  const flush = () => {
    if (run.length >= minDurationHours) windows.push(summariseRun(run));
    run = [];
  };
  for (const h of classified) {
    const prev = run[run.length - 1];
    const contiguous =
      prev && prev.time.slice(0, 10) === h.time.slice(0, 10) && Number(h.time.slice(11, 13)) === Number(prev.time.slice(11, 13)) + 1;
    if (h.status === GREEN) {
      if (prev && !contiguous) flush();
      run.push(h);
    } else {
      flush();
    }
  }
  flush();
  return windows;
}

function summariseRun(run) {
  const avg = (k) => run.reduce((s, h) => s + h[k], 0) / run.length;
  const last = run[run.length - 1];
  const endHour = Number(last.time.slice(11, 13)) + 1;
  return {
    start: run[0].time,
    end: `${last.time.slice(0, 10)}T${String(endHour).padStart(2, '0')}:00`,
    avgSpeedKmh: Math.round(avg('speed')),
    avgDirectionDeg: meanDirection(run.map((h) => h.direction)),
    maxGustKmh: Math.round(Math.max(...run.map((h) => h.gust))),
    rain: run.some(isRaining),
  };
}

/** Circular mean of bearings. */
export function meanDirection(degs) {
  const rad = (d) => (d * Math.PI) / 180;
  const x = degs.reduce((s, d) => s + Math.cos(rad(d)), 0);
  const y = degs.reduce((s, d) => s + Math.sin(rad(d)), 0);
  return Math.round((((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360);
}

/**
 * Evaluate a location over its forecast.
 * hours: array of { time, speed, direction, gust, precip }, already limited to the hours to consider.
 * Returns { days: [{date, status, speedKmh, directionDeg, gustKmh, rain}], windows, nextWindow }.
 */
export function evaluateLocation(hours, conditions, amber) {
  const classified = hours.map((h) => ({ ...h, status: classifyHour(h, conditions, amber) }));
  const windows = buildWindows(classified, conditions.minDurationHours ?? 1);

  const byDate = new Map();
  for (const h of classified) {
    const date = h.time.slice(0, 10);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(h);
  }

  const days = [...byDate.entries()].map(([date, list]) => {
    const hasWindow = windows.some((w) => w.start.slice(0, 10) === date);
    const bestStatus = list.reduce((s, h) => best(s, h.status), RED);
    // A green day needs a long-enough window; otherwise cap at amber.
    const status = hasWindow ? GREEN : bestStatus === GREEN ? AMBER : bestStatus;
    const rep = list.find((h) => h.status === bestStatus) ?? list[0];
    return {
      date,
      status,
      speedKmh: Math.round(rep.speed),
      directionDeg: Math.round(rep.direction),
      gustKmh: Math.round(rep.gust),
      rain: list.some(isRaining),
    };
  });

  return { days, windows, nextWindow: windows[0] ?? null };
}
