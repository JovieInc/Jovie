import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  collectSources,
  lintReviewFindings,
  parseLedger,
  parseRules,
} from './lint-review-findings.mjs';

const VALID_LEDGER = `${JSON.stringify({
  id: 'RF-0001',
  date: '2026-11-19',
  finding_class: 'design/all-caps-wide-tracking',
  layer_encoded: 'lint',
  pr_url: null,
  notes: 'seed entry',
})}\n`;

const VALID_RULES = JSON.stringify({
  schema: 'jovie.review-findings.banned-values/v1',
  note: 'test rules',
  rules: [
    {
      id: 'RF-TEST-001',
      title: 'No uppercase wide tracking',
      source: 'ASR-TEST',
      status: 'shadow',
      pattern: 'uppercase[^\'"`\\n]*tracking-widest',
      justification: 'test rule',
      ledgerEntry: 'RF-0001',
    },
  ],
});

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
      rulesText: VALID_RULES,
      webRoot: root,
      scanRoots: [scanRoot],
      log: (...lines) => out.push(lines.join(' ')),
    });
    expect(result.code).toBe(0);
    const text = out.join('\n');
    expect(text).toContain('1 ledger entry');
    expect(text).toContain('[shadow] RF-TEST-001');
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
      rulesText: VALID_RULES,
      webRoot: root,
      scanRoots: [scanRoot],
      log: (...lines) => out.push(lines.join(' ')),
    });
    expect(result.code).toBe(0);
    const parsed = JSON.parse(out.join(''));
    expect(parsed.ledgerEntries).toBe(1);
    expect(parsed.hits['RF-TEST-001']).toEqual([
      { file: 'components/Sample.tsx', line: 1 },
    ]);
  });

  it('passes --strict when only shadow rules have hits', () => {
    const { root, scanRoot } = makeFixture();
    fixtureRoot = root;
    const result = lintReviewFindings({
      args: ['--strict'],
      ledgerText: VALID_LEDGER,
      rulesText: VALID_RULES,
      webRoot: root,
      scanRoots: [scanRoot],
    });
    expect(result.code).toBe(0);
  });

  it('fails --strict when an enforced rule has hits', () => {
    const { root, scanRoot } = makeFixture();
    fixtureRoot = root;
    const enforced = JSON.stringify({
      ...JSON.parse(VALID_RULES),
      rules: [{ ...JSON.parse(VALID_RULES).rules[0], status: 'enforced' }],
    });
    /** @type {string[]} */
    const err = [];
    const result = lintReviewFindings({
      args: ['--strict'],
      ledgerText: VALID_LEDGER,
      rulesText: enforced,
      webRoot: root,
      scanRoots: [scanRoot],
      error: (...lines) => err.push(lines.join(' ')),
    });
    expect(result.code).toBe(1);
    expect(err.join('')).toContain('--strict failed with 1 enforced-rule hit');
  });

  it('rejects a malformed ledger line with code 2', () => {
    /** @type {string[]} */
    const err = [];
    const result = lintReviewFindings({
      ledgerText: 'not json at all\n',
      rulesText: VALID_RULES,
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

  it('rejects rules with an invalid regex pattern', () => {
    /** @type {string[]} */
    const err = [];
    const result = parseRules(
      JSON.stringify({
        schema: 'jovie.review-findings.banned-values/v1',
        rules: [
          {
            id: 'RF-BAD',
            title: 't',
            source: 's',
            status: 'shadow',
            pattern: '([unclosed',
            justification: 'j',
          },
        ],
      }),
      (...lines) => err.push(lines.join(' '))
    );
    expect('code' in result).toBe(true);
    expect(err.join('')).toContain('invalid pattern');
  });

  it('rejects rules with an unknown status', () => {
    const result = parseRules(
      JSON.stringify({
        schema: 'jovie.review-findings.banned-values/v1',
        rules: [
          {
            id: 'RF-BAD',
            title: 't',
            source: 's',
            status: 'aggressive',
            pattern: 'x',
            justification: 'j',
          },
        ],
      }),
      () => {}
    );
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
      rulesText: VALID_RULES,
      scanRoots: [join(tmpdir(), 'review-findings-does-not-exist')],
    });
    expect(result.code).toBe(0);
  });
});
