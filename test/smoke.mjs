// §11.1 Headless smoke test — stubbed Three.js/DOM harness executing
// boot -> scene build -> full planning -> simulation -> playback ->
// results -> save score, plus §11.7 (persistence, name rule) and §11.8
// (share card). The APP block runs verbatim from index.html.
import { loadGame } from './extract.mjs';

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
  check('app-path score is the canonical 483.6', app.getState().sim.score.final === canon.expected.final,
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
