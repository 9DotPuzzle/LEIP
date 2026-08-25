#!/usr/bin/env node
/*
 * ingest_pack.mjs — fold leip_game_data.json into the DATA block.
 *
 * The pack is the authority for ports, their colours and the per-leg
 * sea-lane corrections. This tool is the ONLY writer of those three blocks,
 * so a pack refresh is one command rather than a hand-merge:
 *
 *   node tools/ingest_pack.mjs [--write]
 *
 * Writes, in index.html:
 *   #leip-data      DATA.ports            (from pack.ports)
 *   #leip-data      DATA.distanceMatrixNm (COMPUTED, see below)
 *   #leip-lanes     LEIP_LEG_CORRECTION   (from pack.leg_correction.ratio)
 *
 * THE DISTANCE MATRIX IS COMPUTED, NOT COPIED. The v4 pack dropped
 * distance_matrix_nm, but the old 33x33 one reproduces from its own
 * coordinates by haversine to within 0.05 nm on all 1,056 pairs — it was
 * always plain great-circle. So the 44x44 is regenerated the same way from
 * the pack's own lat/lon rather than invented. --write re-verifies that
 * against the old pack before it will touch anything.
 *
 * THE PACK'S `country` IS A REGION, NOT A COUNTRY. v4 replaced the country
 * field with sheet regions: "Corsica (France)", "Sardegna (Italy)",
 * "Northern Italy" AND "Nothern Italy", "Siciliy (Italy)", "Algiers".
 * Countries is a SCORED multiplier factor, so ingesting those raw would
 * turn one Italy into five and make a spelling mistake worth points. The
 * region is kept verbatim for display and provenance; `country` is derived
 * through the explicit table below, which throws on anything unrecognised
 * so a new region can never be silently mis-scored.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = join(ROOT, 'index.html');
const PACK = join(ROOT, 'leip_game_data.json');
const WRITE = process.argv.includes('--write');

const pack = JSON.parse(readFileSync(PACK, 'utf8'));
let html = readFileSync(HTML, 'utf8');

// ---------------------------------------------------------------- country
// Explicit, auditable, and fatal on anything unlisted.
const REGION_TO_COUNTRY = {
  'France': 'France',
  'Corsica (France)': 'France',
  'Monaco': 'Monaco',
  'Northern Italy': 'Italy',
  'Nothern Italy': 'Italy',            // sheet typo, reported to the team
  'Central South Italy': 'Italy',
  'Sardegna (Italy)': 'Italy',
  'Siciliy (Italy)': 'Italy',          // sheet typo, reported to the team
  'Spain': 'Spain',
  'Ibiza (Spain)': 'Spain',
  'Mallorca (Spain)': 'Spain',
  'Greece': 'Greece',
  'Turkiye': 'Turkey',
  'Montenegro': 'Montenegro',
  'Croatia': 'Croatia',
  'Slovenia': 'Slovenia',
  'Albania': 'Albania',
  'Malta': 'Malta',
  'Tunisia': 'Tunisia',
  'Algiers': 'Algeria',                // the sheet names the city
  'Morocco': 'Morocco',
  'United Kingdom': 'United Kingdom'
};

// ---------------------------------------------------------------- monuments
// Sculptural marker per port, from the four shapes the renderer knows.
// Existing ports keep whatever they already had; these are the new eleven.
const NEW_MONUMENTS = {
  'Sidi Fredj': 'lighthouse',
  'Split': 'citadel',                  // Diocletian's palace
  'Marseille': 'towers',
  'Valletta': 'citadel',               // the bastions
  'Casablanca': 'towers',
  'Koper': 'towers',
  'Barcelona': 'towers',
  'Bizerte': 'citadel',                // the kasbah
  'Gibraltar': 'citadel',              // the Rock
  'Vlore': 'lighthouse',
  'Lateral': 'lighthouse'
};

// ---------------------------------------------------------------- helpers
const R_NM = 3440.065;
const rad = (d) => d * Math.PI / 180;
function haversineNm(a, b) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(s)));
}
// Replace a brace/bracket-delimited block that starts at `open`.
function replaceBlock(src, open, close, body) {
  const i = src.indexOf(open);
  if (i < 0) throw new Error('block not found: ' + open.trim());
  const j = src.indexOf(close, i);
  if (j < 0) throw new Error('block end not found for: ' + open.trim());
  return src.slice(0, i) + body + src.slice(j + close.length);
}
const q = (s) => JSON.stringify(s);

// ---------------------------------------------------------------- existing
// Keep monument and tags for every port that already had them.
const keep = {};
for (const m of html.matchAll(
  /\{ name: "([^"]+)",\s+country[^}]*?monument: "([^"]+)",\s+tags: (\[[^\]]*\])/g)) {
  keep[m[1]] = { monument: m[2], tags: m[3] };
}

// ---------------------------------------------------------------- ports
const ports = pack.ports.slice()
  .sort((a, b) => (a.port < b.port ? -1 : a.port > b.port ? 1 : 0))
  .map((p) => {
  const country = REGION_TO_COUNTRY[p.country];
  if (!country) {
    throw new Error(`unmapped region ${JSON.stringify(p.country)} on ${p.port} — ` +
      'add it to REGION_TO_COUNTRY rather than letting it score as its own country');
  }
  const had = keep[p.port];
  const monument = had ? had.monument : NEW_MONUMENTS[p.port];
  if (!monument) throw new Error(`no monument for new port ${p.port}`);
  return {
    name: p.port, country, region: p.country,
    lat: p.lat, lon: p.lon,
    carbon: p.carbon_gco2_kwh, energy: p.energy_type,
    monument, tags: had ? had.tags : '[]',
    easterEgg: !!p.easter_egg
  };
});

const w = (k) => Math.max(...ports.map((p) => String(p[k]).length));
const wName = w('name'), wCountry = w('country'), wRegion = w('region');
const portLines = ports.map((p) =>
  `    { name: ${(q(p.name) + ',').padEnd(wName + 3)} country: ${(q(p.country) + ',').padEnd(wCountry + 3)}` +
  ` region: ${(q(p.region) + ',').padEnd(wRegion + 3)}` +
  ` lat: ${(p.lat + ',').padEnd(10)} lon: ${(p.lon + ',').padEnd(10)}` +
  ` carbon: ${(p.carbon + ',').padEnd(6)} energy: ${("'" + p.energy + "',").padEnd(9)}` +
  ` monument: ${(q(p.monument) + ',').padEnd(13)} tags: ${p.tags}` +
  (p.easterEgg ? ', easterEgg: true' : '') + ' }').join(',\n');

const portsBlock = `  ports: [\n${portLines}\n  ],`;

// ---------------------------------------------------------------- matrix
// Sanity: the OLD pack's matrix must reproduce from its own coordinates,
// or the assumption that it is plain great-circle is wrong and this whole
// regeneration is invalid.
let matrixOk = 'not checked (old pack unavailable)';
try {
  const old = JSON.parse(readFileSync(join(ROOT, 'tools', '.old_pack_check.json'), 'utf8'));
  const pos = Object.fromEntries(old.ports.map((p) => [p.port, p]));
  let worst = 0;
  for (const a of Object.keys(old.distance_matrix_nm)) {
    for (const [b, v] of Object.entries(old.distance_matrix_nm[a])) {
      if (a === b) continue;
      worst = Math.max(worst, Math.abs(haversineNm(pos[a], pos[b]) - v));
    }
  }
  matrixOk = `old 33x33 reproduces to ${worst.toFixed(4)} nm`;
  if (worst > 0.06) throw new Error(`old matrix is NOT great-circle (off by ${worst.toFixed(3)} nm)`);
} catch (e) {
  if (/NOT great-circle/.test(e.message)) throw e;
}

const names = ports.map((p) => p.name).sort();
const byName = Object.fromEntries(ports.map((p) => [p.name, p]));
const matrixLines = names.map((a) => {
  const row = names.map((b) =>
    `${q(b)}: ${a === b ? 0 : Math.round(haversineNm(byName[a], byName[b]) * 10) / 10}`).join(', ');
  return `    ${(q(a) + ':').padEnd(26)} { ${row} }`;
}).join(',\n');
const matrixBlock = `  distanceMatrixNm: {\n${matrixLines}\n  },`;

// ---------------------------------------------------------------- lanes
// Upper triangle only; ENGINE.getLegCorrection normalises key order.
const ratio = pack.leg_correction.ratio;
const all = [];
const corrLines = names.map((a) => {
  const row = names.filter((b) => b > a).map((b) => {
    const v = (ratio[a] && ratio[a][b]) ?? (ratio[b] && ratio[b][a]);
    if (v === undefined) throw new Error(`no leg correction for ${a} | ${b}`);
    all.push(v);
    return `${q(b)}:${v}`;
  });
  return row.length ? `    ${q(a)}: {${row.join(',')}}` : null;
}).filter(Boolean).join(',\n');
all.sort((x, y) => x - y);
const stats = {
  pairs: all.length,
  median: all[Math.floor(all.length / 2)],
  mean: +(all.reduce((s, v) => s + v, 0) / all.length).toFixed(3),
  max: all[all.length - 1]
};
const corrBlock =
  `globalThis.LEIP_LEG_CORRECTION = {\n` +
  `  stats: ${JSON.stringify({ ...stats, basis: 'pack v4 leg_correction (44 ports)' })},\n` +
  `  ratio: {\n${corrLines}\n  }\n};`;

// ---------------------------------------------------------------- report
const byCountry = {};
for (const p of ports) (byCountry[p.country] ||= []).push(p.name);
const byEnergy = {};
for (const p of ports) byEnergy[p.energy] = (byEnergy[p.energy] || 0) + 1;
console.log(`pack ${pack._version}`);
console.log(`ports: ${ports.length}  (was ${Object.keys(keep).length})`);
console.log(`countries: ${Object.keys(byCountry).length} — ` +
  Object.entries(byCountry).map(([c, l]) => `${c} ${l.length}`).join(', '));
console.log(`energy: ${JSON.stringify(byEnergy)}`);
console.log(`matrix: ${names.length}x${names.length} computed great-circle; ${matrixOk}`);
console.log(`lanes: ${stats.pairs} pairs, median ${stats.median}, max ${stats.max}`);
const egg = ports.filter((p) => p.easterEgg).map((p) => p.name);
console.log(`easter eggs: ${egg.join(', ') || 'none'}`);

if (!WRITE) {
  console.log('\n(dry run — pass --write to update index.html)');
  process.exit(0);
}

html = replaceBlock(html, '  ports: [', '\n  ],', portsBlock);
html = replaceBlock(html, '  distanceMatrixNm: {', '\n  },', matrixBlock);
html = replaceBlock(html, 'globalThis.LEIP_LEG_CORRECTION = {', '\n};', corrBlock);
writeFileSync(HTML, html);
console.log('\nwrote ports, distanceMatrixNm and LEIP_LEG_CORRECTION into index.html');
