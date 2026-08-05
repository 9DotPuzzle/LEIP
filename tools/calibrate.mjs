// Calibration report (the Phase 1 deliverable): poster parity table
// (route, published MWh, simulated MWh at the sheet basis, delta) plus
// the secondary reference sets and the canonical breakdown.
import { loadEngine } from '../test/extract.mjs';

const g = loadEngine();
const { LEIP_DATA: D, LEIP_ENGINE: E } = g;
const cal = D.calibration;

console.log(`Constants: hotelUtilisation=${cal.hotelUtilisation}, propFactor Typical=${cal.propFactor.Typical} / Intense=${cal.propFactor.Intense}, stationaryKnotCutoff=${cal.stationaryKnotCutoff} kt`);
for (const p of ['Typical', 'Intense']) {
  const s = E.profileStats(p);
  console.log(`  ${p}: vEff=${s.vEff.toFixed(2)} kts, avg prop=${s.avgBkw.toFixed(0)} bkW`);
}

console.log('\n=== PRIMARY — Poster parity (§6): published nm & days, Typical profile ===');
console.log('route        published   simulated   delta     status');
let ok = 0;
for (const pr of D.posterRoutes) {
  const s = E.posterAssumptionMwh(pr);
  const d = s - pr.mwh;
  const within = Math.abs(d) <= cal.posterToleranceMwh;
  ok += within;
  console.log(`${pr.id.padEnd(12)} ${String(pr.mwh).padStart(6)} MWh ${s.toFixed(2).padStart(8)} MWh ${(d >= 0 ? '+' : '') + d.toFixed(2)}   ${within ? 'calibrated' : 'OVERRIDE (exact-match snap)'}`);
}
console.log(`${ok}/7 within ±${cal.posterToleranceMwh} MWh from first principles; the rest snap to published on exact replication (§6 step 2).`);

console.log('\n=== SECONDARY — Routes_Reference (7-day-normalised, ~10% natural scatter) ===');
for (const r of D.routesReference) {
  for (const [prof, dur, obs, n] of [['Typical', r.durTyp, r.mwh7Typ, r.nTyp], ['Intense', r.durInt, r.mwh7Int, r.nInt]]) {
    if (!n) continue;
    const e = E.energyFor(r.distNm, dur * 24, prof);
    const sim = (e.hotelMwh + e.travelMwh) * 7 / dur;
    const pct = (sim - obs) / obs * 100;
    console.log(`  ${r.route.padEnd(26)} ${prof.padEnd(8)} obs ${obs.toFixed(1).padStart(5)}  sim ${sim.toFixed(1).padStart(5)}  ${(pct >= 0 ? '+' : '') + pct.toFixed(1)}% (n=${n})`);
  }
}

console.log('\n=== Canonical worked example (§5) ===');
const c = E.simulate(D.canonicalTest.inputs);
console.log(`route ${c.distanceNm.toFixed(1)} nm, total ${c.totalMwh.toFixed(2)} MWh, ${(c.coveredNm / c.totalMwh).toFixed(2)} nm/MWh`);
console.log(`rawBase ${c.score.rawBase.toFixed(3)} -> base ${c.score.base} | factors ${JSON.stringify(Object.fromEntries(Object.entries(c.score.factors).map(([k, v]) => [k, v.score])))} -> x${c.score.multiplier}`);
console.log(`final ${c.score.final} (expect ${D.canonicalTest.expected.final})`);

console.log('\n=== Balance scenarios ===');
for (const s of D.balanceScenarios) {
  const sim = E.simulate(s.inputs);
  console.log(`  ${s.id.padEnd(15)} base ${String(sim.score.base).padStart(4)}  mult ${sim.score.multiplier.toFixed(1).padStart(5)}  final ${sim.score.final.toFixed(1).padStart(7)}  diesel ${sim.dieselMwh.toFixed(1)} MWh  dist ${sim.distanceNm.toFixed(0)} nm`);
}
