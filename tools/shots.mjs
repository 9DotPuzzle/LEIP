/*
 * shots.mjs — playtest screenshots straight from index.html.
 *
 * Drives the real page in Chromium: no stubs, so what lands in shots/ is
 * what a player sees. Each shot names the fix it is evidence for.
 *
 *   node tools/shots.mjs [name ...]      (no names = all)
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'shots');
mkdirSync(OUT, { recursive: true });

const VIEW = { width: 1600, height: 1000 };

// The chart is a canvas, so settling is a matter of frames, not network.
const settle = (page, frames = 30) => page.evaluate((n) => new Promise((res) => {
  let i = 0;
  const step = () => (++i >= n ? res() : requestAnimationFrame(step));
  requestAnimationFrame(step);
}), frames);

const shots = {
  // --- 1 & 2: hard frame bounds and grid across all water
  'zoom-out': async (page) => {
    await page.evaluate(() => window.LEIP_APP.debugView({ zoom: 'min' }));
    await settle(page);
    return { clip: stageClip };
  },
  'frame-edge-drag': async (page) => {
    // Shove the view hard into each corner; the clamp must hold.
    await page.evaluate(() => window.LEIP_APP.debugView({ zoom: 'min', pan: [-9999, -9999] }));
    await settle(page);
    return { clip: stageClip };
  },
  // --- 3: label de-collision on the densest cluster
  riviera: async (page) => {
    await page.evaluate(() => {
      window.LEIP_APP.debugView({ focus: ['Saint Tropez', 'Cannes', 'Antibes', 'Nice', 'Monaco', 'Saint-Jean-Cap-Ferrat'] });
      window.LEIP_APP.debugView({ zoom: 150 });   // the cluster, at a readable scale
    });
    await settle(page);
    return { clip: stageClip };
  },
  // --- 4 & 5: yacht and route clear of land; markers never buried
  // A route that must round Sicily: the leg Naples -> Taormina threads the
  // Strait of Messina, and Taormina -> Cagliari runs the length of the
  // island. Both hugged the coast before the clearance went up.
  'route-sicily': async (page) => {
    await page.evaluate(() => window.LEIP_APP.debugRoute(['Naples', 'Taormina', 'Cagliari']));
    await settle(page);
    return { clip: stageClip };
  },
  'route-sardinia': async (page) => {
    await page.evaluate(() => {
      window.LEIP_APP.debugRoute(['Olbia', 'Porto Cervo', 'Bonifacio', 'Ajaccio']);
      window.LEIP_APP.debugView({ zoom: 260 });
    });
    await settle(page);
    return { clip: stageClip };
  },
  'markers-bodrum': async (page) => {
    await page.evaluate(() => window.LEIP_APP.debugView({ focus: ['Bodrum', 'Gulluk', 'Gocek'] }));
    await settle(page);
    return { clip: stageClip };
  },
  // --- 6-9: the planning panel
  'panel-top': async (page) => {
    await settle(page, 5);
    return { clip: await page.locator('#plan').boundingBox() };
  },
  'panel-speed': async (page) => {
    // Scroll the panel so the speed toggle sits in view with its icons.
    await page.evaluate(() => {
      const plan = document.getElementById('plan');
      const el = document.getElementById('speed-toggle');
      plan.scrollTop = el.offsetTop - plan.offsetTop - 40;
    });
    await settle(page, 5);
    return { clip: await page.locator('#plan').boundingBox() };
  },
  'panel-activities': async (page) => {
    await page.evaluate(() => {
      const plan = document.getElementById('plan');
      const el = document.getElementById('activity-list');
      plan.scrollTop = el.offsetTop - plan.offsetTop - 30;
    });
    await settle(page, 5);
    return { clip: await page.locator('#plan').boundingBox() };
  },
  // --- 3: the densest clusters during a live run, callouts and all
  'sim-costa-smeralda': async (page) => {
    await page.evaluate(() => {
      const A = window.LEIP_APP;
      ['Olbia', 'Porto Cervo', 'Porto Rotondo', 'Bonifacio', 'Ajaccio'].forEach((n) => A.pickPort(n));
      A.simulate();
    });
    await page.waitForTimeout(9000);
    await page.evaluate(() => window.LEIP_APP.debugView({ zoom: 150 }));
    await settle(page);
    return { clip: stageClip };
  },
  // --- the diesel reveal: a week that must break into the reserve
  'diesel-reveal': async (page) => {
    await page.evaluate(() => {
      const A = window.LEIP_APP;
      // A week hard enough to break into the reserve early — the diesels
      // wake at hour 71 of 168.
      A.setSpeed('fast');
      A.setNights(0);
      ['Athens', 'Olbia', 'Bodrum'].forEach((n) => A.pickPort(n));
      A.simulate();
      // Advance the simulation clock directly rather than waiting out the
      // playback in real time: SwiftShader renders far slower than the
      // 58-second week. Same tick() the render loop calls.
      const wake = A.getState().sim.dieselStartH;
      for (let i = 0; i < 4000 && A.getState().phase === 'playback' &&
                      A.getState().playT < wake + 8; i++) A.tick(0.25);
    });
    await settle(page, 10);
    return { clip: stageClip };
  },
  // --- 11 & 12: playback pace, clock and progress
  'mid-simulation': async (page) => {
    await page.evaluate(() => {
      const A = window.LEIP_APP;
      ['Ajaccio', 'Antibes', 'Porto Cervo', 'Monaco'].forEach((n) => A.pickPort(n));
      A.simulate();
    });
    await page.waitForTimeout(22000);   // well into the week, not the first hour
    return { clip: stageClip };
  }
};

let stageClip = null;
const THREE_SRC = readFileSync(join(ROOT, 'node_modules/three/build/three.min.js'), 'utf8');

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const names = wanted.length ? wanted : Object.keys(shots);

// This environment ships its own Chromium; use it rather than downloading.
// SwiftShader gives the headless run a real WebGL context, so the world
// layer is photographed, not the no-WebGL fallback.
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--allow-file-access-from-files']
});
for (const name of names) {
  if (!shots[name]) { console.error(`no shot named ${name}`); continue; }
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  // The page loads Three.js from unpkg, which this environment's network
  // policy blocks. Serve the identical pinned build from node_modules so
  // the shot photographs the real WebGL world; index.html is untouched.
  await page.route('**/three@*/build/three.min.js', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: THREE_SRC }));
  await page.goto('file://' + join(ROOT, 'index.html'));
  await page.waitForFunction(() => window.LEIP_APP && window.LEIP_APP.getState().phase === 'planning',
    null, { timeout: 15000 });
  stageClip = await page.locator('#stage-wrap').boundingBox();
  const opts = (await shots[name](page)) || {};
  await page.screenshot({ path: join(OUT, `${name}.png`), ...opts });
  console.log(`${name}.png${errors.length ? `   PAGE ERRORS: ${errors.slice(0, 3).join(' | ')}` : ''}`);
  await page.close();
}
await browser.close();
