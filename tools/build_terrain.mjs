#!/usr/bin/env node
/**
 * Builds the game's terrain, anchorages and sea lanes from Natural Earth
 * vector data. Nothing here is hand-drawn.
 *
 *   source   data/natural-earth-land-med.geojson   (vendored; regenerate
 *            with --extract, which needs the world-atlas devDependency)
 *   outputs  index.html  #leip-terrain   coastline rings + relief rings
 *            index.html  #leip-sealanes  anchorages + port-pair sea lanes
 *
 * Pipeline:
 *   1. clip Natural Earth 1:10m land to the Mediterranean frame
 *   2. Douglas-Peucker simplify to a legible vertex density
 *   3. drop specks, but never one carrying a port
 *   4. rasterise the SAME rings into a water grid, so what you see is
 *      exactly what the router treats as navigable
 *   5. erode that grid for the inland relief tier (contour tracing)
 *   6. A* every port pair through the water grid, then string-pull the
 *      path down to a handful of rounding waypoints
 *
 * Usage: node tools/build_terrain.mjs [--extract] [--write]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GEOJSON = join(ROOT, 'data', 'natural-earth-land-med.geojson');

// ---------------------------------------------------------------- config
const CFG = {
  // Terrain frame: generous enough to fill the sea field behind the
  // charted rect (which is derived from the port bounds).
  // Two frames. `clip` is what gets DRAWN — wide enough that its edge never
  // enters shot at the charted camera distance. `route` is what gets
  // RASTERISED for navigation: the basin the ports actually live in, kept
  // tight so the grid and the A* over it stay tractable.
  clip: { lon0: -22, lat0: 20, lon1: 52, lat1: 58 },
  route: { lon0: -8, lat0: 30, lon1: 38, lat1: 48 },
  simplifyDeg: 0.008,        // ~0.9 km — kills jaggedness, keeps identity
  minAreaDeg2: 0.0016,       // drop specks...
  portKeepDeg: 0.25,         // ...unless a port sits on one
  grid: { cell: 0.01 },      // ~1.1 km routing raster
  clearanceCells: 2,         // keep this far off the beach
  anchorMaxCells: 40,        // how far offshore a port may be pushed
  reliefCell: 0.04,          // coarse raster for the relief tier only
  reliefInsetCells: 4,       // how far inside the coast the highland step starts
  reliefSimplifyDeg: 0.06,
  reliefMinAreaDeg2: 0.4,
  coordDp: 3
};

// ---------------------------------------------------------------- helpers
const ringArea = (r) => {
  let a = 0;
  for (let i = 0, n = r.length; i < n; i++) {
    const p = r[i], q = r[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
};

function clipToBox(ring, box) {                     // Sutherland-Hodgman
  const lerpX = (a, b, x) => { const t = (x - a[0]) / (b[0] - a[0]); return [x, a[1] + t * (b[1] - a[1])]; };
  const lerpY = (a, b, y) => { const t = (y - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), y]; };
  const edges = [
    { in: (p) => p[0] >= box.lon0, cut: (a, b) => lerpX(a, b, box.lon0) },
    { in: (p) => p[0] <= box.lon1, cut: (a, b) => lerpX(a, b, box.lon1) },
    { in: (p) => p[1] >= box.lat0, cut: (a, b) => lerpY(a, b, box.lat0) },
    { in: (p) => p[1] <= box.lat1, cut: (a, b) => lerpY(a, b, box.lat1) }
  ];
  let out = ring;
  for (const e of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i], prev = input[(i + input.length - 1) % input.length];
      const ci = e.in(cur), pi = e.in(prev);
      if (ci) { if (!pi) out.push(e.cut(prev, cur)); out.push(cur); }
      else if (pi) out.push(e.cut(prev, cur));
    }
    if (!out.length) return [];
  }
  return out;
}

function simplify(ring, eps) {                      // Douglas-Peucker
  if (ring.length < 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = 1; keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  const d2 = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L = dx * dx + dy * dy;
    if (!L) return (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2;
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L;
    t = Math.max(0, Math.min(1, t));
    return (p[0] - (a[0] + t * dx)) ** 2 + (p[1] - (a[1] + t * dy)) ** 2;
  };
  while (stack.length) {
    const [s, e] = stack.pop();
    let best = -1, bd = eps * eps;
    for (let i = s + 1; i < e; i++) {
      const d = d2(ring[i], ring[s], ring[e]);
      if (d > bd) { bd = d; best = i; }
    }
    if (best > 0) { keep[best] = 1; stack.push([s, best], [best, e]); }
  }
  return ring.filter((_, i) => keep[i]);
}

const pointInRing = (x, y, r) => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

// ---------------------------------------------------------------- 1. source
function extractSource() {
  const topo = JSON.parse(readFileSync(
    join(ROOT, 'node_modules', 'world-atlas', 'land-10m.json'), 'utf8'));
  // Minimal TopoJSON decode: quantised delta arcs -> absolute rings.
  const { scale: [sx, sy], translate: [tx, ty] } = topo.transform;
  const arcs = topo.arcs.map((arc) => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; });
  });
  const ringOf = (idxs) => {
    const out = [];
    for (const i of idxs) {
      const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
      out.push(...(out.length ? a.slice(1) : a));
    }
    return out;
  };
  const root = topo.objects.land;
  const geoms = root.type === 'GeometryCollection' ? root.geometries : [root];
  const polys = [];
  for (const g of geoms) {
    if (g.type === 'MultiPolygon') polys.push(...g.arcs);
    else if (g.type === 'Polygon') polys.push(g.arcs);
  }
  return {
    type: 'FeatureCollection',
    provenance: {
      source: 'Natural Earth 1:10m physical land, via world-atlas@2.0.2 (land-10m.json)',
      naturalEarth: 'https://www.naturalearthdata.com/ — public domain, no restrictions',
      redistribution: 'world-atlas by Michael Bostock, ISC licence',
      clippedTo: CFG.clip,
      note: 'Clipped to the Mediterranean frame; unsimplified. tools/build_terrain.mjs simplifies from here.'
    },
    features: polys
      .map((poly) => poly.map(ringOf).map((r) => clipToBox(r, CFG.clip)).filter((r) => r.length > 3))
      .filter((rings) => rings.length)
      .map((rings) => ({
        type: 'Feature', properties: {},
        geometry: { type: 'Polygon', coordinates: rings.map((r) => r.map((p) => [+p[0].toFixed(4), +p[1].toFixed(4)])) }
      }))
  };
}

// ---------------------------------------------------------------- run
// The data pack keys each port as `port`; the game calls it `name`.
const ports = JSON.parse(readFileSync(join(ROOT, 'leip_game_data.json'), 'utf8'))
  .ports.map((p) => ({ name: p.port, country: p.country, lat: p.lat, lon: p.lon }));
const args = process.argv.slice(2);

if (args.includes('--extract') || !existsSync(GEOJSON)) {
  mkdirSync(join(ROOT, 'data'), { recursive: true });
  const fc = extractSource();
  writeFileSync(GEOJSON, JSON.stringify(fc));
  console.log(`vendored data/natural-earth-land-med.geojson — ${fc.features.length} polygons, ` +
    `${fc.features.reduce((n, f) => n + f.geometry.coordinates[0].length, 0)} outer vertices`);
}

const src = JSON.parse(readFileSync(GEOJSON, 'utf8'));

// 2-3. simplify + speck filter (a ring carrying a port always survives)
const rings = [];
for (const f of src.features) {
  for (const ring of f.geometry.coordinates) {
    const s = simplify(ring, CFG.simplifyDeg);
    if (s.length < 4) continue;
    const area = Math.abs(ringArea(s));
    const hasPort = ports.some((p) =>
      pointInRing(p.lon, p.lat, s) ||
      s.some((v) => Math.abs(v[0] - p.lon) < CFG.portKeepDeg && Math.abs(v[1] - p.lat) < CFG.portKeepDeg));
    if (area < CFG.minAreaDeg2 && !hasPort) continue;
    rings.push(s);
  }
}
rings.sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)));
console.log(`terrain: ${rings.length} rings, ${rings.reduce((n, r) => n + r.length, 0)} vertices`);

// 4. water raster from exactly these rings
const G = {
  cell: CFG.grid.cell, lon0: CFG.route.lon0, lat0: CFG.route.lat0,
  w: Math.ceil((CFG.route.lon1 - CFG.route.lon0) / CFG.grid.cell),
  h: Math.ceil((CFG.route.lat1 - CFG.route.lat0) / CFG.grid.cell)
};
G.x = (lon) => Math.round((lon - G.lon0) / G.cell - 0.5);
G.y = (lat) => Math.round((lat - G.lat0) / G.cell - 0.5);
G.lon = (x) => G.lon0 + (x + 0.5) * G.cell;
G.lat = (y) => G.lat0 + (y + 0.5) * G.cell;

const land = new Uint8Array(G.w * G.h);
let oddRowCount = 0;
{
  // Canonical even-odd scanline: an edge crosses row `yy` when exactly one
  // endpoint is strictly above it. Anything looser leaves parity holes that
  // punch phantom channels through land — which the router would sail down.
  const spans = Array.from({ length: G.h }, () => []);
  for (const r of rings) {
    for (let i = 0, n = r.length; i < n; i++) {
      const p = r[i], q = r[(i + 1) % n];
      // Widen the candidate row range by one either side: the crossing test
      // below is authoritative, and a tight range can drop a legitimate
      // crossing to floating-point rounding — which flips the parity for
      // that whole row and walls a basin off.
      const yA = Math.max(0, Math.ceil((Math.min(p[1], q[1]) - G.lat0) / G.cell - 0.5) - 1);
      const yB = Math.min(G.h - 1, Math.floor((Math.max(p[1], q[1]) - G.lat0) / G.cell - 0.5) + 1);
      for (let gy = yA; gy <= yB; gy++) {
        // Nudge the sample line off the lattice: source vertices are
        // rounded to 4 dp and land exactly on cell-centre latitudes, which
        // double-counts a crossing and flips the parity for that whole row
        // — leaving one-cell walls across open sea that strand entire basins.
        const yy = G.lat(gy) + 1e-7;
        if ((p[1] > yy) === (q[1] > yy)) continue;
        spans[gy].push(p[0] + ((yy - p[1]) / (q[1] - p[1])) * (q[0] - p[0]));
      }
    }
  }
  for (let gy = 0; gy < G.h; gy++) {
    const xs = spans[gy].sort((p, q) => p - q);
    if (xs.length % 2) oddRowCount++;   // a row that would wall off a basin
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.max(0, Math.ceil((xs[i] - G.lon0) / G.cell - 0.5));
      const xb = Math.min(G.w - 1, Math.floor((xs[i + 1] - G.lon0) / G.cell - 0.5));
      for (let gx = xa; gx <= xb; gx++) land[gy * G.w + gx] = 1;
    }
  }
}
// Stamp every coastline edge into the grid. The scanline fill only marks a
// cell when its CENTRE is inside land, so a spit or isthmus narrower than a
// cell leaves no land cells at all — and a path would thread straight
// through it. Stamping the boundary closes those slivers, and the clearance
// transform then keeps traffic off them.
{
  for (const r of rings) {
    for (let i = 0, n = r.length; i < n; i++) {
      const p = r[i], q = r[(i + 1) % n];
      let x = G.x(p[0]), y = G.y(p[1]);
      const x1 = G.x(q[0]), y1 = G.y(q[1]);
      const dx = Math.abs(x1 - x), dy = Math.abs(y1 - y);
      const sx = x1 > x ? 1 : -1, sy = y1 > y ? 1 : -1;
      let err = dx - dy;
      for (let guard = 0; guard < 1e5; guard++) {
        if (x >= 0 && y >= 0 && x < G.w && y < G.h) land[y * G.w + x] = 1;
        if (x === x1 && y === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x += sx; }
        if (e2 < dx) { err += dx; y += sy; }
      }
    }
  }
}
let landCells = 0;
for (let i = 0; i < land.length; i++) landCells += land[i];
console.log(`raster: ${G.w}x${G.h} cells, ${(landCells / land.length * 100).toFixed(1)}% land, ${oddRowCount} odd-parity rows`);

// chamfer distance transform; `from` selects which set is the source
function chamfer(isSource) {
  const INF = 1e9;
  const d = new Float32Array(G.w * G.h);
  for (let i = 0; i < d.length; i++) d[i] = isSource(i) ? 0 : INF;
  const relax = (i, j, w) => { if (d[j] + w < d[i]) d[i] = d[j] + w; };
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
    const i = y * G.w + x;
    if (x > 0) relax(i, i - 1, 1);
    if (y > 0) relax(i, i - G.w, 1);
    if (x > 0 && y > 0) relax(i, i - G.w - 1, 1.414);
    if (x < G.w - 1 && y > 0) relax(i, i - G.w + 1, 1.414);
  }
  for (let y = G.h - 1; y >= 0; y--) for (let x = G.w - 1; x >= 0; x--) {
    const i = y * G.w + x;
    if (x < G.w - 1) relax(i, i + 1, 1);
    if (y < G.h - 1) relax(i, i + G.w, 1);
    if (x < G.w - 1 && y < G.h - 1) relax(i, i + G.w + 1, 1.414);
    if (x > 0 && y < G.h - 1) relax(i, i + G.w - 1, 1.414);
  }
  return d;
}
const seaDist = chamfer((i) => !!land[i]);           // water: distance to land
const navigable = (x, y) => x >= 0 && y >= 0 && x < G.w && y < G.h &&
  !land[y * G.w + x] && seaDist[y * G.w + x] >= CFG.clearanceCells;

// 5. Inland relief tier. Traced from its OWN coarse raster over the full
// render frame — not the routing grid, whose edge would cut a dead-straight
// seam across a continent. Coarse is fine: this is a soft shading step, not
// a navigation surface.
const reliefRings = (() => {
  const cell = CFG.reliefCell;
  const R = {
    cell, lon0: CFG.clip.lon0, lat0: CFG.clip.lat0,
    w: Math.ceil((CFG.clip.lon1 - CFG.clip.lon0) / cell),
    h: Math.ceil((CFG.clip.lat1 - CFG.clip.lat0) / cell)
  };
  R.lat = (y) => R.lat0 + (y + 0.5) * cell;
  const mask = new Uint8Array(R.w * R.h);
  const spans = Array.from({ length: R.h }, () => []);
  for (const r of rings) {
    for (let i = 0, n = r.length; i < n; i++) {
      const p = r[i], q = r[(i + 1) % n];
      const yA = Math.max(0, Math.ceil((Math.min(p[1], q[1]) - R.lat0) / cell - 0.5) - 1);
      const yB = Math.min(R.h - 1, Math.floor((Math.max(p[1], q[1]) - R.lat0) / cell - 0.5) + 1);
      for (let gy = yA; gy <= yB; gy++) {
        const yy = R.lat(gy) + 1e-7;
        if ((p[1] > yy) === (q[1] > yy)) continue;
        spans[gy].push(p[0] + ((yy - p[1]) / (q[1] - p[1])) * (q[0] - p[0]));
      }
    }
  }
  for (let gy = 0; gy < R.h; gy++) {
    const xs = spans[gy].sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.max(0, Math.ceil((xs[i] - R.lon0) / cell - 0.5));
      const xb = Math.min(R.w - 1, Math.floor((xs[i + 1] - R.lon0) / cell - 0.5));
      for (let gx = xa; gx <= xb; gx++) mask[gy * R.w + gx] = 1;
    }
  }
  // Erode inward from the water by the relief inset.
  const INF = 1e9;
  const d = new Float32Array(R.w * R.h);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? INF : 0;
  const relax = (i, j, w) => { if (d[j] + w < d[i]) d[i] = d[j] + w; };
  for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) {
    const i = y * R.w + x;
    if (x > 0) relax(i, i - 1, 1);
    if (y > 0) relax(i, i - R.w, 1);
    if (x > 0 && y > 0) relax(i, i - R.w - 1, 1.414);
    if (x < R.w - 1 && y > 0) relax(i, i - R.w + 1, 1.414);
  }
  for (let y = R.h - 1; y >= 0; y--) for (let x = R.w - 1; x >= 0; x--) {
    const i = y * R.w + x;
    if (x < R.w - 1) relax(i, i + 1, 1);
    if (y < R.h - 1) relax(i, i + R.w, 1);
    if (x < R.w - 1 && y < R.h - 1) relax(i, i + R.w + 1, 1.414);
    if (x > 0 && y < R.h - 1) relax(i, i + R.w - 1, 1.414);
  }
  const hi = new Uint8Array(R.w * R.h);
  for (let i = 0; i < hi.length; i++) hi[i] = (mask[i] && d[i] >= CFG.reliefInsetCells) ? 1 : 0;

  // Trace the eroded mask's boundary into rings.
  const key = (x, y) => x + ',' + y;
  const at = (x, y) => (x < 0 || y < 0 || x >= R.w || y >= R.h) ? 0 : hi[y * R.w + x];
  const edges = new Map();
  const add = (a, b) => {
    const k = key(a[0], a[1]);
    if (!edges.has(k)) edges.set(k, []);
    edges.get(k).push(b);
  };
  for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) {
    if (!at(x, y)) continue;
    if (!at(x, y - 1)) add([x, y], [x + 1, y]);
    if (!at(x + 1, y)) add([x + 1, y], [x + 1, y + 1]);
    if (!at(x, y + 1)) add([x + 1, y + 1], [x, y + 1]);
    if (!at(x - 1, y)) add([x, y + 1], [x, y]);
  }
  const out = [];
  while (edges.size) {
    const startKey = edges.keys().next().value;
    let cur = startKey.split(',').map(Number);
    const ring = [];
    for (let guard = 0; guard < 1e6; guard++) {
      const list = edges.get(key(cur[0], cur[1]));
      if (!list || !list.length) break;
      const next = list.pop();
      if (!list.length) edges.delete(key(cur[0], cur[1]));
      ring.push([R.lon0 + cur[0] * cell, R.lat0 + cur[1] * cell]);
      cur = next;
      if (key(cur[0], cur[1]) === startKey) break;
    }
    if (ring.length > 8) out.push(ring);
  }
  return out
    .map((r) => simplify(r, CFG.reliefSimplifyDeg))
    .filter((r) => r.length > 5 && Math.abs(ringArea(r)) > CFG.reliefMinAreaDeg2);
})();
console.log(`relief: ${reliefRings.length} rings, ${reliefRings.reduce((n, r) => n + r.length, 0)} vertices`);

// ---------------------------------------------------------------- 6. sea lanes
const R_NM = 3440.065, rad = (d) => d * Math.PI / 180;
function nm(a, b) {
  const dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(s)));
}

// The open sea: the largest connected body of navigable water. Berths must
// sit on it — a marina up a narrow inlet (Kotor) is a closed pocket at this
// resolution, and a yacht berthed there could never leave.
const openSea = (() => {
  const comp = new Int32Array(G.w * G.h).fill(-1);
  let best = -1, bestN = 0, id = 0;
  for (let y0 = 0; y0 < G.h; y0++) {
    for (let x0 = 0; x0 < G.w; x0++) {
      if (!navigable(x0, y0) || comp[y0 * G.w + x0] !== -1) continue;
      const stack = [y0 * G.w + x0];
      comp[stack[0]] = id;
      let n = 0;
      while (stack.length) {
        const i = stack.pop();
        n++;
        const x = i % G.w, y = (i - x) / G.w;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (!navigable(nx, ny)) continue;
          const ni = ny * G.w + nx;
          if (comp[ni] !== -1) continue;
          comp[ni] = id;
          stack.push(ni);
        }
      }
      if (n > bestN) { bestN = n; best = id; }
      id++;
    }
  }
  console.log(`open sea: ${bestN} cells in the main body (${id} separate bodies of water)`);
  return (x, y) => x >= 0 && y >= 0 && x < G.w && y < G.h && comp[y * G.w + x] === best;
})();

const anchorage = {};
for (const p of ports) {
  const px = G.x(p.lon), py = G.y(p.lat);
  let best = null;
  for (let r = 0; r <= CFG.anchorMaxCells && !best; r++) {
    for (let dy = -r; dy <= r && !best; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = px + dx, y = py + dy;
        if (navigable(x, y) && openSea(x, y)) { best = [x, y]; break; }
      }
    }
  }
  if (!best) throw new Error(`no open-sea water within ${CFG.anchorMaxCells} cells of ${p.name}`);
  anchorage[p.name] = { cell: best, lon: G.lon(best[0]), lat: G.lat(best[1]),
                        offNm: nm([p.lon, p.lat], [G.lon(best[0]), G.lat(best[1])]) };
}
{
  const byOff = ports.slice().sort((a, b) => anchorage[b.name].offNm - anchorage[a.name].offNm);
  const mean = ports.reduce((s, p) => s + anchorage[p.name].offNm, 0) / ports.length;
  console.log(`anchorages: mean ${mean.toFixed(2)} nm off the charted position; furthest — ` +
    byOff.slice(0, 5).map((p) => `${p.name} ${anchorage[p.name].offNm.toFixed(1)}`).join(', '));
}

// Connectivity diagnostic: every port must share one body of navigable
// water, or some pair is unroutable and the yacht would have to swim.
{
  const seen = new Uint8Array(G.w * G.h);
  const start = anchorage[ports[0].name].cell;
  const stack = [start[1] * G.w + start[0]];
  seen[stack[0]] = 1;
  let n = 0;
  while (stack.length) {
    const i = stack.pop();
    n++;
    const x = i % G.w, y = (i - x) / G.w;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + dx, ny = y + dy;
      if (!navigable(nx, ny)) continue;
      const ni = ny * G.w + nx;
      if (seen[ni]) continue;
      seen[ni] = 1;
      stack.push(ni);
    }
  }
  const stranded = ports.filter((p) => {
    const c = anchorage[p.name].cell;
    return !seen[c[1] * G.w + c[0]];
  }).map((p) => p.name);
  console.log(`connectivity: ${n} navigable cells reachable from ${ports[0].name}` +
    (stranded.length ? `; STRANDED: ${stranded.join(', ')}` : '; all ports connected'));
  if (args.includes('--dump')) {
    const step = 2, w = Math.floor(G.w / step), h = Math.floor(G.h / step);
    const buf = Buffer.alloc(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const gx = x * step, gy = y * step, i = gy * G.w + gx;
      buf[(h - 1 - y) * w + x] = land[i] ? 20 : (seen[i] ? 245 : (navigable(gx, gy) ? 120 : 70));
    }
    writeFileSync(join(ROOT, 'reach.pgm'), Buffer.concat([Buffer.from(`P5\n${w} ${h}\n255\n`), buf]));
    console.log('dumped reach.pgm (dark=land, bright=reachable, mid=other water)');
  }
}

if (args.includes('--dump')) {                       // navigable-water diagnostic
  const step = 2, w = Math.floor(G.w / step), h = Math.floor(G.h / step);
  const buf = Buffer.alloc(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = x * step, gy = y * step;
      buf[(h - 1 - y) * w + x] = land[gy * G.w + gx] ? 30 : (navigable(gx, gy) ? 235 : 140);
    }
  }
  const out = join(ROOT, 'navigable.pgm');
  writeFileSync(out, Buffer.concat([Buffer.from(`P5\n${w} ${h}\n255\n`), buf]));
  console.log(`dumped ${out} (${w}x${h}; dark=land, mid=too close to shore, light=navigable)`);
}

// Exact segment-vs-coastline test, indexed by a coarse grid of the ring
// segments. The raster alone is not enough: it discretises the coast, so a
// shortcut can slice a headland the grid rounded away. Every shortcut must
// satisfy BOTH the raster clearance and this exact test.
const SEGIDX = (() => {
  const CELL = 0.5;
  const key = (x, y) => Math.floor(x / CELL) + ':' + Math.floor(y / CELL);
  const map = new Map();
  for (const r of rings) {
    for (let i = 0, n = r.length; i < n; i++) {
      const p = r[i], q = r[(i + 1) % n];
      const x0 = Math.min(p[0], q[0]), x1 = Math.max(p[0], q[0]);
      const y0 = Math.min(p[1], q[1]), y1 = Math.max(p[1], q[1]);
      for (let x = Math.floor(x0 / CELL) * CELL; x <= x1; x += CELL) {
        for (let y = Math.floor(y0 / CELL) * CELL; y <= y1; y += CELL) {
          const k = key(x, y);
          if (!map.has(k)) map.set(k, []);
          map.get(k).push([p, q]);
        }
      }
    }
  }
  const orient = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return function crossesLandExact(a, b) {
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
    const y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    const seen = new Set();
    for (let x = Math.floor(x0 / CELL) * CELL; x <= x1 + CELL; x += CELL) {
      for (let y = Math.floor(y0 / CELL) * CELL; y <= y1 + CELL; y += CELL) {
        const list = map.get(key(x, y));
        if (!list) continue;
        for (const [p, q] of list) {
          const id = p[0] + ',' + p[1] + ',' + q[0] + ',' + q[1];
          if (seen.has(id)) continue;
          seen.add(id);
          if (orient(a, b, p) !== orient(a, b, q) && orient(p, q, a) !== orient(p, q, b)) return true;
        }
      }
    }
    return false;
  };
})();

// Raster clearance along a segment, walking every cell the line touches
// (not just sampled centres, which can step over a one-cell isthmus).
function rasterClear(a, b) {
  let x = a[0], y = a[1];
  const dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]);
  const sx = b[0] > a[0] ? 1 : -1, sy = b[1] > a[1] ? 1 : -1;
  let err = dx - dy;
  for (let guard = 0; guard < 1e6; guard++) {
    if (!navigable(x, y)) return false;
    if (x === b[0] && y === b[1]) return true;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; if (!navigable(x, y)) return false; }
    if (e2 < dx) { err += dx; y += sy; }
  }
  return false;
}

function losClear(a, b) {
  if (!rasterClear(a, b)) return false;
  return !SEGIDX([G.lon(a[0]), G.lat(a[1])], [G.lon(b[0]), G.lat(b[1])]);
}

const N8 = [[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,1.414],[1,-1,1.414],[-1,1,1.414],[-1,-1,1.414]];
function astar(from, to) {
  const size = G.w * G.h;
  const gScore = new Float32Array(size).fill(Infinity);
  const came = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const open = [];
  const push = (i, f) => {
    open.push([f, i]);
    let c = open.length - 1;
    while (c > 0) { const p = (c - 1) >> 1; if (open[p][0] <= open[c][0]) break;
      const t = open[p]; open[p] = open[c]; open[c] = t; c = p; }
  };
  const pop = () => {
    const top = open[0], last = open.pop();
    if (open.length) {
      open[0] = last;
      let c = 0;
      for (;;) {
        const l = c * 2 + 1, r = l + 1;
        let m = c;
        if (l < open.length && open[l][0] < open[m][0]) m = l;
        if (r < open.length && open[r][0] < open[m][0]) m = r;
        if (m === c) break;
        const t = open[m]; open[m] = open[c]; open[c] = t; c = m;
      }
    }
    return top;
  };
  const idx = (x, y) => y * G.w + x;
  const hx = (x, y) => Math.hypot(x - to[0], y - to[1]);
  const s = idx(from[0], from[1]), t = idx(to[0], to[1]);
  gScore[s] = 0; push(s, hx(from[0], from[1]));
  while (open.length) {
    const [, cur] = pop();
    if (cur === t) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % G.w, cy = (cur - cx) / G.w;
    for (const [dx, dy, w] of N8) {
      const nx = cx + dx, ny = cy + dy;
      if (!navigable(nx, ny)) continue;
      const ni = idx(nx, ny);
      const ng = gScore[cur] + w;
      if (ng < gScore[ni]) { gScore[ni] = ng; came[ni] = cur; push(ni, ng + hx(nx, ny)); }
    }
  }
  if (s !== t && came[t] === -1) return null;
  const cells = [];
  for (let i = t; i !== -1; i = came[i]) { const x = i % G.w; cells.push([x, (i - x) / G.w]); if (i === s) break; }
  return cells.reverse();
}

function stringPull(cells) {
  if (cells.length < 3) return cells;
  const out = [cells[0]];
  let i = 0;
  while (i < cells.length - 1) {
    let j = cells.length - 1;
    while (j > i + 1 && !losClear(cells[i], cells[j])) j--;
    out.push(cells[j]);
    i = j;
  }
  return out;
}

const names = ports.map((p) => p.name);
const lanes = {};
let straight = 0, routed = 0;
const failed = [];
let maxDetour = { pair: null, ratio: 1 };
for (let i = 0; i < names.length; i++) {
  for (let j = i + 1; j < names.length; j++) {
    const A = anchorage[names[i]], B = anchorage[names[j]];
    const key = names[i] + '|' + names[j];
    if (losClear(A.cell, B.cell)) { straight++; continue; }
    const path = astar(A.cell, B.cell);
    if (!path) { failed.push(key); continue; }
    const way = stringPull(path).slice(1, -1)
      .map((c) => [+G.lon(c[0]).toFixed(CFG.coordDp), +G.lat(c[1]).toFixed(CFG.coordDp)]);
    lanes[key] = way;
    routed++;
    const full = [[A.lon, A.lat], ...way, [B.lon, B.lat]];
    let d = 0;
    for (let k = 0; k + 1 < full.length; k++) d += nm(full[k], full[k + 1]);
    const ratio = d / nm([A.lon, A.lat], [B.lon, B.lat]);
    if (ratio > maxDetour.ratio) maxDetour = { pair: key, ratio };
  }
}
console.log(`sea lanes: ${straight} pairs clear on the rhumb line, ${routed} routed around land` +
  (failed.length ? `, ${failed.length} UNREACHABLE: ${failed.join(', ')}` : ''));
console.log(`longest detour: ${maxDetour.pair} x${maxDetour.ratio.toFixed(2)}`);

// ---------------------------------------------------------------- emit
const rd = (v) => +v.toFixed(CFG.coordDp);
const flat = (r) => r.map((p) => rd(p[0]) + ',' + rd(p[1])).join(', ');
const wrap = (s, indent) => {
  const words = s.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    if (line.length + w.length > 104) { lines.push(line); line = ''; }
    line += (line ? ' ' : '') + w;
  }
  if (line) lines.push(line);
  return lines.map((l) => indent + l).join('\n');
};
const CT = '<' + '/script>';

const terrainBlock = `<script id="leip-terrain">
/* GENERATED by tools/build_terrain.mjs — do not edit by hand.
   Natural Earth 1:10m physical land (public domain), clipped to the
   Mediterranean frame and Douglas-Peucker simplified to ${CFG.simplifyDeg} deg.
   Source vendored at data/natural-earth-land-med.geojson.
   coasts: real coastline rings, [lon,lat,...]. The single source of land
   geometry — for rendering AND for the sea-lane router, so what you see is
   exactly what the yacht must sail around.
   relief: inland tier, the same land eroded ${CFG.reliefErodeCells} cells from the coast. */
globalThis.LEIP_TERRAIN = {
  source: 'Natural Earth 1:10m land, public domain (via world-atlas, ISC)',
  simplifyDeg: ${CFG.simplifyDeg},
  coasts: [
${rings.map((r) => wrap('[' + flat(r) + '],', '    ')).join('\n')}
  ],
  relief: [
${reliefRings.map((r) => wrap('[' + flat(r) + '],', '    ')).join('\n')}
  ]
};
${CT}`;

const laneKeys = Object.keys(lanes).sort();
const seaBlock = `<script id="leip-sealanes">
/* GENERATED by tools/build_terrain.mjs — do not edit by hand.
   anchorages: each port's berth — the nearest navigable water to its real
   coordinates, ${+(CFG.clearanceCells * CFG.grid.cell * 60).toFixed(1)} nm clear of the beach.
   lanes: rounding waypoints for the port pairs whose rhumb line crosses
   land, A*-routed through the coastline raster then string-pulled down to
   the turning points. Pairs absent from this map have a clear straight
   run. Keys are "A|B" in data-pack name order; the reverse direction is
   the same lane reversed. */
globalThis.LEIP_SEALANES = {
  clearanceNm: ${+(CFG.clearanceCells * CFG.grid.cell * 60).toFixed(2)},
  anchorages: {
${names.map((n) => `    ${JSON.stringify(n)}: [${rd(anchorage[n].lon)}, ${rd(anchorage[n].lat)}]`).join(',\n')}
  },
  lanes: {
${laneKeys.map((k) => wrap(`${JSON.stringify(k)}: [${lanes[k].map((p) => p[0] + ',' + p[1]).join(', ')}],`, '    ')).join('\n')}
  }
};
${CT}`;

if (args.includes('--write')) {
  const htmlPath = join(ROOT, 'index.html');
  let html = readFileSync(htmlPath, 'utf8');
  const swap = (id, block) => {
    const re = new RegExp(`<script id="${id}">[\\s\\S]*?<\\/script>`);
    if (re.test(html)) html = html.replace(re, block);
    else html = html.replace('<script id="leip-data">', block + '\n\n<script id="leip-data">');
  };
  swap('leip-terrain', terrainBlock);
  swap('leip-sealanes', seaBlock);
  writeFileSync(htmlPath, html);
  console.log(`wrote #leip-terrain (${(terrainBlock.length / 1024).toFixed(0)} KB) and ` +
    `#leip-sealanes (${(seaBlock.length / 1024).toFixed(0)} KB) into index.html`);
} else {
  console.log(`\n(dry run — pass --write to update index.html; blocks are ` +
    `${(terrainBlock.length / 1024).toFixed(0)} KB + ${(seaBlock.length / 1024).toFixed(0)} KB)`);
}
