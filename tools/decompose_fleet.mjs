/*
 * decompose_fleet.mjs — why the two Intense fleet cells fail.
 *
 * Read-only. Breaks each asserted group cell into its distance, speed-mix
 * and power terms so the error can be attributed to a term rather than
 * guessed at from the headline percentage. Backs the KNOWN LIMITATION note
 * on DATA.fleetReference.
 *
 *   node tools/decompose_fleet.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEngine } from '../test/extract.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACK = JSON.parse(readFileSync(join(ROOT, 'leip_game_data.json'), 'utf8'));
const g = loadEngine();
const D = g.LEIP_DATA, E = g.LEIP_ENGINE, F = D.fleetReference;
const cal = D.calibration, hl = D.hotelLoadsEkw;

// Each vessel's OWN speed mix, from the pack's per-vessel distributions —
// as opposed to the fleet-wide profile the game applies to everyone.
const dist = Object.fromEntries(PACK.vessel_speed_distributions.map((v) => [v.vessel, v]));
function ownStats(vessel) {
  const pd = dist[vessel].pct_dist;
  let tot = 0;
  for (const [k, f] of Object.entries(pd)) if (+k > 1 && f > 0) tot += f;
  let hrPerNm = 0, propHr = 0;
  for (const [k, f] of Object.entries(pd)) {
    if (!(+k > 1 && f > 0)) continue;
    const h = (f / tot) / +k;
    hrPerNm += h; propHr += h * E.propBkwAt(+k);
  }
  return { vEff: 1 / hrPerNm, avgBkw: propHr / hrPerNm };
}
const cell = (nm, dur, vEff, avgBkw) => {
  const uwH = Math.min(nm / vEff, dur * 24);
  const hotel = (hl.stationaryGuestAnchor * (dur * 24 - uwH) +
                 hl.underwayGuestTransit * uwH) * cal.hotelUtilisation / 1000;
  return (hotel + avgBkw * cal.propFactor * uwH / 1000) * 7 / dur;
};

console.log('=== distNm: does it reconcile with the charters filed under it? ===');
console.log('group                        distNm   Typ mean   Int mean   all mean   matches');
for (const r of F.routeGroups) {
  const mem = F.charters.filter((c) => c.group === r.route);
  const mean = (a) => (a.length ? a.reduce((s, c) => s + c.totalNm, 0) / a.length : null);
  const t = mean(mem.filter((c) => c.profile === 'Typical'));
  const i = mean(mem.filter((c) => c.profile === 'Intense'));
  const all = mean(mem);
  const near = (x) => x !== null && Math.abs(x - r.distNm) / r.distNm < 0.02;
  const tags = [near(t) && 'Typ', near(i) && 'Int', near(all) && 'all'].filter(Boolean);
  console.log(`${r.route.padEnd(26)} ${r.distNm.toFixed(1).padStart(7)} ` +
    `${(t === null ? '—' : t.toFixed(1)).padStart(10)} ${(i === null ? '—' : i.toFixed(1)).padStart(10)} ` +
    `${all.toFixed(1).padStart(10)}   ${tags.join('+') || 'NONE'}`);
}

console.log('\n=== Attribution, asserted cells: swap one term at a time ===');
console.log('group                     prof   obs   shipped   +real nm   +own mix   +own power');
for (const r of F.routeGroups) {
  for (const [prof, n, dur, obs] of [['Typical', r.nTyp, r.durTyp, r.mwh7Typ],
                                     ['Intense', r.nInt, r.durInt, r.mwh7Int]]) {
    if (!n || n < F.minGroupN) continue;
    const mem = F.charters.filter((c) => c.group === r.route && c.profile === prof);
    const ownNm = mem.reduce((s, c) => s + c.totalNm, 0) / mem.length;
    const st = mem.map((m) => ownStats(m.vessel));
    const mV = st.reduce((s, o) => s + o.vEff, 0) / st.length;
    const mP = st.reduce((s, o) => s + o.avgBkw, 0) / st.length;
    const gs = E.profileStats(prof);
    const pc = (x) => (((x - obs) / obs * 100 >= 0 ? '+' : '') +
                       ((x - obs) / obs * 100).toFixed(1)).padStart(7);
    console.log(`${r.route.padEnd(24)} ${prof.slice(0, 3)} ${obs.toFixed(1).padStart(6)} ` +
      `${pc(cell(r.distNm, dur, gs.vEff, gs.avgBkw))}% ${pc(cell(ownNm, dur, gs.vEff, gs.avgBkw))}% ` +
      `${pc(cell(ownNm, dur, mV, gs.avgBkw))}% ${pc(cell(ownNm, dur, mV, mP))}%`);
  }
}

console.log('\n=== The residual: implied propFactor per charter ===');
console.log('observed propulsion MWh / (own avg bkW x own underway hours).');
console.log(`The model uses one fitted propFactor of ${cal.propFactor}, set by poster parity.\n`);
const rows = F.charters.map((c) => {
  const o = ownStats(c.vessel);
  const uwH = c.totalNm / o.vEff;
  return { ...c, ...o, uwH, pf: c.propulsionMwh * 1000 / (o.avgBkw * uwH) };
}).sort((a, b) => a.pf - b.pf);
for (const r of rows) {
  console.log(`  ${r.vessel.padEnd(20)} ${r.profile.slice(0, 3)} ${r.totalNm.toFixed(0).padStart(5)} nm ` +
    `${r.uwH.toFixed(0).padStart(4)} uwH  implied ${r.pf.toFixed(3)}` +
    `${r.pf > 1 ? '   <- above 1.0: physically impossible' : ''}`);
}
const pf = rows.map((r) => r.pf);
const mean = pf.reduce((a, b) => a + b, 0) / pf.length;
console.log(`\nmin ${pf[0].toFixed(3)} · median ${pf[Math.floor(pf.length / 2)].toFixed(3)} · ` +
  `mean ${mean.toFixed(3)} · max ${pf[pf.length - 1].toFixed(3)}`);
console.log(`${pf.filter((x) => x > 1).length} charters imply a factor above 1.0, so some observed`);
console.log('propulsion_mwh includes load this model books separately (manoeuvring, DP,');
console.log('station keeping). The observed median is NOT a clean recalibration target.');

console.log('\n=== Would per-profile distances fix it? ===');
let a = 0, b = 0, tot = 0;
for (const r of F.routeGroups) {
  for (const [prof, n, dur, obs] of [['Typical', r.nTyp, r.durTyp, r.mwh7Typ],
                                     ['Intense', r.nInt, r.durInt, r.mwh7Int]]) {
    if (!n || n < F.minGroupN) continue;
    const mem = F.charters.filter((c) => c.group === r.route && c.profile === prof);
    const ownNm = mem.reduce((s, c) => s + c.totalNm, 0) / mem.length;
    const gs = E.profileStats(prof);
    const p1 = (cell(r.distNm, dur, gs.vEff, gs.avgBkw) - obs) / obs * 100;
    const p2 = (cell(ownNm, dur, gs.vEff, gs.avgBkw) - obs) / obs * 100;
    a += Math.abs(p1) <= F.tolerancePct; b += Math.abs(p2) <= F.tolerancePct; tot++;
  }
}
console.log(`  asserted cells passing: ${a}/${tot} as shipped -> ${b}/${tot} on per-profile means.`);
console.log('  It fixes the two failures and breaks two that pass. Net nothing — which is');
console.log('  why this is referred to the source rather than patched here.');
