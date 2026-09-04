/** JOV-5973 path death. Needle split so this file is not a citation. */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../../..');
const DEAD = ['scripts', 'hermes'].join('/');
const CLI = `${DEAD}-cli`;
const SKIP = new Set(
  '.git,node_modules,.next,dist,build,__pycache__,.turbo'.split(',')
);

function citations(root) {
  const hits = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let ents;
    try {
      ents = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      if (e.isDirectory()) {
        if (!SKIP.has(e.name)) stack.push(join(dir, e.name));
        continue;
      }
      if (!e.isFile()) continue;
      const full = join(dir, e.name);
      const rel = relative(root, full).replaceAll('\\', '/');
      if (rel === 'CHANGELOG.md') continue;
      let text;
      try {
        if (statSync(full).size > 2e6) continue;
        text = readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      if (!text.includes(DEAD)) continue;
      for (const [i, line] of text.split('\n').entries()) {
        if (line.includes(DEAD) && !line.includes(CLI))
          hits.push(`${rel}:${i + 1}`);
      }
    }
  }
  return hits;
}

describe('JOV-5973 path death', () => {
  it('retires the old package path', () => {
    expect(existsSync(join(ROOT, 'scripts', 'hermes'))).toBe(false);
    expect(existsSync(join(ROOT, 'scripts', 'symphony'))).toBe(true);
    expect(citations(ROOT)).toEqual([]);
  });
});
