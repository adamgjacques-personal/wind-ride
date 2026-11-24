// Renders results.json. Uses textContent only (no innerHTML) so data can never inject markup.

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const compass = (deg) => COMPASS[Math.round(deg / 22.5) % 16];
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Dates are 'YYYY-MM-DD' / 'YYYY-MM-DDTHH:00' in the location's local time; avoid Date parsing to dodge timezone shifts.
function dayName(date) {
  const [y, m, d] = date.split('-').map(Number);
  return DAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}
function formatWindow(w) {
  const date = w.start.slice(0, 10);
  return `${dayName(date)} ${date.slice(8, 10)}/${date.slice(5, 7)}, ${w.start.slice(11, 16)}–${w.end.slice(11, 16)}`;
}
function el(tag, props = {}, text) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  if (text != null) e.textContent = text;
  return e;
}
const safeUrl = (u) => (/^https:\/\//.test(u) ? u : null);

function renderRow(loc) {
  const tr = el('tr');
  tr.append(el('td', {}, loc.name));

  const next = el('td');
  if (loc.error) next.append(el('span', { className: 'err' }, 'Forecast unavailable'));
  else if (loc.nextWindow) {
    const w = loc.nextWindow;
    next.append(el('strong', {}, formatWindow(w)));
    next.append(el('span', { className: 'win-detail' }, `~${w.avgSpeedKmh} km/h from ${compass(w.avgDirectionDeg)}, gusts ${w.maxGustKmh}`));
  } else next.append(document.createTextNode('None in forecast'));
  tr.append(next);

  const strip = el('div', { className: 'strip' });
  for (const d of loc.days) {
    const cell = el('div', { className: `cell ${d.status}` }, dayName(d.date).slice(0, 2));
    cell.title = `${dayName(d.date)} ${d.date}: ${d.status}. ~${d.speedKmh} km/h from ${compass(d.directionDeg)}, gusts ${d.gustKmh}`;
    strip.append(cell);
  }
  tr.append(el('td').appendChild(strip).parentNode);

  const link = el('td');
  const url = safeUrl(loc.windyUrl);
  if (url) link.append(el('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, 'Windy'));
  tr.append(link);
  return tr;
}

async function main() {
  const updated = document.getElementById('updated');
  try {
    const res = await fetch('results.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // Sort: locations with the soonest window first, then those without.
    const locs = [...data.locations].sort((a, b) => (a.nextWindow?.start ?? '9') .localeCompare(b.nextWindow?.start ?? '9'));
    const rows = document.getElementById('rows');
    locs.forEach((l) => rows.append(renderRow(l)));
    document.getElementById('table').hidden = false;
    updated.textContent = `Updated ${new Date(data.generatedAt).toLocaleString()}`;
  } catch (e) {
    updated.textContent = '';
    const err = document.getElementById('error');
    err.hidden = false;
    err.textContent = `Could not load forecast data (${e.message}).`;
  }
}
main();
