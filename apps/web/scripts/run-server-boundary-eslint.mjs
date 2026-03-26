import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..', '..', '..');
const webRoot = resolve(import.meta.dirname, '..');
const projectName = '@jovie/web';

const passthroughArgs = process.argv.slice(2);

function isEligiblePath(inputPath) {
  const absolutePath = resolve(repoRoot, inputPath);

  if (!existsSync(absolutePath)) {
    return false;
  }

  const relativeToWeb = relative(webRoot, absolutePath);
  const ignoredPathSegments = [
    `.next${sep}`,
    `dist${sep}`,
    `node_modules${sep}`,
    `coverage${sep}`,
    `storybook-static${sep}`,
    `test-results${sep}`,
    `playwright-report${sep}`,
    `.storybook${sep}`,
    `tests${sep}`,
  ];

  if (
    relativeToWeb.startsWith('..') ||
    ignoredPathSegments.some(
      segment =>
        relativeToWeb === segment.slice(0, -1) ||
        relativeToWeb.startsWith(segment) ||
        relativeToWeb.includes(`${sep}${segment}`)
    )
  ) {
    return false;
  }

  if (
    relativeToWeb.endsWith('.test.ts') ||
    relativeToWeb.endsWith('.test.tsx') ||
    relativeToWeb.endsWith('.spec.ts') ||
    relativeToWeb.endsWith('.spec.tsx') ||
    relativeToWeb.endsWith('.stories.ts') ||
    relativeToWeb.endsWith('.stories.tsx')
  ) {
    return false;
  }

  return relativeToWeb.endsWith('.ts') || relativeToWeb.endsWith('.tsx');
}

const eligiblePaths = [
  ...new Set(
    passthroughArgs
      .map(inputPath => inputPath.trim())
      .filter(Boolean)
      .filter(isEligiblePath)
      .map(inputPath => relative(webRoot, resolve(repoRoot, inputPath)))
  ),
];

const eslintArgs = [
  'exec',
  'eslint',
  '--config',
  'eslint-server-boundaries.config.js',
  '--no-inline-config',
  '--cache',
  '--cache-location',
  '.cache/eslint-server-boundaries',
  '--cache-strategy',
  'content',
];

if (eligiblePaths.length > 0) {
  eslintArgs.push(...eligiblePaths);
} else {
  eslintArgs.push('.');
}

const result = spawnSync('pnpm', eslintArgs, {
  cwd: webRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error(`[${projectName}] Failed to run ESLint boundary checks.`);
  process.exit(1);
}

process.exit(result.status ?? 1);
