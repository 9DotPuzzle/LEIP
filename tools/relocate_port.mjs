/*
 * relocate_port.mjs — move a port, and carry its leg corrections with it.
 *
 *   node tools/relocate_port.mjs --port Lateral --was <lon>,<lat> \
 *        --lanes tools/.lanes-before-<port>.json [--write]
 *
 * WHY THIS EXISTS
 *
 * The pack's leg_correction ratio is navigable-distance / great-circle for
 * a pair of ports. It is a property of WHERE THE PORTS ARE. Correct a
 * port's coordinates and its whole row of ratios goes stale — silently,
 * because the ratios are plain numbers with nothing tying them back to the
 * position they were computed at. Scoring distance is
 * matrix[a][b] x getLegCorrection(a,b), so a stale row mis-scales real
 * scored distance and the energy that follows from it.
 *
 * The great-circle half regenerates itself: ingest_pack recomputes the
 * whole matrix by haversine from the pack's own lat/lon. It is the
 * NAVIGABLE half that needs measuring, and the game already owns an
 * instrument for it — the A* router in build_terrain.mjs, whose sea lanes
 * are what the yacht actually sails along.
 *
 * So, per leg:
 *
 *   navPack   = ratioPack x gcWas                 (the pack's own figure)
 *   navMoved  = navPack x (routedNow / routedWas) (the router's delta)
 *   ratioNew  = navMoved / gcNow
 *
 * The router is used only for the RATIO of before to after, never for an
 * absolute distance. That matters: measured against the pack across all 43
 * of Lateral's legs the raster router runs about 10% long (median x1.097,
 * range x1.058-1.176) because a grid path with 3 nm clearance corners
 * wider than a real one. A consistent bias cancels in a ratio; it would
 * not cancel if the router's numbers were used directly. The tool prints
 * that calibration so the assumption is visible rather than buried.
 *
 * This is a MIGRATION, not a pipeline stage. It needs the sea lanes from
 * before the move, which build_terrain overwrites — hence --lanes pointing
 * at a captured snapshot, committed alongside. Once run, the pack holds
 * the corrected ratios and ingest_pack remains their only reader.
 *
 * The right long-term fix is for the pack to be re-issued with corrections
 * computed at the corrected position; this keeps the game honest until it is.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => {
  const i = process.argv.indexOf('--' + k);
  return i < 0 ? d : process.argv[i + 1];
};
const PORT = arg('port');
const WAS = (arg('was') || '').split(',').map(Number);
const LANES = arg('lanes');
const SNAPSHOT = arg('snapshot');
const WRITE = process.argv.includes('--write');
if (!PORT || !(SNAPSHOT || LANES)) {
  console.error('usage: --port <name> --snapshot <out.json>   (run BEFORE moving it)\n' +
                '       --port <name> --lanes <snapshot.json> [--was <lon>,<lat>] [--write]');
  process.exit(2);
}

const packPath = join(ROOT, 'leip_game_data.json');
const pack = JSON.parse(readFileSync(packPath, 'utf8'));
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const SL = (0, eval)('(' + html.match(/globalThis\.LEIP_SEALANES = ([\s\S]*?\n};)/)[1]
  .replace(/;\s*$/, '') + ')');

const R_NM = 3440.065, rad = (d) => d * Math.PI / 180;
const hv = (a, b) => {                       // [lon, lat]
  const s = Math.sin(rad(b[1] - a[1]) / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(rad(b[0] - a[0]) / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(s)));
};
// Lane keys are in data-pack order, not alphabetical. Try both directions,
// exactly as ENGINE.getLegCorrection's neighbour in the app does.
function routedNm(a, b) {
  const fwd = SL.lanes[`${a}|${b}`], rev = SL.lanes[`${b}|${a}`];
  const flat = fwd || rev;
  const pts = [SL.anchorages[a]];
  if (flat) {
    const w = [];
    for (let i = 0; i < flat.length; i += 2) w.push([flat[i], flat[i + 1]]);
    pts.push(...(fwd ? w : w.reverse()));
  }
  pts.push(SL.anchorages[b]);
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += hv(pts[i - 1], pts[i]);
  return d;
}

const P = Object.fromEntries(pack.ports.map((p) => [p.port, p]));
const me = P[PORT];
if (!me) throw new Error(`no port named ${PORT} in the pack`);
const now = [me.lon, me.lat];

// --- snapshot mode: freeze the BEFORE geometry, since build_terrain will
// --- overwrite the sea lanes the moment the coordinates change.
if (SNAPSHOT) {
  const legs = {};
  for (const p of pack.ports) {
    if (p.port === PORT) continue;
    legs[p.port] = { routed: +routedNm(PORT, p.port).toFixed(2),
                     gc: +hv(now, [p.lon, p.lat]).toFixed(2) };
  }
  writeFileSync(join(ROOT, SNAPSHOT), JSON.stringify(
    { port: PORT, at: now, berth: SL.anchorages[PORT], legs }, null, 1) + '\n');
  console.log(`${PORT} at ${now.join(', ')}: snapshotted ${Object.keys(legs).length} legs ` +
    `to ${SNAPSHOT}`);
  process.exit(0);
}

const before = JSON.parse(readFileSync(join(ROOT, LANES), 'utf8'));
const was = WAS.length === 2 && !WAS.some(Number.isNaN) ? WAS : before.at;
if (before.port !== PORT) throw new Error(`snapshot is for ${before.port}, not ${PORT}`);
if (hv(was, before.at) > 0.01) {
  throw new Error(`--was ${was.join(',')} disagrees with the snapshot's ${before.at.join(',')}`);
}
console.log(`${PORT}: ${was.join(', ')}  ->  ${now.join(', ')}   ` +
  `(${hv(was, now).toFixed(0)} nm as the crow flies)`);

const ratio = pack.leg_correction.ratio;
const rows = [];
for (const p of pack.ports) {
  if (p.port === PORT) continue;
  const gcWas = before.legs[p.port].gc;
  const gcNow = hv(now, [p.lon, p.lat]);
  const rWas = before.legs[p.port].routed;
  const rNow = routedNm(PORT, p.port);
  const rp = ratio[PORT]?.[p.port] ?? ratio[p.port]?.[PORT];
  if (rp === undefined) throw new Error(`no pack correction for ${PORT} | ${p.port}`);
  rows.push({
    port: p.port, gcWas, gcNow, rWas, rNow, packRatio: rp,
    routerWas: rWas / gcWas,
    navWas: rp * gcWas,
    ratioNew: +(rp * gcWas * (rNow / rWas) / gcNow).toFixed(3)
  });
}

// Calibration: how far the raster router sits from the pack's own figure,
// at the OLD position where both are talking about the same geometry.
const bias = rows.map((r) => r.routerWas / r.packRatio).sort((a, b) => a - b);
console.log(`router vs pack at the old position: median x${bias[bias.length >> 1].toFixed(3)}, ` +
  `range x${bias[0].toFixed(3)}-${bias[bias.length - 1].toFixed(3)} over ${bias.length} legs ` +
  `(a consistent bias, and it cancels in the before/after ratio)`);

const moved = rows.map((r) => r.ratioNew / r.packRatio).sort((a, b) => a - b);
console.log(`corrections move: median x${moved[moved.length >> 1].toFixed(3)}, ` +
  `range x${moved[0].toFixed(3)}-${moved[moved.length - 1].toFixed(3)}`);
console.log('');
const show = ['Gibraltar', 'Casablanca', 'Monaco', 'Marseille', 'Athens', 'Barcelona', 'Bizerte']
  .filter((n) => rows.some((r) => r.port === n));
console.log(`  ${'leg'.padEnd(13)}${'gc was'.padStart(8)}${'gc now'.padStart(8)}` +
  `${'nav was'.padStart(9)}${'nav now'.padStart(9)}${'ratio'.padStart(8)}${'->'.padStart(4)}`);
for (const n of show) {
  const r = rows.find((x) => x.port === n);
  console.log(`  ${n.padEnd(13)}${r.gcWas.toFixed(0).padStart(8)}${r.gcNow.toFixed(0).padStart(8)}` +
    `${r.navWas.toFixed(0).padStart(9)}${(r.navWas * r.rNow / r.rWas).toFixed(0).padStart(9)}` +
    `${r.packRatio.toFixed(3).padStart(8)}${('-> ' + r.ratioNew.toFixed(3)).padStart(11)}`);
}

if (!WRITE) {
  console.log('\n(dry run — pass --write to update leip_game_data.json)');
  process.exit(0);
}

for (const r of rows) {
  if (ratio[PORT]?.[r.port] !== undefined) ratio[PORT][r.port] = r.ratioNew;
  if (ratio[r.port]?.[PORT] !== undefined) ratio[r.port][PORT] = r.ratioNew;
}
pack.leg_correction._note += ` ${PORT} relocated to ${now[0]}, ${now[1]}; its ` +
  `${rows.length} ratios rescaled by tools/relocate_port.mjs from the game's own ` +
  `sea lanes — re-issue from source when the pack can be regenerated.`;
const src = readFileSync(packPath, 'utf8');
writeFileSync(packPath, JSON.stringify(pack, null, 1) + (src.endsWith('\n') ? '\n' : ''));
console.log(`\nwrote ${rows.length} rescaled corrections into leip_game_data.json`);
