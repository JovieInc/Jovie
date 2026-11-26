import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  collectSources,
  lintReviewFindings,
  parseLedger,
  rulesFromLedger,
} from './lint-review-findings.mjs';

const RULE_PATTERN =
  'uppercase[^\'"`\\n]*tracking-widest|tracking-widest[^\'"`\\n]*uppercase';

const LEDGER_ENTRY = {
  id: 'RF-0001',
  date: '2026-11-19',
  finding_class: 'design/all-caps-wide-tracking',
  layer_encoded: 'lint',
  pr_url: null,
  notes: 'seed entry',
  rule_pattern: RULE_PATTERN,
  rule_status: 'shadow',
  rule_source: 'ASR-022',
};
const VALID_LEDGER = `${JSON.stringify(LEDGER_ENTRY)}\n`;

/** @returns {{ root: string, scanRoot: string }} */
function makeFixture({
  source = "<p className='text-xs uppercase tracking-widest text-[13px]'>X</p>\n",
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'review-findings-'));
  const scanRoot = join(root, 'components');
  mkdirSync(scanRoot);
  writeFileSync(join(scanRoot, 'Sample.tsx'), source);
  return { root, scanRoot };
}

/** @param {string} root */
function cleanup(root) {
  rmSync(root, { recursive: true, force: true });
}

describe('review-findings lint', () => {
  /** @type {string | undefined} */
  let fixtureRoot;

  beforeEach(() => {
    fixtureRoot = undefined;
  });

  afterEach(() => {
    if (fixtureRoot) cleanup(fixtureRoot);
  });

  it('reports shadow-rule hits and token-bypass signals with code 0', () => {
    const { root, scanRoot } = makeFixture();
    fixtureRoot = root;
    /** @type {string[]} */
    const out = [];
    const result = lintReviewFindings({
      ledgerText: VALID_LEDGER,
      webRoot: root,
      scanRoots: [scanRoot],
      log: (...lines) => out.push(lines.join(' ')),
    });
    expect(result.code).toBe(0);
    const text = out.join('\n');
    expect(text).toContain('1 ledger entry');
    expect(text).toContain('[shadow] RF-0001 (ASR-022)');
    expect(text).toContain('components/Sample.tsx:1');
    expect(text).toContain('arbitrary-tracking: 0');
    expect(text).toContain('arbitrary-px-font-size: 1');
    expect(text).toContain('ok (informational mode)');
  });

  it('emits machine-readable output with --json', () => {
    const { root, scanRoot } = makeFixture();
    fixtureRoot = root;
    /** @type {string[]} */
    const out = [];
    const result = lintReviewFindings({
      args: ['--json'],
      ledgerText: VALID_LEDGER,
      webRoot: root,
      scanRoots: [scanRoot],
      log: (...lines) => out.push(lines.join(' ')),
    });
    expect(result.code).toBe(0);
    const parsed = JSON.parse(out.join(''));
    expect(parsed.ledgerEntries).toBe(1);
    expect(parsed.hits['RF-0001']).toEqual([
      { file: 'components/Sample.tsx', line: 1 },
    ]);
  });

  it('passes --strict when only shadow rules have hits', () => {
    const { root, scanRoot } = makeFixture();
    fixtureRoot = root;
    const result = lintReviewFindings({
      args: ['--strict'],
      ledgerText: VALID_LEDGER,
      webRoot: root,
      scanRoots: [scanRoot],
    });
    expect(result.code).toBe(0);
  });

  it('fails --strict when an enforced rule has hits', () => {
    const { root, scanRoot } = makeFixture();
    fixtureRoot = root;
    const enforced = `${JSON.stringify({ ...LEDGER_ENTRY, rule_status: 'enforced' })}\n`;
    /** @type {string[]} */
    const err = [];
    const result = lintReviewFindings({
      args: ['--strict'],
      ledgerText: enforced,
      webRoot: root,
      scanRoots: [scanRoot],
      error: (...lines) => err.push(lines.join(' ')),
    });
    expect(result.code).toBe(1);
    expect(err.join('')).toContain('--strict failed with 1 enforced-rule hit');
  });

  it('derives rules only from entries that carry a pattern', () => {
    const docOnly = `${JSON.stringify({ ...LEDGER_ENTRY, layer_encoded: 'doc', rule_pattern: undefined })}\n`;
    const derived = rulesFromLedger(parseLedger(docOnly, () => {}));
    expect('rules' in derived && derived.rules).toEqual([]);
  });

  it('rejects a malformed ledger line with code 2', () => {
    /** @type {string[]} */
    const err = [];
    const result = lintReviewFindings({
      ledgerText: 'not json at all\n',
      scanRoots: [],
      error: (...lines) => err.push(lines.join(' ')),
    });
    expect(result.code).toBe(2);
    expect(err.join('')).toContain('line 1 is not valid JSON');
  });

  it('rejects an unknown layer_encoded with code 2', () => {
    /** @type {string[]} */
    const err = [];
    const result = parseLedger(
      `${JSON.stringify({
        date: '2026-11-19',
        finding_class: 'x',
        layer_encoded: 'vibes',
        pr_url: null,
        notes: 'n',
      })}\n`,
      (...lines) => err.push(lines.join(' '))
    );
    expect('code' in result).toBe(true);
    expect(err.join('')).toContain('layer_encoded must be one of');
  });

  it('rejects a malformed pr_url with code 2', () => {
    const result = parseLedger(
      `${JSON.stringify({
        date: '2026-11-19',
        finding_class: 'x',
        layer_encoded: 'lint',
        pr_url: 42,
        notes: 'n',
      })}\n`,
      () => {}
    );
    expect('code' in result).toBe(true);
  });

  it('rejects an invalid rule_pattern with code 2', () => {
    const result = lintReviewFindings({
      ledgerText: `${JSON.stringify({ ...LEDGER_ENTRY, rule_pattern: '([unclosed' })}\n`,
      scanRoots: [],
      error: () => {},
    });
    expect('code' in result).toBe(true);
  });

  it('rejects an unknown rule_status with code 2', () => {
    const result = lintReviewFindings({
      ledgerText: `${JSON.stringify({ ...LEDGER_ENTRY, rule_status: 'aggressive' })}\n`,
      scanRoots: [],
      error: () => {},
    });
    expect('code' in result).toBe(true);
  });

  it('collectSources skips tests and __tests__ but keeps stories', () => {
    const { root, scanRoot } = makeFixture();
    fixtureRoot = root;
    writeFileSync(
      join(scanRoot, 'Sample.stories.tsx'),
      'export const A = 1;\n'
    );
    writeFileSync(join(scanRoot, 'Sample.test.tsx'), 'export const B = 1;\n');
    mkdirSync(join(scanRoot, '__tests__'));
    writeFileSync(
      join(scanRoot, '__tests__', 'Deep.ts'),
      'export const C = 1;\n'
    );
    const files = collectSources(scanRoot).map(path => path.split('/').pop());
    expect(files).toContain('Sample.tsx');
    expect(files).toContain('Sample.stories.tsx');
    expect(files).not.toContain('Sample.test.tsx');
    expect(files).not.toContain('Deep.ts');
  });

  it('tolerates missing scan directories', () => {
    const result = lintReviewFindings({
      ledgerText: VALID_LEDGER,
      scanRoots: [join(tmpdir(), 'review-findings-does-not-exist')],
    });
    expect(result.code).toBe(0);
  });
});
