// Injects the Saira SemiCondensed 400/600 latin subsets (SIL OFL 1.1,
// fonts/LICENSE-SAIRA-OFL.txt) into index.html's #leip-fonts style block
// as base64 data URIs, replacing the /*__SAIRA_FACES__*/ marker (or any
// previously injected faces). Keeps the single-file contract: the only
// companion file is fonts/leip-ocra.woff2.
//
// Usage: node tools/embed_fonts.mjs path/to/saira400.woff2 path/to/saira600.woff2
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [p400, p600] = process.argv.slice(2);
if (!p400 || !p600) {
  console.error('usage: node tools/embed_fonts.mjs <saira-400.woff2> <saira-600.woff2>');
  process.exit(1);
}

const face = (weight, path) => `@font-face {
  font-family: 'Saira SemiCondensed';
  font-style: normal;
  font-weight: ${weight};
  font-display: swap;
  src: url(data:font/woff2;base64,${readFileSync(path).toString('base64')}) format('woff2');
}`;

const block = `/*SAIRA-BEGIN*/\n${face(400, p400)}\n${face(600, p600)}\n/*SAIRA-END*/`;

const htmlPath = join(root, 'index.html');
let html = readFileSync(htmlPath, 'utf8');
if (html.includes('/*__SAIRA_FACES__*/')) {
  html = html.replace('/*__SAIRA_FACES__*/', block);
} else if (/\/\*SAIRA-BEGIN\*\/[\s\S]*?\/\*SAIRA-END\*\//.test(html)) {
  html = html.replace(/\/\*SAIRA-BEGIN\*\/[\s\S]*?\/\*SAIRA-END\*\//, block);
} else {
  console.error('no injection marker found in index.html');
  process.exit(1);
}
writeFileSync(htmlPath, html);
console.log(`injected Saira 400 (${readFileSync(p400).length} B) + 600 (${readFileSync(p600).length} B) into index.html`);
