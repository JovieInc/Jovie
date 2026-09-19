#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'glob';
import postcss from 'postcss';
import ts from 'typescript';

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
  if (auditedCssFullBleedFiles.has(filePath)) {
    return [];
  }

  const scannedContent = omitAuditedOverlayUtility(filePath, content);
  const applyMatch = /@apply\b[^;{}]*\bw-overlay-viewport\b/.exec(
    scannedContent
  );
  const violations = applyMatch
    ? [
        {
          filePath,
          line: getLineNumber(content, applyMatch.index),
          rule: 'unaudited w-overlay-viewport consumer',
          detail:
            'The viewport utility is audited only in the centered overlay source owner, not in new CSS compositions.',
        },
      ]
    : [];
  const match = cssRiskPattern.exec(scannedContent);
  if (!match) return violations;

  return [
    ...violations,
    {
      filePath,
      line: getLineNumber(content, match.index),
      rule: `${match[2]}: ${match[3]}`,
      detail:
        'Direct 100vw width declarations create mobile overflow easily; use width: 100%, max-width, or add this file to the audited full-bleed allowlist.',
    },
  ];
}

/**
 * Width-only audit: audits/jovie-overlay-native-width-proof-and-focus-hold-2026-09-05.
 * Native manifest sha256:daa5d5d5b8e61c9abb0a62be6535208d1f29437e3e7f3b4f9344fb1bd16936cc.
 * This does not certify Dialog focus behavior or arbitrary caller overrides.
 * Remove only the exact, top-level, single-declaration utility; scan all other
 * declarations normally. Never exempt globals.css as a file.
 */
function omitAuditedOverlayUtility(filePath, content) {
  if (filePath !== 'apps/web/app/globals.css') return content;
  const css = postcss.parse(content);
  const utilities = [];
  css.walkAtRules('utility', rule => {
    if (rule.params.trim() === 'w-overlay-viewport') utilities.push(rule);
  });
  if (utilities.length !== 1) return content;
  const utility = utilities[0];
  const declaration = utility.nodes?.[0];
  if (
    utility.parent !== css ||
    utility.nodes?.length !== 1 ||
    declaration.type !== 'decl' ||
    declaration.prop !== 'width' ||
    declaration.important ||
    !/^calc\(\s*100vw\s+-\s+var\(\s*--space-8\s*\)\s*\)$/.test(
      declaration.value
    )
  )
    return content;
  const start = utility.source.start.offset;
  const end = utility.source.end.offset + 1;
  return (
    content.slice(0, start) +
    content.slice(start, end).replace(/[^\n]/g, ' ') +
    content.slice(end)
  );
}

function hasAuditedOverlayDeclaration(content) {
  const source = ts.createSourceFile(
    'overlay-styles.ts',
    content,
    ts.ScriptTarget.Latest,
    true
  );
  if (source.parseDiagnostics.length) return false;
  let uses = 0;
  const countUses = node => {
    if (ts.isStringLiteral(node) || ts.isTemplateLiteralToken(node))
      uses += [...node.text.matchAll(/\bw-overlay-viewport\b/g)].length;
    ts.forEachChild(node, countUses);
  };
  countUses(source);
  if (uses !== 1) return false;
  const declarations = source.statements
    .filter(ts.isVariableStatement)
    .flatMap(statement => statement.declarationList.declarations)
    .filter(
      declaration =>
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === 'centeredContentStyles'
    );
  if (declarations.length !== 1) return false;
  const initializer = declarations[0].initializer;
  const object =
    initializer && ts.isAsExpression(initializer)
      ? initializer.expression
      : initializer;
  if (
    !object ||
    !ts.isObjectLiteralExpression(object) ||
    object.properties.some(ts.isSpreadAssignment)
  )
    return false;
  return Object.entries({
    position: 'fixed left-1/2 top-1/2 z-50 [translate:-50%_-50%]',
    layout:
      'grid max-h-overlay-viewport w-overlay-viewport max-w-lg gap-5 overflow-y-auto overscroll-contain',
  }).every(([name, value]) => {
    const properties = object.properties.filter(
      property => property.name?.getText(source) === name
    );
    return (
      properties.length === 1 &&
      ts.isPropertyAssignment(properties[0]) &&
      ts.isStringLiteral(properties[0].initializer) &&
      properties[0].initializer.text === value
    );
  });
}

function scanOverlayConsumer(filePath, content) {
  const match = /\bw-overlay-viewport\b/.exec(content);
  if (!match) return [];
  const isAuditedOwner =
    filePath === 'packages/ui/lib/overlay-styles.ts' &&
    hasAuditedOverlayDeclaration(content);
  if (isAuditedOwner) return [];
  return [
    {
      filePath,
      line: getLineNumber(content, match.index),
      rule: 'unaudited w-overlay-viewport consumer',
      detail:
        'This viewport width is audited only in the constrained centered overlay owner; audit changed placement or new consumers before reuse.',
    },
  ];
}

export function scanSourceFile(filePath, content) {
  if (isTsLikeFile(filePath))
    return [
      ...scanTailwindFile(filePath, content),
      ...scanOverlayConsumer(filePath, content),
    ];
  if (isCssFile(filePath)) return scanCssFile(filePath, content);
  return [];
}

export async function findMobileOverflowViolations(root = repoRoot) {
  const files = await glob(scannedFilePatterns, {
    cwd: root,
    absolute: true,
    ignore: ignoredPatterns,
    nodir: true,
  });
  return files.flatMap(filePath =>
    scanSourceFile(relative(root, filePath), readFileSync(filePath, 'utf8'))
  );
}

async function main() {
  const violations = await findMobileOverflowViolations();
  if (violations.length > 0) {
    console.error('Mobile overflow guard failed.');
    console.error(
      'Remove risky viewport-width classes/declarations or audit a true full-bleed exception.'
    );
    for (const violation of violations) {
      console.error(
        `- ${violation.filePath}:${violation.line} ${violation.rule}`
      );
      console.error(`  ${violation.detail}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log('Mobile overflow guard passed.');
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) await main();
