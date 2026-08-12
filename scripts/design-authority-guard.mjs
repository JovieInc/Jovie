#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const REQUIRED_DESIGN_INVARIANT_IDS = [
  'no-serif-product-source',
  'marketing-pill-32-visible-44-target',
  'marketing-o-mark-32',
  'semantic-accent-only',
  'decorative-icons-unboxed',
  'single-component-family',
  'founder-review-canonical-only',
  'pen-source-identity-boundary',
  'logo-visible-bounds-normalization',
];

const ACTIVE_AUTHORITY_FILES = [
  'DESIGN.md',
  '.claude/rules/ui.md',
  'docs/marketing/AGENT_GUIDE.md',
  '.agents/skills/gstack/design-canonical/SKILL.md.tmpl',
  '.agents/skills/gstack/design-consultation/SKILL.md.tmpl',
];

const STALE_ACTIVE_PATTERNS = [
  /Use System A for/i,
  /dark-only System A/i,
  /rotate per section/i,
  /accent (?:goes|color) on (?:the )?title text/i,
  /Instrument Serif|Source Serif|Fraunces/i,
  /Inter,.*never recommend as primary/i,
];

const SERIF_DECLARATION =
  /font-serif|ui-serif|--font-serif|Instrument Serif|Source Serif|SourceSerif|\bGeorgia\b|\bTimes New Roman\b|font(?:-family|Family)[^\n]*(?<!sans-)\bserif\b/i;

export function isSerifDeclaration(line, isTemplate = false) {
  const templateRecommendation =
    /Instrument Serif|Source Serif|SourceSerif|\bGeorgia\b|\bTimes New Roman\b/i;
  return (isTemplate ? templateRecommendation : SERIF_DECLARATION).test(line);
}

export function hasExactSerifException(exceptions, relativePath, line) {
  return exceptions.find(
    item => item.path === relativePath && line.includes(item.match)
  );
}

function readSerifExceptions(repoRoot) {
  const exceptionPath = path.join(
    repoRoot,
    'scripts/design-authority-exceptions.json'
  );
  const parsed = JSON.parse(readFileSync(exceptionPath, 'utf8'));
  if (!Array.isArray(parsed.serif))
    throw new Error('serif exceptions must be an array');
  return parsed.serif.map(exception => {
    for (const key of ['path', 'match', 'kind', 'owner', 'reason']) {
      if (typeof exception[key] !== 'string' || exception[key].trim() === '') {
        throw new Error(`serif exception requires ${key}`);
      }
    }
    if (/[*?{}[\]]/.test(exception.path)) {
      throw new Error(`serif exception paths must be exact: ${exception.path}`);
    }
    if (!['ugc', 'media'].includes(exception.kind)) {
      throw new Error(
        `serif exception kind must be ugc or media: ${exception.path}`
      );
    }
    return { ...exception, used: false };
  });
}

function trackedFiles(repoRoot) {
  return execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
}

export function findDesignAuthorityViolations(repoRoot = process.cwd()) {
  const violations = [];
  const serifExceptions = readSerifExceptions(repoRoot);
  for (const relativePath of ACTIVE_AUTHORITY_FILES) {
    const source = readFileSync(path.join(repoRoot, relativePath), 'utf8');
    for (const pattern of STALE_ACTIVE_PATTERNS) {
      if (pattern.test(source)) violations.push(`${relativePath}: ${pattern}`);
    }
  }

  const manifest = readFileSync(
    path.join(repoRoot, 'docs/llms-design-manifest.txt'),
    'utf8'
  );
  for (const id of REQUIRED_DESIGN_INVARIANT_IDS) {
    if (!manifest.includes(`\`${id}\``)) {
      violations.push(`docs/llms-design-manifest.txt: missing invariant ${id}`);
    }
  }

  const productFiles = trackedFiles(repoRoot).filter(file => {
    if (!/^(apps|packages)\//.test(file)) return false;
    if (!/\.(?:ts|tsx|js|jsx|css|scss|html|svg|swift)$/.test(file))
      return false;
    if (
      /(?:^|\/)(?:tests?|fixtures?|snapshots?|generated|dist|build)(?:\/|$)/.test(
        file
      )
    )
      return false;
    if (/\.(?:test|spec|stories)\./.test(file)) return false;
    return true;
  });
  productFiles.push(
    '.agents/skills/gstack/design-canonical/SKILL.md.tmpl',
    '.agents/skills/gstack/design-consultation/SKILL.md.tmpl',
    '.agents/skills/gstack/design-html/SKILL.md.tmpl'
  );

  for (const relativePath of [...new Set(productFiles)]) {
    const lines = readFileSync(path.join(repoRoot, relativePath), 'utf8').split(
      '\n'
    );
    lines.forEach((line, index) => {
      const isTemplate = relativePath.endsWith('.md.tmpl');
      if (isSerifDeclaration(line, isTemplate)) {
        const exception = hasExactSerifException(
          serifExceptions,
          relativePath,
          line
        );
        if (exception) exception.used = true;
        else violations.push(`${relativePath}:${index + 1}: serif declaration`);
      }
    });
  }
  for (const exception of serifExceptions) {
    if (!exception.used) {
      violations.push(
        `${exception.path}: stale serif exception ${exception.match}`
      );
    }
  }
  return violations;
}

if (process.argv[1] === import.meta.filename) {
  const violations = findDesignAuthorityViolations();
  if (violations.length > 0) {
    console.error(violations.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Design authority and no-serif ratchets passed.');
  }
}
