// §11.1 Headless smoke test — stubbed Three.js/DOM harness executing
// boot -> scene build -> full planning -> simulation -> playback ->
// results -> save score, plus §11.7 (persistence, name rule) and §11.8
// (share card). The APP block runs verbatim from index.html.
import { loadGame, readHtml } from './extract.mjs';

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.error(`  FAIL ${name}${detail !== undefined ? ' — ' + detail : ''}`); }
}
function section(t) { console.log(`\n== ${t}`); }

// Permissive THREE stub: every get/call/construct yields another stub;
// numeric coercion yields 0. The app is write-only toward THREE.
function magic() {
  const fn = function () { return magic(); };
  return new Proxy(fn, {
    get(t, p) {
      if (p === Symbol.toPrimitive || p === 'valueOf') return () => 0;
      if (p === 'toString') return () => 'stub';
      if (p === Symbol.iterator) return function* () {};
      if (!(p in t)) { try { t[p] = magic(); } catch { return magic(); } }
      return t[p];
    },
    set(t, p, v) { try { t[p] = v; } catch {} return true; },
    construct() { return magic(); },
    apply() { return magic(); }
  });
}

// Recording 2D context for the share-card check.
function recordingCanvas() {
  const ops = [];
  const ctx = new Proxy({}, {
    get(t, p) {
      if (p === 'canvas') return cnv;
      return (...args) => { ops.push({ op: p, args }); return undefined; };
    },
    set() { return true; }
  });
  const cnv = { width: 0, height: 0, getContext: () => ctx, ops,
                toDataURL: () => 'data:image/png;base64,', toBlob: undefined };
  return cnv;
}

function stubEl() {
  return {
    style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    children: [],
    addEventListener() {}, removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    remove() {}, removeChild() {},
    setAttribute() {}, getAttribute() { return null; },
    querySelector() { return stubEl(); }, querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; },
    getContext() { return magic(); },
    toDataURL() { return 'data:image/png;base64,'; },
    setPointerCapture() {}, click() {},
    width: 800, height: 600, textContent: '', innerHTML: '', value: '', disabled: false
  };
}

function makeSandbox({ three = true, storage = {} } = {}) {
  const els = {};
  const documentStub = {
    readyState: 'complete',
    getElementById: (id) => (els[id] || (els[id] = stubEl())),
    createElement: (tag) => stubEl(),
    createElementNS: () => stubEl(),
    body: stubEl(), documentElement: stubEl(),
    fonts: { load: () => Promise.resolve([]), check: () => true },
    addEventListener() {}, removeEventListener() {}
  };
  documentStub.documentElement.style = { setProperty() {} };
  const sandbox = {
    document: documentStub,
    localStorage: {
      getItem: (k) => (k in storage ? storage[k] : null),
      setItem: (k, v) => { storage[k] = String(v); },
      removeItem: (k) => { delete storage[k]; }
    },
    requestAnimationFrame: () => 0,
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false }),
    devicePixelRatio: 1,
    navigator: {},
    setTimeout: (fn) => { fn(); return 0; },   // stamp animation runs inline
    clearTimeout() {},
    Promise, Date, File: undefined,
    fetch: () => Promise.reject(new Error('offline'))
  };
  if (three) sandbox.THREE = magic();
  sandbox.window = sandbox;
  return { sandbox, els, storage };
}

function runTicksUntil(app, pred, maxTicks = 80, dt = 4) {
  for (let i = 0; i < maxTicks; i++) {
    if (pred()) return true;
    app.tick(dt);
  }
  return pred();
}

// ================================================================ boot
section('§11.1 Boot -> scene build (stubbed Three.js/DOM)');
const { sandbox, storage } = makeSandbox();
const g = loadGame(sandbox);
const app = g.LEIP_APP;
check('APP block evaluates', !!app && typeof app.init === 'function');
app.init();
check('boot completes; planning phase', app.getState().phase === 'planning');
check('scene built against stubbed THREE', app.getState().webgl === true);

// ================================================================ plan -> results -> save
section('§11.1 Full planning -> simulation -> playback -> results -> save score');
{
  const canon = g.LEIP_DATA.canonicalTest;
  app.setSpeed(canon.inputs.speed);
  app.setNights(canon.inputs.nights);
  for (const n of canon.inputs.route) app.pickPort(n);
  for (const [id, c] of Object.entries(canon.inputs.activities)) app.setActivity(id, c);
  const sim = app.simulate();
  check('simulate() locks inputs and starts playback', sim !== null && app.getState().phase === 'playback');
  check('playback runs to results', runTicksUntil(app, () => app.getState().phase === 'results'));
  check(`app-path score is the canonical ${canon.expected.final}`, app.getState().sim.score.final === canon.expected.final,
    String(app.getState().sim.score.final));

  // §11.7: saving with no name entered is impossible.
  check('empty-name save is refused', app.saveScore('').ok === false && app.saveScore('   ').ok === false);
  const res = app.saveScore('ellis');
  check('named save succeeds and ranks first', res.ok === true && res.rank === 0);
  check('double-save of the same charter is refused', app.saveScore('ellis').ok === false);
  check('board holds the arcade-style entry',
    app.getState().persistent.board.length === 1 && app.getState().persistent.board[0].name === 'ELLIS');

  // §11.7: skipping the save never blocks returning to the start screen.
  app.playAgain();
  check('playAgain returns to planning (no save required)', app.getState().phase === 'planning');
}

// ================================================================ planning UI
section('Planning panel — the playtest rules the markup must keep');
{
  const html = readHtml();
  const panel = html.slice(html.indexOf('<aside id="plan">'), html.indexOf('</aside>'));
  check('section headings carry no step numbers',
    !/stepno/.test(html) && !/<h3>\s*\d/.test(panel));
  check('the four headings read plainly',
    ['>Route<', '>Speed<', 'Nights at anchor', '>Activities<'].every(h => panel.includes(h)));
  // A fresh charter starts at ZERO anchor nights and the player adds them.
  // Three places have to agree or the control lies on the first paint,
  // before refreshPlanning has run: the slider, its readout, and the state.
  {
    const { sandbox: sb0 } = makeSandbox();
    const g0 = loadGame(sb0);
    g0.LEIP_APP.init();
    check('a fresh charter opens with no anchor nights',
      g0.LEIP_APP.getState().inputs.nights === 0,
      String(g0.LEIP_APP.getState().inputs.nights));
    check('and the slider and its readout are built at 0 to match',
      /id="nights" min="0" max="6" step="1" value="0"/.test(html) &&
      /<b id="nights-val" class="data">0<\/b>/.test(html));
    // The heading and its live value stay; only the explanatory line goes.
    check('the helper sentence is gone, the live readout is not',
      !html.includes('Real charterers target') &&
      panel.includes('Nights at anchor · <b id="nights-val"'));
    g0.LEIP_APP.setNights(5);
    check('dragging still moves the value', g0.LEIP_APP.getState().inputs.nights === 5);
    g0.LEIP_APP.setNights(0);
    check('and it can be taken back to zero', g0.LEIP_APP.getState().inputs.nights === 0);
    // The scoring reads whatever the slider holds — nothing about anchor
    // nights is defaulted inside the engine.
    const E0 = g0.LEIP_ENGINE;
    const at = (n) => E0.simulate({ route: ['Monaco', 'Calvi'], speed: 'slow', nights: n, activities: {} });
    check(`0 and 4 anchor nights still score differently (${at(0).score.final} vs ${at(4).score.final})`,
      at(0).score.final !== at(4).score.final);
  }
  // The intro copy moved OFF the panel and onto the landing screen, so the
  // rules are stated once, in one place, and the panel is all controls.
  // Both halves are asserted — gone from here, present there — because
  // "moved" is the requirement and either half alone would pass a copy.
  check('the panel carries no prose intro; Route leads it',
    !panel.includes('id="intro"') && panel.indexOf('>Route<') > 0);
  const landing = html.slice(html.indexOf('<div id="landing"'), html.indexOf('<div id="results"'));
  check('the landing screen carries the headline, the body and the way in',
    landing.includes('Can you plan the most optimal charter?') &&
    landing.includes('Nine achievements are hidden in the planning.') &&
    landing.includes('Plan your week at sea.') &&
    landing.includes('id="btn-landing-go"'));
  check('the landing screen is up before the first frame, not revealed after one',
    /<div id="landing" class="overlay">/.test(html));
  check('the header carries an info button that reopens it',
    /id="btn-info"/.test(html) && html.includes("on('btn-info', 'click'"));

  // The rename is PLAYER-FACING ONLY. The wordmark, the HUD and the copy
  // read ENX50; the data-block globals, the script ids and the filenames
  // are untouched, and this check is what stops a well-meaning
  // find-and-replace from taking them with it.
  check('the wordmark, the HUD and the landing copy all read ENX50',
    html.includes('<div id="brand">ENX50') &&
    html.includes('<div class="tb-brand">ENX50<em>70M E-HYBRID · 50MWH</em>') &&
    landing.includes('ENX50 carries enough installed energy') &&
    html.includes('<title>ENX50'));
  check('the rename did NOT reach the globals, the script ids or the fonts',
    html.includes('globalThis.LEIP_DATA') && html.includes('globalThis.LEIP_THEME') &&
    html.includes('id="leip-engine"') && html.includes('OCR-A-LEIP') &&
    !/ENX50_/.test(html) && !/id="enx50-/.test(html));

  const { sandbox: sb2 } = makeSandbox();
  const g2 = loadGame(sb2);
  g2.LEIP_APP.init();
  // Eco still scores; it just must not reach the player.
  check('eco values are still in the model',
    g2.LEIP_DATA.activities.every(a => typeof a.eco === 'number'));
  const rendered = sb2.document.getElementById('activity-list').innerHTML;
  check('no eco number is rendered on any activity tile',
    rendered.length > 0 && !/eco\s*<b>/.test(rendered) && !/>\s*eco\b/i.test(rendered));
  const spd = sb2.document.getElementById('speed-toggle').innerHTML;
  check('the speed toggle carries a turtle and a hare',
    g2.LEIP_DATA.speedToggles.slow.icon === 'SPD_TURTLE' &&
    g2.LEIP_DATA.speedToggles.fast.icon === 'SPD_HARE' &&
    (spd.match(/<svg/g) || []).length === 2,
    `${(spd.match(/<svg/g) || []).length} icons rendered`);
  check('both speed icons live in the THEME, not inline in the UI',
    !!g2.LEIP_THEME.icons.defs.SPD_TURTLE && !!g2.LEIP_THEME.icons.defs.SPD_HARE);

  // ---- the picker is ONE flat list, country-major, no headings ----
  const D2 = g2.LEIP_DATA;
  const list = sb2.document.getElementById('port-list').innerHTML;
  const order = (list.match(/data-port="([^"]+)"/g) || []).map(s => s.slice(11, -1));
  const byName = Object.fromEntries(D2.ports.map(p => [p.name, p]));
  check('every one of the 44 ports, once each, in one list',
    order.length === D2.ports.length && new Set(order).size === order.length);
  check('no country headings survive — the ordering does the grouping',
    !/port-country|port-group|port-grid/.test(list));
  {
    // Country-major: each country occupies ONE contiguous run. A country
    // appearing twice would mean the sort is not country-first, which is
    // the only thing holding the grouping together now the headings are
    // gone.
    const runs = [];
    for (const n of order) {
      const c = byName[n].country;
      if (!runs.length || runs[runs.length - 1] !== c) runs.push(c);
    }
    check(`each country is one contiguous run (${runs.length} runs, ${new Set(runs).size} countries)`,
      runs.length === new Set(runs).size, runs.join(' > '));
    check('the runs follow the DATA-block country order',
      runs.filter(c => D2.countryOrder.includes(c)).join() ===
        D2.countryOrder.filter(c => runs.includes(c)).join(), runs.join(' > '));
    check('the sort key is the DERIVED country, not the pack region',
      runs.includes('Italy') && runs.includes('France') &&
      !runs.some(c => /\(|Sardegna|Siciliy|Corsica|Nothern/.test(c)), runs.join(' > '));
    // Corsica under France and Sardinia/Sicily under Italy is the whole
    // point of using the derived field, so name the ports outright.
    check('Corsican ports sort under France; Sardinian and Sicilian under Italy',
      ['Ajaccio', 'Bonifacio', 'Calvi'].every(n => byName[n].country === 'France') &&
      ['Cagliari', 'Olbia', 'Taormina'].every(n => byName[n].country === 'Italy'));
    // Alphabetical inside each run.
    const bad = [];
    let i = 0;
    while (i < order.length) {
      const c = byName[order[i]].country;
      const run = [];
      while (i < order.length && byName[order[i]].country === c) run.push(order[i++]);
      if (run.join() !== run.slice().sort().join()) bad.push(c);
    }
    check('ports run alphabetically inside each country', bad.length === 0, bad.join(', '));
  }
  check('the flag rides on the chip, since there is no heading to carry it',
    (list.match(/class="flag"/g) || []).length === D2.ports.length);

  // ---- selecting, dropping and reordering ----
  const A2 = g2.LEIP_APP;
  A2.clearRoute();
  A2.togglePort('Nice'); A2.togglePort('Monaco'); A2.togglePort('Cannes');
  check('a chip adds the port', A2.getState().inputs.route.join() === 'Nice,Monaco,Cannes');
  A2.togglePort('Monaco');
  check('the same chip again drops it', A2.getState().inputs.route.join() === 'Nice,Cannes');
  A2.pickPort('Nice');                       // a repeat
  A2.dropPort('Nice');
  check('dropping a repeated port takes the MOST RECENT instance',
    A2.getState().inputs.route.join() === 'Nice,Cannes');

  // ---- repeats, via the + on a chosen chip ----
  // The chip body toggles; the + repeats. Both live on the same chip, so
  // the markup has to distinguish them or one gesture does both.
  //
  // WHAT THIS CAN AND CANNOT SEE. The + is added to live chip nodes by
  // refreshPlanning, and this sandbox's element stub does not model
  // querySelector, so it never reaches innerHTML here. So: the BEHAVIOUR
  // is asserted through the API, and the WIRING is asserted against the
  // source. That the + actually appears on a chosen chip is checked in the
  // browser, by the repeat-plus shot in tools/shots.mjs.
  A2.clearRoute();
  A2.togglePort('Nice');
  check('a chip is built with no + until it is chosen',
    !/pc-plus/.test(sb2.document.getElementById('port-list').innerHTML));
  A2.pickPort('Nice');
  check('+ adds another instance rather than toggling the port off',
    A2.getState().inputs.route.join() === 'Nice,Nice');
  A2.pickPort('Nice');
  check('and again, so a port can appear three times',
    A2.getState().inputs.route.join() === 'Nice,Nice,Nice');
  A2.togglePort('Nice');
  check('the chip body still drops one instance, not the whole run',
    A2.getState().inputs.route.join() === 'Nice,Nice');
  {
    // The chip has two gestures on one element, so the handler must split
    // them: a click landing on the + repeats, anything else toggles. If
    // the closest('.pc-plus') branch were dropped, + would silently
    // become "remove" — the exact opposite of what it says.
    const handler = html.slice(html.indexOf("chip.addEventListener('click'"),
                               html.indexOf('})(chips[i]);'));
    check('the + is wired to pickPort, and the chip body to togglePort',
      /closest\('\.pc-plus'\)/.test(handler) &&
      /API\.pickPort\(name\)/.test(handler) && /API\.togglePort\(name\)/.test(handler));
    check('the + is only rendered on a chosen chip, alongside its count',
      /pc-extra/.test(html) && /uses > 1 \? '<i>/.test(html));
  }
  check('the route hint tells the player how to repeat a stop',
    html.includes('repeats are allowed \u2014 press + on a chosen stop to add it again') ||
    html.includes('repeats are allowed — press + on a chosen stop to add it again'));
  A2.clearRoute();
  ['Nice', 'Monaco', 'Cannes', 'Antibes'].forEach((n) => A2.pickPort(n));
  A2.reorderRoute(0, 2);
  check('a stop drags to a new position and the rest keep their order',
    A2.getState().inputs.route.join() === 'Monaco,Cannes,Nice,Antibes',
    A2.getState().inputs.route.join());
  A2.reorderRoute(3, 0);
  check('and it can be dragged back to the front',
    A2.getState().inputs.route.join() === 'Antibes,Monaco,Cannes,Nice');
  {
    const before = A2.getState().inputs.route.join();
    A2.reorderRoute(0, 9); A2.reorderRoute(-1, 0); A2.reorderRoute(2, 2);
    check('an out-of-range or no-op drag changes nothing',
      A2.getState().inputs.route.join() === before);
  }
  // Reordering is a real re-timing of the week, not a relabelling: the same
  // ports in a different order sail a different distance.
  {
    const a = g2.LEIP_ENGINE.simulate({ route: ['Athens', 'Nice', 'Corfu'], speed: 'slow', nights: 4, activities: {} });
    const b = g2.LEIP_ENGINE.simulate({ route: ['Nice', 'Corfu', 'Athens'], speed: 'slow', nights: 4, activities: {} });
    check(`order changes the week (${a.coveredNm.toFixed(0)} nm vs ${b.coveredNm.toFixed(0)} nm)`,
      Math.abs(a.coveredNm - b.coveredNm) > 1);
  }

  // ---- activities: one selected style, and a way to clear them ----
  // NOTE ON WHAT THIS CAN SEE. The tiles' selected class is applied to live
  // nodes by refreshPlanning, and this sandbox's element stub does not
  // model querySelector, so innerHTML here never shows it. What is checked
  // here is the contract either side of that gap — the markup the tiles are
  // built with, the state the API holds, and the CSS rule that renders it.
  // That the class actually lands is checked in the browser, by the
  // activities-selected shot in tools/shots.mjs.
  const onTiles = sb2.document.getElementById('activity-list').innerHTML;
  check('every tile is built unselected and says so for screen readers',
    (onTiles.match(/class="act-tile"/g) || []).length === D2.activities.length &&
    (onTiles.match(/aria-pressed="false"/g) || []).length === D2.activities.length);
  A2.setActivity('A02', 1); A2.setActivity('A07', 1);
  check('selecting activities holds them in state',
    Object.keys(A2.getState().inputs.activities).sort().join() === 'A02,A07');
  A2.setActivity('A02', 0);
  check('pressing a selected activity deselects it',
    !A2.getState().inputs.activities.A02 && !!A2.getState().inputs.activities.A07);
  A2.clearActivities();
  check('clear all empties the selection',
    Object.keys(A2.getState().inputs.activities).length === 0);
  check('the clear-all button exists and the icons carry their tone class',
    html.includes('id="btn-clear-acts"') && /class="t-\w+"/.test(onTiles));
  // One selected style across the panel: the same declaration serves the
  // speed toggle, the port chips and the activity tiles.
  {
    const rule = html.slice(html.indexOf('#speed-toggle button.on, #plan #speed-toggle button.on,'));
    const decl = rule.slice(0, rule.indexOf('}'));
    check('speed, ports and activities share one dark-navy selected rule',
      decl.includes('.port-chip.on') && decl.includes('.act-tile.on') &&
      decl.includes('background: var(--ink-fixed)') && decl.includes('color: var(--paper)'));
  }
}

// ================================================================ playback HUD
section('Playback HUD — time of day and charter progress');
{
  const { sandbox: sb4 } = makeSandbox();
  const g4 = loadGame(sb4);
  const A4 = g4.LEIP_APP;
  A4.init();
  const T4 = g4.LEIP_THEME, D4 = g4.LEIP_DATA;
  check('the charter start hour is a THEME token, shared by the light and the clock',
    typeof T4.charterStartHour === 'number');
  check('playback pace is a THEME token', typeof T4.motion.weekSeconds === 'number');
  ['Ajaccio', 'Antibes', 'Porto Cervo', 'Monaco'].forEach(n => A4.pickPort(n));
  A4.simulate();
  const el = (id) => sb4.document.getElementById(id);
  check('the clock reads a time of day with AM/PM', /^\d{1,2}:\d{2} (AM|PM)$/.test(el('tb-clock').textContent),
    el('tb-clock').textContent);
  check('progress starts at 0%', el('tb-progpct').textContent === '0%', el('tb-progpct').textContent);
  const seen = new Set();
  for (let i = 0; i < 40 && A4.getState().phase === 'playback'; i++) {
    A4.tick(1);
    seen.add(el('tb-clock').textContent);
  }
  check('the clock advances through the week', seen.size > 5, `${seen.size} distinct readings`);
  const pctText = el('tb-progpct').textContent;
  const pct = parseInt(pctText, 10);
  check(`progress advances and stays in range (${pctText})`, pct > 0 && pct <= 100);
  // Run to the end: the bar must land on exactly 100, not 99 or 101.
  for (let i = 0; i < 200 && A4.getState().phase === 'playback'; i++) A4.tick(1);
  check('progress finishes at 100%', el('tb-progpct').textContent === '100%',
    el('tb-progpct').textContent);
  check('the bar width tracks the percentage', el('tb-progbar').style.width === '100%',
    el('tb-progbar').style.width);
}

// ================================================================ diesel gauge
section('Diesel gauge — hidden until the diesels wake');
{
  const { sandbox: sb6 } = makeSandbox();
  const g6 = loadGame(sb6);
  const A6 = g6.LEIP_APP;
  A6.init();
  const el = (id) => sb6.document.getElementById(id);
  // Track the row's shown/hidden state through the run.
  const shown = [];
  const row = el('tb-dieselrow');
  row.classList.add = (cls) => { if (cls === 'hidden') shown.push(false); };
  row.classList.remove = (cls) => { if (cls === 'hidden') shown.push(true); };

  check('the row is hidden in the markup by default',
    /id="tb-dieselrow"[^>]*class="tb-row hidden"|class="tb-row hidden" id="tb-dieselrow"/.test(readHtml()));

  // A week that must wake the diesels.
  ['Palma', 'Bonifacio', 'Naples', 'Monaco'].forEach(n => A6.pickPort(n));
  A6.setSpeed('fast');
  const sim = A6.simulate();
  check('the fixture week does break into the reserve', sim.dieselMwh > 0,
    `${sim.dieselMwh.toFixed(1)} MWh`);
  check('planning and the battery phase leave it hidden', shown.every(v => v === false),
    JSON.stringify(shown.slice(0, 6)));

  // Run to just before the diesels wake, then past it.
  const wake = sim.dieselStartH;
  let revealedBefore = null, revealedAfter = null;
  for (let i = 0; i < 400 && A6.getState().phase === 'playback'; i++) {
    const t = A6.getState().playT;
    A6.tick(1);
    if (revealedBefore === null && t > 1 && t < wake - 2) revealedBefore = shown[shown.length - 1];
    if (revealedAfter === null && A6.getState().playT > wake + 2) revealedAfter = shown[shown.length - 1];
  }
  check(`still hidden before the diesels wake (hour ${wake.toFixed(0)})`, revealedBefore === false);
  check('revealed once they wake — the same moment the smoke starts', revealedAfter === true);
  check('the gauge reads the reserve remaining, not the amount burnt',
    /%$/.test(el('tb-dieselpct').textContent) &&
    /MWH USED$/.test(el('tb-dieselmwh').textContent),
    `${el('tb-dieselpct').textContent} · ${el('tb-dieselmwh').textContent}`);

  // Results carry the reserve line; a clean week does not.
  const card = el('results-card').innerHTML;
  check('results report the reserve used', /Diesel reserve used/.test(card));
  const { sandbox: sb7 } = makeSandbox();
  const g7 = loadGame(sb7);
  g7.LEIP_APP.init();
  ['Nice', 'Monaco'].forEach(n => g7.LEIP_APP.pickPort(n));
  const clean = g7.LEIP_APP.simulate();
  for (let i = 0; i < 400 && g7.LEIP_APP.getState().phase === 'playback'; i++) g7.LEIP_APP.tick(4);
  check('a clean week never shows the reserve at all',
    clean.dieselMwh === 0 &&
    !/Diesel reserve used/.test(sb7.document.getElementById('results-card').innerHTML));
}

// ================================================================ map legibility
section('Map legibility — no port rings, callouts in the collision pass');
{
  const html = readHtml();
  const { sandbox: sb5 } = makeSandbox();
  const g5 = loadGame(sb5);
  const A5 = g5.LEIP_APP;
  A5.init();
  const T5 = g5.LEIP_THEME;

  // 1. The per-port radiating hatch is gone, token and all.
  check('the per-port hatch token is gone from the THEME',
    T5.chart.hatchSpacingPx === undefined);
  // Comments stripped: the code is what draws, and both removals are
  // explained in comments that would otherwise match.
  const chartBlock = html.slice(html.indexOf('<script id="leip-app">'))
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('nothing draws a radial tick ring around a port',
    !/hatchSpacing/.test(chartBlock));
  check('no depth soundings are drawn on the water',
    T5.chart.soundingsPerPort === undefined && T5.chart.soundingsAlpha === undefined &&
    !/soundings/i.test(chartBlock));
  check('the single main compass rose is still charted',
    Array.isArray(T5.chart.roseLatLon) && T5.chart.roseLatLon.length === 2);
  // The white foam circle that used to sit around EVERY port went with
  // them: unconditional and white, in a cluster it read as a second set of
  // compass rings. Foam survives on the coastline bevel and in the wake,
  // which is what the visual direction actually describes.
  //
  // A volt selection ring was tried here and removed again: it was drawn
  // flat on the water at a fixed height while the monument sits on a
  // sculpted islet, so on any port whose island rises under it the ring
  // cut through the terrain rather than resting on it. The selection now
  // recolours the building and hangs a pin above it, neither of which
  // needs a surface to lie on. So the original rule stands unqualified.
  check('no ring is built around a port marker',
    !/RingGeometry/.test(chartBlock));
  check('foam still exists for the coastline bevel and the wake',
    typeof T5.world.foam === 'string' &&
    typeof T5.terrain.bevelSize === 'number' && T5.terrain.bevelSize > 0);

  // 2. Callouts are plates in the label system, not baked route ink.
  check('the callout plate is a THEME token with its own candidates',
    !!T5.world.calloutPlate && Array.isArray(T5.world.calloutPlate.candidates));
  check('callouts draw under port names',
    T5.world.order.callout < T5.world.order.label);
  check('both plate kinds offset in screen space, in units of their own size',
    T5.world.labelPlate.candidates.every(c => Math.abs(c[0]) <= 4 && Math.abs(c[1]) <= 4) &&
    T5.world.calloutPlate.candidates.every(c => Math.abs(c[0]) <= 4 && Math.abs(c[1]) <= 4));
  check('the monument footprint is reserved before any type is placed',
    typeof T5.world.labelPlate.monumentPad === 'number' && T5.world.labelPlate.monumentPad >= 1);

  // A route with three legs must produce three callouts, and clearing the
  // route must not leave any behind.
  ['Olbia', 'Porto Cervo', 'Bonifacio', 'Ajaccio'].forEach(n => A5.pickPort(n));
  A5.tick(0.016);          // the chart redraw is what hands callouts over
  const labels = g5.LEIP_APP.debugLabels();
  check('one callout per leg, carrying bearing and distance',
    labels.callouts.length === 3 &&
    labels.callouts.every(c => /^\d{3}° · \d+ NM$/.test(c.text)),
    labels.callouts.map(c => c.text).join(' | '));
  A5.clearRoute();
  A5.tick(0.016);
  check('clearing the route retires every callout',
    g5.LEIP_APP.debugLabels().callouts.length === 0);
}

// ================================================================ chart frame
section('Chart frame — the view is bounded and the grid fills it');
{
  const g3 = loadGame(makeSandbox().sandbox);
  const T3 = g3.LEIP_THEME, D3 = g3.LEIP_DATA;
  const fb = T3.frame.boundsDeg;
  check('the frame is stated in the THEME, not derived per-viewport',
    fb && typeof fb.minLon === 'number' && typeof fb.maxLat === 'number');
  check('every port lies inside the frame',
    D3.ports.every(p => p.lon > fb.minLon && p.lon < fb.maxLon &&
                        p.lat > fb.minLat && p.lat < fb.maxLat),
    D3.ports.filter(p => !(p.lon > fb.minLon && p.lon < fb.maxLon &&
                           p.lat > fb.minLat && p.lat < fb.maxLat)).map(p => p.name).join(', '));
  // The frame must sit inside the drawn terrain, or its edge shows void.
  const TER = g3.LEIP_TERRAIN;
  let tl = 180, tr = -180, tb = 90, tt = -90;
  for (const ring of TER.coasts) {
    for (let i = 0; i < ring.length; i += 2) {
      tl = Math.min(tl, ring[i]); tr = Math.max(tr, ring[i]);
      tb = Math.min(tb, ring[i + 1]); tt = Math.max(tt, ring[i + 1]);
    }
  }
  check(`the frame sits inside the drawn terrain (lon ${tl.toFixed(0)}..${tr.toFixed(0)}, lat ${tb.toFixed(0)}..${tt.toFixed(0)})`,
    fb.minLon >= tl && fb.maxLon <= tr && fb.minLat >= tb && fb.maxLat <= tt);
  // ...and inside the sea field, so water fills whatever the land does not.
  const seaLon = (fb.maxLon - fb.minLon), seaLat = (fb.maxLat - fb.minLat);
  check('the sea field is wider than the frame in both axes',
    T3.world.seaSpread.x > 1 && T3.world.seaSpread.z > 1 && seaLon > 0 && seaLat > 0);
  check('the graticule labels every Nth line, so marginalia stay legible',
    T3.chart.graticuleLabelEvery >= 2);
}

// ================================================================ share card
section('§11.8 Share card renders 1080x1920, non-blank, and share degrades to download');
{
  app.clearRoute();
  for (const n of ['Athens', 'Santorini', 'Livadia']) app.pickPort(n);
  app.simulate();
  app.skip();
  check('charter completed for the card', app.getState().phase === 'results');
  const cnv = recordingCanvas();
  app.renderShareCard(cnv);
  const T = g.LEIP_THEME;
  check(`card dimensions are ${T.shareCard.w}x${T.shareCard.h}`,
    cnv.width === T.shareCard.w && cnv.height === T.shareCard.h, `${cnv.width}x${cnv.height}`);
  const fills = cnv.ops.filter(o => o.op === 'fillRect');
  check('card is non-blank: full-sheet fill first, then substantial drawing',
    fills.length >= 1 && fills[0].args[2] === T.shareCard.w && fills[0].args[3] === T.shareCard.h &&
    cnv.ops.length > 60, `ops=${cnv.ops.length}`);
  const texts = cnv.ops.filter(o => o.op === 'fillText').map(o => String(o.args[0]));
  const score = app.getState().sim.score.final.toFixed(1);
  check('card carries the score and the wordmark',
    texts.some(t => t === score) && texts.some(t => t === 'LEIP'), JSON.stringify(texts.slice(0, 4)));
  const outcome = await app.shareCard();
  check('Web Share unsupported -> clean download fallback', outcome === 'downloaded', outcome);
  app.playAgain();
}

// ================================================================ chaos + degradation
section('Random Spin cycles and no-WebGL degradation');
{
  let ok = 0;
  const errs = [];
  for (let i = 0; i < 25; i++) {
    try {
      app.clearRoute();
      app.spin();
      if (!app.simulate()) throw new Error('simulate returned null');
      app.tick(2);
      app.skip();
      if (app.getState().phase !== 'results') throw new Error('no results');
      app.playAgain();
      ok++;
    } catch (e) { errs.push(`#${i}: ${e.message}`); }
  }
  check('25/25 spin cycles clean', ok === 25, errs.slice(0, 3).join('; '));

  const { sandbox: sb2 } = makeSandbox({ three: false });
  const g2 = loadGame(sb2);
  const app2 = g2.LEIP_APP;
  app2.init();
  check('boot survives missing THREE', app2.getState().webgl === false);
  app2.pickPort('Nice'); app2.pickPort('Monaco');
  app2.simulate();
  check('no-WebGL simulate goes straight to results', app2.getState().phase === 'results');
}

// ================================================================ persistence
section('§11.7 Persistence across reload (same localStorage)');
{
  const before = {
    dots: Object.keys(app.getState().persistent.unlocked).length,
    board: app.getState().persistent.board.length
  };
  check('session accumulated dots and board entries', before.dots > 0 && before.board > 0, JSON.stringify(before));
  const { sandbox: sb3 } = makeSandbox({ storage });
  const g3 = loadGame(sb3);
  const app3 = g3.LEIP_APP;
  app3.init();
  const after = {
    dots: Object.keys(app3.getState().persistent.unlocked).length,
    board: app3.getState().persistent.board.length
  };
  check('achievements and leaderboard survive a reload',
    after.dots === before.dots && after.board === before.board,
    `${JSON.stringify(before)} vs ${JSON.stringify(after)}`);
  check('reloaded board keeps the saved name', app3.getState().persistent.board[0].name === 'ELLIS');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
