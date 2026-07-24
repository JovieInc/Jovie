#!/usr/bin/env node
/**
 * Storybook story quality guard.
 *
 * Blocks the class of "coverage void" stories that pass Chromatic/a11y while
 * destroying product taste:
 * - bare atoms on pure black / dark void backgrounds
 * - hand-rolled fake product chrome (bg-blue-600 continue buttons, etc.)
 * - design-studio leftovers pretending to be the system
 *
 * Run: node scripts/storybook-story-quality-guard.mjs
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scanRoots = [
  path.join(root, 'apps/web/components'),
  path.join(root, 'packages/ui'),
];

/** @type {{ file: string, rule: string, detail: string }[]} */
const findings = [];

async function walk(dir) {
  /** @type {string[]} */
  const out = [];
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      out.push(...(await walk(full)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.stories.tsx')) out.push(full);
  }
  return out;
}

function rel(file) {
  return path.relative(root, file);
}

function add(file, rule, detail) {
  findings.push({ file: rel(file), rule, detail });
}

const BANNED_PATTERNS = [
  {
    rule: 'no-pure-black-story-chrome',
    re: /\bbg-black\b|backgroundColor:\s*['"]#000['"]|background:\s*['"]#000['"]/i,
    detail:
      'Do not stage stories on pure black chrome; use System B surfaces (bg-base).',
  },
  {
    rule: 'no-fake-blue-cta',
    re: /\bbg-blue-600\b|\bbg-blue-500\b/,
    detail:
      'Do not hand-roll fake primary CTAs in stories; render the real product component.',
  },
  {
    rule: 'no-gray-900-void-tile',
    re: /dark:bg-gray-900[^"'`]*dark:text-gray-100/,
    detail:
      'Do not invent off-system gray tiles; use AmountSelector/PaySelector or System B tokens.',
  },
];

async function main() {
  const files = (await Promise.all(scanRoots.map(walk))).flat();

  for (const file of files) {
    const text = await readFile(file, 'utf8');
    const normalized = file.replaceAll('\\', '/');

    // Design-studio section stories are not the product system.
    if (normalized.includes('/components/design-studio/')) {
      add(
        file,
        'no-design-studio-product-stories',
        'Design-studio leftovers are quarantined from the product Storybook library.'
      );
      continue;
    }

    for (const ban of BANNED_PATTERNS) {
      if (ban.re.test(text)) add(file, ban.rule, ban.detail);
    }

    // Bare AmountSelector args-only stories recreate the floating white circle.
    if (
      normalized.endsWith('/AmountSelector.stories.tsx') &&
      !text.includes('grid grid-cols-') &&
      !text.includes('PayAmountRow') &&
      !text.includes('PaySelector')
    ) {
      add(
        file,
        'amount-selector-requires-composition',
        'AmountSelector must be shown in a pay-row composition, never as a lone void tile.'
      );
    }

    // PaySelector stories must render PaySelector itself.
    if (
      normalized.endsWith('/PaySelector.stories.tsx') &&
      text.includes('<button') &&
      !text.includes('<PaySelector')
    ) {
      add(
        file,
        'payselector-must-use-real-component',
        'PaySelector stories must render <PaySelector />, not a hand-rolled mock.'
      );
    }
  }

  if (findings.length === 0) {
    console.log(`[story-quality] clean (${files.length} stories scanned)`);
    return;
  }

  console.error(
    `[story-quality] ${findings.length} finding(s) in ${files.length} stories:`
  );
  for (const f of findings) {
    console.error(`- ${f.file}\n  rule: ${f.rule}\n  ${f.detail}`);
  }
  process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
