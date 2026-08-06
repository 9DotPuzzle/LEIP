// Geometric validation of the world: no port floats in open sea, and no
// sailed leg crosses land. Both are checked against the SAME coastline
// rings the game renders — there is only one land geometry.
import { loadEngine } from './extract.mjs';

const g = loadEngine();
const D = g.LEIP_DATA;
const E = g.LEIP_ENGINE;
const TER = g.LEIP_TERRAIN;

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.error(`  FAIL ${name}${detail !== undefined ? ' — ' + detail : ''}`); }
}
function section(t) { console.log(`\n== ${t}`); }

// Coastline rings as [lon,lat] pairs, with a bounding box for quick rejection.
const rings = TER.coasts.map((flat) => {
  const pts = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < flat.length; i += 2) {
    const x = flat[i], y = flat[i + 1];
    pts.push([x, y]);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { pts, minX, maxX, minY, maxY };
});

const inRing = (x, y, r) => {
  if (x < r.minX || x > r.maxX || y < r.minY || y > r.maxY) return false;
  let inside = false;
  const p = r.pts;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if ((p[i][1] > y) !== (p[j][1] > y) &&
        x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) inside = !inside;
  }
  return inside;
};
const onLand = (x, y) => rings.some((r) => inRing(x, y, r));

// Segment intersection, used to catch a leg clipping a headland even when
// both endpoints are in water.
function segsCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  return o1 !== o2 && o3 !== o4;
}
function crossesLand(a, b) {
  const minX = Math.min(a[0], b[0]), maxX = Math.max(a[0], b[0]);
  const minY = Math.min(a[1], b[1]), maxY = Math.max(a[1], b[1]);
  for (const r of rings) {
    if (r.maxX < minX || r.minX > maxX || r.maxY < minY || r.minY > maxY) continue;
    const p = r.pts;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      if (segsCross(a, b, p[j], p[i])) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- ports
section('Ports sit on their coastline, never in open sea');
{
  // "On the coastline" = the charted position is on land or within a short
  // reach of it. A port floating mid-basin would fail both.
  const coastReachDeg = 0.08;                    // ~5 nm
  const offshore = [];
  for (const p of D.ports) {
    if (onLand(p.lon, p.lat)) continue;
    let near = false;
    for (let dx = -coastReachDeg; dx <= coastReachDeg && !near; dx += coastReachDeg / 2) {
      for (let dy = -coastReachDeg; dy <= coastReachDeg; dy += coastReachDeg / 2) {
        if (onLand(p.lon + dx, p.lat + dy)) { near = true; break; }
      }
    }
    if (!near) offshore.push(p.name);
  }
  check(`all ${D.ports.length} ports are on or beside real coastline`, offshore.length === 0, offshore.join(', '));

  const wet = D.ports.filter((p) => onLand(E.berth(p.name).lon, E.berth(p.name).lat));
  check('every berth is in water, not on the beach', wet.length === 0, wet.map((p) => p.name).join(', '));
}

// ---------------------------------------------------------------- sea lanes
section('No sailed leg crosses land');
{
  const names = D.ports.map((p) => p.name);
  const bad = [];
  let legs = 0, waypoints = 0;
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const path = E.legPath(names[i], names[j]).map((q) => [q.lon, q.lat]);
      legs++;
      waypoints += path.length - 2;
      for (let k = 0; k + 1 < path.length; k++) {
        if (crossesLand(path[k], path[k + 1])) { bad.push(`${names[i]}->${names[j]}`); break; }
      }
    }
  }
  check(`${legs} port-pair legs, ${waypoints} rounding waypoints, none crossing land`,
    bad.length === 0, bad.slice(0, 8).join(', ') + (bad.length > 8 ? ` (+${bad.length - 8} more)` : ''));

  // The straight rhumb line for the same pairs certainly does cross land —
  // proof the lanes are doing real work.
  let wouldCross = 0;
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = E.berth(names[i]), b = E.berth(names[j]);
      if (crossesLand([a.lon, a.lat], [b.lon, b.lat])) wouldCross++;
    }
  }
  check(`the rhumb line would sail overland on ${wouldCross} of those pairs`, wouldCross > 50, String(wouldCross));
}

// ---------------------------------------------------------------- terrain
section('Terrain is real, registered geometry');
{
  check('coastline rings present and detailed', rings.length > 50 &&
    TER.coasts.reduce((n, r) => n + r.length / 2, 0) > 5000);
  const bbox = rings.reduce((b, r) => ({
    minX: Math.min(b.minX, r.minX), maxX: Math.max(b.maxX, r.maxX),
    minY: Math.min(b.minY, r.minY), maxY: Math.max(b.maxY, r.maxY)
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  const portBox = D.ports.reduce((b, p) => ({
    minX: Math.min(b.minX, p.lon), maxX: Math.max(b.maxX, p.lon),
    minY: Math.min(b.minY, p.lat), maxY: Math.max(b.maxY, p.lat)
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  check('terrain frame contains every port with margin',
    bbox.minX < portBox.minX && bbox.maxX > portBox.maxX &&
    bbox.minY < portBox.minY && bbox.maxY > portBox.maxY);
  // Islands a naval audience will look for, by area rank.
  const area = (r) => {
    let a = 0;
    for (let i = 0, n = r.pts.length; i < n; i++) {
      const p = r.pts[i], q = r.pts[(i + 1) % n];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(a / 2);
  };
  const named = { Sicily: [14.0, 37.6], Sardinia: [9.1, 40.1], Corsica: [9.1, 42.2],
                  Crete: [24.8, 35.2], Mallorca: [3.0, 39.6], Rhodes: [28.0, 36.2] };
  const missing = Object.entries(named).filter(([, c]) => !onLand(c[0], c[1])).map(([n]) => n);
  check('Sicily, Sardinia, Corsica, Crete, Mallorca and Rhodes are all present',
    missing.length === 0, missing.join(', '));
  check('the largest ring is the European mainland', area(rings[0]) > 100);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
