import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  countViolations,
  listViolations,
  SCAN_DIRS,
  scanProject,
  walkDir,
} from '../../../scripts/lint-contrast-ratchet.mjs';

/**
 * Fail-closed token-drift eval.
 *
 * Drives the SHIPPED contrast-ratchet scanner. Do not copy its regexes here —
 * product replacements live on a sibling branch; this file only asserts the
 * scanner contract and that owned buckets stay at zero on shipped trees.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, '..', '..', '..');
const SCANNER_PATH = join(WEB_ROOT, 'scripts', 'lint-contrast-ratchet.mjs');
const THIS_TEST_PATH = fileURLToPath(import.meta.url);

const OWNED_BUCKETS = [
  'bareTextBlack',
  'bareBgWhite',
  'bareTextWhite',
  'bareBgBlack',
  'arbitraryHex',
] as const;

const ZERO_COUNTS = {
  bareTextBlack: 0,
  bareBgWhite: 0,
  bareTextWhite: 0,
  bareBgBlack: 0,
  arbitraryHex: 0,
} as const;

const DIRTY_SOURCE = `export function DirtyContrast() {
  return (
    <section>
      <p className="text-[#fff]">ghost</p>
      <div className="bg-[#7170FF]">retired carbon</div>
      <footer className="bg-black">ink</footer>
    </section>
  );
}
`;

const CLEAN_SOURCE = `export function CleanContrast() {
  return (
    <section className="text-primary-token bg-surface-1">
      <button className="bg-btn-primary text-btn-primary-foreground">
        Go
      </button>
    </section>
  );
}
`;

const CARBON_SOURCE = `export function RetiredCarbon() {
  return <div className="bg-[#7170FF]">retired carbon</div>;
}
`;

describe('token-drift eval (shipped contrast ratchet)', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'token-drift-eval-'));
  const dirtyPath = join(fixtureRoot, 'dirty.tsx');
  const cleanPath = join(fixtureRoot, 'clean.tsx');
  const carbonPath = join(fixtureRoot, 'retired-carbon.tsx');

  beforeAll(() => {
    writeFileSync(dirtyPath, DIRTY_SOURCE);
    writeFileSync(cleanPath, CLEAN_SOURCE);
    writeFileSync(carbonPath, CARBON_SOURCE);
  });

  afterAll(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('imports the shipped scanner module, not a copied regex', async () => {
    expect(readFileSync(THIS_TEST_PATH, 'utf8')).toContain(
      "from '../../../scripts/lint-contrast-ratchet.mjs'"
    );
    expect(SCANNER_PATH.endsWith('scripts/lint-contrast-ratchet.mjs')).toBe(
      true
    );
    expect(readFileSync(SCANNER_PATH, 'utf8')).toContain(
      'export function countViolations'
    );

    const cliModule = await import(pathToFileURL(SCANNER_PATH).href);
    expect(countViolations).toBe(cliModule.countViolations);
    expect(walkDir).toBe(cliModule.walkDir);
    expect(listViolations).toBe(cliModule.listViolations);
    expect(scanProject).toBe(cliModule.scanProject);
  });

  it('flags dirty fixture arbitrary hex and bare bg-black', () => {
    const counts = countViolations([dirtyPath]);
    expect(counts.arbitraryHex).toBeGreaterThan(0);
    expect(counts.bareBgBlack).toBeGreaterThan(0);

    const hits = listViolations([dirtyPath]);
    expect(hits.some(hit => hit.bucket === 'arbitraryHex')).toBe(true);
    expect(hits.some(hit => hit.bucket === 'bareBgBlack')).toBe(true);
    expect(hits.every(hit => hit.file === dirtyPath)).toBe(true);
  });

  it('reports zero owned buckets on named-token fixtures', () => {
    expect(countViolations([cleanPath])).toEqual({ ...ZERO_COUNTS });
  });

  it('flags retired carbon #7170FF as arbitraryHex', () => {
    const counts = countViolations([carbonPath]);
    expect(counts.arbitraryHex).toBeGreaterThan(0);
    expect(
      listViolations([carbonPath]).some(
        hit => hit.bucket === 'arbitraryHex' && hit.text.includes('#7170FF')
      )
    ).toBe(true);
  });

  it('live product components+app trees have zero owned raw-token buckets', () => {
    const files: string[] = [];
    for (const dir of SCAN_DIRS) {
      walkDir(join(WEB_ROOT, dir), files);
    }

    const counts = countViolations(files);
    expect(scanProject(WEB_ROOT)).toEqual(counts);

    const leftovers = listViolations(files);
    const leftoverReport = leftovers
      .map(hit => `${hit.bucket} ${hit.file}:${hit.line}: ${hit.text.trim()}`)
      .join('\n');

    expect(
      counts,
      `Shipped raw-token drift (owned buckets must be 0):\n${leftoverReport}`
    ).toEqual({ ...ZERO_COUNTS });

    for (const bucket of OWNED_BUCKETS) {
      expect(counts[bucket], leftoverReport).toBe(0);
    }
  });
});
