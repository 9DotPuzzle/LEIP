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
console.log(`engine distance basis: '${D.distanceBasis}'. NOTE the parity check runs on the`);
console.log('sheet basis — the poster\'s OWN published nm over its published days — which is');
console.log('what the calibration constants are fitted against. The per-leg correction scales');
console.log('the game\'s leg distances, not the sheet figures, so it does not move this table.');
console.log('route        published   simulated   delta    status');
let ok = 0;
for (const pr of D.posterRoutes) {
  const s = E.posterAssumptionMwh(pr);
  const d = s - pr.mwh;
  const within = Math.abs(d) <= cal.posterToleranceMwh;
  ok += within;
  console.log(`${pr.id.padEnd(12)} ${String(pr.mwh).padStart(6)} MWh ${s.toFixed(2).padStart(8)} MWh ` +
    `${((d >= 0 ? '+' : '') + d.toFixed(2)).padStart(6)}   ` +
    `${within ? 'calibrated' : 'OVERRIDE (exact-match snap)'}`);
}
console.log(`${ok}/${D.posterRoutes.length} within ±${cal.posterToleranceMwh} MWh from first principles.`);

// The distance rule: an exact ordered poster match outputs the published
// charter distance whole. Everything else is a planned passage.
console.log('\n=== Distance rule — poster routes output published nm by construction ===');
console.log('route        published   simulated   planned passage   charter factor');
let exactNm = 0;
for (const pr of D.posterRoutes) {
  const sim = E.simulate({ route: pr.ports, speed: 'slow', nights: 4, activities: {} });
  const planned = E.routeLegs(pr.ports).reduce((s, l) => s + l.plannedNm, 0);
  exactNm += sim.distanceNm === pr.nm;
  console.log(`${pr.id.padEnd(12)} ${String(pr.nm).padStart(6)} nm ${sim.distanceNm.toFixed(1).padStart(9)} nm ` +
    `${planned.toFixed(1).padStart(14)} nm ${('x' + (pr.nm / planned).toFixed(2)).padStart(13)}` +
    `${sim.distanceNm === pr.nm ? '' : '   <- MISMATCH'}`);
}
console.log(`${exactNm}/${D.posterRoutes.length} poster routes output their published nm exactly.`);
console.log('The charter factors span too wide a range to be one scalar — which is why the');
console.log('published figures are taken whole rather than decomposed into legs.');

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
console.log(`base ${c.score.base.toFixed(3)} = ${c.score.baseParts.distance.toFixed(3)} distance + ` +
  `${c.score.baseParts.energy.toFixed(3)} energy ${c.score.baseParts.dieselPenalty.toFixed(3)} diesel`);
console.log(`factors ` +
  Object.entries(c.score.factors).map(([k, v]) =>
    `${k} ${v.value !== undefined ? v.value : v.energy}->${v.score}x${v.weight}`).join(' · ') +
  ` = ${c.score.weightedSum} / 5 = x${c.score.multiplier}`);
console.log(`final ${c.score.final} (expect ${D.canonicalTest.expected.final})`);

console.log('\n=== Balance scenarios ===');
for (const s of D.balanceScenarios) {
  const sim = E.simulate(s.inputs);
  const b = s.band;
  const inBand = (b.baseMin === undefined || sim.score.base >= b.baseMin) &&
                 (b.baseMax === undefined || sim.score.base <= b.baseMax) &&
                 (b.multiplierMin === undefined || sim.score.multiplier >= b.multiplierMin) &&
                 (b.multiplierMax === undefined || sim.score.multiplier <= b.multiplierMax) &&
                 (b.finalMin === undefined || sim.score.final >= b.finalMin) &&
                 (b.finalMax === undefined || sim.score.final <= b.finalMax) &&
                 (!b.dieselRequired || sim.dieselMwh > 0);
  console.log(`  ${s.id.padEnd(15)} base ${sim.score.base.toFixed(1).padStart(6)}  ` +
    `mult ${sim.score.multiplier.toFixed(2).padStart(5)}  final ${String(sim.score.final).padStart(5)}  ` +
    `diesel ${sim.dieselMwh.toFixed(1).padStart(5)} MWh  dist ${sim.coveredNm.toFixed(0).padStart(5)} nm  ` +
    `${inBand ? 'in band' : 'OUT OF BAND'}`);
}

console.log('\n=== The four worked examples (spec §5) ===');
console.log('example           base    mult   final   expected');
for (const ex of D.scoringExamples) {
  const s = E.computeScore(ex.q);
  const ok = Math.abs(s.base - ex.expected.base) < 1e-9 &&
             Math.abs(s.multiplier - ex.expected.multiplier) < 1e-9 &&
             s.final === ex.expected.final;
  console.log(`  ${ex.id.padEnd(15)} ${s.base.toFixed(1).padStart(5)} ${s.multiplier.toFixed(2).padStart(7)} ` +
    `${String(s.final).padStart(6)}   ${ex.expected.base} x ${ex.expected.multiplier.toFixed(2)} = ` +
    `${ex.expected.final}  ${ok ? 'OK' : 'MISMATCH'}`);
}

console.log('\n=== SECONDARY — Fleet reference (28 observed charters) ===');
{
  const F = D.fleetReference;
  const emptyC = F.charters.filter((c) => c.mwh == null || c.durationDays == null).length;
  const emptyG = F.routeGroups.filter((g) => g.distNm == null).length;
  console.log(`  populated=${F.populated} · tolerance ±${F.tolerancePct}% · basis '${F.basis}'`);
  console.log('  (asserted in test/fleet.mjs; n=1 cells are scatter, reported not asserted)');
  if (!F.populated) {
    console.log(`  awaiting values: ${emptyC}/${F.charters.length} charters, ${emptyG}/${F.routeGroups.length} route groups`);
    console.log(`  pending: ${F.pending}`);
  } else {
    for (const r of F.routeGroups) {
      if (r.distNm == null) continue;
      for (const [prof, dur, obs, n] of [['Typical', r.durTyp, r.mwh7Typ, r.nTyp],
                                         ['Intense', r.durInt, r.mwh7Int, r.nInt]]) {
        if (!n || dur == null || obs == null) continue;
        const e = E.energyFor(r.distNm, dur * 24, prof);
        const sim = (e.hotelMwh + e.travelMwh) * 7 / dur;
        const pct = (sim - obs) / obs * 100;
        console.log(`  ${r.route.padEnd(26)} ${prof.padEnd(8)} n=${n}  obs ${obs.toFixed(1).padStart(5)}  ` +
          `sim ${sim.toFixed(1).padStart(5)}  ${((pct >= 0 ? '+' : '') + pct.toFixed(1)).padStart(6)}%`);
      }
    }
  }
}
