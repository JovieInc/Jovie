#!/usr/bin/env node
// Generate the investor deck from the private fundraising ledger.
//
//   node scripts/investor-deck/build.mjs [--ledger <registry dir>] [--out <dir>] [--no-pdf]
//
// Ledger dir (default $JOVIE_FUNDRAISING_DIR, else
// ~/conductor/ops-wt/fundraising/registry) holds deck.yaml (story),
// claims.yaml, metrics.yaml, and ../drafts/*.md (application drafts). Output
// (default ~/.local/state/jovie-investor-deck/<sha12>/) is private: deck.html,
// deck.pdf, slide PNGs, deck.txt and build.json. Exit 1 on any generator or
// consistency issue; nothing renders from a failing ledger.

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { load as loadYaml } from 'js-yaml';
import { buildLedgerYcDeck } from '../../apps/web/lib/investors/yc-deck.ts';
import { checkConsistency } from './consistency.mjs';
import { deckText, renderDeckHtml } from './render.mjs';

export const STATE_DIR = join(
  homedir(),
  '.local',
  'state',
  'jovie-investor-deck'
);

export function defaultLedgerDir(env = process.env) {
  return (
    env.JOVIE_FUNDRAISING_DIR ||
    join(homedir(), 'conductor', 'ops-wt', 'fundraising', 'registry')
  );
}

export function loadLedger(dir) {
  const read = name => loadYaml(readFileSync(join(dir, name), 'utf8'));
  const claims = read('claims.yaml')?.claims ?? {};
  const metricsFile = read('metrics.yaml') ?? {};
  const story = read('deck.yaml');
  const draftsDir = resolve(dir, '..', 'drafts');
  const drafts = {};
  if (existsSync(draftsDir))
    for (const name of readdirSync(draftsDir))
      if (/^(?:YC|SPEEDRUN)-.*\.md$/u.test(name))
        drafts[name] = readFileSync(join(draftsDir, name), 'utf8');
  return {
    story,
    ledger: {
      claims,
      metrics: metricsFile.metrics ?? {},
      facts: metricsFile.facts ?? {},
    },
    drafts,
  };
}

/** Generator + consistency, no I/O beyond the inputs. */
export function buildDeck({ story, ledger, drafts }) {
  const { slides, issues } = buildLedgerYcDeck(story, ledger);
  const text = deckText(slides);
  const consistency = checkConsistency({ deckText: text, drafts, ledger });
  return {
    slides,
    text,
    issues: [...issues, ...consistency.issues],
    consistency,
  };
}

async function exportPdf(htmlPath, outDir, count) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
    });
    await page.goto(`file://${htmlPath}`);
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({
      path: join(outDir, 'deck.pdf'),
      width: '1920px',
      height: '1080px',
      printBackground: true,
    });
    const sections = await page.$$('section.slide');
    for (let i = 0; i < Math.min(count, sections.length); i++)
      await sections[i].screenshot({
        path: join(outDir, `slide-${String(i + 1).padStart(2, '0')}.png`),
      });
    // Overflow check: text that spills past its slide is a layout defect.
    return await page.$$eval('section.slide', nodes =>
      nodes
        .filter(node => node.scrollHeight > node.clientHeight + 1)
        .map(node => node.dataset.slide)
    );
  } finally {
    await browser.close();
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      ledger: { type: 'string' },
      out: { type: 'string' },
      'no-pdf': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
    },
  });
  const dir = values.ledger ?? defaultLedgerDir();
  const input = loadLedger(dir);
  const started = Date.now();
  const result = buildDeck(input);
  const html = renderDeckHtml(result.slides, { title: input.story.title });
  const sha = createHash('sha256').update(html).digest('hex');
  const outDir = values.out ?? join(STATE_DIR, sha.slice(0, 12));
  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  const htmlPath = join(outDir, 'deck.html');
  writeFileSync(htmlPath, html, { mode: 0o600 });
  writeFileSync(join(outDir, 'deck.txt'), result.text, { mode: 0o600 });
  let overflow = [];
  if (!values['no-pdf'] && result.issues.length === 0)
    overflow = await exportPdf(htmlPath, outDir, result.slides.length);
  const issues = [
    ...result.issues,
    ...overflow.map(id => `slide ${id}: content overflows the 1920x1080 page`),
  ];
  const receipt = {
    schema: 'jovie.investor-deck.build/v1',
    generator: 'apps/web/lib/investors/yc-deck.ts#buildLedgerYcDeck',
    program: input.story.program,
    deckSha256: sha,
    slides: result.slides.map(slide => slide.id),
    issues,
    families: result.consistency.families,
    drafts: Object.keys(input.drafts),
    builtAt: new Date().toISOString(),
    ms: Date.now() - started,
    outDir,
  };
  writeFileSync(
    join(outDir, 'build.json'),
    `${JSON.stringify(receipt, null, 2)}\n`,
    {
      mode: 0o600,
    }
  );
  if (values.json)
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  else {
    process.stdout.write(`deck ${sha.slice(0, 12)} -> ${outDir}\n`);
    for (const issue of issues) process.stdout.write(`  FAIL ${issue}\n`);
    if (!issues.length)
      process.stdout.write('  generator + consistency: pass\n');
  }
  process.exitCode = issues.length ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
