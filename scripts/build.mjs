// ============================================================
// scripts/build.mjs: assembles the site into dist/ for deployment
//
// Runs automatically inside GitHub Actions (nobody needs to run it by hand).
// It uses only what ships with Node.js, so there is nothing to install.
//
// What it does:
//   1. Checks the 750-question bank (unique ids, four options, valid answer).
//   2. Copies only the public site files into dist/ (never docs, scripts, or workflows).
//   3. Fills in the site address (site.json) and a build id for the offline cache.
//   4. Verifies that every local file the pages refer to really exists.
// A problem in step 1, 3 or 4 stops the build, so a broken site is never published.
// ============================================================

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const problems = [];
const fail = (message) => problems.push(message);

// ---------- 1. Question bank ----------
const { BIBLE_QUESTIONS: questions } = await import(pathToFileURL(join(root, 'js/questions.js')).href);
const seen = new Set();
for (const q of questions) {
  const label = `Question ${q.id}`;
  if (!Number.isInteger(q.id) || seen.has(q.id)) fail(`${label}: id is missing or repeated`);
  seen.add(q.id);
  if (typeof q.question !== 'string' || !q.question.trim()) fail(`${label}: question text is empty`);
  if (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some((o) => typeof o !== 'string' || !o.trim())) fail(`${label}: needs exactly four non-empty options`);
  else if (new Set(q.options).size !== 4) fail(`${label}: two options are identical`);
  if (q.correctIndex !== 0) fail(`${label}: correctIndex must be 0 (the right answer is listed first)`);
  if (typeof q.explanation !== 'string' || !q.explanation.trim()) fail(`${label}: explanation is empty`);
  if (q.category !== undefined && !['bible', 'history'].includes(q.category)) fail(`${label}: unknown category "${q.category}"`);
}
const counts = { bible: 0, history: 0 };
questions.forEach((q) => { counts[q.category || 'bible'] += 1; });
console.log(`Questions: ${questions.length} (Bible ${counts.bible}, Church History ${counts.history})`);

// ---------- 2. Copy the public files ----------
const PUBLIC = [
  'index.html', '404.html', 'favicon.svg', 'favicon.ico', 'manifest.webmanifest',
  'robots.txt', 'sitemap.xml', 'sw.js', 'css', 'js', 'assets',
];
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
for (const item of PUBLIC) {
  if (!existsSync(join(root, item))) { fail(`Missing public file: ${item}`); continue; }
  cpSync(join(root, item), join(dist, item), { recursive: true, filter: (src) => !src.endsWith('README.md') });
}
writeFileSync(join(dist, '.nojekyll'), '');

const listFiles = (dir) => readdirSync(dir).flatMap((name) => {
  const full = join(dir, name);
  return statSync(full).isDirectory() ? listFiles(full) : [full];
});

// ---------- 3. Site address and build id ----------
const site = JSON.parse(readFileSync(join(root, 'site.json'), 'utf8'));
if (!/^https:\/\/[^\s]+\/$/.test(site.url)) fail('site.json: "url" must start with https:// and end with a slash');

const files = listFiles(dist).map((f) => relative(dist, f).split('\\').join('/')).sort();
const hash = createHash('sha256');
files.forEach((f) => hash.update(f).update(readFileSync(join(dist, f))));
const buildId = hash.digest('hex').slice(0, 10);

const precache = files.filter((f) => !['sw.js', '.nojekyll', 'sitemap.xml', 'robots.txt'].includes(f) && !f.endsWith('.txt'));
const replacements = {
  '%SITE_URL%': site.url,
  '/*BUILD_ID*/': `${buildId}-`,
  '/*PRECACHE*/': ['./', ...precache].map((f) => JSON.stringify(f)).join(', '),
};
for (const file of files.filter((f) => /\.(html|xml|txt|js|webmanifest)$/.test(f))) {
  const path = join(dist, file);
  let text = readFileSync(path, 'utf8');
  for (const [token, value] of Object.entries(replacements)) text = text.split(token).join(value);
  writeFileSync(path, text);
}
for (const file of files.filter((f) => /\.(html|xml|txt|js|webmanifest)$/.test(f))) {
  if (readFileSync(join(dist, file), 'utf8').includes('%SITE_URL%')) fail(`${file}: site address was not filled in`);
}

// ---------- 4. Every local reference must exist ----------
const refPattern = /(?:href|src)="([^"#?]+)(?:[?#][^"]*)?"|url\("([^"]+)"\)/g;
for (const file of files.filter((f) => /\.(html|css)$/.test(f))) {
  const base = dirname(join(dist, file));
  const text = readFileSync(join(dist, file), 'utf8');
  for (const match of text.matchAll(refPattern)) {
    const ref = match[1] || match[2];
    if (/^(https?:|mailto:|data:|\/\/)/.test(ref) || ref === './' || ref.startsWith('#')) continue;
    // The 404 page resolves everything against the site address, so test from the root
    const from = file === '404.html' ? dist : base;
    if (!existsSync(resolve(from, ref))) fail(`${file}: refers to "${ref}" but that file does not exist`);
  }
}
const html = readFileSync(join(dist, 'index.html'), 'utf8');
for (const match of html.matchAll(/<use href="#([^"]+)"/g)) {
  if (!html.includes(`id="${match[1]}"`)) fail(`index.html: icon "${match[1]}" is used but not defined`);
}

// ---------- Result ----------
if (problems.length) {
  console.error(`\nBuild stopped. ${problems.length} problem(s) found:`);
  problems.forEach((p) => console.error(`  - ${p}`));
  process.exit(1);
}
console.log(`Build ok: ${files.length} files in dist/ (build ${buildId}), site address ${site.url}`);
