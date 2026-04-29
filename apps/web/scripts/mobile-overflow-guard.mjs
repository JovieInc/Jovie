#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const webRoot = join(__dirname, '..');
const repoRoot = join(webRoot, '..', '..');

const auditedCssFullBleedFiles = new Set(['apps/web/app/(home)/home.css']);

const scannedFilePatterns = [
  'apps/web/app/**/*.{css,ts,tsx}',
  'apps/web/components/**/*.{css,ts,tsx}',
  'apps/web/lib/**/*.{ts,tsx}',
  'apps/web/hooks/**/*.{ts,tsx}',
  'packages/ui/**/*.{css,ts,tsx}',
];

const ignoredPatterns = [
  '**/node_modules/**',
  '**/.next/**',
  '**/playwright-report/**',
  '**/test-results/**',
  '**/__snapshots__/**',
  '**/*.test.{ts,tsx}',
  '**/*.spec.{ts,tsx}',
];

const tailwindRiskPatterns = [
  {
    name: 'left-0 right-0 w-screen',
    pattern: /(?:^|\s)left-0\s+right-0\s+w-screen(?:\s|$)/,
  },
  {
    name: 'w-screen',
    pattern: /(?:^|\s)w-screen(?:\s|$)/,
  },
  {
    name: 'min-w-screen',
    pattern: /(?:^|\s)min-w-screen(?:\s|$)/,
  },
  {
    name: 'w-[100vw]',
    pattern: /(?:^|\s)w-\[100vw\](?:\s|$)/,
  },
  {
    name: 'min-w-[100vw]',
    pattern: /(?:^|\s)min-w-\[100vw\](?:\s|$)/,
  },
];

const cssRiskPattern =
  /(^|[;{\n])\s*(width|min-width)\s*:\s*(100vw|calc\(100vw\b[^;]*)/i;

function getLineNumber(content, index) {
  return content.slice(0, index).split('\n').length;
}

function isTsLikeFile(filePath) {
  return filePath.endsWith('.ts') || filePath.endsWith('.tsx');
}

function isCssFile(filePath) {
  return filePath.endsWith('.css');
}

function scanTailwindFile(filePath, content) {
  const violations = [];

  for (const { name, pattern } of tailwindRiskPatterns) {
    const match = pattern.exec(content);
    if (!match) continue;

    violations.push({
      filePath,
      line: getLineNumber(content, match.index),
      rule: name,
      detail:
        'Use w-full/max-w-full or a constrained calc() width unless the full-bleed behavior is audited.',
    });
  }

  return violations;
}

function scanCssFile(filePath, content) {
  const relativePath = relative(repoRoot, filePath);
  if (auditedCssFullBleedFiles.has(relativePath)) {
    return [];
  }

  const match = cssRiskPattern.exec(content);
  if (!match) return [];

  return [
    {
      filePath,
      line: getLineNumber(content, match.index),
      rule: `${match[2]}: ${match[3]}`,
      detail:
        'Direct 100vw width declarations create mobile overflow easily; use width: 100%, max-width, or add this file to the audited full-bleed allowlist.',
    },
  ];
}

const files = await glob(scannedFilePatterns, {
  cwd: repoRoot,
  absolute: true,
  ignore: ignoredPatterns,
  nodir: true,
});

const violations = [];

for (const filePath of files) {
  const content = readFileSync(filePath, 'utf8');

  if (isTsLikeFile(filePath)) {
    violations.push(...scanTailwindFile(filePath, content));
  }

  if (isCssFile(filePath)) {
    violations.push(...scanCssFile(filePath, content));
  }
}

if (violations.length > 0) {
  console.error('Mobile overflow guard failed.');
  console.error(
    'Remove risky viewport-width classes/declarations or audit a true full-bleed exception.'
  );

  for (const violation of violations) {
    console.error(
      `- ${relative(repoRoot, violation.filePath)}:${violation.line} ${violation.rule}`
    );
    console.error(`  ${violation.detail}`);
  }

  process.exit(1);
}

console.log('Mobile overflow guard passed.');
