// Renders results.json as cards. Uses textContent only (no innerHTML) so data can never inject markup.

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const compass = (deg) => COMPASS[Math.round(deg / 22.5) % 16];
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PHASE = { dawn: ['🌅', 'dawn'], day: ['☀️', 'daytime'], dusk: ['🌇', 'dusk'], night: ['🌙', 'dark'] };
const NOW_LABEL = { green: 'Good now', amber: 'Marginal now', red: 'Poor now' };

// Dates are 'YYYY-MM-DD' / 'YYYY-MM-DDTHH:00' in the location's local time; avoid Date parsing to dodge timezone shifts.
function dayIndex(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function daysBetween(a, b) {
  const t = (s) => Date.UTC(...s.split('-').map((n, i) => (i === 1 ? n - 1 : +n)));
  return Math.round((t(b) - t(a)) / 86400000);
}
function relativeDay(date, today) {
  const diff = today ? daysBetween(today, date) : null;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return `${DAY[dayIndex(date)]} ${Number(date.slice(8, 10))}/${Number(date.slice(5, 7))}`;
}
function timeAgo(iso) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs} h ago` : new Date(iso).toLocaleString();
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}
function iconSpan(symbol, label) {
  const s = el('span', null, symbol);
  s.setAttribute('role', 'img');
  s.setAttribute('aria-label', label);
  s.title = label;
  return s;
}
// Arrow points the way the wind is blowing (direction is where it comes FROM, so add 180°).
function windArrow(fromDeg) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'arrow');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M12 3l6 16-6-4-6 4z');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('transform', `rotate(${(fromDeg + 180) % 360} 12 12)`);
  svg.append(path);
  return svg;
}
const safeUrl = (u) => (/^https:\/\//.test(u) ? u : null);

function renderCard(loc) {
  const li = el('li', 'card');
  const url = safeUrl(loc.windyUrl);
  const a = el(url ? 'a' : 'div');
  if (url) {
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
  li.append(a);

  // Header: name + current status
  const head = el('div', 'card-head');
  head.append(el('h2', 'name', loc.name));
  if (loc.now) head.append(el('span', `pill ${loc.now.status}`, NOW_LABEL[loc.now.status]));
  a.append(head);

  if (loc.error) {
    a.append(el('p', 'err', 'Forecast unavailable right now.'));
  } else {
    // Current wind
    if (loc.now) {
      const n = loc.now;
      const now = el('div', 'now');
      now.append(windArrow(n.directionDeg), el('span', null, `${n.speedKmh} km/h ${compass(n.directionDeg)} · gusts ${n.gustKmh}`));
      if (n.rain) now.append(iconSpan('🌧', 'Raining now'));
      a.append(now);
    }

    // Next good window
    const next = el('div', 'next');
    next.append(el('div', 'next-label', 'Next good wind'));
    const w = loc.nextWindow;
    if (w) {
      const today = loc.days[0]?.date;
      const when = el('div', 'next-when', `${relativeDay(w.start.slice(0, 10), today)} · ${w.start.slice(11, 16)}–${w.end.slice(11, 16)}`);
      const icons = el('span', 'icons');
      if (w.rain) icons.append(iconSpan('🌧', 'Rain expected'));
      for (const p of w.phases ?? []) if (PHASE[p]) icons.append(iconSpan(...PHASE[p]));
      if (icons.childNodes.length) when.append(icons);
      next.append(when, el('div', 'next-detail', `~${w.avgSpeedKmh} km/h from ${compass(w.avgDirectionDeg)} · gusts to ${w.maxGustKmh}`));
    } else {
      next.append(el('div', 'next-when none', 'Nothing in the next 7 days'));
    }
    a.append(next);

    // 7-day strip
    const days = el('div', 'days');
    days.setAttribute('aria-label', '7-day outlook');
    for (const d of loc.days) {
      const day = el('div', `day${d.rain ? ' rain' : ''}`);
      day.title = `${DAY[dayIndex(d.date)]} ${d.date}: ${d.status}, ~${d.speedKmh} km/h from ${compass(d.directionDeg)}${d.rain ? ', rain' : ''}`;
      day.append(el('span', 'day-name', DAY[dayIndex(d.date)].slice(0, 2)), el('span', `day-bar ${d.status}`), el('span', 'day-speed', String(d.speedKmh)));
      days.append(day);
    }
    a.append(days);
  }

  if (url) a.append(el('div', 'card-foot', 'Open in Windy ↗'));
  return li;
}

async function main() {
  const updated = document.getElementById('updated');
  const list = document.getElementById('spots');
  try {
    const res = await fetch('results.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // Soonest good window first, then spots with none, alphabetically.
    const locs = [...data.locations].sort(
      (a, b) => (a.nextWindow?.start ?? '~').localeCompare(b.nextWindow?.start ?? '~') || a.name.localeCompare(b.name),
    );
    list.replaceChildren(...locs.map(renderCard));

    const good = locs.filter((l) => l.nextWindow).length;
    const summary = document.getElementById('summary');
    summary.textContent = good
      ? `${good} of ${locs.length} spots have good wind coming up`
      : 'No good wind at any spot in the next 7 days';
    summary.hidden = false;
    updated.textContent = `Updated ${timeAgo(data.generatedAt)}`;
    updated.title = new Date(data.generatedAt).toLocaleString();
  } catch (e) {
    list.replaceChildren();
    updated.textContent = '';
    const err = document.getElementById('error');
    err.hidden = false;
    err.textContent = `Could not load forecast data (${e.message}).`;
  }
}
main();
