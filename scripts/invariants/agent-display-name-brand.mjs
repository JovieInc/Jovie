#!/usr/bin/env node
/**
 * JOV-3121 brand guard, runnable without pnpm install. Mirrors
 * apps/web/tests/unit/brand/agent-display-name.test.ts (which only ran in the
 * merge group and failed every group when main carried a leak, 2026-11-01).
 * Forbidden patterns are read from apps/web/lib/brand/agent-display-name.ts so
 * there is one source. Usage: node scripts/invariants/agent-display-name-brand.mjs [repoRoot]
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOTS = ['app', 'components', 'content', 'lib', 'constants'];
const EXTS = new Set(['.ts', '.tsx', '.md', '.mdx', '.json']);
const EXCLUDED = new Set(['lib/brand/agent-display-name.ts']);

export function forbiddenPatterns(source) {
  const block = /FORBIDDEN_USER_VISIBLE_AGENT_BRANDS\s*=\s*\[([\s\S]*?)\]/.exec(
    source
  );
  if (!block) throw new Error('FORBIDDEN_USER_VISIBLE_AGENT_BRANDS not found');
  return [...block[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
}

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (EXTS.has(path.extname(p))) yield p;
  }
}

export function findLeaks(repoRoot) {
  const web = path.join(repoRoot, 'apps/web');
  const patterns = forbiddenPatterns(
    readFileSync(path.join(web, 'lib/brand/agent-display-name.ts'), 'utf8')
  );
  const leaks = [];
  for (const root of ROOTS) {
    for (const file of walk(path.join(web, root))) {
      const rel = path.relative(web, file);
      if (EXCLUDED.has(rel)) continue;
      const text = readFileSync(file, 'utf8');
      for (const pat of patterns)
        if (text.includes(pat)) leaks.push(`${rel}: ${pat}`);
    }
  }
  return leaks;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(
    process.argv[2] ??
      path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
  );
  const leaks = findLeaks(root);
  if (leaks.length) {
    console.error(
      `agent-display-name-brand: forbidden wording (JOV-3121):\n${leaks.join('\n')}`
    );
    process.exit(1);
  }
  console.log('agent-display-name-brand: clean');
}
