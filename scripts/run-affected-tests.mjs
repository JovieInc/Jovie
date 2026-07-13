#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const GLOBAL_TEST_INPUTS = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'turbo.json',
  'apps/web/package.json',
  'apps/web/vitest.config.mjs',
  'apps/web/tests/setup.ts',
]);
const TESTABLE_FILE = /\.(?:[cm]?[jt]sx?|json)$/;

function unique(values) {
  return [...new Set(values)];
}

export function buildAffectedTestPlan(changedFiles) {
  const files = unique(changedFiles.filter(Boolean)).sort();
  if (files.some(file => GLOBAL_TEST_INPUTS.has(file))) {
    return { mode: 'full', relatedFiles: [], mandatoryTests: [] };
  }

  const relatedFiles = files.filter(
    file =>
      TESTABLE_FILE.test(file) &&
      (file.startsWith('apps/web/') || file.startsWith('packages/'))
  );
  const directTests = relatedFiles.filter(file =>
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)
  );
  const mandatoryTests = [];
  if (
    files.some(
      file =>
        file.startsWith('apps/web/components/features/profile/') ||
        file.startsWith('apps/web/app/[username]/')
    )
  ) {
    mandatoryTests.push(
      'apps/web/tests/unit/profile/profile-layout-shift.test.tsx',
      'apps/web/tests/unit/profile/profile-card-layout.test.tsx',
      'apps/web/tests/unit/profile/profile-compact-surface-hero-layout.test.ts'
    );
  }
  if (
    files.some(
      file =>
        file.startsWith('apps/web/components/') ||
        file.startsWith('apps/web/app/') ||
        file.startsWith('packages/ui/')
    )
  ) {
    mandatoryTests.push(
      'apps/web/tests/unit/design-system/arbitrary-values-ratchet.test.ts'
    );
  }
  if (
    files.some(file =>
      file.startsWith('apps/web/eslint-rules/canonical-ui-label-casing')
    )
  ) {
    mandatoryTests.push(
      'apps/web/eslint-rules/canonical-ui-label-casing.test.ts'
    );
  }

  const selectedTests = unique([...directTests, ...mandatoryTests]);
  const isCoveredSource = file => {
    if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)) return true;
    if (file.startsWith('apps/web/components/features/profile/')) return true;
    if (file.startsWith('apps/web/app/[username]/')) return true;
    if (file.startsWith('apps/web/components/')) return true;
    if (file.startsWith('apps/web/app/')) return true;
    if (file.startsWith('packages/ui/')) return true;
    if (file.startsWith('apps/web/eslint-rules/canonical-ui-label-casing'))
      return true;
    return (
      file ===
      'apps/web/tests/unit/design-system/arbitrary-values.baseline.json'
    );
  };
  const hasUncoveredSource = relatedFiles.some(file => !isCoveredSource(file));
  return {
    mode:
      relatedFiles.length === 0
        ? 'none'
        : !hasUncoveredSource && selectedTests.length > 0
          ? 'selected'
          : 'full',
    relatedFiles,
    mandatoryTests: unique(mandatoryTests),
    selectedTests,
  };
}

function argValue(args, flag, fallback) {
  const index = args.indexOf(flag);
  return index === -1 ? fallback : args[index + 1];
}

function changedFiles(base) {
  return execFileSync(
    'git',
    ['diff', '--diff-filter=ACDMR', '--name-only', `${base}...HEAD`],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }
  )
    .trim()
    .split('\n')
    .filter(Boolean);
}

export async function runCommand(command, args) {
  const child = spawn(command, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: process.env,
    detached: process.platform !== 'win32',
  });
  const terminate = signal => {
    if (child.exitCode !== null) return;
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  };
  const onInterrupt = () => terminate('SIGINT');
  const onTerminate = () => terminate('SIGTERM');
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onTerminate);
  const status = await new Promise(resolveStatus => {
    child.once('exit', (code, signal) =>
      resolveStatus(code ?? (signal ? 128 : 1))
    );
    child.once('error', () => resolveStatus(1));
  });
  process.removeListener('SIGINT', onInterrupt);
  process.removeListener('SIGTERM', onTerminate);
  process.exit(status);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const base = argValue(args, '--base', 'origin/main');
  const maxWorkers = argValue(args, '--max-workers', '2');
  const plan = buildAffectedTestPlan(changedFiles(base));
  if (args.includes('--dry-run')) {
    console.log(JSON.stringify(plan, null, 2));
    process.exit(0);
  }
  console.log(
    `[affected-tests] mode=${plan.mode} related=${plan.relatedFiles.length} mandatory=${plan.mandatoryTests.length}`
  );

  if (plan.mode === 'none') process.exit(0);
  if (plan.mode === 'full') {
    await runCommand('pnpm', ['--filter', '@jovie/web', 'run', 'test']);
  }

  await runCommand('pnpm', [
    '--filter',
    '@jovie/web',
    'exec',
    'vitest',
    'run',
    ...plan.selectedTests.map(file => file.replace(/^apps\/web\//, '')),
    '--passWithNoTests',
    '--maxWorkers',
    maxWorkers,
  ]);
}
