// Geometric validation of the world: no port floats in open sea, and no
// sailed leg crosses land. Both are checked against the SAME coastline
// rings the game renders — there is only one land geometry.
import { loadEngine } from './extract.mjs';

const g = loadEngine();
const D = g.LEIP_DATA;
const E = g.LEIP_ENGINE;
const TER = g.LEIP_TERRAIN;
const T = g.LEIP_THEME;
const SL = g.LEIP_SEALANES;

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

// Distance in nm from a point to a coastline segment, on a locally flat
// lon/lat scaling. Shared by the berth and lane clearance checks.
function d2seg(p, a, b) {
  const kx = Math.cos(p[1] * Math.PI / 180);
  const ax = (a[0] - p[0]) * kx * 60, ay = (a[1] - p[1]) * 60;
  const bx = (b[0] - p[0]) * kx * 60, by = (b[1] - p[1]) * 60;
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  let t = L > 0 ? -(ax * dx + ay * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

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

  // A berth being IN water is not enough — the yacht is a sculptural token
  // with real extent on the chart, and at rest it lies still at that point
  // in whatever heading it arrived on. So the whole HULL FOOTPRINT has to
  // clear land, in every orientation. Half the hull length is the radius
  // that guarantees it.
  const nmPerDeg = 60;
  const d2segLocal = (p, a, b) => {
    const kx = Math.cos(p[1] * Math.PI / 180);
    const ax = (a[0] - p[0]) * kx * nmPerDeg, ay = (a[1] - p[1]) * nmPerDeg;
    const bx = (b[0] - p[0]) * kx * nmPerDeg, by = (b[1] - p[1]) * nmPerDeg;
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    let t = L > 0 ? -(ax * dx + ay * dy) / L : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(ax + t * dx, ay + t * dy);
  };
  const coastNm = (lon, lat) => {
    let best = Infinity;
    for (const r of rings) {
      // cheap reject: a ring whose box is far away cannot hold the nearest edge
      const pad = best / nmPerDeg + 0.5;
      if (lon < r.minX - pad || lon > r.maxX + pad || lat < r.minY - pad || lat > r.maxY + pad) continue;
      const p = r.pts;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        const d = d2segLocal([lon, lat], p[j], p[i]);
        if (d < best) best = d;
      }
    }
    return best;
  };
  const nmPerWorld = 60 / T.world.scalePerDeg;
  const halfHullNm = T.world.yacht.length * nmPerWorld / 2;
  // The land is EXTRUDED and the camera looks down a fixed rake, so a coast
  // paints its silhouette some way toward the viewer: a berth can be clear
  // in plan and still sit under the drawn shore. The camera sits at
  // (0.85·d high, 0.58·d back), so a feature of height h lands 0.58/0.85·h
  // nearer the viewer on the ground plane. Only the coast tier matters —
  // the relief tier is inset ~9 nm inland, far past the shoreline.
  const rake = 0.58 / 0.85;
  const silhouetteNm = T.terrain.landHeight * rake * nmPerWorld;
  const needNm = halfHullNm + silhouetteNm;
  const tight = D.ports.map((p) => {
    const b = E.berth(p.name);
    return { name: p.name, clr: coastNm(b.lon, b.lat) };
  }).sort((a, b) => a.clr - b.clr);
  check(`the hull is ${(halfHullNm * 2).toFixed(1)} nm long and every berth clears its half-length ` +
    `plus the ${silhouetteNm.toFixed(2)} nm the drawn shore leans toward the camera ` +
    `(tightest ${tight[0].name} ${tight[0].clr.toFixed(2)} nm vs ${needNm.toFixed(2)} needed)`,
    tight[0].clr > needNm,
    tight.filter((t) => t.clr <= needNm).map((t) => `${t.name} ${t.clr.toFixed(2)}`).join(', '));
  // The berth pass targets more than the lane pass on purpose; if that ever
  // gets flattened back the stationary hull starts clipping again.
  check('berths are held clear of the beach by more than the lane threshold',
    tight[0].clr > SL.clearanceNm, `tightest ${tight[0].clr.toFixed(2)} vs lane ${SL.clearanceNm} nm`);
  console.log(`  info berth clearance: min ${tight[0].clr.toFixed(2)} nm, ` +
    `median ${tight[Math.floor(tight.length / 2)].clr.toFixed(2)} nm, ` +
    `max ${tight[tight.length - 1].clr.toFixed(2)} nm · needs ${needNm.toFixed(2)} nm ` +
    `(hull half-length ${halfHullNm.toFixed(2)} + shore silhouette ${silhouetteNm.toFixed(2)})`);
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

  // "Not crossing land" is a weaker claim than "does not LOOK like it
  // crosses land". The drawn hull has beam, so a lane that merely grazes a
  // headland still renders the yacht clipping it. Measure the real
  // clearance along every lane and hold it above the hull's half-beam.
  {
    const nmPerWorld = 60 / T.world.scalePerDeg;
    const halfBeamNm = T.world.yacht.length * T.world.yacht.beamRatio * nmPerWorld / 2;
    // Bucket the coastline so this stays a seconds-long check, not a minutes-long one.
    const CELL = 0.25, buckets = new Map(), segs = [];
    for (const r of rings) {
      const p = r.pts;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        const id = segs.push([p[j], p[i]]) - 1;
        const i0 = Math.floor(Math.min(p[j][0], p[i][0]) / CELL), i1 = Math.floor(Math.max(p[j][0], p[i][0]) / CELL);
        const j0 = Math.floor(Math.min(p[j][1], p[i][1]) / CELL), j1 = Math.floor(Math.max(p[j][1], p[i][1]) / CELL);
        for (let a = i0; a <= i1; a++) for (let b = j0; b <= j1; b++) {
          const k = a + ',' + b;
          let arr = buckets.get(k);
          if (!arr) { arr = []; buckets.set(k, arr); }
          arr.push(id);
        }
      }
    }
    const nearNm = (lon, lat) => {
      let best = Infinity;
      const i0 = Math.floor(lon / CELL), j0 = Math.floor(lat / CELL);
      for (let ring = 1; ring <= 5; ring++) {
        for (let a = i0 - ring; a <= i0 + ring; a++) for (let b = j0 - ring; b <= j0 + ring; b++) {
          const arr = buckets.get(a + ',' + b);
          if (!arr) continue;
          for (const id of arr) {
            const d = d2seg([lon, lat], segs[id][0], segs[id][1]);
            if (d < best) best = d;
          }
        }
        if (best < ring * CELL * 30) break;      // certainly the nearest
      }
      return best;
    };
    let worst = { nm: Infinity, pair: '' };
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const path = E.legPath(names[i], names[j]);
        for (let k = 0; k + 1 < path.length; k++) {
          const a = path[k], b = path[k + 1];
          const kx = Math.cos(a.lat * Math.PI / 180);
          const dnm = Math.hypot((b.lon - a.lon) * kx * 60, (b.lat - a.lat) * 60);
          const steps = Math.max(1, Math.ceil(dnm));
          for (let t = 0; t <= steps; t++) {
            const f = t / steps;
            const c = nearNm(a.lon + (b.lon - a.lon) * f, a.lat + (b.lat - a.lat) * f);
            if (c < worst.nm) worst = { nm: c, pair: `${names[i]}->${names[j]}` };
          }
        }
      }
    }
    check(`every lane keeps the hull's ${halfBeamNm.toFixed(2)} nm half-beam off the coast ` +
      `(tightest ${worst.nm.toFixed(2)} nm on ${worst.pair})`,
      worst.nm > halfBeamNm, `${worst.nm.toFixed(2)} nm on ${worst.pair}`);
    console.log(`  info tightest lane clearance ${worst.nm.toFixed(2)} nm (${worst.pair})`);
  }

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
