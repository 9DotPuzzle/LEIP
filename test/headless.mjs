// Headless validation — spec §11.2-11.6 plus poster parity (§6), the
// leaderboard's pure logic (§8/§11.7 name rule) and model behaviours.
// Runs the THEME/DATA/ENGINE blocks extracted verbatim from index.html.
import { loadEngine, readHtml } from './extract.mjs';

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
check('hotel load reads off the prop curve: 128.0 at rest / 113.4 under way',
  D.hotelKw.atRest === 128.0 && D.hotelKw.underway === 113.4 &&
  D.propCurve[0].hotelKw === D.hotelKw.atRest &&
  D.propCurve.slice(1).every(c => c.hotelKw === D.hotelKw.underway));
check('the prop curve is electrical power, used with no conversion',
  D.calibration.propFactor === undefined && D.calibration.hotelUtilisation === undefined &&
  D.propCurve.map(c => c.pbKw).join() === '0,291.5,771.8,1845.8');
check('battery 49,860 kWh installed, 50 MWh game threshold',
  D.battery.installedKwh === 49860 && D.battery.gameThresholdMwh === 50);
check('speed model fitted over all 28 observed charters, split 14/14',
  D.speedProfiles.Typical.nCharters === 14 && D.speedProfiles.Intense.nCharters === 14);
check('Intense is genuinely the harder-driven profile, at every route length',
  [50, 200, 440, 700, 1039].every(nm =>
    E.profileStats('Intense', nm).vEff > E.profileStats('Typical', nm).vEff &&
    E.profileStats('Intense', nm).avgKw > E.profileStats('Typical', nm).avgKw));
// The regression is the whole point: the split must MOVE with distance,
// which the two fixed profiles it replaced could not do.
check('the speed split is predicted from total route distance, not fixed',
  [50, 200, 440, 700].every((nm, i, a) => i === 0 ||
    E.profileStats('Typical', nm).vEff > E.profileStats('Typical', a[i - 1]).vEff));
// Sheet reproduction at 71.3 nm — the check point the regression ships with.
{
  const pct = (p, nm) => {
    const s = E.profileStats(p, nm).share;
    return [14, 11, 8].map(v => (s[v] * 100).toFixed(1)).join('/');
  };
  check('at 71.3 nm the Hare split reproduces the sheet: 12.4/76.5/11.1',
    pct('Intense', 71.3) === '12.4/76.5/11.1', pct('Intense', 71.3));
  check('at 71.3 nm the Tortoise split reproduces the sheet: 2.4/76.5/21.1',
    pct('Typical', 71.3) === '2.4/76.5/21.1', pct('Typical', 71.3));
}
check('shares always sum to 1 and never go negative',
  [0, 71.3, 400, 681, 956, 1039, 3000].every(nm =>
    ['Typical', 'Intense'].every(p => {
      const s = E.profileStats(p, nm).share;
      const vals = Object.values(s);
      return vals.every(v => v >= 0) && Math.abs(vals.reduce((a, b) => a + b, 0) - 1) < 1e-9;
    })));
// The 8 kt share hits the clamp on long Hare routes — asserted so the
// clamp stays a documented behaviour rather than a silent one.
check('the 8 kt share clamps to zero past the regression\'s observed range',
  E.profileStats('Intense', 700).share[8] === 0 &&
  E.profileStats('Intense', 400).share[8] > 0);
check('44 ports, names unique',
  D.ports.length === 44 && new Set(D.ports.map(p => p.name)).size === 44);
// v4 replaced the pack's country field with SHEET REGIONS — "Corsica
// (France)", "Sardegna (Italy)", "Northern Italy" AND "Nothern Italy".
// Countries is a scored factor, so the region is kept for provenance and
// the country is derived. If these two were ever conflated, one Italy
// would score as five and a spelling mistake would be worth points.
check('every port carries both a country and the pack region it came from',
  D.ports.every(p => p.country && p.region));
check('regions collapse to real countries — Italy is one country, not five',
  new Set(D.ports.map(p => p.country)).size === 15 &&
  D.ports.filter(p => p.country === 'Italy').length === 11 &&
  new Set(D.ports.filter(p => p.country === 'Italy').map(p => p.region)).size === 5);
check('every country the ports use has a flag',
  [...new Set(D.ports.map(p => p.country))].every(c => T.flags.defs[c]),
  [...new Set(D.ports.map(p => p.country))].filter(c => !T.flags.defs[c]).join(', '));
check('Livadia is on Astypalea, not Tilos',
  (() => { const l = D.ports.find(p => p.name === 'Livadia');
           return l.lat === 36.5423 && l.lon === 26.3429; })());
check('the eleven new ports are all present',
  ['Sidi Fredj', 'Split', 'Marseille', 'Valletta', 'Casablanca', 'Koper',
   'Barcelona', 'Bizerte', 'Gibraltar', 'Vlore', 'Lateral']
    .every(n => D.ports.some(p => p.name === n)));
check('Lateral is flagged as the easter egg, and nothing else is',
  D.ports.filter(p => p.easterEgg).map(p => p.name).join() === 'Lateral');
check('energy types are the four carbon classes, or null where the source has no figure',
  D.ports.every(p => p.energy === null || ['green', 'blue', 'grey', 'brown'].includes(p.energy)));
check('every port is rated — no blanks left in the pack',
  D.ports.every(p => p.carbon !== null && p.energy !== null));
check('an unrated port would still never be a reward',
  D.scoring.multiplier.rechargeUnrated === D.scoring.multiplier.recharge.grey);
// v4: colour comes from the sheet's Category column, NOT derived from
// carbon. The two mostly agree but not always — the three Turkish ports
// sit at 440 gCO2/kWh, which any threshold would call brown, and the
// sheet calls grey. The sheet wins; that is what "category-driven" means.
check('energy is one of the four classes, taken from the pack',
  D.ports.every(p => ['green', 'blue', 'grey', 'brown'].includes(p.energy)));
check('colour is category-driven, not derived from carbon',
  D.energyThresholdsGco2kwh === undefined && D.energyQuartilesGco2kwh === undefined);
{
  const n = (c) => D.ports.filter(p => p.energy === c).length;
  check('the pack gives 11 green / 15 blue / 7 grey / 11 brown',
    [n('green'), n('blue'), n('grey'), n('brown')].join('/') === '11/15/7/11',
    [n('green'), n('blue'), n('grey'), n('brown')].join('/'));
  // Carbon and colour must still broadly track, or the Category column has
  // drifted from the physical figure it is supposed to summarise.
  const rank = { green: 0, blue: 1, grey: 2, brown: 3 };
  const bad = D.ports.filter(p => {
    const others = D.ports.filter(o => rank[o.energy] > rank[p.energy]);
    return others.some(o => o.carbon < p.carbon - 120);
  });
  check('a greener port is never far dirtier than a browner one',
    bad.length <= 3, bad.map(p => `${p.name} ${p.carbon}/${p.energy}`).join(', '));
}
check('44x44 distance matrix, symmetric, zero on the diagonal',
  Object.keys(D.distanceMatrixNm).length === 44 &&
  D.ports.every(a => D.ports.every(b =>
    D.distanceMatrixNm[a.name][b.name] === D.distanceMatrixNm[b.name][a.name])) &&
  D.ports.every(a => D.distanceMatrixNm[a.name][a.name] === 0));
check('seven poster routes over valid ports',
  D.posterRoutes.length === 7 &&
  D.posterRoutes.every(r => r.ports.every(n => D.ports.some(p => p.name === n))));
// The SIMPLIFIED set: one flat list, each selectable once, all the same
// trivial energy, each carrying a hidden eco rating.
check('14 activities, one flat list, ids A01-A14',
  D.activities.length === 14 &&
  D.activities.map(a => a.id).join() ===
    Array.from({ length: 14 }, (_, i) => 'A' + String(i + 1).padStart(2, '0')).join());
check('no category, no repeat counts, no per-week maxima, no fun ratings',
  D.activities.every(a => a.category === undefined && a.repeatable === undefined &&
    a.maxPerWeek === undefined && a.fun === undefined) &&
  D.scoring.activitiesCountsRepeats === undefined && D.scoring.funMetric === undefined);
check('every activity costs the same trivial energy — 0.1% of the weekly budget',
  D.activities.every(a => a.energyPct === 0.001) &&
  D.activities[0].energyPct * D.scoring.weeklyEnergyRefMwh === 0.05);
check('every activity carries a hidden eco rating in 1-10',
  D.activities.every(a => Number.isFinite(a.eco) && a.eco >= 1 && a.eco <= 10));
check('the eco rating is never rendered — it reaches the player only as score',
  !/act-eco|a\.eco|\.eco\b/.test(readHtml().split('<script id="leip-app">')[1] || ''));
check('the fourteen are the published set with the published eco ratings',
  D.activities.map(a => a.name + ' ' + a.eco).join(' · ') ===
    ['Scuba diving 4', 'Snorkelling 10', 'Jet skis 1', 'Seabobs 8', 'E-foiling 8',
     'Wakeboarding & waterskiing 2', 'Paddleboards & kayaks 10', 'Beach club afternoon 7',
     'Jacuzzi under the stars 4', 'Spa & massage 7', 'Sauna & hammam 3', 'Cinema night 8',
     'Formal dinner & wine tasting 6', 'Deck party 5'].join(' · '),
  D.activities.map(a => a.name + ' ' + a.eco).join(' · '));
check('every activity has an icon, and no icon is orphaned',
  D.activities.every(a => T.icons.defs[a.id]) &&
  Object.keys(T.icons.defs).filter(k => /^A\d\d$/.test(k)).length === 14);
check('nine achievements', D.achievements.list.length === 9);
check('Santorini tagged for Volcano Chief', D.ports.some(p => p.tags.includes(D.achievements.santoriniTag)));
// ---- Animated sea and wake: visual tokens, all in THEME ------------
check('THEME.water describes a calm sea, not weather',
  T.water.swell.length === 3 &&
  T.water.swell.every(w => w.wavelength > 20 && w.speed > 0 && w.speed < 0.2 && w.amp > 0) &&
  T.water.depth > 0 && T.water.depth <= 0.08 &&
  T.water.steps >= 3 && T.water.steps <= 8);
check('the sea shading is stepped, not smooth — the flat-shaded look holds',
  Number.isInteger(T.water.steps));
check('the glitter path is a soft pool, not a specular highlight',
  T.water.glint.strength > 0 && T.water.glint.strength <= 1 &&
  T.water.glint.moonStrength > 0 && T.water.glint.moonStrength < T.water.glint.strength &&
  T.water.glint.radius > 0 && T.water.glint.reach > 0);
// ---- Sky: one clock, no disc, no bloom -----------------------------
check('the sun arc runs sunrise to sunset within a single day',
  T.sky.sunriseHour >= 0 && T.sky.sunsetHour <= 24 &&
  T.sky.sunsetHour > T.sky.sunriseHour);
check('the arc stays southern, so a low sun rakes across the land',
  T.sky.azimuthFromDeg > 0 && T.sky.azimuthToDeg < 180 &&
  T.sky.azimuthToDeg > T.sky.azimuthFromDeg);
check('the sun climbs but never stands overhead',
  T.sky.maxElevationDeg > 30 && T.sky.maxElevationDeg < 90);
check('the moon runs the same arc, lower',
  T.sky.moonElevationScale > 0 && T.sky.moonElevationScale < 1);
check('the light is warm low, near-neutral high, cool after dark',
  [T.sky.warmLow, T.sky.neutralHigh, T.sky.moonCool].every(c => /^#[0-9A-F]{6}$/i.test(c)));
// The sun's hours are the SAME hours the scene tints are centred on. If
// these ever diverged there would in effect be two clocks.
check('the sun is up across the daylight scenes and down at night',
  T.sceneHours.dawn >= T.sky.sunriseHour && T.sceneHours.dusk < T.sky.sunsetHour &&
  T.sceneHours.night > T.sky.sunsetHour);
// ---- Cloud shadows -------------------------------------------------
check('cloud shadows are sparse — only the top of the field darkens',
  T.clouds.coverage > 0.5 && T.clouds.coverage < 0.9 &&
  T.clouds.softness > 0.1 && T.clouds.softness < 0.6);
// Scale is judged against the VIEWPORT, not the basin: the camera's
// ground footprint runs 160-510 world units, so a patch has to be a
// fraction of that or a whole view sits inside one trough and shows
// nothing. Measured, 150 puts 15% of a typical frame in soft shadow.
check('patches are sized against the viewport, and the drift is slow',
  T.clouds.scale > 80 && T.clouds.scale < 260 &&
  T.clouds.driftSpeed > 0 && T.clouds.driftSpeed < 20);
check('the shadow is light, not UI — it must not read as a panel',
  T.clouds.seaDepth > 0 && T.clouds.seaDepth <= 0.2 &&
  T.clouds.landDepth > 0 && T.clouds.landDepth <= 0.2);
check('sea and land take the shadow from one field at near-equal depth',
  Math.abs(T.clouds.landDepth - T.clouds.seaDepth) < 0.06);
check('phones drop a term rather than the whole effect',
  T.clouds.lowDetailTerms >= 2 && T.clouds.lowDetailTerms < 3);
check('nothing in the sky or cloud blocks carries a banned effect',
  !/bloom|glow|hdr|flare/i.test(JSON.stringify(T.sky) + JSON.stringify(T.clouds)));
check('water carries no colour of its own — the scene tint is the only source',
  !/#[0-9a-fA-F]{3,8}/.test(JSON.stringify(T.water)));
check('small viewports drop to a cheaper sea',
  T.water.lowDetailSwells < T.water.swell.length && T.water.lowDetailMaxPx > 0);
{
  const Y = T.world.yacht;
  check('the wake is a drawn V, laid down in pairs and faded',
    Y.wake.halfAngleDeg > 10 && Y.wake.halfAngleDeg < 30 &&
    Y.wake.beatSec > 0 && Y.wake.life > 0 && Y.wake.opacity > 0 && Y.wake.opacity <= 1);
  check('the wake starts clear of the transom, not under the hull',
    Y.wake.astern > 0.5);
  check('a Hare leg leaves a stronger wake than a Tortoise one, gently',
    Y.wake.fastScale > 1 && Y.wake.fastScale < 1.5);
  // There is no bow wave any more, and this asserts its ABSENCE rather
  // than being deleted. It was a PlaneGeometry — a rectangle — sold as a
  // soft crescent, and at chart scale it read as a small pale box parked
  // ahead of the bow. The V wake astern already says "under way". A token
  // left behind would invite someone to wire it back up.
  check('no bow wave: the box ahead of the stem is gone, wake and all else intact',
    Y.bowWave === undefined && !!Y.wake && !!Y.idle);
  check('and nothing still builds or shows one',
    !/bowWave/.test(readHtml()));
  check('the idle bob is a breath, not a roll',
    Y.idle.heave < 0.02 && Y.idle.roll < 0.05 && Y.idle.pitch < 0.05 &&
    [Y.idle.heaveSec, Y.idle.rollSec, Y.idle.pitchSec, Y.idle.yawSec].every(p => p > 3));
  // Mutually prime-ish periods, so the four axes never re-synchronise into
  // a visible loop.
  const per = [Y.idle.heaveSec, Y.idle.rollSec, Y.idle.pitchSec, Y.idle.yawSec];
  check('the idle periods do not share a short common multiple',
    new Set(per).size === 4 && per.every((a, i) => per.every((b, j) =>
      i === j || Math.abs(a / b - Math.round(a / b)) > 0.05)));
}

// ---- the visual fixes: planned line, label chips, monument palette ----
{
  const src = readHtml();
  // The PLANNED passage carries its own fixed white ink; the volt trail
  // that inks over it as she sails is untouched and stays the one accent.
  const rc = T.routeCanvas;
  check('the planned route line has its own ink, and it is white',
    typeof rc.plannedInk === 'string' && /^#(f{3}|f{6})$/i.test(rc.plannedInk));
  check('it does NOT follow the day cycle — that is what made it vanish',
    rc.plannedInk !== T.ink.onLight && rc.plannedInk !== T.ink.onDark);
  {
    // Scoped to RoutePlot.draw — scene ink is still correct elsewhere
    // (the graticule, the compass rose, the share card all flip with the
    // day cycle and should). What must not happen is the PASSAGE PLOT
    // taking it.
    const body = src.slice(src.indexOf('// Each leg is a sea-lane polyline'),
                           src.indexOf('// Bearing/distance callouts are NOT baked'));
    check('the dashes are drawn in it, not in the scene ink handed to draw()',
      /ctx\.strokeStyle = rc\.plannedInk;/.test(body) &&
      !/ctx\.strokeStyle = ink;/.test(body));
    const trail = src.slice(src.indexOf('if (sailedNm > 0) {'));
    check('the volt trail is untouched and still the accent',
      /ctx\.strokeStyle = T\.volt;/.test(trail) && T.volt === '#F5D90A');
  }

  // The PLANNING weight: heavier while the plan is the only line on the
  // water, back to the original once the volt trail can fringe it.
  check('the planning line is drawn heavier than the plotted one',
    rc.planningLineWorld > rc.lineWorld * 2 &&
    rc.planningDashWorld[0] > rc.dashWorld[0] &&
    rc.planningTickWorld > rc.tickWorld);
  check('the heavier dash is still a dash — mark longer than gap, not a solid line',
    rc.planningDashWorld.length === 2 && rc.planningDashWorld[0] > rc.planningDashWorld[1]);
  check('and it is the same white — brighter by weight, never by colour',
    rc.plannedInk === '#FFFFFF');
  check('the weight is chosen by PHASE, so playback is untouched',
    /var planning = S\.phase === 'planning';/.test(src) &&
    /planning \? rc\.planningLineWorld : rc\.lineWorld/.test(src) &&
    /planning \? rc\.planningTickWorld : rc\.tickWorld/.test(src));
  check('and the volt trail still takes its width from the ORIGINAL lineWorld',
    /ctx\.lineWidth = rc\.lineWorld \* ppu \* 1\.5;/.test(src));

  // ---- the mobile layout, and the flag that was not a flag ----
  {
    const uk = T.flags.defs['United Kingdom'];
    const kinds = uk.map((o) => o[0]);
    check('the Union Flag has a saltire, not just an upright cross',
      kinds.filter((k) => k === 'line').length === 4 &&
      kinds.filter((k) => k === 'cross').length === 2, kinds.join(','));
    check('its diagonals run corner to corner, both ways',
      uk.some((o) => o[0] === 'line' && o[1] === 0 && o[2] === 0 && o[3] === 1 && o[4] === 1) &&
      uk.some((o) => o[0] === 'line' && o[1] === 0 && o[2] === 1 && o[3] === 1 && o[4] === 0));
    check('white under red on both the saltire and the cross',
      uk.filter((o) => o[0] === 'line')[0][6] === 'white' &&
      uk.filter((o) => o[0] === 'line')[2][6] === 'ukRed' &&
      uk.filter((o) => o[0] === 'cross')[0][5] === 'white' &&
      uk.filter((o) => o[0] === 'cross')[1][5] === 'ukRed');
    check('a stroked diagonal overhangs the corners, so the flag is clipped',
      /needsClip = true;/.test(src) && /clip-path="url\(#/.test(src));
  }
  // The three header buttons are ONE ROW — same top edge, same bottom
  // edge. Baseline alignment used to do this and could not: a square with
  // no text in it has no baseline to align, so it sat short and low.
  check('every header button takes the row height, so all three share their edges',
    /#topbar button \{ align-self: stretch; \}/.test(src) &&
    /#topbar \{[\s\S]{0,120}align-items: center/.test(src));
  check('the info button matches their height and stays narrow',
    /#btn-info \{[^}]*padding: 0 10px/.test(src) &&
    !/#btn-info \{[^}]*align-self: center/.test(src));
  {
    // The HUD box sizes to its content. The old fixed width plus
    // overflow:hidden is what sliced "7:00 PM" into "7:00 PI".
    const css = src.slice(src.indexOf('#titleblock {'), src.indexOf('.tb-row {'));
    check('the HUD box sizes to content, bounded by the viewport',
      /width: max-content/.test(css) && /max-width: calc\(100vw/.test(css));
    check('no HUD value is clipped by overflow any more',
      !/\.tb-cell output \{[^}]*overflow: hidden/.test(src));
    check('cells keep their content width — flex-basis auto, not the `flex: 1` shorthand',
      /\.tb-cell \{ flex: 1 1 auto;/.test(src) &&
      /#tb-mode-cell \{ flex-grow:/.test(src) && !/#tb-mode-cell \{ flex: /.test(src));
    // FIXED WIDTH FOR THE SESSION. Sizing to live values made the frame
    // twitch every time a reading changed length; the box is measured once
    // against the widest content the game can produce and pinned there.
    const w = T.hud.widest;
    check('the worst case is stated, not guessed at',
      !!w && w.mode === 'HYBRID' && /KTS$/.test(w.speed) &&
      /^\d\/7$/.test(w.day) && /(AM|PM)$/.test(w.clock));
    {
      // The reserved leg must cover every leg a route between two DIFFERENT
      // ports can produce — swept from the port list rather than taken on
      // trust. A port to itself is longer still and is allowed to wrap;
      // what must not happen is the width moving.
      let longest = '';
      for (const a of D.ports) {
        for (const b2 of D.ports) {
          if (a.name === b2.name) continue;
          const t = (a.name + ' > ' + b2.name).toUpperCase();
          if (t.length > longest.length) longest = t;
        }
      }
      check(`the reserved leg covers the longest a route can make (${longest.length} chars: ${longest})`,
        w.leg.toUpperCase().length >= longest.length, `reserved ${w.leg.length}`);
      check('MODE reserves for the widest word the HUD can show there',
        w.mode.length >= 'ANCHOR'.length);
    }
    check('the box is measured once and pinned, and re-measured only on resize',
      /function lockTitleBlockWidth\(\)/.test(src) &&
      /tb\.style\.width = Math\.min\(want, cap\)/.test(src) &&
      /lockTitleBlockWidth\(\);\n\s*clampCam\(true\);/.test(src));
    check('and the pin is capped at the viewport, so a narrow phone never overflows',
      /var cap = vw > 0 \? vw - margin : want;/.test(src));
    check('the leg, the one unbounded value, wraps rather than overflowing',
      /#tb-leg-cell output \{[\s\S]*?white-space: normal;[\s\S]*?overflow-wrap: anywhere;/.test(src));
  }
  {
    // The sheet layout: one breakpoint, known to both the CSS and the
    // camera. If they drifted the camera would centre the world behind a
    // panel that is not where it thinks it is.
    const q = src.match(/@media \(max-width: (\d+)px\)/);
    check(`the CSS breakpoint and T.ui.sheetBreakpointPx are the same number (${T.ui.sheetBreakpointPx})`,
      !!q && Number(q[1]) === T.ui.sheetBreakpointPx, q && q[1]);
    check('one helper answers which edge the panel covers, on both layouts',
      /function panelInset\(\)/.test(src) && !/panelFrac/.test(src));
    // MEASURED, not inferred. sheetMaxVh is a fraction of the VIEWPORT and
    // the stage is the viewport minus the header, so computing the covered
    // fraction from the token was wrong by five points on every phone —
    // a third of the visible strip — and over-zoomed every default view.
    check('it measures the panel\'s real rectangle rather than inferring it',
      /stage\.getBoundingClientRect/.test(src) &&
      /\(sr\.bottom - pr\.top\) \/ sr\.height/.test(src) &&
      /\(pr\.right - sr\.left\) \/ sr\.width/.test(src));
    check('a minimised sheet covers nothing, so the box is the whole stage',
      /if \(isSheetLayout\(\) && S\.sheetMinimised\) return \{ left: 0, bottom: 0 \};/.test(src));
    check('and minimising does NOT re-fit or re-centre — it only re-clamps',
      /if \(was !== S\.sheetMinimised && G\) clampCam\(true\);/.test(src) &&
      !/S\.lastFitKey = null;[\s\S]{0,80}clampCam\(true\);/.test(src));

    const h = T.frame.homeDeg, m = T.frame.homeDegMobile, b = T.frame.boundsDeg;
    const inRect = (p, r) => p.lon >= r.minLon && p.lon <= r.maxLon &&
                             p.lat >= r.minLat && p.lat <= r.maxLat;
    check('both opening rectangles sit inside the pan limit',
      [m, h].every((r) => r.minLon >= b.minLon && r.maxLon <= b.maxLon &&
                          r.minLat >= b.minLat && r.maxLat <= b.maxLat));
    // The phone opens on the WHOLE Mediterranean cluster. "Whole" is
    // checked against the port list rather than asserted: every port that
    // is in the Mediterranean at all must be inside it. The three that are
    // not are Atlantic, and are reachable by pan exactly as before.
    {
      const atlantic = ['Lateral', 'Casablanca', 'Gibraltar'];
      const med = D.ports.filter((p) => !atlantic.includes(p.name));
      const missed = med.filter((p) => !inRect(p, m)).map((p) => p.name);
      check(`the phone opens on the whole Mediterranean cluster — all ${med.length} Med ports in frame`,
        missed.length === 0, missed.join(', '));
      check('the three Atlantic ports are the only ones outside it, and still in the pan limit',
        atlantic.every((n) => {
          const p = D.ports.find((q) => q.name === n);
          return !inRect(p, m) && inRect(p, b);
        }));
    }
    check('the grip is the only thing that moves the sheet — not the map, not the panel body',
      /var g = \$\('sheet-grip'\);\s*\n\s*if \(!g \|\| !g\.addEventListener\) return;/.test(src) &&
      /g\.addEventListener\('pointerdown'/.test(src) &&
      !/setSheetMinimised/.test(
        src.slice(src.indexOf('function bindStageInput'), src.indexOf('function bindRouteDrag'))));
    // THE FIXED ACTION BAR is a MIRROR, not a second implementation, and
    // it is the thing the rest of the mobile layout anchors against.
    check('the bar calls the same API entry points as the panel buttons',
      /on\('btn-bar-spin', 'click', function \(\) \{ API\.spin\(\); \}\);/.test(src) &&
      /on\('btn-spin', 'click', function \(\) \{ API\.spin\(\); \}\);/.test(src) &&
      /on\('btn-sim', 'click', function \(\) \{ API\.simulate\(\); \}\);/.test(src) &&
      /API\.skip\(\);\s*\n?\s*else API\.simulate\(\);/.test(src));
    // ONE RULE for both copies of the pair, not the bar mirroring the
    // panel button's .disabled — which only worked while refreshPlanning
    // was the only thing that set it. During playback nothing calls
    // refreshPlanning, so the bar held a stale answer and offered
    // SIMULATE CHARTER in the middle of a charter.
    check('one rule decides whether a charter can be started, for both buttons',
      /function canSimulate\(\) \{ return S\.phase === 'planning' && S\.inputs\.route\.length >= 1; \}/.test(src) &&
      /\[\$\('btn-spin'\), \$\('btn-bar-spin'\)\]\.forEach/.test(src) &&
      /if \(sim\) sim\.disabled = !canSimulate\(\);/.test(src));
    // The bar's primary control is never inert: mid-run it becomes STOP,
    // the same action as the SKIP on the chart. One function decides the
    // label, the action and the disabled state together, and the click
    // handler reads back the very attribute that function sets — so the
    // label and what it does cannot drift apart.
    check('the bar\'s primary becomes STOP during a run and reverts after it',
      /function barPrimary\(\)/.test(src) &&
      /S\.phase === 'playback'\s*\n?\s*\? \{ act: 'skip', label: 'Stop', disabled: false \}/.test(src) &&
      /: \{ act: 'simulate', label: 'Simulate charter', disabled: !canSimulate\(\) \}/.test(src));
    check('and the click reads the same attribute the sync writes',
      /bar\.setAttribute\('data-act', p\.act\);/.test(src) &&
      /b\.getAttribute\('data-act'\) === 'skip'/.test(src));
    check('and refreshPlanning no longer keeps a second copy of it',
      !/sim\.disabled = S\.inputs\.route\.length < 1/.test(src));
    check('it lives outside the sheet, since the sheet is what slides',
      src.indexOf('id="action-bar"') > src.indexOf('</aside>'));
    check('and it exists only on the phone — the desktop sidebar has no bottom bar',
      /^#action-bar \{ display: none; \}$/m.test(src) &&
      /@media \(max-width: 760px\)[\s\S]{0,1200}#action-bar \{\s*\n\s*display: flex;/.test(src));
    // The sheet is CONTAINED, and its list dissolves into the footer.
    check('main clips, so a translated sheet cannot escape below the layout',
      /^main \{[^}]*overflow: hidden;/m.test(src));
    check('and the sheet does not chain its scroll on to the page behind',
      /#plan \{ overscroll-behavior: contain; \}/.test(src));
    check('a sticky frosted lip sits at the foot of the list, costing it no height',
      /#sheet-fade \{[\s\S]*?position: sticky; bottom: 0;[\s\S]*?margin-top: calc\(var\(--fade-h\) \* -1\);[\s\S]*?\}/.test(src) &&
      /#sheet-fade \{[\s\S]*?pointer-events: none;/.test(src));
    check('the lip is the panel\'s own glass language, not a new colour',
      /#sheet-fade \{[\s\S]*?backdrop-filter: blur\(calc\(var\(--glass-blur\) \/ 3\)\);/.test(src) &&
      /rgba\(245, 242, 234,/.test(src));
    check('and there is no lip on the desktop sidebar, which has no footer to fade into',
      /^#sheet-fade \{ display: none; \}$/m.test(src));
    check(`the expanded sheet is ${T.ui.sheetMaxVh}vh and still sits above the bar`,
      T.ui.sheetMaxVh === 62 && /#plan \{[\s\S]{0,240}bottom: var\(--bar-h\);/.test(src));

    check('the two are a matched pair — equal flex width, one style, full opacity',
      /#action-bar button \{[\s\S]*?flex: 1 1 0;[\s\S]*?opacity: 1;[\s\S]*?\}/.test(src));
    check('the panel\'s own copy of the pair is hidden, so neither appears twice',
      /#actions \{ display: none; \}/.test(src));

    // The bar is the ANCHOR: the sheet rests on it, the HUD sits above it.
    check('the sheet slides in the space above the bar, never over it',
      /#plan \{[\s\S]{0,240}bottom: var\(--bar-h\);/.test(src));
    check('minimised, the sheet rests on the bar with only its PLAN strip showing',
      /body\.sheet-min #plan \{\s*\n\s*transform: translateY\(calc\(100% - var\(--grip-h\)\)\);/.test(src));
    check('and the HUD sits above the bar too',
      /#titleblock \{[\s\S]{0,160}bottom: calc\(var\(--bar-h\) \+ 8px\);/.test(src));

    // Telemetry only while there is telemetry.
    check('the HUD is hidden while planning on a phone, and shown for the run',
      /function syncHudVisibility\(\)/.test(src) &&
      /if \(!isSheetLayout\(\)\) \{ show\('titleblock', true\); return; \}/.test(src) &&
      /show\('titleblock', S\.phase === 'playback'\);/.test(src));
    check('and every phase change re-evaluates it',
      (src.match(/syncHudVisibility\(\); syncActionBar\(\);/g) || []).length >= 5);

    // Names route around the chrome, not under it.
    check('the label pass treats the HUD and the action bar as occupied',
      /Labels\.chromeBoxes\(\)\.forEach/.test(src) &&
      /\['titleblock', 'action-bar'\]/.test(src));
    check('and folding the sheet forces a re-layout, since the camera did not move',
      /Labels\.lastCam = null;/.test(
        src.slice(src.indexOf('function setSheetMinimised'),
                  src.indexOf('function syncActionBar'))));
    // The drag: real-time follow, then snap by velocity or by position.
    check('the PLAN bar drags the sheet in real time',
      /plan\.style\.transform =\s*\n?\s*'translateY\(' \+ Math\.max\(0, Math\.min\(travel, base \+ drag\.dy\)\)/.test(src));
    check('a flick decides the state regardless of how far it travelled',
      /if \(v >= FLICK_PX_PER_MS\) setSheetMinimised\(true\);/.test(src) &&
      /else if \(v <= -FLICK_PX_PER_MS\) setSheetMinimised\(false\);/.test(src));
    check('and a slow partial drag settles to whichever state it is nearest',
      /else setSheetMinimised\(at > travel \/ 2\);/.test(src));
    check('a tap still toggles, and taps on other controls in the bar pass through',
      /if \(Math\.abs\(dy\) <= TAP_PX\) \{ setSheetMinimised\(!S\.sheetMinimised\); return; \}/.test(src) &&
      /if \(t && t\.closest && t !== g && t\.closest\('button'\) !== g\) return;/.test(src));
    check('and coming back above the breakpoint cannot leave the panel hidden',
      /if \(!isSheetLayout\(\) && S\.sheetMinimised\) setSheetMinimised\(false\);/.test(src));
  }

  // THE CAMERA HOLDS THE WHOLE ROUTE. Asserted against the source here
  // because fitCamera needs a live scene; that it actually frames a route
  // reaching to Lateral is checked in the browser by tools/reach.mjs.
  check('a route change reframes on the WHOLE route, not the latest pick',
    /fitCamera\(S\.inputs\.route\.length \? S\.inputs\.route : null\)/.test(src));
  check('it sets targets only, so the per-frame easing carries the move',
    /c\.x \+= \(c\.tx - c\.x\) \* k/.test(src) &&
    !/fitCamera[\s\S]{0,400}G\.cam\.x = /.test(src));
  check('and it re-solves on the port SET, so a reorder drag does not thrash it',
    /S\.lastFitKey/.test(src) && /route\.slice\(\)\.sort\(\)\.join/.test(src));
  check('the min/max distance clamps still bound the answer',
    /var dist = Math\.min\(f\.maxDist, Math\.max\(f\.minDist, hi\)\);/.test(src));

  // Port names are chips: one dark box with light type, for every port.
  const chip = T.world.labelPlate.chip;
  check('port labels are chips — a dark box with light type',
    !!chip && typeof chip.fill === 'string' && typeof chip.text === 'string' &&
    chip.padXPx > 0 && chip.padYPx > 0);
  {
    // "Dark box, light text" asserted as a real contrast, not as two
    // strings that happen to differ.
    const lum = (h) => {
      const n = parseInt(h.slice(1), 16);
      return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
    };
    check(`the chip's type reads against its box (${lum(chip.fill).toFixed(2)} vs ${lum(chip.text).toFixed(2)})`,
      lum(chip.text) - lum(chip.fill) > 0.5);
  }
  check('the chip is painted into the same plate the de-collision pass measures',
    /var chip = plate\.chip;/.test(src) && /ctx\.fillRect\(bx, by, bw, bh\)/.test(src));
  check('the collision system itself is untouched — same candidates, same drop rule',
    T.world.labelPlate.candidates.length === 24 && T.world.labelPlate.padPx > 0);
  check('callouts are NOT chipped — only port names are',
    !T.world.calloutPlate.chip);

  // The monuments own their palette; it is not a reuse and not the energy
  // colour, which belongs to the marker and the label.
  const mn = T.world.monument;
  check('the monuments have their own three-tone palette entry',
    !!mn && ['lit', 'mid', 'shade'].every(k => /^#[0-9a-f]{6}$/i.test(mn[k])));
  check('it is a new token, not a repurposed one',
    ![T.world.yachtHull, T.world.yachtTeak, T.world.foam, T.volt, T.dieselSmoke,
      T.signalRed, T.ink.onLight, T.ink.onDark].includes(mn.lit));
  check('the three tones actually descend',
    parseInt(mn.lit.slice(1), 16) > parseInt(mn.mid.slice(1), 16) &&
    parseInt(mn.mid.slice(1), 16) > parseInt(mn.shade.slice(1), 16));
  check('and it says nothing about the port\'s energy — that stays on the label',
    !/monument\.(lit|mid|shade)[\s\S]{0,200}energy/.test(src) &&
    D.ports.every(p => typeof p.energy === 'string'));
  check('no monument is still built in the hull white it disappeared in',
    !/monument === '[a-z]+'[\s\S]*?hullMat/.test(
      src.slice(src.indexOf("port.monument === 'lighthouse'"),
                src.indexOf("mon.position.y ="))));
}
// The opening view is a STATED rectangle, not the bounding box of the port
// list — or adding a port in the Channel would open the game on a
// continental map. Home must sit inside the pan limit, and the limit must
// still be wide enough to reach anything outside home by zooming out.
{
  const h = T.frame.homeDeg, b = T.frame.boundsDeg;
  check('the home view is stated, not derived from the ports',
    h && h.minLon < h.maxLon && h.minLat < h.maxLat);
  check('home sits inside the pan limit',
    h.minLon > b.minLon && h.maxLon < b.maxLon &&
    h.minLat > b.minLat && h.maxLat < b.maxLat);
  check('home is the working Mediterranean, not the whole frame',
    (h.maxLon - h.minLon) < (b.maxLon - b.minLon) * 0.6);
  // Every port must be reachable: inside the pan limit, whether or not it
  // is inside the opening view.
  const outside = D.ports.filter(p =>
    p.lon <= b.minLon || p.lon >= b.maxLon || p.lat <= b.minLat || p.lat >= b.maxLat);
  check(`all ${D.ports.length} ports are reachable within the pan limit`,
    outside.length === 0, outside.map(p => p.name).join(', '));
}
check('THEME carries the four scene tints and the volt accent',
  ['dawn', 'day', 'dusk', 'night'].every(s => T.scenes[s] && T.scenes[s].sea && T.scenes[s].sky && T.scenes[s].land) &&
  T.volt === '#F5D90A' && T.ink.onLight === '#22344A' && T.ink.onDark === '#E8EEF2');

// ---------------------------------------------------------------- §11.2 canonical
section(`§11.2 Canonical — base ${D.canonicalTest.expected.base} x multiplier ${D.canonicalTest.expected.multiplier} = ${D.canonicalTest.expected.final}`);
{
  const sim = E.simulate(D.canonicalTest.inputs);
  const exp = D.canonicalTest.expected;
  // The base is a continuous ladder sum now, so it is asserted to the 2 dp
  // the fixture states; the multiplier and the final are exact.
  check(`base === ${exp.base}`, Math.abs(sim.score.base - exp.base) < 0.005,
    `got ${sim.score.base}`);
  check(`multiplier === ${exp.multiplier}`, sim.score.multiplier === exp.multiplier, `got ${sim.score.multiplier}`);
  check(`final === ${exp.final}`, sim.score.final === exp.final, `got ${sim.score.final}`);
  check('canonical completes on battery alone', sim.completed && sim.dieselMwh === 0);
  // The base must arise from the ladders, not from a stored number.
  const bp = sim.score.baseParts;
  check(`base is the ladders: ${bp.distance.toFixed(3)} distance + ${bp.energy.toFixed(3)} energy - 0 diesel`,
    Math.abs(bp.distance + bp.energy + bp.dieselPenalty - sim.score.base) < 1e-9);
}

// ---------------------------------------------------------------- §5 scoring formula
section('§5 Scoring formula — the four worked examples, against computeScore itself');
{
  for (const ex of D.scoringExamples) {
    const s = E.computeScore(ex.q);
    check(`${ex.name}: base ${ex.expected.base}`, Math.abs(s.base - ex.expected.base) < 1e-9,
      `got ${s.base}`);
    check(`${ex.name}: multiplier ${ex.expected.multiplier.toFixed(2)}`,
      Math.abs(s.multiplier - ex.expected.multiplier) < 1e-9, `got ${s.multiplier}`);
    check(`${ex.name}: final ${ex.expected.final}`, s.final === ex.expected.final, `got ${s.final}`);
  }

  // The ladders are linear inside their range and cap outside it.
  const bc = D.scoring.base;
  const q = (o) => Object.assign({ coveredNm: 0, batteryMwh: 0, dieselMwh: 0, countries: 1,
    ports: 1, anchorNights: 0, activityUses: 0, rechargeEnergy: 'brown' }, o);
  check('distance is continuous, not stepped (250 nm = 12.5 pts)',
    Math.abs(E.computeScore(q({ coveredNm: 250 })).baseParts.distance - 12.5) < 1e-9);
  check('energy is continuous, not stepped (25 MWh = 12.5 pts)',
    Math.abs(E.computeScore(q({ batteryMwh: 25 })).baseParts.energy - 12.5) < 1e-9);
  check(`distance caps at ${bc.distance.max} above ${bc.distance.perNm / bc.distance.pointsPer * bc.distance.max} nm`,
    E.computeScore(q({ coveredNm: 9999 })).baseParts.distance === bc.distance.max);
  check(`energy caps at ${bc.energy.max} above ${bc.energy.perMwh / bc.energy.pointsPer * bc.energy.max} MWh`,
    E.computeScore(q({ batteryMwh: 9999 })).baseParts.energy === bc.energy.max);
  check('the base is not floored — heavy diesel takes it negative',
    E.computeScore(q({ coveredNm: 500, batteryMwh: 50, dieselMwh: 80 })).base === -30);
  check('diesel costs exactly 1 point per MWh',
    E.computeScore(q({ dieselMwh: 7 })).base === -7);

  // The multiplier stays on its 1-10 scale because the weights sum to 5.
  const mc = D.scoring.multiplier;
  const wsum = Object.keys(mc.weights).reduce((a, k) => a + mc.weights[k], 0);
  check(`weights sum to ${mc.weightSum}, keeping the multiplier on 1-10`,
    Math.abs(wsum - mc.weightSum) < 1e-9, `got ${wsum}`);
  const af = mc.activitiesFactor;
  const worstMult = E.computeScore(q({})).multiplier;
  const best = q({ countries: 9, ports: 9, anchorNights: 4, activityUses: 9,
    activityEcoClean: 9, rechargeEnergy: 'green' });
  const bestMult = E.computeScore(best).multiplier;
  check(`multiplier spans ${worstMult} to ${bestMult}`, worstMult === mc.min && bestMult === mc.max);
  // COUNT ALONE cannot max the activities factor: the band stops at 6 and
  // the last four points are gated on a strict clean majority.
  const dirtyMax = E.computeScore(Object.assign({}, best, { activityEcoClean: 0 })).multiplier;
  check(`a perfect week on dirty activities cannot reach the ceiling (${dirtyMax} vs ${mc.max})`,
    dirtyMax < mc.max, `${dirtyMax}`);
  // ATTAINABILITY. This used to be the place the suite recorded that a
  // perfect week was IMPOSSIBLE: the old (count band + average eco) / 2
  // blend topped out near 7.9 because reaching the 12+ count band forced
  // dirty picks into the average, so neither the factor nor the multiplier
  // could reach 10. The gate replaced it precisely to close that gap, so
  // the check now runs the other way — build the best selection the SHEET
  // actually allows and require that it does reach the ceiling.
  {
    const clean = D.activities.filter(a => a.eco >= af.cleanEcoMin).length;
    check(`the sheet carries ${clean} clean activities, enough for the gate's ` +
      `${af.topMinCount} with a strict majority`,
      clean >= af.topMinCount && clean * 2 > af.topMinCount);
    const top = E.computeScore(q({ countries: 9, ports: 9, anchorNights: 4,
      activityUses: af.topMinCount, activityEcoClean: af.topMinCount,
      rechargeEnergy: 'green' }));
    check(`the activities factor reaches ${mc.max} on ${af.topMinCount} clean picks`,
      top.factors.activities.score === af.topScore && af.topScore === mc.max);
    check(`so the attainable multiplier is ${top.multiplier} — the formula's own ceiling`,
      top.multiplier === mc.max);
    // The other four factors must still be individually maxable, or the
    // ceiling is being reached for the wrong reason.
    check('every other factor still reaches 10 in play',
      E.bandLookup(mc.bands.countries, 4) === mc.max &&
      E.bandLookup(mc.bands.ports, 6) === mc.max &&
      E.bandLookup(mc.bands.anchor, 4) === mc.max &&
      mc.recharge.green === mc.max);
  }
  // ---- The activities factor: a count band, then a quality gate ----
  const actScore = (n, clean) =>
    E.computeScore(q({ activityUses: n, activityEcoClean: clean })).factors.activities.score;
  check('no activities scores the floor, whatever the eco figures say',
    actScore(0, 0) === af.emptyScore);
  check('the count bands are 1-3 -> 1, 4-6 -> 3, 7+ -> 6',
    [1, 2, 3].every(n => actScore(n, 0) === 1) &&
    [4, 5, 6].every(n => actScore(n, 0) === 3) &&
    [7, 10, 14].every(n => actScore(n, 0) === 6));
  // The point of the gate: same count, different choices, different score.
  {
    const dirty = actScore(7, 3), clean = actScore(7, 4);
    check(`seven picks score ${dirty} on a minority clean and ${clean} on a majority`,
      dirty === 6 && clean === af.topScore);
  }
  // STRICT majority, stated as its own case because an even split is the
  // one a "more than half" rule is easy to get wrong.
  check('an even split is not a majority — 8 picks need 5 clean, not 4',
    actScore(8, 4) === 6 && actScore(8, 5) === af.topScore);
  // Quality is a GATE, not a slope: below the count threshold it buys
  // nothing at all, which is the deliberate reversal of the old blend.
  check(`fewer than ${af.topMinCount} picks cannot open the gate however clean they are`,
    actScore(6, 6) === 3 && actScore(3, 3) === 1);
  check('six spotless picks score below seven mostly-spotless ones',
    actScore(6, 6) < actScore(7, 4));
  // Simulated end-to-end: the clean count is a plain count over the
  // selection, and it is what decides the factor.
  {
    const clean = D.activities.filter(a => a.eco >= af.cleanEcoMin);
    const dirty = D.activities.filter(a => a.eco < af.cleanEcoMin);
    const route = ['Nice', 'Monaco'];
    const mk = (list) => {
      const a = {}; list.forEach((x) => { a[x.id] = 1; });
      return E.simulate({ route, speed: 'slow', nights: 4, activities: a });
    };
    const sevenClean = mk(clean.slice(0, 7));
    const fourThree = mk(clean.slice(0, 4).concat(dirty.slice(0, 3)));
    const threeFour = mk(clean.slice(0, 3).concat(dirty.slice(0, 4)));
    check(`seven clean picks simulate to the ceiling (clean ${sevenClean.score.factors.activities.clean}/7)`,
      sevenClean.score.factors.activities.clean === 7 &&
      sevenClean.score.factors.activities.score === af.topScore);
    check('four clean and three dirty still opens the gate',
      fourThree.score.factors.activities.clean === 4 &&
      fourThree.score.factors.activities.topReached === true);
    check('three clean and four dirty does not',
      threeFour.score.factors.activities.clean === 3 &&
      threeFour.score.factors.activities.topReached === false &&
      threeFour.score.factors.activities.score === 6);
    // Swapping a clean pick for a dirty one at the SAME count is the whole
    // design: quantity held constant, the choice alone moves the score.
    check(`one swap costs ${fourThree.score.factors.activities.score - threeFour.score.factors.activities.score} ` +
      'of the factor at identical count',
      threeFour.score.factors.activities.score < fourThree.score.factors.activities.score);
  }
  // Selecting the same activity twice is not a thing any more.
  {
    const twice = E.simulate({ route: ['Nice', 'Monaco'], speed: 'slow', nights: 4,
      activities: { A03: 4 } });
    check('a count above 1 normalises to a single selection',
      twice.inputs.activities.A03 === 1 && twice.score.factors.activities.value === 1);
  }
  check('the multiplier truncates to 2 dp, so base x multiplier is hand-checkable',
    E.computeScore(q({ countries: 4, ports: 7, anchorNights: 1, activityUses: 4,
      activityEcoClean: 2, rechargeEnergy: 'grey' })).multiplier === 5.85);
  check('anchor nights are non-monotonic: 6+ scores below 4-5',
    E.bandLookup(mc.bands.anchor, 6) < E.bandLookup(mc.bands.anchor, 4));
  check('an unreached recharge port scores the floor, an unrated one scores grey',
    E.computeScore(q({ rechargeReached: false, rechargeEnergy: 'green' })).factors.recharge.score === mc.rechargeNotReached &&
    E.computeScore(q({ rechargeEnergy: null })).factors.recharge.score === mc.rechargeUnrated);
  check('the retired base and multiplier constants are gone',
    bc.disciplineWeight === undefined && bc.efficiencyWeight === undefined &&
    bc.outputScale === undefined && bc.incompletePenalty === undefined &&
    mc.varietyTable === undefined);
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
  // Measured in NAUTICAL MILES, not in summed degrees. The old form added
  // |dlat| + |dlon| against a flat 0.6 limit, which is two different units
  // in a trench coat: a degree of longitude is 0.63 of a degree of latitude
  // at Lateral's 51N and 0.77 in the Med, so the same real distance scored
  // differently depending on where the port was. It only ever passed
  // because every port was in the Mediterranean. The limit is the builder's
  // own search radius — anchorMaxCells, 40 cells of 0.01 degrees, 24 nm —
  // so what is actually asserted is that no berth was pushed further out
  // than the tool is allowed to push it.
  {
    const R = 3440.065, rad = (d) => d * Math.PI / 180;
    const off = D.ports.map((p) => {
      const b = E.berth(p.name);
      const s = Math.sin(rad(b.lat - p.lat) / 2) ** 2 +
        Math.cos(rad(p.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - p.lon) / 2) ** 2;
      return { name: p.name, nm: 2 * R * Math.asin(Math.min(1, Math.sqrt(s))) };
    }).sort((a, b) => b.nm - a.nm);
    check(`every berth is within the builder's 24 nm search of its port ` +
      `(furthest ${off[0].name} ${off[0].nm.toFixed(1)} nm)`,
      off[0].nm <= 24, `${off[0].name} ${off[0].nm.toFixed(1)} nm`);
    check('and none is ON its port — a berth is off the beach by construction',
      off[off.length - 1].nm > 0.5,
      `${off[off.length - 1].name} ${off[off.length - 1].nm.toFixed(2)} nm`);
  }
  const gv = E.pathNm(E.legPath('Genoa', 'Venice'));
  check(`a leg that must round Italy is scored as sailed, not as the crow flies (${gv.toFixed(0)} nm vs ${D.distanceMatrixNm.Genoa.Venice} nm)`,
    gv > D.distanceMatrixNm.Genoa.Venice * 3);
  const gvMatrix = D.distanceMatrixNm.Genoa.Venice;
  check('scoring distance follows DATA.distanceBasis',
    D.distanceBasis === 'sealane' ? Math.abs(E.legNm('Genoa', 'Venice') - gv) < 1
      : D.distanceBasis === 'corrected'
        ? Math.abs(E.legNm('Genoa', 'Venice') - gvMatrix * E.getLegCorrection('Genoa', 'Venice')) < 1e-9
        : E.legNm('Genoa', 'Venice') === gvMatrix,
    `basis ${D.distanceBasis}, legNm ${E.legNm('Genoa', 'Venice').toFixed(1)}`);
}

// ---------------------------------------------------------------- poster distance rule
section('Poster distance rule — an exact ordered match outputs published nm, full stop');
{
  // The exact sequences, spelled out. These are the charters as sailed —
  // repeated ports and returns to the start included — and they are what a
  // player must enter for the published figure to come out. Written
  // literally so a sequence edit that breaks the match fails here rather
  // than quietly scoring the passage sum instead.
  const SEQUENCES = {
    SOF_BLUE: ['Savona', 'Monaco', 'Nice', 'Antibes', 'Saint Tropez', 'Antibes',
               'Saint-Jean-Cap-Ferrat', 'Monaco'],
    SOF_GREEN: ['Monaco', 'Calvi', 'Ajaccio', 'Saint Tropez'],
    SARD_BLUE: ['Calvi', 'Ajaccio', 'Bonifacio', 'Porto Rotondo', 'Porto Cervo',
                'Porto Vecchio', 'Calvi'],
    SARD_GREEN: ['Salerno', 'Olbia', 'Porto Cervo', 'Porto Rotondo', 'Porto Vecchio'],
    BALEARICS: ['Palma', 'Eivissa', "Port d'Andratx", 'Palma'],
    GREECE: ['Athens', 'Santorini', 'Livadia', 'Athens'],
    TURKEY: ['Gulluk', 'Bodrum', 'Gocek']
  };
  const PUBLISHED_NM = { SOF_BLUE: 220, SOF_GREEN: 440, SARD_BLUE: 370, SARD_GREEN: 390,
                         BALEARICS: 380, GREECE: 408, TURKEY: 295 };
  check('the shipped sequences are the full charters, verbatim',
    D.posterRoutes.every(pr => JSON.stringify(pr.ports) === JSON.stringify(SEQUENCES[pr.id])),
    D.posterRoutes.filter(pr => JSON.stringify(pr.ports) !== JSON.stringify(SEQUENCES[pr.id]))
      .map(pr => pr.id).join(', '));
  check('the shipped published nm are the model\'s figures',
    D.posterRoutes.every(pr => pr.nm === PUBLISHED_NM[pr.id]),
    D.posterRoutes.filter(pr => pr.nm !== PUBLISHED_NM[pr.id])
      .map(pr => `${pr.id} ${pr.nm} vs ${PUBLISHED_NM[pr.id]}`).join(', '));

  for (const pr of D.posterRoutes) {
    // Entered in full, from the literal sequence — not from the data the
    // engine also reads — so this fails if either side drifts.
    const seq = SEQUENCES[pr.id], want = PUBLISHED_NM[pr.id];
    check(`${pr.id}: the full ${seq.length}-stop sequence outputs ${want} nm`,
      E.posterByRoute(seq) !== null &&
      E.simulate({ route: seq, speed: 'slow', nights: 4, activities: {} }).distanceNm === want,
      `got ${E.simulate({ route: seq, speed: 'slow', nights: 4, activities: {} }).distanceNm}`);
    // No speed/activity qualifier: matching the ordered sequence is what
    // makes it that charter, so every profile must produce the figure.
    const variants = [
      { route: seq, speed: 'slow', nights: 4, activities: {} },
      { route: seq, speed: 'fast', nights: 2, activities: { A08: 1, R06: 2 } }
    ];
    check(`${pr.id}: ${want} nm on every profile, exactly`,
      variants.every(v => E.simulate(v).distanceNm === want),
      variants.map(v => E.simulate(v).distanceNm).join(' / '));
  }
  // Repeats and returns are load-bearing: dropping them must break the match.
  check('a poster sequence with its repeated port removed is NOT a match',
    E.posterByRoute(SEQUENCES.SOF_BLUE.filter((p, i) => i !== 5)) === null);
  check('a poster sequence with its return-to-start removed is NOT a match',
    E.posterByRoute(SEQUENCES.BALEARICS.slice(0, -1)) === null &&
    E.posterByRoute(SEQUENCES.GREECE.slice(0, -1)) === null &&
    E.posterByRoute(SEQUENCES.SARD_BLUE.slice(0, -1)) === null);
  // The legs must still sum to the published figure with no rounding drift,
  // or playback and the reached-ports walk would disagree with the score.
  check('legs sum to the published figure with no drift',
    D.posterRoutes.every(pr => {
      const legs = E.routeLegs(pr.ports);
      return legs.reduce((s, l) => s + l.nm, 0) === pr.nm;
    }));
  check('the planned-passage distance is kept alongside, not discarded',
    D.posterRoutes.every(pr => {
      const s = E.simulate({ route: pr.ports, speed: 'slow', nights: 4, activities: {} });
      return s.poster.plannedNm > 0 && s.poster.publishedNm === pr.nm;
    }));
  // Match detection is exact and ordered — near misses are player routes.
  const gr = D.posterRoutes.find(p => p.id === 'GREECE');
  const reversed = gr.ports.slice().reverse();
  const extended = gr.ports.concat([gr.ports[0]]);
  check('a reversed sequence is not a poster match', E.posterByRoute(reversed) === null);
  check('an extended sequence is not a poster match', E.posterByRoute(extended) === null);
  check('a dropped port is not a poster match', E.posterByRoute(gr.ports.slice(0, -1)) === null);
  check('near-miss routes fall through to the planned-passage basis',
    E.simulate({ route: reversed, speed: 'slow', nights: 4, activities: {} }).distanceNm !== gr.nm &&
    E.simulate({ route: extended, speed: 'slow', nights: 4, activities: {} }).distanceNm !== gr.nm);
  check('one detector serves both the distance rule and the §6 MWh override',
    D.posterRoutes.every(pr => {
      const s = E.simulate({ route: pr.ports, speed: 'slow', nights: 4, activities: {} });
      return s.poster.id === E.posterByRoute(pr.ports).id && s.distanceNm === pr.nm;
    }));
  // Published nm are charter distances, not passage sums: the implied
  // factors run 0.95 to 3.17, which is why they cannot be decomposed.
  const factors = D.posterRoutes.map(pr => pr.nm /
    E.routeLegs(pr.ports).reduce((s, l) => s + l.plannedNm, 0));
  check(`charter factors span x${Math.min(...factors).toFixed(2)}-x${Math.max(...factors).toFixed(2)}, so no single scalar fits`,
    Math.max(...factors) / Math.min(...factors) > 2);
}

// ---------------------------------------------------------------- leg correction
section('Per-leg sea-lane correction — read through the one accessor');
{
  const names = D.ports.map((p) => p.name);
  check('correction table present for every port pair',
    names.every(a => names.every(b => a === b || E.getLegCorrection(a, b) > 0)));
  check('the accessor is symmetric whichever way the leg is sailed',
    names.every(a => names.every(b => E.getLegCorrection(a, b) === E.getLegCorrection(b, a))));
  check('a port to itself needs no correction', names.every(a => E.getLegCorrection(a, a) === 1));
  check('no leg is shorter than its point-to-point distance',
    names.every(a => names.every(b => E.getLegCorrection(a, b) >= 1)));
  // Legs that must round a landmass carry the large corrections; open-water
  // legs carry none. Both extremes must be present or the table is inert.
  check('legs that round land are corrected hardest',
    E.getLegCorrection('Genoa', 'Venice') > 4 &&
    E.getLegCorrection('Ajaccio', 'Calvi') > 1.3,
    `Genoa-Venice ×${E.getLegCorrection('Genoa', 'Venice')}, Ajaccio-Calvi ×${E.getLegCorrection('Ajaccio', 'Calvi')}`);
  // Lateral is the easter egg: the English Channel, reachable only out
  // through Gibraltar and up the Atlantic. Nothing special enforces that —
  // the correction and the diesel it costs do all the work.
  check(`Lateral costs ×${E.getLegCorrection('Lateral', 'Monaco')} from the Riviera`,
    E.getLegCorrection('Lateral', 'Monaco') > 3 &&
    E.getLegCorrection('Lateral', 'Monaco') < 4.5);
  check('open-water legs are left alone',
    names.some(a => names.some(b => a !== b && E.getLegCorrection(a, b) === 1)));
  // The accessor is the only boundary: the engine must not read the table.
  const engineSrc = readHtml().match(/<script id="leip-engine">([\s\S]*?)<\/script>/)[1]
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const reads = (engineSrc.match(/LEIP_LEG_CORRECTION/g) || []).length;
  check('LEIP_LEG_CORRECTION is touched in exactly one place — getLegCorrection',
    reads === 1, `${reads} references in the ENGINE block`);
  check('scoring multiplies the point-to-point leg by the correction',
    Math.abs(E.legNm('Monaco', 'Naples') -
      D.distanceMatrixNm.Monaco.Naples * E.getLegCorrection('Monaco', 'Naples')) < 1e-9);
  // Short hops differ by more than the lane itself: a berth lies several
  // miles off its charted position, which is a big share of a 7 nm run.
  // Judge agreement on legs long enough for that to wash out.
  const ratios = [];
  for (const a of D.ports) for (const b of D.ports) {
    if (a.name >= b.name) continue;
    const m = D.distanceMatrixNm[a.name][b.name];
    if (m < 100) continue;
    ratios.push(E.pathNm(E.legPath(a.name, b.name)) / m);
  }
  ratios.sort((x, y) => x - y);
  const median = ratios[Math.floor(ratios.length / 2)];
  // Berths sit up to ~12 nm off the charted position — lanes hold 3 nm of
  // clearance and berths considerably more, so the whole hull clears land
  // at rest — and a berth-to-berth run can therefore come out a few
  // percent SHORTER than the charted-position figure. That is geometry,
  // not a collapsed lane: pushing both endpoints seaward straightens the
  // run, and 31 pairs now make it on the rhumb line where 8 did before.
  // The median is what matters; the floor only guards against a lane
  // genuinely folding in on itself.
  check(`legs over 100 nm track the pack matrix (median x${median.toFixed(3)})`,
    median >= 1 && median < 1.3 && ratios[0] > 0.85, `min ${ratios[0].toFixed(3)}`);
  const sim = E.simulate({ route: ['Genoa', 'Venice'], speed: 'slow', nights: 4, activities: {} });
  check('a sea-lane leg carries its path into the timeline for playback',
    sim.timeline.some(seg => seg.type === 'transit' && seg.path && seg.path.length > 2));
}

// ---------------------------------------------------------------- secondary reference sets
// The fleet reference is validated on its own, in test/fleet.mjs — it is a
// real-world anchor with real-world scatter, and holding it in the primary
// suite would put pressure on the contractual §6 calibration. Only its
// shape and wiring are checked here.
section('Secondary — fleet reference is present and wired to this engine');
{
  const F = D.fleetReference;
  check('fleet reference block present and shaped', !!F &&
    Array.isArray(F.charters) && Array.isArray(F.routeGroups) &&
    typeof F.tolerancePct === 'number' && typeof F.populated === 'boolean');
  check('all 28 observed charters carry observed duration and energy',
    F.charters.length === 28 &&
    F.charters.every(c => c.durationDays > 0 && c.mwh > 0 && c.totalNm > 0));
  check('every poster route points at a named group in the table',
    D.posterRoutes.every(pr => F.routeGroups.some(g => g.route === pr.refGroup)),
    D.posterRoutes.filter(pr => !F.routeGroups.some(g => g.route === pr.refGroup)).map(pr => pr.id).join(', '));
  check('the fleet check assumes a navigable distance basis, and gets one',
    ['sealane', 'corrected'].includes(D.distanceBasis),
    `fleet basis '${F.basis}' vs engine basis '${D.distanceBasis}'`);
  const populatedGroups = F.routeGroups.filter(g => g.distNm != null &&
    (g.mwh7Typ != null || g.mwh7Int != null)).length;
  check('populated flag matches the data actually present',
    F.populated === (populatedGroups === F.routeGroups.length &&
      F.charters.every(c => c.mwh != null)));
  console.log(`  info: ${populatedGroups}/${F.routeGroups.length} route groups populated; ` +
    `run \`node test/fleet.mjs\` for the ±${F.tolerancePct}% tolerance report.`);
}

// ---------------------------------------------------------------- diesel reserve
section('Diesel reserve — finite, depletable, and second in line');
{
  // Recompute the reserve from the prop curve rather than trusting the
  // stored figure: 4,500 nm at a flat 11 kt, all of it under way, on
  // electrical power with no conversion. The basis is a flat 11 kt rather
  // than a profile's effective cruise because the regression makes that
  // cruise route-dependent — a delivery passage is not a charter week.
  const kts = 11;
  const hours = D.dieselRangeNm / kts;
  const propMwh = E.propKwAt(kts) * hours / 1000;
  const hotelMwh = D.hotelKw.underway * hours / 1000;
  const derived = propMwh + hotelMwh;
  check(`${D.dieselRangeNm} nm at a flat ${kts} kt derives ${derived.toFixed(1)} MWh, matching the stored ${D.dieselReserveMwh}`,
    Math.abs(derived - D.dieselReserveMwh) < 0.5,
    `derived ${derived.toFixed(2)} vs stored ${D.dieselReserveMwh}`);
  // ~7x the battery, deliberately: a realistic backstop, not a second
  // resource to manage. The teeth are the -1/MWh base penalty.
  check('the reserve is ~7x the battery and cannot deplete in one week',
    D.dieselReserveMwh / D.battery.gameThresholdMwh > 6.5,
    `${(D.dieselReserveMwh / D.battery.gameThresholdMwh).toFixed(1)}x`);

  // The penalty is linear per MWh under the redesigned base — no curve,
  // no cap, no floor. Depth into the reserve is reported, not scored.
  const bc = D.scoring.base;
  check(`diesel costs ${bc.dieselPenaltyPerMwh} point per MWh, flat`,
    bc.dieselPenaltyPerMwh === 1 && bc.diesel === undefined);

  // Sequential depletion: battery first, reserve only after.
  const clean = E.simulate({ route: ['Nice', 'Monaco'], speed: 'slow', nights: 4, activities: {} });
  check('a battery week never touches the reserve',
    clean.dieselMwh === 0 && clean.dieselReserveUsedPct === 0 &&
    clean.dieselReserveLeftMwh === D.dieselReserveMwh && clean.score.baseParts.dieselPenalty === 0);
  check('a diesel week is charged exactly its MWh against the base',
    (() => { const s2 = E.simulate({ route: ['Palma', 'Bonifacio', 'Naples', 'Monaco'], speed: 'fast', nights: 4, activities: {} });
             return Math.abs(s2.score.baseParts.dieselPenalty + s2.dieselMwh) < 1e-9; })());
  const dirty = E.simulate({ route: ['Palma', 'Bonifacio', 'Naples', 'Monaco'], speed: 'fast', nights: 4, activities: {} });
  check(`a diesel week draws the battery to the cap first, then the reserve (${dirty.dieselMwh.toFixed(1)} MWh)`,
    dirty.batteryMwh === D.battery.gameThresholdMwh &&
    Math.abs(dirty.dieselMwh - (dirty.totalMwh - D.battery.gameThresholdMwh)) < 1e-9 &&
    dirty.dieselReserveUsedPct > 0);
  check('the reserve is drawn by actual generator energy, so the fast week costs more',
    E.simulate({ route: ['Palma', 'Bonifacio', 'Naples', 'Monaco'], speed: 'fast', nights: 4, activities: {} }).dieselMwh >
    E.simulate({ route: ['Palma', 'Bonifacio', 'Naples', 'Monaco'], speed: 'slow', nights: 4, activities: {} }).dieselMwh);

  // No hard fail: a catastrophic week still completes and still scores.
  const worst = E.simulate({ route: ['Palma', 'Venice', 'Gocek'], speed: 'fast', nights: 0, activities: {} });
  check(`the deepest reachable week still returns a valid score (${worst.score.final}, ${worst.dieselMwh.toFixed(0)} MWh diesel)`,
    Number.isFinite(worst.score.final) &&
    worst.dieselReserveUsedPct > 0);
  check('no route is stopped or failed by the reserve — the week always runs',
    worst.timeline.length > 0 && worst.reached.length >= 1);
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
// Under the redesigned model a CLEAN week can no longer score negative:
// both ladders are positive and the multiplier floors at 1. Diesel is the
// only route to a negative final, which is the intended shape.
{
  const nowhere = E.simulate(D.balanceScenarios.find(s => s.id === 'go-nowhere').inputs);
  check(`a clean week floors at a low positive score, never negative (${nowhere.score.final})`,
    nowhere.dieselMwh === 0 && nowhere.score.final > 0 && nowhere.score.final < 50);
  const burnt = E.computeScore({ coveredNm: 60, batteryMwh: 50, dieselMwh: 60, countries: 1,
    ports: 1, anchorNights: 0, activityUses: 0, rechargeEnergy: 'brown' });
  check(`negative scores are possible and intended, via diesel (${burnt.final})`,
    burnt.base < 0 && burnt.final < 0);
}

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
  // Hotel load is now read straight off DATA.hotelKw — the eKW figures and
  // the utilisation factor that used to scale them went with propFactor.
  check(`hotel splits ${D.hotelKw.atRest}/${D.hotelKw.underway} kW by stationary/underway hours`,
    Math.abs(slow.hotelMwh - (D.hotelKw.atRest * (168 - slow.underwayH) +
      D.hotelKw.underway * slow.underwayH) / 1000) < 1e-9);
  check('travel is the energy story: longer route costs more',
    E.simulate({ route: ['Athens', 'Santorini'], speed: 'slow', nights: 4, activities: {} }).totalMwh <
    E.simulate({ route: ['Athens', 'Santorini', 'Athens', 'Santorini'], speed: 'slow', nights: 4, activities: {} }).totalMwh);
  check('activities are deliberately marginal (< 1% of week each)',
    D.activities.every(a => a.energyPct * D.scoring.weeklyEnergyRefMwh < 0.5));

  const doomed = E.simulate({ route: ['Palma', 'Venice', 'Palma'], speed: 'slow', nights: 6, activities: {} });
  check('infeasible route allowed; runs; suffers',
    !doomed.completed && doomed.score.factors.recharge.score === D.scoring.multiplier.rechargeNotReached);

  // Repetition is gone entirely — the count is how many of the fourteen
  // were picked, so the same activity twice is the same single pick.
  const three = E.simulate({ route: ['Monaco', 'Nice', 'Monaco'], speed: 'slow', nights: 4,
    activities: { A14: 1, A02: 1, A12: 1 } });
  const spam = E.simulate({ route: ['Monaco', 'Nice', 'Monaco'], speed: 'slow', nights: 4,
    activities: { A14: 4, A02: 2, A12: 3 } });
  check('the count is distinct picks, so repeating one changes nothing',
    three.score.factors.activities.value === 3 && spam.score.factors.activities.value === 3 &&
    spam.score.final === three.score.final);
  check('every activity draws the same energy, so the picks never trade off',
    Math.abs(three.activitiesMwh - 3 * D.activities[0].energyPct * D.scoring.weeklyEnergyRefMwh) < 1e-12);

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
  const sim = E.simulate({ route: ['Athens', 'Santorini', 'Kalathos', 'Athens'], speed: 'fast', nights: 4,
    activities: { A01: 1 } });   // A01 is Scuba diving in the simplified set
  const r1 = E.evaluateAchievements(sim, null);
  const ids = r1.newly.map(a => a.id);
  check('Volcano Chief fires mid-sim with an hour',
    ids.includes('volcano-chief') && r1.newly.find(a => a.id === 'volcano-chief').atHour > 0);
  check('Submerged Ruins: dive activity at dive-tagged location', ids.includes('submerged-ruins'));
  // Long Haul is battery-only: distance alone does not earn it.
  {
    const far = E.simulate(D.achievementFixtures.longHaulClean);
    const farDirty = E.simulate(D.achievementFixtures.longHaulDiesel);
    check(`Long Haul unlocks on ${far.coveredNm.toFixed(0)} nm with zero diesel`,
      far.coveredNm > th.longHaulNm && far.dieselMwh === 0 &&
      E.evaluateAchievements(far, null).newly.some(a => a.id === 'long-haul'),
      `${far.coveredNm.toFixed(1)} nm, diesel ${far.dieselMwh.toFixed(2)}`);
    check(`Long Haul does NOT unlock on ${farDirty.coveredNm.toFixed(0)} nm that burned ${farDirty.dieselMwh.toFixed(1)} MWh of diesel`,
      farDirty.coveredNm > th.longHaulNm && farDirty.dieselMwh > 0 &&
      !E.evaluateAchievements(farDirty, null).newly.some(a => a.id === 'long-haul'));
    check('a short battery-only week does not earn it either',
      !E.evaluateAchievements(E.simulate({ route: ['Nice', 'Monaco'], speed: 'slow', nights: 4, activities: {} }), null)
        .newly.some(a => a.id === 'long-haul'));
    check('the condition text states the battery requirement',
      /diesel/i.test(D.achievements.list.find(a => a.id === 'long-haul').desc));
  }
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
  const ceiling = D.scoring.base.max * D.scoring.multiplier.max;
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
if (failed) {
  console.log(
    '\nOPEN ITEM pending a decision, deliberately left failing rather than tuned\n' +
    'away: §6 poster parity now reconciles 0/7 from first principles, down from\n' +
    '4/7. All seven still output their published nm exactly and their published MWh\n' +
    'via the §6 exact-match override, so nothing a player sees is wrong — what is\n' +
    'lost is first-principles reconciliation.\n' +
    '\n' +
    'Two changes took it there, both made on the engineering team\'s own figures\n' +
    'and neither reversible without discarding those figures:\n' +
    '  1. propFactor was deleted when the propulsion table was confirmed to give\n' +
    '     ELECTRICAL power. Effective propulsion power rose x1.45. Parity 4/7 -> 1/7.\n' +
    '     The constants that used to absorb the gap were the ones removed.\n' +
    '  2. The speed split became a regression on total route distance, replacing\n' +
    '     two fixed profiles. Poster routes are long, so they now run a faster mix\n' +
    '     and draw more. Parity 1/7 -> 0/7; SOF_GREEN went +0.65 to +1.48 MWh and\n' +
    '     fell just outside the ±1 window.\n' +
    '\n' +
    'Every route now simulates HIGH against its published figure, by +1.5 to +15.7\n' +
    'MWh. A single scalar cannot close that spread, and the published figures are\n' +
    'mutually inconsistent anyway (see the conflict list in tools/calibrate.mjs).\n' +
    'Closing it means either a new calibration constant fitted against the sheets —\n' +
    'which is what was just removed — or the sheets being restated. That is a call\n' +
    'for the source, not a test fix.\n' +
    '\n' +
    'No model constant or band has been touched to make this pass. Before/after is\n' +
    'in tools/calibrate.mjs.');
}
process.exit(failed === 0 ? 0 : 1);
