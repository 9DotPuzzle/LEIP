// Secondary external validation: the simulated energy model against 28
// observed charters (Report 835-52 AIS analysis), grouped by route.
//
// This is deliberately a SEPARATE run from headless.mjs. Poster parity is
// the contractual target and the game is calibrated to it; this is the
// real-world anchor behind it, held to the source's own ±15% scatter band.
// Keeping it out of the primary suite means a real-world miss shows up as
// a real-world miss instead of pressuring the contractual calibration.
import { loadEngine } from './extract.mjs';

const g = loadEngine();
const D = g.LEIP_DATA;
const E = g.LEIP_ENGINE;
const F = D.fleetReference;

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.error(`  FAIL ${name}${detail !== undefined ? ' — ' + detail : ''}`); }
}
function section(t) { console.log(`\n== ${t}`); }

if (!F.populated) {
  console.log(`SKIP: fleet reference not populated — ${F.pending}`);
  process.exit(0);
}

// ---------------------------------------------------------------- integrity
section('Fleet reference integrity');
{
  check('28 observed charters, the source\'s own 18/10 category split',
    F.charters.length === 28 &&
    F.charters.filter(c => c.profile === 'Typical').length === 18 &&
    F.charters.filter(c => c.profile === 'Intense').length === 10);
  check('every charter belongs to a named route group',
    F.charters.every(c => F.routeGroups.some(r => r.route === c.group)));
  check('every poster route points at a group in the table',
    D.posterRoutes.every(pr => F.routeGroups.some(r => r.route === pr.refGroup)));
  // The group distNm are observed navigable distances, so the engine must
  // be scoring on a navigable basis too — comparing them against raw
  // great-circle legs would be comparing two different quantities.
  check('the engine scores on a navigable basis, as these figures assume',
    ['sealane', 'corrected'].includes(D.distanceBasis),
    `fleet basis '${F.basis}' vs engine basis '${D.distanceBasis}'`);
  // Each group's headcount must equal the charters filed under it, or the
  // group averages are being computed over a different set than they claim.
  const bad = [];
  for (const r of F.routeGroups) {
    for (const [prof, n] of [['Typical', r.nTyp], ['Intense', r.nInt]]) {
      const actual = F.charters.filter(c => c.group === r.route && c.profile === prof).length;
      if (actual !== (n || 0)) bad.push(`${r.route}/${prof}: table ${n} vs ${actual} filed`);
    }
  }
  check('group headcounts reconcile with the charter list', bad.length === 0, bad.join('; '));
  // The published 7-day figure must be the charter figure normalised.
  const drift = [];
  for (const r of F.routeGroups) {
    for (const [prof, n, dur, mwh, mwh7] of [['Typical', r.nTyp, r.durTyp, r.mwhTyp, r.mwh7Typ],
                                             ['Intense', r.nInt, r.durInt, r.mwhInt, r.mwh7Int]]) {
      if (!n) continue;
      const pct = Math.abs(mwh * 7 / dur - mwh7) / mwh7 * 100;
      if (pct > 2) drift.push(`${r.route}/${prof}: ${pct.toFixed(1)}%`);
    }
  }
  check('published 7-day figures are the charter figures normalised', drift.length === 0, drift.join('; '));
}

// ---------------------------------------------------------------- groups
section(`Route groups — 7-day energy within ±${F.tolerancePct}% of observed`);
const cells = [];
for (const r of F.routeGroups) {
  for (const [prof, n, dur, obs] of [['Typical', r.nTyp, r.durTyp, r.mwh7Typ],
                                     ['Intense', r.nInt, r.durInt, r.mwh7Int]]) {
    if (!n) continue;
    const e = E.energyFor(r.distNm, dur * 24, prof);
    const sim = (e.hotelMwh + e.travelMwh) * 7 / dur;
    cells.push({ route: r.route, prof, n, obs, sim, pct: (sim - obs) / obs * 100 });
  }
}
const label = (c) => `${c.route} ${c.prof} (n=${c.n}): sim ${c.sim.toFixed(1)} vs obs ${c.obs.toFixed(1)} MWh/7d, ` +
  `${(c.pct >= 0 ? '+' : '') + c.pct.toFixed(1)}%`;
for (const c of cells.filter((c) => c.n >= F.minGroupN)) {
  check(label(c), Math.abs(c.pct) <= F.tolerancePct);
}
console.log('  — single-charter cells below are scatter, reported not asserted —');
for (const c of cells.filter((c) => c.n < F.minGroupN)) {
  console.log(`  info ${label(c)}${Math.abs(c.pct) > F.tolerancePct ? '  (outside band)' : ''}`);
}

// ---------------------------------------------------------------- charters
section('Per-charter spread and where the error sits');
{
  const rows = F.charters.map((c) => {
    const e = E.energyFor(c.totalNm, c.durationDays * 24, c.profile);
    return {
      vessel: c.vessel,
      total: ((e.hotelMwh + e.travelMwh) - c.mwh) / c.mwh * 100,
      hotel: (e.hotelMwh - c.hotelMwh) / c.hotelMwh * 100,
      prop: (e.travelMwh - c.propulsionMwh) / c.propulsionMwh * 100
    };
  });
  const mean = (k) => rows.reduce((a, r) => a + r[k], 0) / rows.length;
  const worst = rows.slice().sort((a, b) => Math.abs(b.total) - Math.abs(a.total)).slice(0, 3);
  console.log(`  info total energy: mean ${mean('total').toFixed(1)}%, ` +
    `spread ${Math.min(...rows.map(r => r.total)).toFixed(1)}% to ${Math.max(...rows.map(r => r.total)).toFixed(1)}%`);
  console.log(`  info hotel load:   mean ${mean('hotel').toFixed(1)}%`);
  console.log(`  info propulsion:   mean ${mean('prop').toFixed(1)}%`);
  console.log(`  info widest misses: ${worst.map(r => `${r.vessel} ${r.total.toFixed(0)}%`).join(', ')}`);
  check(`hotel load tracks the fleet within ±${F.tolerancePct}% on the mean`,
    Math.abs(mean('hotel')) <= F.tolerancePct, `${mean('hotel').toFixed(1)}%`);
  check(`propulsion tracks the fleet within ±${F.tolerancePct}% on the mean`,
    Math.abs(mean('prop')) <= F.tolerancePct, `${mean('prop').toFixed(1)}% — the model runs light on propulsion`);
  check(`fleet-wide total within ±${F.tolerancePct}% on the mean`,
    Math.abs(mean('total')) <= F.tolerancePct, `${mean('total').toFixed(1)}%`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  console.log(
    'KNOWN LIMITATION, not a regression. The two Intense cells and the propulsion\n' +
    'mean share one cause: the shipped speed profiles imply 694/868 bkW, while this\n' +
    "file's own per-knot underway hours imply 852/1152 for the same 28 charters.\n" +
    'Re-deriving from the hours was evaluated and rejected: poster parity would go\n' +
    'from 4/7 reconciled to 0/7, the fleet error would move to Sardinia & Corsica\n' +
    'Typical (n=5) at +21%, and the diesel-dash balance scenario would collapse from\n' +
    '159.6 to 8.4. The data inconsistency is referred back to the source. See the\n' +
    'KNOWN LIMITATION note on DATA.fleetReference in index.html.');
}
process.exit(failed === 0 ? 0 : 1);
