// Headless validation — spec §11.2-11.6 plus poster parity (§6), the
// leaderboard's pure logic (§8/§11.7 name rule) and model behaviours.
// Runs the THEME/DATA/ENGINE blocks extracted verbatim from index.html.
import { loadEngine } from './extract.mjs';

const g = loadEngine();
const D = g.LEIP_DATA;
const E = g.LEIP_ENGINE;
const T = g.LEIP_THEME;

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.error(`  FAIL ${name}${detail !== undefined ? ' — ' + detail : ''}`); }
}
function section(t) { console.log(`\n== ${t}`); }

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- data integrity
section('DATA mirrors the data pack; THEME mirrors the visual direction');
check('4-point prop curve with HUD mode labels',
  D.propCurve.length === 4 && D.propCurve.every((c) => typeof c.pbKw === 'number' && c.gameMode));
check('guest-mode hotel loads 188.6 anchor / 162.8 under way',
  D.hotelLoadsEkw.stationaryGuestAnchor === 188.6 && D.hotelLoadsEkw.underwayGuestTransit === 162.8);
check('battery 49,860 kWh installed, 50 MWh game threshold',
  D.battery.installedKwh === 49860 && D.battery.gameThresholdMwh === 50);
check('speed profiles from all 28 observed charters, split 14/14',
  D.speedProfiles.Typical.nCharters === 14 && D.speedProfiles.Intense.nCharters === 14);
check('Intense is genuinely the harder-driven profile',
  E.profileStats('Intense').vEff > E.profileStats('Typical').vEff &&
  E.profileStats('Intense').avgBkw > E.profileStats('Typical').avgBkw);
check('33 ports, names unique',
  D.ports.length === 33 && new Set(D.ports.map(p => p.name)).size === 33);
check('energy types are the four carbon classes, or null where the source has no figure',
  D.ports.every(p => p.energy === null || ['green', 'blue', 'grey', 'brown'].includes(p.energy)));
check('Genoa is the only unrated port, and it scores neutral rather than guessing',
  D.ports.filter(p => p.energy === null).map(p => p.name).join() === 'Genoa' &&
  D.scoring.multiplier.rechargeUnrated === 0);
check('energy classes follow the published carbon quartiles',
  D.ports.filter(p => p.carbon !== null).every(p => {
    const q = D.energyQuartilesGco2kwh;
    const want = p.carbon <= q.greenMax ? 'green' : p.carbon <= q.blueMax ? 'blue'
      : p.carbon <= q.greyMax ? 'grey' : 'brown';
    return p.energy === want;
  }));
check('33x33 distance matrix, symmetric, zero on the diagonal',
  Object.keys(D.distanceMatrixNm).length === 33 &&
  D.ports.every(a => D.ports.every(b =>
    D.distanceMatrixNm[a.name][b.name] === D.distanceMatrixNm[b.name][a.name])) &&
  D.ports.every(a => D.distanceMatrixNm[a.name][a.name] === 0));
check('seven poster routes over valid ports',
  D.posterRoutes.length === 7 &&
  D.posterRoutes.every(r => r.ports.every(n => D.ports.some(p => p.name === n))));
check('24 activities (12 Active / 12 Relaxing), one once-only',
  D.activities.length === 24 &&
  D.activities.filter(a => a.category === 'Active').length === 12 &&
  D.activities.filter(a => !a.repeatable).length === 1);
check('nine achievements', D.achievements.list.length === 9);
check('Santorini tagged for Volcano Chief', D.ports.some(p => p.tags.includes(D.achievements.santoriniTag)));
check('THEME carries the four scene tints and the volt accent',
  ['dawn', 'day', 'dusk', 'night'].every(s => T.scenes[s] && T.scenes[s].sea && T.scenes[s].sky && T.scenes[s].land) &&
  T.volt === '#F5D90A' && T.ink.onLight === '#22344A' && T.ink.onDark === '#E8EEF2');

// ---------------------------------------------------------------- §11.2 canonical
section('§11.2 Canonical — base 39 x multiplier 6.2 = 241.8, exactly (0-50 base scale)');
{
  const sim = E.simulate(D.canonicalTest.inputs);
  const exp = D.canonicalTest.expected;
  check(`base === ${exp.base}`, sim.score.base === exp.base, `got ${sim.score.base} (raw ${sim.score.rawBase})`);
  check(`multiplier === ${exp.multiplier}`, sim.score.multiplier === exp.multiplier, `got ${sim.score.multiplier}`);
  check(`final === ${exp.final}`, sim.score.final === exp.final, `got ${sim.score.final}`);
  check('canonical completes on battery alone', sim.completed && sim.dieselMwh === 0);
}

// ---------------------------------------------------------------- §11.3 / §6 poster parity
section('§11.3 Poster parity — published figure output on exact replication; override logged when calibration misses ±1');
{
  let calibrated = 0, overridden = 0;
  for (const pr of D.posterRoutes) {
    const sheetSim = E.posterAssumptionMwh(pr);
    const delta = Math.abs(sheetSim - pr.mwh);
    const sim = E.simulate({ route: pr.ports, speed: 'slow', nights: 4, activities: {} });
    check(`${pr.id}: exact replication outputs the published figure (${pr.mwh} MWh)`,
      sim.totalMwh === pr.mwh && sim.poster && sim.poster.exactReplica,
      `got ${sim.totalMwh}`);
    if (delta <= D.calibration.posterToleranceMwh) {
      calibrated++;
      check(`${pr.id}: calibrated within ±1 MWh at the sheet basis (${sheetSim.toFixed(2)} vs ${pr.mwh})`, true);
    } else {
      overridden++;
      check(`${pr.id}: override engaged and logged (sheet-basis sim ${sheetSim.toFixed(2)})`,
        sim.poster.overrideEngaged === true);
    }
  }
  console.log(`  info: ${calibrated}/7 calibrated, ${overridden}/7 via §6 exact-match override`);
  check('a majority of poster routes reconcile from first principles', calibrated >= 4, `${calibrated}/7`);
  const fast = E.simulate({ route: D.posterRoutes[0].ports, speed: 'fast', nights: 4, activities: {} });
  check('fast toggle on a poster route is NOT an exact replica (no snap)',
    fast.poster && !fast.poster.exactReplica && fast.totalMwh !== D.posterRoutes[0].mwh);
}

// ---------------------------------------------------------------- sea lanes
section('Sea lanes — every leg stays on water, and scoring uses the sailed path');
{
  const SL = g.LEIP_SEALANES;
  check('sea-lane data present: a berth for every port', !!SL &&
    D.ports.every(p => Array.isArray(SL.anchorages[p.name])));
  check('berths sit off the charted position, not on it',
    D.ports.every(p => {
      const b = E.berth(p.name);
      return Math.abs(b.lat - p.lat) + Math.abs(b.lon - p.lon) < 0.6;
    }));
  const gv = E.pathNm(E.legPath('Genoa', 'Venice'));
  check(`a leg that must round Italy is scored as sailed, not as the crow flies (${gv.toFixed(0)} nm vs ${D.distanceMatrixNm.Genoa.Venice} nm)`,
    gv > D.distanceMatrixNm.Genoa.Venice * 3);
  check('scoring distance follows DATA.distanceBasis',
    D.distanceBasis === 'sealane'
      ? Math.abs(E.legNm('Genoa', 'Venice') - gv) < 1
      : E.legNm('Genoa', 'Venice') === D.distanceMatrixNm.Genoa.Venice);
  // Short hops differ by more than the lane itself: a berth lies ~1.7 nm
  // off its charted position, which is a big share of a 7 nm run. Judge
  // agreement on legs long enough for that to wash out.
  const ratios = [];
  for (const a of D.ports) for (const b of D.ports) {
    if (a.name >= b.name) continue;
    const m = D.distanceMatrixNm[a.name][b.name];
    if (m < 100) continue;
    ratios.push(E.pathNm(E.legPath(a.name, b.name)) / m);
  }
  ratios.sort((x, y) => x - y);
  const median = ratios[Math.floor(ratios.length / 2)];
  // A berth sits up to a few miles off its charted position, so an
  // individual leg can come out marginally shorter than the port-to-port
  // figure; the median is what matters.
  check(`legs over 100 nm track the pack matrix (median x${median.toFixed(3)})`,
    median >= 1 && median < 1.3 && ratios[0] > 0.95, `min ${ratios[0].toFixed(3)}`);
  const sim = E.simulate({ route: ['Genoa', 'Venice'], speed: 'slow', nights: 4, activities: {} });
  check('a sea-lane leg carries its path into the timeline for playback',
    sim.timeline.some(seg => seg.type === 'transit' && seg.path && seg.path.length > 2));
}

// ---------------------------------------------------------------- §11.4 balance scenarios
section('§11.4 Balance scenarios land in their intended bands');
for (const s of D.balanceScenarios) {
  const sim = E.simulate(s.inputs);
  const b = s.band;
  const ok = (b.baseMin === undefined || sim.score.base >= b.baseMin) &&
             (b.baseMax === undefined || sim.score.base <= b.baseMax) &&
             (b.multiplierMin === undefined || sim.score.multiplier >= b.multiplierMin) &&
             (b.multiplierMax === undefined || sim.score.multiplier <= b.multiplierMax) &&
             (b.finalMin === undefined || sim.score.final >= b.finalMin) &&
             (b.finalMax === undefined || sim.score.final <= b.finalMax) &&
             (!b.dieselRequired || sim.dieselMwh > 0);
  check(`${s.id}: base ${sim.score.base}, mult ${sim.score.multiplier}, final ${sim.score.final}`,
    ok, `band ${JSON.stringify(b)}, diesel ${sim.dieselMwh.toFixed(1)}`);
}
check('negative scores are possible and intended',
  E.simulate(D.balanceScenarios.find(s => s.id === 'go-nowhere').inputs).score.final < 0);

// ---------------------------------------------------------------- §11.5 determinism
section('§11.5 Determinism');
{
  const a = JSON.stringify(E.simulate(D.canonicalTest.inputs));
  const b = JSON.stringify(E.simulate(D.canonicalTest.inputs));
  check('canonical x2 byte-identical', a === b);
  const spin = E.randomSpin(mulberry32(42));
  check('a spun input set replays identically',
    JSON.stringify(E.simulate(spin)) === JSON.stringify(E.simulate(spin)));
}

// ---------------------------------------------------------------- §11.6 random spin
section('§11.6 Random Spin — 500 chaotic spins simulate without error');
{
  const rng = mulberry32(1337);
  let ok = 0, doomed = 0, dieselled = 0, negative = 0;
  const errs = [];
  for (let i = 0; i < 500; i++) {
    try {
      const inputs = E.randomSpin(rng);
      for (const [id, n] of Object.entries(inputs.activities)) {
        if (n < 1 || n > E.activityById(id).maxPerWeek) throw new Error(`${id} count ${n} out of bounds`);
      }
      const sim = E.simulate(inputs);
      if (!Number.isFinite(sim.score.final) || !Number.isFinite(sim.totalMwh)) throw new Error('non-finite');
      if (!sim.completed) doomed++;
      if (sim.dieselMwh > 0) dieselled++;
      if (sim.score.final < 0) negative++;
      ok++;
    } catch (e) { errs.push(`#${i}: ${e.message}`); }
  }
  check('500/500 clean', ok === 500, errs.slice(0, 3).join('; '));
  check('chaos includes doomed routes', doomed > 0, String(doomed));
  check('chaos includes diesel weeks', dieselled > 0, String(dieselled));
  console.log(`  info: ${doomed} doomed, ${dieselled} diesel, ${negative} negative of 500`);
}

// ---------------------------------------------------------------- model behaviours
section('Model behaviours (spec §2, §3)');
{
  // NB: not a poster port sequence — the poster snap would mask the comparison.
  const base = { route: ['Monaco', 'Calvi', 'Bonifacio', 'Saint Tropez'], nights: 4, activities: {} };
  const slow = E.simulate({ ...base, speed: 'slow' });
  const fast = E.simulate({ ...base, speed: 'fast' });
  check('fast covers the route quicker (more anchor hours)', fast.anchorH > slow.anchorH);
  check('fast draws more energy', fast.totalMwh > slow.totalMwh);
  check('hotel splits 188.6/162.8 ekW by stationary/underway hours',
    Math.abs(slow.hotelMwh - (188.6 * (168 - slow.underwayH) + 162.8 * slow.underwayH) * D.calibration.hotelUtilisation / 1000) < 1e-9);
  check('travel is the energy story: longer route costs more',
    E.simulate({ route: ['Athens', 'Santorini'], speed: 'slow', nights: 4, activities: {} }).totalMwh <
    E.simulate({ route: ['Athens', 'Santorini', 'Athens', 'Santorini'], speed: 'slow', nights: 4, activities: {} }).totalMwh);
  check('activities are deliberately marginal (< 1% of week each)',
    D.activities.every(a => a.energyPct * D.scoring.weeklyEnergyRefMwh < 0.5));

  const doomed = E.simulate({ route: ['Palma', 'Venice', 'Palma'], speed: 'slow', nights: 6, activities: {} });
  check('infeasible route allowed; runs; suffers',
    !doomed.completed && doomed.score.factors.recharge.score === D.scoring.multiplier.rechargeNotReached);

  const party3 = E.simulate({ route: ['Monaco', 'Nice', 'Monaco'], speed: 'slow', nights: 4, activities: { R08: 3, A07: 1, R06: 1 } });
  const party6 = E.simulate({ route: ['Monaco', 'Nice', 'Monaco'], speed: 'slow', nights: 4, activities: { R08: 6, A07: 1, R06: 1 } });
  check('party too many times decays the activities factor',
    party6.score.factors.activities.score < party3.score.factors.activities.score);

  const over = E.simulate({ route: ['Palma', 'Bonifacio', 'Naples', 'Monaco'], speed: 'fast', nights: 4, activities: {} });
  check('the diesel moment is located in time',
    over.dieselMwh > 0 && over.dieselStartH > 0 && over.dieselStartH < 168, String(over.dieselStartH));
  const tlEnergy = over.timeline.reduce((s, seg) => s + seg.powerKw * seg.hours / 1000, 0);
  check('timeline energy reconciles with totals', Math.abs(tlEnergy - over.totalMwh) < 1e-6,
    `${tlEnergy.toFixed(3)} vs ${over.totalMwh.toFixed(3)}`);
  check('timeline spans the 168 h week',
    Math.abs(over.timeline[over.timeline.length - 1].endH - 168) < 1e-6);
  check('single-port go-nowhere is valid', E.simulate({ route: ['Saint Tropez'], speed: 'slow', nights: 0, activities: {} }).completed);
  check('normalize clamps activity overcounts to the sheet max',
    E.normalizeInputs({ route: ['Monaco'], activities: { A09: 5 } }).activities.A09 === 1);
}

// ---------------------------------------------------------------- achievements
section('Achievements — trophies only (spec §7)');
{
  const th = D.achievements.thresholds;
  const sim = E.simulate({ route: ['Athens', 'Santorini', 'Kalathos', 'Athens'], speed: 'fast', nights: 4, activities: { A08: 1 } });
  const r1 = E.evaluateAchievements(sim, null);
  const ids = r1.newly.map(a => a.id);
  check('Volcano Chief fires mid-sim with an hour',
    ids.includes('volcano-chief') && r1.newly.find(a => a.id === 'volcano-chief').atHour > 0);
  check('Submerged Ruins: dive activity at dive-tagged location', ids.includes('submerged-ruins'));
  check('Long Haul over 400 nm', sim.coveredNm > th.longHaulNm === ids.includes('long-haul'));
  // Score Over 400 — retargeted for the 0-50 base scale (ceiling 500).
  const big = E.simulate(D.achievementFixtures.scoreOver400);
  check(`a strong charter clears the bar and unlocks Score Over 400 (${big.score.final})`,
    big.score.final > th.scoreOver &&
    E.evaluateAchievements(big, null).newly.some(a => a.id === 'score-400'),
    `final ${big.score.final} vs bar ${th.scoreOver}`);
  const modest = E.simulate(D.balanceScenarios.find(s => s.id === 'modest-local').inputs);
  check(`a charter at or under the bar does not (${modest.score.final})`,
    modest.score.final <= th.scoreOver &&
    !E.evaluateAchievements(modest, null).newly.some(a => a.id === 'score-400'));
  // Ceiling = best base x best multiplier, both read from the data.
  const mc = D.scoring.multiplier;
  const best = (t) => Math.max(...Object.values(t));
  const maxMultiplier = (best(mc.countries) + best(mc.ports) + best(mc.nights) +
    Math.min(best(mc.activities.varietyTable) + mc.activities.bothCategoriesBonus, mc.activities.clampMax) +
    best(mc.recharge)) / 5;
  const ceiling = D.scoring.base.max * maxMultiplier;
  check(`the bar sits inside the reachable range, under the ${ceiling} ceiling`,
    th.scoreOver < ceiling, `bar ${th.scoreOver}, ceiling ${ceiling}`);

  const green = E.simulate({ route: ['Nice', 'Monaco'], speed: 'slow', nights: 4, activities: {} });
  check('Green Charge on a green-energy finish',
    E.evaluateAchievements(green, null).newly.some(a => a.id === 'green-charge'));
  // 50 MWh Hit — battery brinkmanship, not a failure badge: the full
  // battery drawn AND the diesels never woken.
  const dieselSim = E.simulate({ route: ['Palma', 'Bonifacio', 'Naples', 'Monaco'], speed: 'fast', nights: 4, activities: {} });
  check('50 MWh Hit does NOT fire on a diesel-soaked week', dieselSim.dieselMwh > 0 &&
    !E.evaluateAchievements(dieselSim, null).newly.some(a => a.id === 'mwh-hit'));
  const easy = E.simulate({ route: ['Nice', 'Monaco'], speed: 'slow', nights: 4, activities: {} });
  check('50 MWh Hit does NOT fire on a comfortable week', easy.totalMwh < 49 &&
    !E.evaluateAchievements(easy, null).newly.some(a => a.id === 'mwh-hit'));
  const brink = E.simulate(D.achievementFixtures.batteryBrinkmanship);
  const band = D.battery.gameThresholdMwh - th.batteryBandMwh;
  check(`50 MWh Hit fires on the full battery with zero diesel (${brink.totalMwh.toFixed(2)} MWh)`,
    brink.dieselMwh === 0 && brink.totalMwh >= band && brink.totalMwh <= D.battery.gameThresholdMwh &&
    E.evaluateAchievements(brink, null).newly.some(a => a.id === 'mwh-hit'),
    `total ${brink.totalMwh.toFixed(3)}, diesel ${brink.dieselMwh}`);
  check('50 MWh Hit fires mid-sim, at the moment the band is crossed',
    E.evaluateAchievements(brink, null).newly.find(a => a.id === 'mwh-hit').atHour === brink.bandStartH &&
    brink.bandStartH > 0 && brink.bandStartH < 168, String(brink.bandStartH));

  let persistent = null;
  for (const pr of D.posterRoutes.slice(0, th.posterRoutesRequired)) {
    const s = E.simulate({ route: pr.ports, speed: 'slow', nights: 4, activities: {} });
    persistent = E.evaluateAchievements(s, persistent).persistent;
  }
  check(`The Five Routes unlocks after ${th.posterRoutesRequired} poster routes`,
    persistent.unlocked['five-routes'] === true, JSON.stringify(persistent.posterDone));

  let p2 = null, got = false;
  const good = D.balanceScenarios.find(s => s.id === 'balanced-multi').inputs;
  for (let i = 0; i < th.repeatClientCharters; i++) {
    const res = E.evaluateAchievements(E.simulate(good), p2);
    p2 = res.persistent;
    got = res.newly.some(a => a.id === 'repeat-client');
  }
  check('Repeat Client unlocks on the third qualifying charter', got);
}

// ---------------------------------------------------------------- leaderboard pure logic
section('Leaderboard logic (spec §8, §11.7 name rule)');
{
  const sim = E.simulate(D.canonicalTest.inputs);
  check('saving with no name is impossible',
    E.leaderboardEntry(sim, '', '2026-08-05') === null &&
    E.leaderboardEntry(sim, '   ', '2026-08-05') === null &&
    E.leaderboardEntry(sim, undefined, '2026-08-05') === null);
  const e1 = E.leaderboardEntry(sim, 'ellis', '2026-08-05');
  check('names are arcade-style: trimmed, uppercased, capped',
    e1.name === 'ELLIS' &&
    E.leaderboardEntry(sim, 'averyveryloongname', '2026-08-05').name.length === D.leaderboard.nameMaxLen);
  let board = [];
  for (let i = 0; i < 15; i++) {
    const entry = { ...e1, name: 'P' + i, score: i * 50, date: '2026-08-0' + (i % 9 + 1) };
    board = E.leaderboardInsert(board, entry).board;
  }
  check(`board caps at top ${D.leaderboard.maxEntries} sorted by score`,
    board.length === D.leaderboard.maxEntries &&
    board.every((e, i) => i === 0 || board[i - 1].score >= e.score));
  const { rank } = E.leaderboardInsert(board, { ...e1, score: 1e6 });
  check('a top score ranks first', rank === 0);
  check('a too-low score reports no rank',
    E.leaderboardInsert(board, { ...e1, score: -1e6 }).rank === -1);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
