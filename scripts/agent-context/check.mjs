import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const budgets = {
  'CLAUDE.md': 6000,
  'DESIGN.md': 18000,
  'docs/agent-context/README.md': 6500,
};
export const references = [
  'docs/agent-context/providers.md',
  'docs/agent-context/research.md',
  'docs/agent-context/EVALS.md',
  'docs/agent-context/RESULTS.md',
  'docs/design-system/DETAILS.md',
];
export function evaluate(root) {
  const errors = [];
  const sizes = {};
  for (const [file, limit] of [
    ...Object.entries(budgets),
    ...references.map(file => [file, Infinity]),
  ]) {
    const path = resolve(root, file);
    if (!existsSync(path)) {
      errors.push(`missing: ${file}`);
      continue;
    }
    const text = readFileSync(path, 'utf8');
    sizes[file] = Buffer.byteLength(text);
    if (sizes[file] > limit)
      errors.push(`${file}: ${sizes[file]} bytes exceeds ${limit}`);
    for (const [, target] of text.matchAll(/\[[^\]\n]*\]\(([^)]+)\)/g)) {
      if (/^(https?:|#)/.test(target)) continue;
      const local = target.split('#')[0];
      if (local && !existsSync(resolve(dirname(path), local)))
        errors.push(`${file}: broken link ${target}`);
    }
  }
  for (const file of ['AGENTS.md', 'CLAUDE.md']) {
    if (!existsSync(resolve(root, file))) errors.push(`missing: ${file}`);
  }
  if (
    ['AGENTS.md', 'CLAUDE.md'].every(p => existsSync(resolve(root, p))) &&
    realpathSync(resolve(root, 'AGENTS.md')) !==
      realpathSync(resolve(root, 'CLAUDE.md'))
  ) {
    errors.push(
      'AGENTS.md must resolve to CLAUDE.md without a second policy copy'
    );
  }
  const routing = resolve(root, '.claude/rules/gstack.md');
  if (
    existsSync(routing) &&
    /gstack version takes precedence|ALWAYS invoke.*FIRST action/.test(
      readFileSync(routing, 'utf8')
    )
  ) {
    errors.push('skill routing overrides task or canon precedence');
  }
  return { ok: errors.length === 0, sizes, errors };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const result = evaluate(process.cwd());
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
}
