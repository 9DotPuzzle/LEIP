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
  check('the intro block leads the panel',
    panel.indexOf('id="intro"') > 0 &&
    panel.indexOf('id="intro"') < panel.indexOf('>Route<') &&
    panel.includes('A week at sea, on battery alone.') &&
    panel.includes('Nine achievements are hidden in the planning.'));

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
  const chartBlock = html.slice(html.indexOf('<script id="leip-app">'));
  check('nothing draws a radial tick ring around a port',
    !/hatchSpacing/.test(chartBlock));
  check('soundings survive as sparse chart texture',
    T5.chart.soundingsPerPort >= 1 && T5.chart.soundingsPerPort <= 3);
  check('the single main compass rose is still charted',
    Array.isArray(T5.chart.roseLatLon) && T5.chart.roseLatLon.length === 2);

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
