import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  affectsJovieTypecheck,
  affectsWebTestTypecheck,
} from '../lib/ci-repo-lanes.mjs';

export function selectMqParityScope(files, ciSource) {
  // Reuse the MQ selector itself so prompt/model changes cannot drift out of PR coverage.
  const pattern = /PROMPTFOO_EVAL_PATTERN='([^']+)'/.exec(ciSource)?.[1];
  if (!pattern) throw new Error('MQ Promptfoo path selector is missing');
  const evals = new RegExp(pattern);
  return {
    typecheck: files.some(
      file =>
        affectsJovieTypecheck(file) ||
        affectsWebTestTypecheck(file) ||
        /^(scripts\/ci-fast-lanes\.mjs|scripts\/ci\/mq-parity-|\.github\/workflows\/(?:ci|source-validation)\.yml$)/.test(
          file
        )
    ),
    structural: files.some(file =>
      /^(apps\/web\/|scripts\/|\.github\/|packages\/|(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|turbo\.json)$)/.test(
        file
      )
    ),
    storybook: files.some(file =>
      /^(apps\/web\/|packages\/|scripts\/component-|\.github\/(?:workflows\/(?:ci|source-validation)\.yml$|scripts\/(?:run-storybook-surfaces\.sh|guard-playwright-artifacts\.mjs)$)|(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml)$)/.test(
        file
      )
    ),
    evals: files.some(
      file =>
        evals.test(file) ||
        file === '.github/workflows/source-validation.yml' ||
        file === 'scripts/ci/mq-parity-scope.mjs'
    ),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  const base = process.argv[2];
  if (!/^[0-9a-f]{40}$/.test(base ?? ''))
    throw new Error('Exact diff base SHA required');
  const files = execFileSync(
    'git',
    ['diff', '--name-only', '-z', base, 'HEAD'],
    { encoding: 'utf8' }
  )
    .split('\0')
    .filter(Boolean);
  const scope = selectMqParityScope(
    files,
    readFileSync(
      new URL('../../.github/workflows/ci.yml', import.meta.url),
      'utf8'
    )
  );
  for (const [key, value] of Object.entries(scope))
    console.log(`${key}=${value}`);
}
