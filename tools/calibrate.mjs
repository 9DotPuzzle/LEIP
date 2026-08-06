// Calibration report: the poster-parity table (§6), the sea-lane vs
// matrix distance comparison, the canonical worked example and the
// balance scenarios. Run after any data or constant change.
import { loadEngine } from '../test/extract.mjs';

const g = loadEngine();
const { LEIP_DATA: D, LEIP_ENGINE: E } = g;
const cal = D.calibration;

console.log(`Constants: hotelUtilisation=${cal.hotelUtilisation}, propFactor=${cal.propFactor}, ` +
  `distanceBasis='${D.distanceBasis}'`);
for (const p of ['Typical', 'Intense']) {
  const s = E.profileStats(p);
  const sp = D.speedProfiles[p];
  console.log(`  ${p}: vEff=${s.vEff.toFixed(2)} kts, avg prop=${s.avgBkw.toFixed(0)} bkW ` +
    `(${sp.nCharters} charters, observed ${sp.observedSpeedRangeKts[0]}-${sp.observedSpeedRangeKts[1]} kt)`);
}

console.log('\n=== PRIMARY — Poster parity (§6): published nm & days, Typical profile ===');
console.log('route        published   simulated   delta    status');
let ok = 0;
for (const pr of D.posterRoutes) {
  const s = E.posterAssumptionMwh(pr);
  const d = s - pr.mwh;
  const within = Math.abs(d) <= cal.posterToleranceMwh;
  ok += within;
  console.log(`${pr.id.padEnd(12)} ${String(pr.mwh).padStart(6)} MWh ${s.toFixed(2).padStart(8)} MWh ` +
    `${((d >= 0 ? '+' : '') + d.toFixed(2)).padStart(6)}   ${within ? 'calibrated' : 'OVERRIDE (exact-match snap)'}`);
}
console.log(`${ok}/${D.posterRoutes.length} within ±${cal.posterToleranceMwh} MWh from first principles.`);

// Why the remainder cannot be reconciled by any distance/duration model:
// find published pairs that are near-identical in nm and days yet far apart
// in MWh. No f(nm, days) can satisfy both.
console.log('\n=== Poster figures that conflict with each other ===');
for (let i = 0; i < D.posterRoutes.length; i++) {
  for (let j = i + 1; j < D.posterRoutes.length; j++) {
    const a = D.posterRoutes[i], b = D.posterRoutes[j];
    const dNm = Math.abs(a.nm - b.nm) / Math.max(a.nm, b.nm);
    const dDay = Math.abs(a.days - b.days) / Math.max(a.days, b.days);
    const dMwh = Math.abs(a.mwh - b.mwh);
    if (dNm < 0.1 && dDay < 0.1 && dMwh > 5) {
      console.log(`  ${a.id} (${a.nm} nm / ${a.days} d / ${a.mwh} MWh) vs ` +
        `${b.id} (${b.nm} nm / ${b.days} d / ${b.mwh} MWh): ` +
        `${(dNm * 100).toFixed(0)}% apart in distance, ${(dDay * 100).toFixed(0)}% in duration, ` +
        `but ${dMwh} MWh apart — mutually unreachable.`);
    }
  }
}

console.log('\n=== Sea-lane distance vs the pack matrix ===');
{
  const names = D.ports.map((p) => p.name);
  const rows = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i], b = names[j];
      const lane = E.pathNm(E.legPath(a, b));
      const m = D.distanceMatrixNm[a][b];
      rows.push({ a, b, lane, m, r: lane / Math.max(m, 0.01) });
    }
  }
  rows.sort((x, y) => y.r - x.r);
  const med = rows[Math.floor(rows.length / 2)].r;
  const within = (p) => rows.filter((r) => Math.abs(r.r - 1) <= p).length;
  console.log(`  ${rows.length} pairs · median lane/matrix ${med.toFixed(3)} · ` +
    `within 5% ${within(0.05)} · within 20% ${within(0.20)}`);
  console.log('  largest departures (the matrix is great-circle, so these legs cross land):');
  for (const r of rows.slice(0, 5)) {
    console.log(`    ${r.a} -> ${r.b}: lane ${r.lane.toFixed(0)} nm vs matrix ${r.m.toFixed(0)} nm  ×${r.r.toFixed(2)}`);
  }
}

console.log('\n=== Canonical worked example (§5) ===');
const c = E.simulate(D.canonicalTest.inputs);
console.log(`sailed ${c.distanceNm.toFixed(1)} nm, total ${c.totalMwh.toFixed(2)} MWh, ` +
  `${(c.coveredNm / c.totalMwh).toFixed(2)} nm/MWh`);
console.log(`rawBase ${c.score.rawBase.toFixed(3)} -> base ${c.score.base} | factors ` +
  JSON.stringify(Object.fromEntries(Object.entries(c.score.factors).map(([k, v]) => [k, v.score]))) +
  ` -> ×${c.score.multiplier}`);
console.log(`final ${c.score.final} (expect ${D.canonicalTest.expected.final})`);

console.log('\n=== Balance scenarios ===');
for (const s of D.balanceScenarios) {
  const sim = E.simulate(s.inputs);
  console.log(`  ${s.id.padEnd(15)} base ${String(sim.score.base).padStart(4)}  ` +
    `mult ${sim.score.multiplier.toFixed(1).padStart(5)}  final ${sim.score.final.toFixed(1).padStart(7)}  ` +
    `diesel ${sim.dieselMwh.toFixed(1)} MWh  dist ${sim.distanceNm.toFixed(0)} nm`);
}
