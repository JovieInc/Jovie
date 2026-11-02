#!/usr/bin/env node
// Generator for scripts/agent-context/design-sections.json: the sha256 of each
// DESIGN.md / docs/design-system/DETAILS.md section (links normalized). Nobody
// hand-edits these hashes. A section that disappears still fails: the
// generator rebinds hashes for headings that exist, never invents or drops one.
// Usage: node scripts/agent-context/design-sections.mjs [--write]
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = resolve(root, 'scripts/agent-context/design-sections.json');
const normalize = s => s.replace(/\]\([^)]*\)/g, '](link)').trim();
const hash = s => createHash('sha256').update(normalize(s)).digest('hex');

export const SOURCES = ['DESIGN.md', 'docs/design-system/DETAILS.md'];

/**
 * Each entry pins the file that owns the section. Hashes are rebound only
 * within that file; a legacy entry without `source` is bound to the file whose
 * section still matches its recorded hash.
 */
export function regenerate(baseline, texts) {
  const find = (text, heading) =>
    text.split(/(?=^## )/m).find(s => s.split('\n', 1)[0].trim() === heading);
  return baseline.map(({ heading, sha256, source }) => {
    let index = SOURCES.indexOf(source);
    if (index < 0) {
      index = texts.findIndex(text => {
        const section = find(text, heading);
        return section && hash(section) === sha256;
      });
    }
    if (index < 0) {
      throw new Error(`${heading}: cannot bind to a source file; set "source"`);
    }
    const section = find(texts[index], heading);
    if (!section) throw new Error(`design section removed: ${heading}`);
    return { heading, source: SOURCES[index], sha256: hash(section) };
  });
}

if (process.argv[1] === import.meta.filename) {
  const baseline = JSON.parse(readFileSync(FILE, 'utf8'));
  const next = regenerate(
    baseline,
    SOURCES.map(f => readFileSync(resolve(root, f), 'utf8'))
  );
  const text = `${JSON.stringify(next, null, 2)}\n`;
  if (process.argv.includes('--write')) writeFileSync(FILE, text);
  else if (text !== readFileSync(FILE, 'utf8')) {
    console.error('design-sections.json is stale; run with --write');
    process.exitCode = 1;
  }
}
