/*
 * reach.mjs — can a player actually get to every port?
 *
 * The pan/zoom clamp is a hard bound: the visible ground rectangle must
 * stay inside the charted frame. Widening the map to 44 ports put Lateral
 * in the Channel and Casablanca on the Atlantic coast, well outside the
 * opening view, so "it is in the data" is no longer the same claim as
 * "the player can see it".
 *
 * This drives the real page and, for every port, asks the camera to frame
 * it exactly as a click on its chip would, then checks it landed inside
 * the SAFE area — the stage minus the planning panel and the title block.
 * A port that only ever renders behind the panel is unreachable.
 *
 *   node tools/reach.mjs
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const THREE_SRC = readFileSync(join(ROOT, 'node_modules/three/build/three.min.js'), 'utf8');

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--allow-file-access-from-files']
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
await page.route('**/three@*/build/three.min.js', (route) =>
  route.fulfill({ contentType: 'application/javascript', body: THREE_SRC }));
await page.goto('file://' + join(ROOT, 'index.html'));
await page.waitForFunction(() => window.LEIP_APP && window.LEIP_APP.getState().phase === 'planning',
  null, { timeout: 15000 });

const res = await page.evaluate(() => {
  const A = window.LEIP_APP;
  const names = window.LEIP_DATA.ports.map((p) => p.name);
  const bad = [];
  for (const n of names) {
    A.debugView({ focus: [n] });
    if (A.debugSafeArea().outside.includes(n)) bad.push(n);
  }
  // And the opening view, which is a stated rectangle rather than a fit:
  A.debugView({ focus: null });
  return { total: names.length, unreachable: bad };
});

console.log(`ports: ${res.total}`);
console.log(res.unreachable.length
  ? `UNREACHABLE (${res.unreachable.length}): ${res.unreachable.join(', ')}`
  : 'every port frames inside the safe area — none is unreachable by pan');

// ---------------------------------------------------------------- framing
// The camera holds the WHOLE route as it grows, rather than hopping to the
// latest pick. The case that matters is the one that crosses the map: a
// week that starts on the Riviera and ends up in the Channel.
const grow = await page.evaluate(async () => {
  const A = window.LEIP_APP;
  const settle = () => new Promise((res) => {
    let i = 0;
    const step = () => (++i >= 45 ? res() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  });
  A.clearRoute();
  const out = [];
  for (const n of ['Monaco', 'Cannes', 'Barcelona', 'Gibraltar', 'Lateral']) {
    A.pickPort(n);
    await settle();                       // let the easing arrive
    const route = A.getState().inputs.route;
    const missed = A.debugSafeArea().outside.filter((p) => route.includes(p));
    out.push({ after: n, stops: route.length, missed,
               dist: Math.round(A.debugSafeArea().cam.dist) });
  }
  return out;
});
let framingOk = true;
for (const s of grow) {
  if (s.missed.length) framingOk = false;
  console.log(`  + ${s.after.padEnd(10)} ${s.stops} stops, camera ${String(s.dist).padStart(4)} — ` +
    (s.missed.length ? `NOT FRAMED: ${s.missed.join(', ')}` : 'all stops framed'));
}
console.log(framingOk
  ? 'the camera holds every stop as the route grows, Channel included'
  : 'FRAMING FAILED — a stop fell outside the safe area as the route grew');

await browser.close();
process.exit(res.unreachable.length || !framingOk ? 1 : 0);
