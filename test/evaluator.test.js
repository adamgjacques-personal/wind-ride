import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayPhase, isRaining, angularDistance, distanceToRange, classifyHour, buildWindows, evaluateLocation, meanDirection, GREEN, AMBER, RED,
} from '../src/evaluator.js';

const amber = { speedMarginPct: 15, directionMarginDeg: 20 };
const cond = {
  speedMinKmh: 10, directions: [[200, 250]],
  hours: { start: 7, end: 19 }, minDurationHours: 2,
};
const hr = (time, o = {}) => ({ time, speed: 15, direction: 225, gust: 25, precip: 0, ...o });

test('angularDistance wraps around north', () => {
  assert.equal(angularDistance(350, 10), 20);
  assert.equal(angularDistance(0, 180), 180);
});

test('distanceToRange: inside, outside, and wrapping range', () => {
  assert.equal(distanceToRange(225, [200, 250]), 0);
  assert.equal(distanceToRange(190, [200, 250]), 10);
  assert.equal(distanceToRange(355, [330, 30]), 0);
  assert.equal(distanceToRange(10, [330, 30]), 0);
  assert.equal(distanceToRange(60, [330, 30]), 30);
});

test('meanDirection handles wrap', () => {
  assert.equal(meanDirection([350, 10]), 0);
});

test('classifyHour: green when all conditions met', () => {
  assert.equal(classifyHour(hr('2025-06-01T10:00'), cond, amber), GREEN);
});

test('classifyHour: speed is minimum-only; strong wind is never penalised', () => {
  assert.equal(classifyHour(hr('2025-06-01T10:00', { speed: 80, gust: 120 }), cond, amber), GREEN);
  assert.equal(classifyHour(hr('2025-06-01T10:00', { speed: 9 }), cond, amber), AMBER); // 1 below, margin 1.5
  assert.equal(classifyHour(hr('2025-06-01T10:00', { speed: 5 }), cond, amber), RED);
});

test('classifyHour: direction amber within margin, red beyond', () => {
  assert.equal(classifyHour(hr('2025-06-01T10:00', { direction: 265 }), cond, amber), AMBER);
  assert.equal(classifyHour(hr('2025-06-01T10:00', { direction: 300 }), cond, amber), RED);
});

test('rain never affects status and is flagged separately', () => {
  assert.equal(classifyHour(hr('2025-06-01T10:00', { precip: 5 }), cond, amber), GREEN);
  assert.equal(isRaining(hr('2025-06-01T10:00', { precip: 0.1 })), true);
  assert.equal(isRaining(hr('2025-06-01T10:00', { precip: 0 })), false);
  assert.equal(isRaining(undefined), false);
  const r = evaluateLocation([hr('2025-06-01T08:00', { precip: 1 }), hr('2025-06-01T09:00')], cond, amber);
  assert.equal(r.nextWindow.rain, true);
  assert.equal(r.days[0].rain, true);
});

test('hours is optional and defaults to all day', () => {
  const noHours = { speedMinKmh: 10, directions: [[200, 250]], minDurationHours: 1 };
  assert.equal(classifyHour(hr('2025-06-01T02:00'), noHours, amber), GREEN);
  assert.equal(classifyHour(hr('2025-06-01T23:00'), noHours, amber), GREEN);
});

test('classifyHour: outside riding hours is red; end hour is exclusive', () => {
  assert.equal(classifyHour(hr('2025-06-01T06:00'), cond, amber), RED);
  assert.equal(classifyHour(hr('2025-06-01T18:00'), cond, amber), GREEN);
  assert.equal(classifyHour(hr('2025-06-01T19:00'), cond, amber), RED);
});

test('buildWindows merges consecutive green hours and enforces min duration', () => {
  const c = [
    { ...hr('2025-06-01T08:00'), status: GREEN },
    { ...hr('2025-06-01T09:00'), status: GREEN },
    { ...hr('2025-06-01T10:00'), status: AMBER },
    { ...hr('2025-06-01T11:00'), status: GREEN }, // single hour, too short
  ];
  const w = buildWindows(c, 2);
  assert.equal(w.length, 1);
  assert.equal(w[0].start, '2025-06-01T08:00');
  assert.equal(w[0].end, '2025-06-01T10:00');
});

test('buildWindows does not join across a gap or midnight', () => {
  const c = [
    { ...hr('2025-06-01T17:00'), status: GREEN },
    { ...hr('2025-06-01T18:00'), status: GREEN },
    { ...hr('2025-06-02T07:00'), status: GREEN },
    { ...hr('2025-06-02T08:00'), status: GREEN },
  ];
  assert.equal(buildWindows(c, 2).length, 2);
});

test('evaluateLocation: green day, amber day (short window), red day, nextWindow', () => {
  const hours = [
    hr('2025-06-01T08:00', { speed: 2 }), hr('2025-06-01T09:00', { speed: 2 }), // red day
    hr('2025-06-02T08:00'), // one green hour only -> amber day
    hr('2025-06-02T09:00', { speed: 2 }),
    hr('2025-06-03T08:00'), hr('2025-06-03T09:00'), hr('2025-06-03T10:00'), // green day
  ];
  const r = evaluateLocation(hours, cond, amber);
  assert.deepEqual(r.days.map((d) => d.status), [RED, AMBER, GREEN]);
  assert.equal(r.nextWindow.start, '2025-06-03T08:00');
  assert.equal(r.nextWindow.end, '2025-06-03T11:00');
});

test('evaluateLocation: no windows gives null nextWindow', () => {
  const r = evaluateLocation([hr('2025-06-01T08:00', { speed: 2 })], cond, amber);
  assert.equal(r.nextWindow, null);
});

test('dayPhase classifies dawn, day, dusk, night around sunrise/sunset', () => {
  const sun = { sunrise: '2025-06-01T06:30', sunset: '2025-06-01T17:30' };
  assert.equal(dayPhase('2025-06-01T03:00', sun), 'night');
  assert.equal(dayPhase('2025-06-01T06:00', sun), 'dawn'); // midpoint 06:30
  assert.equal(dayPhase('2025-06-01T07:00', sun), 'day'); // midpoint 07:30, 60 min after sunrise
  assert.equal(dayPhase('2025-06-01T12:00', sun), 'day');
  assert.equal(dayPhase('2025-06-01T17:00', sun), 'dusk');
  assert.equal(dayPhase('2025-06-01T21:00', sun), 'night');
  assert.equal(dayPhase('2025-06-01T12:00', undefined), 'day');
});

test('window lists the phases it spans, in order, without duplicates', () => {
  const hours = ['16:00', '17:00', '18:00'].map((t, i) => ({ ...hr(`2025-06-01T${t}`), phase: ['day', 'dusk', 'night'][i] }));
  const r = evaluateLocation(hours, { ...cond, hours: undefined }, amber);
  assert.deepEqual(r.nextWindow.phases, ['day', 'dusk', 'night']);
});
