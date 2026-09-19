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

export const webRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);
export const repoRoot = path.resolve(webRoot, '..', '..');
export const CHANGED_WEB_PATHSPECS = Object.freeze([
  'apps/web/**/*.tsx',
  'apps/web/**/*.ts',
]);

function isProductionWebTs(file) {
  return (
    file.startsWith('apps/web/') &&
    (file.endsWith('.tsx') || file.endsWith('.ts')) &&
    !file.includes('/tests/') &&
    !file.includes('.test.') &&
    !file.includes('.stories.') &&
    !file.includes('/__tests__/fixtures/shadcn-lint/invalid/') &&
    !file.includes('/__tests__/fixtures/shadcn-lint/enrollment/')
  );
}

export function changedWebTsx({
  repoRoot: root = repoRoot,
  webRoot: web = webRoot,
  event = process.env.GITHUB_EVENT_NAME || '',
  baseRef = process.env.GITHUB_BASE_REF || 'main',
  turboBase = process.env.TURBO_SCM_BASE,
  diffBase,
  head = 'HEAD',
} = {}) {
  let resolvedBase = diffBase;
  if (!resolvedBase) {
    resolvedBase = 'HEAD^1';
    if (event === 'pull_request') {
      const probe = spawnSync(
        'git',
        ['rev-parse', '--verify', `origin/${baseRef}`],
        {
          cwd: root,
          encoding: 'utf8',
        }
      );
      resolvedBase = probe.status === 0 ? `origin/${baseRef}` : resolvedBase;
    } else if (turboBase) {
      resolvedBase = turboBase;
    }
  }
  const result = spawnSync(
    'git',
    [
      'diff',
      '--diff-filter=ACMRT',
      '--name-only',
      resolvedBase,
      head,
      '--',
      ...CHANGED_WEB_PATHSPECS,
    ],
    { cwd: root, encoding: 'utf8' }
  );
  if (result.status !== 0) return null;
  return result.stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(isProductionWebTs)
    .map(file => path.relative(web, path.join(root, file)));
}

async function main() {
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
    const rel = path
      .relative(webRoot, result.filePath)
      .split(path.sep)
      .join('/');
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
}

const entry = process.argv[1];
if (entry && path.resolve(entry) === fileURLToPath(import.meta.url)) {
  await main();
}
