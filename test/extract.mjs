// Shared loader: extracts the THEME / DATA / ENGINE (and later APP)
// script blocks verbatim from index.html and executes them in a Node vm
// context — the tested code is byte-for-byte the shipped code.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function readHtml() {
  return readFileSync(join(root, 'index.html'), 'utf8');
}

export function extractBlock(html, id) {
  const re = new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`);
  const m = html.match(re);
  if (!m) throw new Error(`script block #${id} not found in index.html`);
  return m[1];
}

// THEME + DATA + ENGINE in a fresh sandbox.
export function loadEngine(extraSandbox = {}) {
  const html = readHtml();
  const sandbox = { console, ...extraSandbox };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const id of ['leip-theme', 'leip-data', 'leip-engine']) {
    vm.runInContext(extractBlock(html, id), sandbox, { filename: id + '.js' });
  }
  return sandbox;
}

// Full game (adds the APP block); __LEIP_TEST__ suppresses auto-init.
export function loadGame(extraSandbox = {}) {
  const sandbox = loadEngine({ __LEIP_TEST__: true, ...extraSandbox });
  vm.runInContext(extractBlock(readHtml(), 'leip-app'), sandbox, { filename: 'leip-app.js' });
  return sandbox;
}
