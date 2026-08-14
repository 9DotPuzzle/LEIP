/*
 * ceiling.mjs — how high can a CLEAN week actually score?
 *
 *   node tools/ceiling.mjs [--iters N]
 *
 * "Score Over 400" is an achievement, so 400 has to be reachable on the
 * battery alone or the bar is decoration. That is not a question the
 * formula can answer — the formula's ceiling is 500 by construction. It is
 * a question about what the MAP and the ENERGY MODEL together allow, and
 * the answer moves whenever either does.
 *
 * Random sampling gets it badly wrong: drawn routes almost never land near
 * the battery cap, which is exactly where the optimum sits, so sampling
 * reports a ceiling well below the real one. This hill-climbs instead —
 * seeded from the poster routes, then single-port insert / swap / delete
 * with every nights value, keeping the best clean completion.
 *
 * ACTIVITIES are solved rather than searched. Under the gated factor the
 * optimum is exactly topMinCount picks with a strict clean majority: that
 * is the cheapest selection that reaches 10, every activity costs the same
 * flat energyPct, and going past it only burns battery. The tool asserts
 * that reasoning against the data rather than assuming it.
 */
import { loadEngine } from '../test/extract.mjs';

const g = loadEngine();
const D = g.LEIP_DATA, E = g.LEIP_ENGINE;
const iters = (() => {
  const i = process.argv.indexOf('--iters');
  return i < 0 ? 40 : Number(process.argv[i + 1]);
})();

// ---------------------------------------------------------------- activities
const af = D.scoring.multiplier.activitiesFactor;
const byEco = D.activities.slice().sort((a, b) => b.eco - a.eco);
const best = {};
byEco.slice(0, af.topMinCount).forEach((a) => { best[a.id] = 1; });
const cleanIn = byEco.slice(0, af.topMinCount).filter((a) => a.eco >= af.cleanEcoMin).length;
if (!(cleanIn * 2 > af.topMinCount)) {
  throw new Error('the sheet cannot field a clean majority at topMinCount');
}
console.log(`activities: ${af.topMinCount} picks, ${cleanIn} of them clean — factor ` +
  `${af.topScore} at ${(af.topMinCount * D.activities[0].energyPct * 100).toFixed(1)}% of the ` +
  'weekly reference. Fewer cannot open the gate; more only costs battery.');

// ---------------------------------------------------------------- search
const names = D.ports.map((p) => p.name);
const run = (route, nights, speed) => {
  try {
    const s = E.simulate({ route, speed, nights, activities: best });
    return s.completed && s.dieselMwh === 0 ? s : null;
  } catch (e) { return null; }
};
const key = (r, n, s) => r.join('>') + '|' + n + '|' + s;

let bestSim = null, bestRoute = null, evaluated = 0, clean = 0;
const seen = new Set();
const consider = (route, nights, speed) => {
  const k = key(route, nights, speed);
  if (seen.has(k)) return null;
  seen.add(k);
  evaluated++;
  const s = run(route, nights, speed);
  if (!s) return null;
  clean++;
  if (!bestSim || s.score.final > bestSim.score.final) {
    bestSim = s; bestRoute = { route: route.slice(), nights, speed };
  }
  return s;
};

// Seeds: the published routes, plus every single-port week, so the climb
// does not start inside one basin.
const seeds = D.posterRoutes.map((p) => p.route.slice());
names.forEach((n) => seeds.push([n]));

const nightsRange = [0, 1, 2, 3, 4, 5, 6, 7];
const speeds = ['slow', 'fast'];
for (const seed of seeds) {
  for (const n of nightsRange) for (const sp of speeds) consider(seed, n, sp);
}

// Hill-climb from the leader: insert, swap or delete one port at a time.
for (let it = 0; it < iters; it++) {
  const from = bestRoute;
  if (!from) break;
  const before = bestSim.score.final;
  const r = from.route;
  const moves = [];
  for (let i = 0; i <= r.length; i++) {
    for (const n of names) moves.push([...r.slice(0, i), n, ...r.slice(i)]);
  }
  for (let i = 0; i < r.length; i++) {
    for (const n of names) moves.push([...r.slice(0, i), n, ...r.slice(i + 1)]);
    if (r.length > 1) moves.push([...r.slice(0, i), ...r.slice(i + 1)]);
  }
  for (const m of moves) {
    for (const n of nightsRange) for (const sp of speeds) consider(m, n, sp);
  }
  if (bestSim.score.final <= before) break;      // local optimum
}

// ---------------------------------------------------------------- report
const bar = D.achievements.thresholds.scoreOver;
const sc = bestSim.score;
console.log(`\nevaluated ${evaluated.toLocaleString()} route/nights/speed combinations, ` +
  `${clean.toLocaleString()} clean completions`);
console.log(`best CLEAN week: ${sc.final}  ` +
  `(base ${sc.base.toFixed(2)} x ${sc.multiplier.toFixed(2)})`);
console.log(`  ${bestRoute.route.join(' -> ')}`);
console.log(`  ${bestRoute.nights} nights, ${bestRoute.speed}, ` +
  `${bestSim.coveredNm.toFixed(1)} nm, ${bestSim.batteryMwh.toFixed(3)} MWh battery, ` +
  `${bestSim.dieselMwh.toFixed(1)} MWh diesel`);
console.log(`  factors: ` + Object.keys(sc.factors)
  .map((k) => `${k} ${sc.factors[k].score}`).join(' · '));
console.log(`\n"Score Over ${bar}" is ${sc.final > bar ? 'CLEAN-REACHABLE' : 'NOT clean-reachable'}` +
  ` — ${sc.final} against a bar of ${bar}, ` +
  `${(sc.final - bar)} to spare.`);
