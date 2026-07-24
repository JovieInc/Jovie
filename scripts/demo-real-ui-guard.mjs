#!/usr/bin/env node
/**
 * Demo must reflect real product UI.
 *
 * Allowed: simplified fixture data + real product components/shells.
 * Forbidden: design-studio invented chrome, hand-rolled <button> CTAs in demo,
 * pure-black mock frames pretending to be product.
 *
 * Run: node scripts/demo-real-ui-guard.mjs
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scanRoots = [
  path.join(root, 'apps/web/components/features/demo'),
  path.join(root, 'apps/web/app/demo'),
  path.join(root, 'apps/web/components/features/home/demo'),
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
      out.push(...(await walk(full)));
      continue;
    }
    if (entry.isFile() && /\.(tsx|ts)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function rel(file) {
  return path.relative(root, file);
}

function add(file, rule, detail) {
  findings.push({ file: rel(file), rule, detail });
}

async function main() {
  const files = (await Promise.all(scanRoots.map(walk))).flat();

  for (const file of files) {
    const text = await readFile(file, 'utf8');
    const normalized = file.replaceAll('\\', '/');

    if (
      text.includes("from '@/lib/design-studio/registry'") ||
      text.includes('getDesignStudioItem(')
    ) {
      add(
        file,
        'no-design-studio-in-demo',
        'Demo must mount real product components, not design-studio invented previews.'
      );
    }

    if (text.includes('DemoDesignStudioShowcase')) {
      add(
        file,
        'no-design-studio-showcase-wrapper',
        'Remove DemoDesignStudioShowcase; use DemoProductSurfaces instead.'
      );
    }

    // CTA marketing fluff page is not product demo.
    if (normalized.endsWith('/CTAShowcase.tsx')) {
      add(
        file,
        'no-cta-marketing-demo',
        'CTAShowcase is a button marketing page, not product UI. Delete or replace with real surfaces.'
      );
    }

    // Hand-rolled primary buttons in demo (allow testids-only files carefully)
    if (
      /<button\b[^>]*className=\{?['"][^'"]*(?:bg-blue-|bg-primary)/.test(
        text
      ) ||
      /className=\{?['"][^'"]*bg-blue-600/.test(text)
    ) {
      add(
        file,
        'no-hand-rolled-demo-cta',
        'Use @jovie/ui Button instead of hand-rolled blue CTAs in demo.'
      );
    }
  }

  if (findings.length === 0) {
    console.log(`[demo-real-ui] clean (${files.length} files scanned)`);
    return;
  }

  console.error(`[demo-real-ui] ${findings.length} finding(s):`);
  for (const f of findings) {
    console.error(`- ${f.file}\n  rule: ${f.rule}\n  ${f.detail}`);
  }
  process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
