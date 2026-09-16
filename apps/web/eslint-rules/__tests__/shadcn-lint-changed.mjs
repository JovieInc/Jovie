#!/usr/bin/env node
/**
 * Path-aware shadcn/no-restyle probe for changed web TSX files.
 * Forces the shipped rule on so grandfathered files cannot grow counts.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const webRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const repoRoot = path.resolve(webRoot, '..', '..');
const baseline = JSON.parse(
  readFileSync(
    path.join(
      webRoot,
      'tests/unit/design-system/shadcn-no-restyle.baseline.json'
    ),
    'utf8'
  )
);
const options = JSON.parse(
  readFileSync(
    path.join(webRoot, 'eslint-rules/shadcn-no-restyle.options.json'),
    'utf8'
  )
);

function changedWebTsx() {
  const event = process.env.GITHUB_EVENT_NAME || '';
  let diffBase = 'HEAD^1';
  if (event === 'pull_request') {
    const base = process.env.GITHUB_BASE_REF || 'main';
    const probe = spawnSync(
      'git',
      ['rev-parse', '--verify', `origin/${base}`],
      {
        cwd: repoRoot,
        encoding: 'utf8',
      }
    );
    diffBase = probe.status === 0 ? `origin/${base}` : diffBase;
  } else if (process.env.TURBO_SCM_BASE) {
    diffBase = process.env.TURBO_SCM_BASE;
  }
  const result = spawnSync(
    'git',
    [
      'diff',
      '--diff-filter=ACMRT',
      '--name-only',
      diffBase,
      'HEAD',
      '--',
      'apps/web/**/*.tsx',
      'apps/web/**/*.ts',
    ],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  if (result.status !== 0) return null;
  return result.stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(
      file =>
        file.startsWith('apps/web/') &&
        (file.endsWith('.tsx') || file.endsWith('.ts')) &&
        !file.includes('/tests/') &&
        !file.includes('.test.') &&
        !file.includes('.stories.') &&
        !file.includes('/__fixtures__/shadcn-lint/invalid/') &&
        !file.includes('/__fixtures__/shadcn-lint/enrollment/')
    )
    .map(file => path.relative(webRoot, path.join(repoRoot, file)));
}

const files = changedWebTsx();
if (files === null) {
  console.error('shadcn-lint-changed: unreadable git diff; fail closed');
  process.exit(1);
}
if (files.length === 0) {
  console.log('shadcn-lint-changed: no production web TS files changed');
  process.exit(0);
}

const eslint = new ESLint({
  cwd: webRoot,
  overrideConfigFile: path.join(webRoot, 'eslint.config.js'),
  overrideConfig: {
    rules: {
      'shadcn/no-restyle': ['error', options],
    },
  },
});

const results = await eslint.lintFiles(files);
const errors = [];
for (const result of results) {
  const rel = path.relative(webRoot, result.filePath).split(path.sep).join('/');
  const count = result.messages.filter(
    message => message.ruleId === 'shadcn/no-restyle'
  ).length;
  const allowed = baseline.files[rel] ?? 0;
  if (count > allowed) {
    errors.push(`${rel}: shadcn/no-restyle ${count} > baseline ${allowed}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(
  `shadcn-lint-changed: ${files.length} file(s) within shrink-only baseline`
);
