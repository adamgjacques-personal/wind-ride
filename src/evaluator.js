// Pure rule evaluation. No network or file access, so it is easy to test.

export const GREEN = 'green';
export const AMBER = 'amber';
export const RED = 'red';
export const GREAT = 'great';

const RANK = { [RED]: 0, [AMBER]: 1, [GREEN]: 2, [GREAT]: 3 };
const DEFAULT_GREAT_MARGIN_KMH = 10;

/** Good enough to ride: green or great. */
export const isGood = (status) => status === GREEN || status === GREAT;

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
  status = worst(status, dirMiss === 0 ? GREEN : dirMiss <= amber.directionMarginDeg ? AMBER : RED);

  // Great: everything met and speed at least greatMarginKmh above the minimum.
  const greatAt = conditions.speedMinKmh + (conditions.greatMarginKmh ?? DEFAULT_GREAT_MARGIN_KMH);
  return status === GREEN && hour.speed >= greatAt ? GREAT : status;
}

/** Rain is display-only and never affects the status. */
export function isRaining(hour) {
  return hour != null && hour.precip > 0;
}

const toMinutes = (t) => Number(t.slice(11, 13)) * 60 + Number(t.slice(14, 16));
const TWILIGHT_MIN = 45;

/**
 * Time-of-day phase for an hourly slot, judged at the slot's midpoint (local time).
 * dawn/dusk = within 45 minutes either side of sunrise/sunset; day = between; night = otherwise.
 * sun: { sunrise, sunset } as 'YYYY-MM-DDTHH:MM'. Missing sun times (polar regions) count as day.
 */
export function dayPhase(time, sun) {
  if (!sun?.sunrise || !sun?.sunset) return 'day';
  const mid = Number(time.slice(11, 13)) * 60 + 30;
  const rise = toMinutes(sun.sunrise);
  const set = toMinutes(sun.sunset);
  if (Math.abs(mid - rise) <= TWILIGHT_MIN) return 'dawn';
  if (Math.abs(mid - set) <= TWILIGHT_MIN) return 'dusk';
  return mid > rise && mid < set ? 'day' : 'night';
}

/** Merge consecutive matching hours (same day) into windows of at least minDurationHours. Default match: green or great. */
export function buildWindows(classified, minDurationHours, match = isGood) {
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
    if (match(h.status)) {
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
    phases: [...new Set(run.map((h) => h.phase).filter(Boolean))],
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
 * Returns { now, days: [{date, status, speedKmh, directionDeg, gustKmh, rain}], windows, nextWindow }.
 */
export function evaluateLocation(hours, conditions, amber) {
  const classified = hours.map((h) => ({ ...h, status: classifyHour(h, conditions, amber) }));
  const minDur = conditions.minDurationHours ?? 1;
  const greatWindows = buildWindows(classified, minDur, (st) => st === GREAT);
  // A good window is "great" if it contains a run of great hours at least minDurationHours long.
  const windows = buildWindows(classified, minDur).map((w) => ({
    ...w,
    great: greatWindows.some((g) => g.start >= w.start && g.start < w.end),
  }));

  const byDate = new Map();
  for (const h of classified) {
    const date = h.time.slice(0, 10);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(h);
  }

  const days = [...byDate.entries()].map(([date, list]) => {
    const dayWindows = windows.filter((w) => w.start.slice(0, 10) === date);
    const bestStatus = list.reduce((s, h) => best(s, h.status), RED);
    // A green/great day needs a long-enough window; otherwise cap at amber.
    const status = dayWindows.some((w) => w.great) ? GREAT : dayWindows.length ? GREEN : isGood(bestStatus) ? AMBER : bestStatus;
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

  const first = classified[0];
  const now = first
    ? {
        status: first.status,
        speedKmh: Math.round(first.speed),
        directionDeg: Math.round(first.direction),
        gustKmh: Math.round(first.gust),
        rain: isRaining(first),
        phase: first.phase ?? null,
      }
    : null;
  return { now, days, windows, nextWindow: windows[0] ?? null };
}
