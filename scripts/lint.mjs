// ============================================================
// scripts/lint.mjs: quick checks that run before every deployment
// (JavaScript syntax, JSON files, and leftover debug code).
// Uses only what ships with Node.js.
// ============================================================

import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

// JavaScript files must parse as modules (sw.js and theme-init.js are plain scripts, which also parse as modules)
const scripts = [
  ...readdirSync(join(root, 'js')).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`),
  'sw.js', 'scripts/build.mjs', 'scripts/lint.mjs',
];
for (const file of scripts) {
  const source = readFileSync(join(root, file), 'utf8');
  const result = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: source, encoding: 'utf8' });
  if (result.status !== 0) problems.push(`${file}: ${result.stderr.split('\n').find((l) => l.includes('Error')) || 'syntax error'}`);
  if (source.includes('debug' + 'ger;')) problems.push(`${file}: contains a debug statement`);
}

// JSON files must be valid
for (const file of ['manifest.webmanifest', 'site.json', 'database.rules.json', '.lighthouserc.json']) {
  try { JSON.parse(readFileSync(join(root, file), 'utf8')); } catch (error) { problems.push(`${file}: ${error.message}`); }
}

if (problems.length) {
  console.error(`Lint found ${problems.length} problem(s):`);
  problems.forEach((p) => console.error(`  - ${p}`));
  process.exit(1);
}
console.log(`Lint ok: ${scripts.length} scripts and 4 JSON files checked.`);
