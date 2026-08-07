/*
 * build_sealane_correction.mjs
 *
 *   input   leip_distance_model.json  .leg_correction (per-leg ratios)
 *   output  index.html  #leip-leg-correction  ratio table, upper triangle
 *
 * The ratio is symmetric by construction, so only one direction is stored
 * and the accessor normalises the key order. The table is the authority
 * for now; ENGINE.getLegCorrection is the single boundary, so when the
 * game computes the same quantity from its own sea lanes this block and
 * the accessor's body go together and nothing else moves.
 *
 *   node tools/build_sealane_correction.mjs [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const model = JSON.parse(readFileSync(join(ROOT, 'leip_distance_model.json'), 'utf8'));
const src = model.leg_correction;
const pack = JSON.parse(readFileSync(join(ROOT, 'leip_game_data.json'), 'utf8'));

const ports = pack.ports.map((p) => p.port).sort();
const ratio = src.ratio;

// --- integrity, reported loudly: a silent mismatch here would quietly
// --- mis-scale scoring distance for the affected legs.
const missing = ports.filter((p) => !ratio[p]);
if (missing.length) throw new Error(`no correction row for: ${missing.join(', ')}`);
const extra = Object.keys(ratio).filter((p) => !ports.includes(p));
if (extra.length) throw new Error(`correction rows for unknown ports: ${extra.join(', ')}`);

let asym = 0, pairs = 0, below1 = 0;
const vals = [];
for (let i = 0; i < ports.length; i++) {
  for (let j = i + 1; j < ports.length; j++) {
    const a = ports[i], b = ports[j];
    const ab = ratio[a][b], ba = ratio[b][a];
    if (ab === undefined || ba === undefined) throw new Error(`missing pair ${a}|${b}`);
    if (Math.abs(ab - ba) > 1e-9) asym++;
    if (ab < 1) below1++;
    vals.push(ab);
    pairs++;
  }
}
vals.sort((x, y) => x - y);
console.log(`${pairs} unordered pairs over ${ports.length} ports · ${asym} asymmetric · ${below1} below 1.0`);
console.log(`ratio min ${vals[0]} · median ${vals[Math.floor(vals.length / 2)]} · ` +
  `mean ${(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(3)} · max ${vals[vals.length - 1]}`);

// The file also ships sea_nm. Its _stats declare the ratios' basis to be
// the pack's distance matrix, so matrix x ratio is authoritative and any
// sea_nm that disagrees is the file's own great-circle basis differing on
// that pair. Reported, not applied.
if (src.sea_nm) {
  const m = pack.distance_matrix_nm;
  const off = [];
  for (let i = 0; i < ports.length; i++) {
    for (let j = i + 1; j < ports.length; j++) {
      const a = ports[i], b = ports[j];
      const pred = m[a][b] * ratio[a][b], obs = src.sea_nm[a][b];
      if (obs > 0 && Math.abs(pred - obs) / obs > 0.10) off.push({ a, b, pred, obs });
    }
  }
  off.sort((x, y) => Math.abs(y.pred - y.obs) / y.obs - Math.abs(x.pred - x.obs) / x.obs);
  console.log(`\n${off.length} pairs where matrix x ratio differs from the file's sea_nm by >10%:`);
  for (const o of off.slice(0, 8)) {
    console.log(`  ${o.a} <-> ${o.b}: matrix x ratio ${o.pred.toFixed(1)} nm vs sea_nm ${o.obs.toFixed(1)} nm`);
  }
  if (off.length > 8) console.log(`  (+${off.length - 8} more)`);
}

// --- poster half of the model. published_nm is authoritative and is what
// --- the game outputs; computed_nm and charter_factor are the file's own
// --- working and are NOT used. Reconciled here so any drift is visible.
if (model.poster_routes) {
  const m = pack.distance_matrix_nm;
  console.log('\nPoster routes — published_nm (authoritative) vs the file\'s own working:');
  const drift = [];
  for (const [id, pr] of Object.entries(model.poster_routes)) {
    const sheet = pack.poster_routes.find((p) => p.id === id);
    if (!sheet) throw new Error(`poster ${id} is not in the data pack`);
    if (JSON.stringify(sheet.ports) !== JSON.stringify(pr.ports)) {
      throw new Error(`poster ${id}: port sequence differs from the data pack`);
    }
    if (sheet.nm !== pr.published_nm) {
      throw new Error(`poster ${id}: published_nm ${pr.published_nm} != pack nm ${sheet.nm}`);
    }
    let corrected = 0;
    for (let i = 0; i + 1 < pr.ports.length; i++) {
      const a = pr.ports[i], b = pr.ports[i + 1];
      corrected += m[a][b] * ratio[a][b];
    }
    const off = Math.abs(corrected - pr.computed_nm) / pr.computed_nm > 0.02;
    if (off) drift.push(id);
    console.log(`  ${id.padEnd(11)} published ${String(pr.published_nm).padStart(4)} nm · ` +
      `this model's legs ${corrected.toFixed(1).padStart(6)} nm · ` +
      `file's computed_nm ${String(pr.computed_nm).padStart(6)} nm${off ? '  <- disagree' : ''}`);
  }
  if (drift.length) {
    console.log(`  NOTE: computed_nm disagrees with this file's own leg_correction on ` +
      `${drift.join(', ')} — so charter_factor is unreliable on those rows. Unused: the ` +
      `game takes published_nm whole.`);
  }
}

const CT = '<' + '/script>';
const rows = [];
for (let i = 0; i < ports.length; i++) {
  const a = ports[i];
  const cells = [];
  for (let j = i + 1; j < ports.length; j++) cells.push(`${JSON.stringify(ports[j])}:${ratio[a][ports[j]]}`);
  if (cells.length) rows.push(`    ${JSON.stringify(a)}: {${cells.join(',')}}`);
}

const block = `<script id="leip-leg-correction">
/* GENERATED by tools/build_sealane_correction.mjs — do not edit by hand.
   Source: leip_distance_model.json .leg_correction, applied to the pack's
   distance matrix (${src._stats.basis}).
   Per-leg sea-lane correction: the factor by which the navigable distance
   between two ports exceeds the point-to-point distance. Symmetric, so
   only the upper triangle is stored; ENGINE.getLegCorrection normalises
   key order and is the ONLY reader. ${pairs} pairs, long-leg median ${src._stats.long_leg_median}, max ${src._stats.max}.
   NOT encoded: traffic separation schemes, depth, local routing rules. */
globalThis.LEIP_LEG_CORRECTION = {
  stats: ${JSON.stringify(src._stats)},
  ratio: {
${rows.join(',\n')}
  }
};
${CT}`;

if (process.argv.includes('--write')) {
  const htmlPath = join(ROOT, 'index.html');
  let html = readFileSync(htmlPath, 'utf8');
  const re = /<script id="leip-leg-correction">[\s\S]*?<\/script>/;
  if (re.test(html)) html = html.replace(re, block);
  else html = html.replace('<script id="leip-data">', block + '\n\n<script id="leip-data">');
  writeFileSync(htmlPath, html);
  console.log(`\nwrote #leip-leg-correction (${(block.length / 1024).toFixed(0)} KB) into index.html`);
} else {
  console.log(`\n(dry run — pass --write; block is ${(block.length / 1024).toFixed(0)} KB)`);
}
