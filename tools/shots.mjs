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

// Four stills across one charter day, sharing a route and a framing so the
// only thing that changes between them is the light.
function timeOfDay() {
  const at = { dawn: 22, midday: 3, dusk: 11, night: 14 };
  const out = {};
  Object.keys(at).forEach((name) => {
    out['sky-' + name] = async (page) => {
      await page.evaluate((h) => {
        const A = window.LEIP_APP;
        ['Ajaccio', 'Calvi', 'Monaco'].forEach((n) => A.pickPort(n));
        A.simulate();
        A.debugHour(h);
        A.debugPause();
        A.debugView({ focus: ['Ajaccio', 'Calvi', 'Monaco'], zoom: 300 });
      }, at[name]);
      await settle(page, 12);
      return { clip: stageClip };
    };
  });
  return out;
}

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
  // --- the UI overhaul ------------------------------------------------
  // The landing screen, as it comes up on every open.
  'landing': async (page) => {
    await page.evaluate(() => window.LEIP_APP.showLanding(true));
    await settle(page, 6);
    return {};
  },
  // The picker: ONE flat list, country-major, no headings. Scrolled to the
  // France/Italy boundary, which is where the ordering has to be doing the
  // work now that nothing labels it.
  'panel-ports-flat': async (page) => {
    await page.evaluate(() => {
      const A = window.LEIP_APP;
      ['Ajaccio', 'Bonifacio', 'Cannes'].forEach((n) => A.pickPort(n));
      const plan = document.getElementById('plan');
      const el = document.getElementById('port-list');
      plan.scrollTop = el.offsetTop - plan.offsetTop - 60;
    });
    await settle(page, 6);
    return { clip: await page.locator('#plan').boundingBox() };
  },
  // A port taken three times: the count and the + riding together on the
  // chosen chip. This is the check the element stub in smoke.mjs cannot
  // make — that the + actually renders on a chosen chip.
  'repeat-plus': async (page) => {
    await page.evaluate(() => {
      const A = window.LEIP_APP;
      ['Nice', 'Monaco', 'Nice', 'Cannes', 'Nice'].forEach((n) => A.pickPort(n));
      const plan = document.getElementById('plan');
      const el = document.getElementById('port-list');
      plan.scrollTop = el.offsetTop - plan.offsetTop - 60;
    });
    await settle(page, 6);
    return { clip: await page.locator('#plan').boundingBox() };
  },
  // Several ports picked, so the white selection halos read against the
  // sea. Paused mid-breath rather than at either end of the pulse.
  'selected-halos': async (page) => {
    await page.evaluate(() => {
      const A = window.LEIP_APP;
      ['Ajaccio', 'Bonifacio', 'Calvi', 'Porto Cervo', 'Olbia'].forEach((n) => A.pickPort(n));
      A.debugView({ focus: ['Ajaccio', 'Bonifacio', 'Calvi', 'Porto Cervo', 'Olbia'], zoom: 230 });
    });
    await settle(page, 34);
    return { clip: stageClip };
  },
  // The camera holding a route that crosses the map. Picked one at a time,
  // settling between, exactly as a player builds it.
  'route-fits-lateral': async (page) => {
    await page.evaluate(async () => {
      const A = window.LEIP_APP;
      const wait = () => new Promise((res) => {
        let i = 0;
        const step = () => (++i >= 40 ? res() : requestAnimationFrame(step));
        requestAnimationFrame(step);
      });
      for (const n of ['Monaco', 'Cannes', 'Barcelona', 'Gibraltar', 'Lateral']) {
        A.pickPort(n);
        await wait();
      }
    });
    await settle(page, 20);
    return { clip: stageClip };
  },
  // Selected against unselected, side by side in one grid — this is the
  // check that the dark-navy fill actually lands on the tile, which the
  // smoke test's element stub cannot see.
  'panel-activities-selected': async (page) => {
    await page.evaluate(() => {
      const A = window.LEIP_APP;
      // Alternate picks so both states are legible in the same shot.
      ['A02', 'A04', 'A07', 'A10', 'A12'].forEach((id) => A.setActivity(id, 1));
      const plan = document.getElementById('plan');
      const el = document.getElementById('activity-list');
      plan.scrollTop = el.offsetTop - plan.offsetTop - 30;
    });
    await settle(page, 6);
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
  // --- evidence for the three rendering fixes ---------------------
  // FIX 1: the yacht STATIONARY at a berth. Athens was the reported case —
  // it sat on the Attic coast. Zoomed in close enough that the hull and the
  // shoreline are both legible.
  'berth-athens': async (page) => {
    await page.evaluate(() => {
      const A = window.LEIP_APP;
      ['Athens', 'Livadia'].forEach((n) => A.pickPort(n));
      A.simulate();
      // Hold the clock inside the opening dwell, before she leaves Athens.
      for (let i = 0; i < 40 && A.getState().playT < 3; i++) A.tick(0.1);
      // Centre on the hull itself, not the port marker — the berth lies
      // offshore, which is the whole point of the fix.
      A.debugPause();                       // hold the clock and the camera
      const y = A.debugYacht();
      A.debugView({ at: [y.x, y.z], zoom: 60 });
    });
    await settle(page);
    return { clip: stageClip };
  },
  // FIX 2: yacht UNDER WAY with the passage plot beneath the hull. Held
  // mid-leg on a long straight run so the line passes under the whole boat.
  'yacht-over-route': async (page) => {
    await page.evaluate(() => {
      const A = window.LEIP_APP;
      ['Monaco', 'Calvi'].forEach((n) => A.pickPort(n));
      A.simulate();
      for (let i = 0; i < 4000 && A.getState().phase === 'playback' &&
                      A.getState().playT < 40; i++) A.tick(0.25);
      const y = A.getState().sim ? A.debugYacht() : null;
      A.debugView(y ? { at: [y.x, y.z], zoom: 'max' } : { zoom: 'max' });
    });
    await settle(page);
    return { clip: stageClip };
  },
  // FIX 3: a leg that used to clip. Bonifacio -> Porto Vecchio runs the
  // Strait of Bonifacio and then up a tight lee shore; it is also the leg
  // that proved 3.6 nm of lane clearance closes the strait entirely.
  'strait-of-bonifacio': async (page) => {
    await page.evaluate(() => {
      const A = window.LEIP_APP;
      A.debugRoute(['Porto Cervo', 'Bonifacio', 'Porto Vecchio']);
      A.debugView({ focus: ['Bonifacio', 'Porto Vecchio'] });
    });
    await settle(page);
    return { clip: stageClip };
  },
  // --- the water/wake atmosphere pass ------------------------------
  // Sea at rest: open water with the swell banding and the drifting glint.
  // Deliberately away from land so nothing but the sea is in frame.
  'sea-at-rest': async (page) => {
    await page.evaluate(() => {
      window.LEIP_APP.debugView({ focus: ['Eivissa', 'Palma', "Port d'Andratx"], zoom: 340 });
    });
    await settle(page, 40);
    return { clip: stageClip };
  },
  // Under way with the wake: laid down at the real frame cadence, then the
  // clock is frozen so the shutter catches the V instead of its ashes.
  'wake-underway': async (page) => {
    await page.evaluate(() => {
      const A = window.LEIP_APP;
      A.setSpeed('fast');                       // the stronger of the two wakes
      ['Monaco', 'Calvi'].forEach((n) => A.pickPort(n));
      A.simulate();
      for (let i = 0; i < 400 && A.getState().phase === 'playback' &&
                      !A.debugYacht().moving; i++) A.tick(0.25);
      for (let i = 0; i < 3; i++) A.tick(0.25);
      for (let i = 0; i < 80; i++) A.tick(0.0167);   // lay wake at frame cadence
      A.debugPause();
      const y = A.debugYacht();
      A.debugView({ at: [y.x, y.z], zoom: 'max' });
    });
    await settle(page, 12);
    return { clip: stageClip };
  },
  // Close on the hull under way. This is the shot that shows there is
  // nothing ahead of the bow any more: wake astern, clear water forward.
  'yacht-no-bow-box': async (page) => {
    await page.evaluate(() => {
      const A = window.LEIP_APP;
      A.setSpeed('fast');
      ['Monaco', 'Calvi'].forEach((n) => A.pickPort(n));
      A.simulate();
      for (let i = 0; i < 400 && A.getState().phase === 'playback' &&
                      !A.debugYacht().moving; i++) A.tick(0.25);
      for (let i = 0; i < 3; i++) A.tick(0.25);
      for (let i = 0; i < 80; i++) A.tick(0.0167);
      A.debugPause();
      const y = A.debugYacht();
      A.debugView({ at: [y.x, y.z], zoom: 'max' });
    });
    await settle(page, 12);
    // minDist is 90 — the closest the game ever lets the player get — and
    // at that distance the hull is only ~70px of a 3200px frame. So this
    // CROPS to her rather than zooming past the game's own limit: the shot
    // has to be able to show that the water ahead of the stem is empty.
    const box = await page.evaluate(() => {
      const A = window.LEIP_APP;
      const p = A.debugYachtScreen();
      return p && { x: p.x - 90, y: p.y - 70, width: 180, height: 140 };
    });
    return { clip: box || stageClip };
  },
  // At anchor: the hull breathing on the swell rather than frozen. Athens,
  // because its berth is well out into the Saronic Gulf, so the hull is
  // unambiguously on open water rather than tucked against a headland.
  'yacht-at-anchor': async (page) => {
    await page.evaluate(() => {
      const A = window.LEIP_APP;
      ['Athens', 'Livadia'].forEach((n) => A.pickPort(n));
      A.simulate();
      for (let i = 0; i < 40 && A.getState().playT < 3; i++) A.tick(0.1);
      A.debugPause();
      const y = A.debugYacht();
      A.debugView({ at: [y.x, y.z], zoom: 'max' });
    });
    await settle(page, 12);
    return { clip: stageClip };
  },
  // --- the sky pass: one clock, four times of day -------------------
  // Scene tints are centred on local 6 / 11 / 19 / 22, and the charter
  // starts at local 8, so these are sim hours 22 / 3 / 11 / 14. The same
  // hour drives the tint, the light direction and the glitter path.
  ...timeOfDay(),
  // Cloud shadows crossing open water, at midday where the contrast
  // between lit sea and shadowed sea is clearest.
  'cloud-shadows': async (page) => {
    await page.evaluate(() => {
      const A = window.LEIP_APP;
      ['Eivissa', 'Palma'].forEach((n) => A.pickPort(n));
      A.simulate();
      A.debugHour(3);
      A.debugPause();
      A.debugView({ focus: ['Eivissa', 'Palma', "Port d'Andratx"], zoom: 260 });
    });
    await settle(page, 12);
    return { clip: stageClip };
  },
  // The opening view: a stated Mediterranean rectangle, not the bounding
  // box of the port list. This is what the game boots to.
  'home-view': async (page) => {
    await settle(page, 12);
    return { clip: stageClip };
  },
  // The pan limit, which every port must sit inside — including the ones
  // outside the opening view. Lateral is up in the Channel.
  'full-extent': async (page) => {
    await page.evaluate(() => window.LEIP_APP.debugView({ zoom: 'min' }));
    await settle(page, 14);
    return { clip: stageClip };
  },
  // Zoomed fully out the frame is wider than the stage, so the western
  // ports the expansion added — Gibraltar, Casablanca, Barcelona — sit
  // behind the planning panel until the player pans. This is that pan.
  'full-extent-west': async (page) => {
    await page.evaluate(() => window.LEIP_APP.debugView({ zoom: 'min', pan: [-400, 0] }));
    await settle(page, 14);
    return { clip: stageClip };
  },
  // The easter egg itself, and the Atlantic lane that reaches it.
  'lateral-route': async (page) => {
    await page.evaluate(() => {
      window.LEIP_APP.debugRoute(['Monaco', 'Gibraltar', 'Lateral']);
      window.LEIP_APP.debugView({ zoom: 'min' });
    });
    await settle(page, 14);
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

// ---------------------------------------------------------------- mobile
// A phone viewport, so the bottom-sheet layout is the one under test. The
// shots below are the only ones that use it; everything else stays on the
// desktop viewport so the two layouts are never confused for each other.
const PHONE = { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true,
                hasTouch: true };
const phoneShots = {
  // The corrected Union Flag, beside the ports that carry it.
  'm-uk-flag': async (page) => {
    await page.evaluate(() => {
      const A = window.LEIP_APP;
      A.setSheetMinimised(false);
      const plan = document.getElementById('plan');
      const el = plan.querySelector('[data-port="Gibraltar"]');
      el.scrollIntoView({ block: 'center' });
    });
    await settle(page, 6);
    return { clip: await page.locator('#plan').boundingBox() };
  },
  // The HUD carrying the worst case in the port list: the longest leg
  // there is, a full time string and HYBRID mode.
  'm-hud-long-leg': async (page) => {
    await page.evaluate(() => {
      const A = window.LEIP_APP;
      A.setSheetMinimised(true);
      A.setSpeed('fast');
      ['Saint-Jean-Cap-Ferrat', 'Lateral'].forEach((n) => A.pickPort(n));
      A.simulate();
      for (let i = 0; i < 400 && A.getState().phase === 'playback' &&
                      !A.debugYacht().moving; i++) A.tick(0.25);
      for (let i = 0; i < 60; i++) A.tick(0.25);
      A.debugPause();
    });
    await settle(page, 8);
    return {};
  },
  // What the game opens to on a phone: the dense Med cluster, ports big
  // enough to tap.
  'm-default-zoom': async (page) => {
    await settle(page, 14);
    return {};
  },
  // (a) Planning, sheet minimised: map + the PLAN sheet resting on the
  // fixed action bar, and NO stats HUD — there is no telemetry yet.
  'm-plan-minimised': async (page) => {
    await page.evaluate(() => {
      const A = window.LEIP_APP;
      ['Monaco', 'Calvi'].forEach((n) => A.pickPort(n));
      A.setSheetMinimised(true);
    });
    await settle(page, 14);
    return {};
  },
  // (b) Planning, sheet expanded: the list slid up over the map, buttons
  // still pinned at the bottom.
  'm-plan-expanded': async (page) => {
    await page.evaluate(() => {
      const A = window.LEIP_APP;
      A.setSheetMinimised(false);
      ['Monaco', 'Calvi'].forEach((n) => A.pickPort(n));
    });
    await settle(page, 12);
    return {};
  },
  // (c) Simulation: the HUD appears above the bar with live telemetry.
  'm-simulating': async (page) => {
    await page.evaluate(() => {
      const A = window.LEIP_APP;
      A.setSpeed('fast');
      ['Monaco', 'Calvi'].forEach((n) => A.pickPort(n));
      A.simulate();
      for (let i = 0; i < 400 && A.getState().phase === 'playback' &&
                      !A.debugYacht().moving; i++) A.tick(0.25);
      for (let i = 0; i < 50; i++) A.tick(0.25);
      A.debugPause();
    });
    await settle(page, 10);
    return {};
  },
  'm-sheet-expanded': async (page) => {
    await page.evaluate(() => {
      const A = window.LEIP_APP;
      A.setSheetMinimised(false);
      ['Monaco', 'Calvi'].forEach((n) => A.pickPort(n));
    });
    await settle(page, 12);
    return {};
  },
  // The HUD's width, in two states that used to produce two widths:
  // nothing picked (all dashes) and mid-charter (a long leg, HYBRID, a
  // full clock). The shots are captioned with the measured width so the
  // pair is checkable rather than merely comparable by eye.
  'm-hud-empty': async (page) => {
    const w = await page.evaluate(() =>
      Math.round(document.getElementById('titleblock').getBoundingClientRect().width));
    console.log(`    titleblock width, nothing picked: ${w}px`);
    await settle(page, 6);
    return { clip: await page.locator('#titleblock').boundingBox() };
  },
  'm-hud-running': async (page) => {
    const w = await page.evaluate(() => {
      const A = window.LEIP_APP;
      ['Port d\'Andratx', 'Saint-Jean-Cap-Ferrat'].forEach((n) => A.pickPort(n));
      A.simulate();
      for (let i = 0; i < 400 && A.getState().phase === 'playback' &&
                      !A.debugYacht().moving; i++) A.tick(0.25);
      for (let i = 0; i < 40; i++) A.tick(0.25);
      A.debugPause();
      return Math.round(document.getElementById('titleblock').getBoundingClientRect().width);
    });
    console.log(`    titleblock width, mid-charter:    ${w}px`);
    await settle(page, 8);
    return { clip: await page.locator('#titleblock').boundingBox() };
  },
  'm-sheet-minimised': async (page) => {
    await page.evaluate(() => {
      const A = window.LEIP_APP;
      ['Monaco', 'Calvi'].forEach((n) => A.pickPort(n));
      A.setSheetMinimised(true);
    });
    await settle(page, 14);
    return {};
  },
  // The sheet caught HALF WAY DOWN, mid-gesture: pointer down on the PLAN
  // bar, moved, and not yet released, so the sheet is following the finger
  // and has not snapped to either state.
  'm-sheet-dragging': async (page) => {
    const bar = await page.locator('#sheet-grip').boundingBox();
    await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
    await page.mouse.down();
    // Several small steps rather than one jump: a real gesture, and slow
    // enough that the release would settle by position rather than flick.
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2 + i * 28);
      await page.waitForTimeout(40);
    }
    await settle(page, 4);
    const shot = {};                      // full frame, pointer still down
    await page.screenshot({ path: 'shots/m-sheet-dragging.png' });
    await page.mouse.up();
    return shot;
  },
  // The header, where the info button used to sit short and low against
  // the two tall buttons beside it.
  'm-header': async (page) => {
    await settle(page, 4);
    return { clip: await page.locator('#topbar').boundingBox() };
  }
};
Object.assign(shots, phoneShots);
const isPhoneShot = (name) => Object.prototype.hasOwnProperty.call(phoneShots, name);

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
  const page = await browser.newPage(isPhoneShot(name)
    ? { viewport: { width: PHONE.width, height: PHONE.height },
        deviceScaleFactor: PHONE.deviceScaleFactor,
        isMobile: PHONE.isMobile, hasTouch: PHONE.hasTouch }
    : { viewport: VIEW, deviceScaleFactor: 2 });
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
  // The landing screen covers the chart on every open. Every shot but the
  // landing one is of the game behind it, so dismiss it exactly as the
  // player's button does; the shots that want it re-open it themselves.
  await page.evaluate(() => window.LEIP_APP.showLanding(false));
  stageClip = await page.locator('#stage-wrap').boundingBox();
  const opts = (await shots[name](page)) || {};
  await page.screenshot({ path: join(OUT, `${name}.png`), ...opts });
  console.log(`${name}.png${errors.length ? `   PAGE ERRORS: ${errors.slice(0, 3).join(' | ')}` : ''}`);
  await page.close();
}
await browser.close();
