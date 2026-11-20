import { describe, expect, it } from 'vitest';
import {
  compareToBaseline,
  countFindings,
  isScannedTestFile,
  isUnitSuite,
  lowerBaseline,
  scanTestFile,
} from '../test-hygiene.mjs';

// Test-modifier spellings are built, not written, so the gate-weakening detector
// doesn't read these fixtures as focused or skipped tests being added.
const m = (fn, modifier) => [fn, modifier].join('.');
const ONLY = fn => m(fn, 'only');
const SKIP = fn => m(fn, 'skip');
const X = fn => `x${fn}`;

const rules = (text, options) =>
  scanTestFile('x.test.ts', text, options).map(f => f.rule);

describe('scanTestFile', () => {
  it('scans a test, not its steps, suites or hooks', () => {
    expect(
      rules(
        "test('a', async () => { await test.step('open', async () => { await go(); }); expect(f()).toBe(1); });"
      )
    ).toEqual([]);
    expect(
      rules(
        "test.describe('s', () => { test.beforeEach(async () => { await go(); }); });"
      )
    ).toEqual([]);
    expect(rules("test('a', async () => { await go(); });")).toEqual([
      'no-assertion',
    ]);
  });

  it('flags focused tests anywhere, but not a helper that happens to be named fit', () => {
    expect(
      rules(`${ONLY('it')}('a', () => { expect(f()).toBe(1); });`)
    ).toEqual(['focused']);
    expect(rules(`${ONLY('describe')}('s', () => {});`)).toEqual(['focused']);
    expect(rules(`${ONLY('it')}(caseName, () => {});`)).toEqual(['focused']);
    expect(rules('fit(box, () => {});')).toEqual([]);
    expect(rules("fit('a', () => { expect(f()).toBe(1); });")).toEqual([
      'focused',
    ]);
    expect(
      rules(
        "it('a', async () => { await fit(page, box); expect(f()).toBe(1); });"
      )
    ).toEqual([]);
  });

  it('flags skips and todos in unit suites only', () => {
    const text = `${SKIP('it')}('a', () => {}); it.todo('b'); ${X('describe')}('c', () => {});`;
    expect(rules(text)).toEqual(['skipped', 'skipped', 'skipped']);
    expect(rules(text, { unit: false })).toEqual([]);
    expect(rules(`${SKIP('test')}(!process.env.CI, 'needs CI');`)).toEqual([]);
  });

  it('flags a test with no assertion, and accepts asserting helpers and expect.fail', () => {
    expect(rules("it('a', () => { run(); });")).toEqual(['no-assertion']);
    expect(rules("it('a', () => { assert.equal(run(), 1); });")).toEqual([]);
    expect(rules("it('a', () => { expectSame(run()); });")).toEqual([]);
    expect(
      rules(
        "function contract(x) { expect(x).toBe(1); }\nit('a', () => contract(run()));"
      )
    ).toEqual([]);
    expect(rules("it('a', () => { if (bad()) expect.fail('no'); });")).toEqual(
      []
    );
  });

  it('flags tautologies and existence-only checks', () => {
    expect(rules("it('a', () => { expect(true).toBe(true); });")).toEqual([
      'tautology',
    ]);
    expect(
      rules(
        "it('a', () => { expect(x).toBeDefined(); expect(y).not.toBeNull(); });"
      )
    ).toEqual(['existence-only']);
    expect(
      rules(
        "it('a', () => { expect(x).toBeDefined(); expect(x.id).toBe(3); });"
      )
    ).toEqual([]);
  });

  it('flags call-count checks on imported collaborators but not on prop callbacks', () => {
    const imported = "import { track } from './track';\n";
    expect(
      rules(
        `${imported}it('a', () => { run(); expect(track).toHaveBeenCalled(); });`
      )
    ).toEqual(['mock-only']);
    expect(
      rules(
        `${imported}it('a', () => { run(); expect(vi.mocked(track)).toHaveBeenCalledTimes(1); });`
      )
    ).toEqual(['mock-only']);
    expect(
      rules(
        `${imported}it('a', () => { run(); expect(track).toHaveBeenCalledWith('x'); });`
      )
    ).toEqual([]);
    expect(
      rules(
        "it('a', () => { const onClick = vi.fn(); click(onClick); expect(onClick).toHaveBeenCalled(); });"
      )
    ).toEqual([]);
  });

  it('flags snapshot-only tests', () => {
    expect(
      rules("it('a', () => { expect(render()).toMatchSnapshot(); });")
    ).toEqual(['snapshot-only']);
    expect(
      rules(
        "it('a', () => { expect(render()).toMatchSnapshot(); expect(n).toBe(2); });"
      )
    ).toEqual([]);
  });

  it('flags real-time sleeps unless the file uses fake timers', () => {
    const sleep =
      "it('a', async () => { await new Promise(r => setTimeout(r, 200)); expect(f()).toBe(1); });";
    expect(rules(sleep)).toEqual(['real-sleep']);
    expect(rules(`vi.useFakeTimers();\n${sleep}`)).toEqual([]);
    expect(
      rules(
        "it('a', async () => { await new Promise(r => setTimeout(r, 0)); expect(f()).toBe(1); });"
      )
    ).toEqual([]);
    expect(
      rules(
        "it('a', async () => { await page.waitForTimeout(500); expect(f()).toBe(1); });"
      )
    ).toEqual(['real-sleep']);
  });

  it('flags mocking the module the file is named after, but not its dependencies', () => {
    const subject = (file, text) =>
      scanTestFile(file, text)
        .map(f => f.rule)
        .filter(rule => rule === 'mocked-subject');
    const renders = "it('a', () => { expect(f()).toBe(1); });";
    expect(
      subject('PricingTable.test.tsx', `vi.mock('./PricingTable');\n${renders}`)
    ).toEqual(['mocked-subject']);
    expect(
      subject(
        'PricingTable.certificate.test.tsx',
        `vi.mock('./PricingTable');\n${renders}`
      )
    ).toEqual(['mocked-subject']);
    // Dependencies stay mockable: packages, aliases, differently-named
    // siblings, and observation spies.
    expect(
      subject('redis.test.ts', `vi.mock('@upstash/redis');\n${renders}`)
    ).toEqual([]);
    expect(
      subject('rate-limit.test.ts', `vi.mock('@/lib/rate-limit');\n${renders}`)
    ).toEqual([]);
    expect(subject('checkout.test.ts', `vi.mock('./db');\n${renders}`)).toEqual(
      []
    );
    expect(
      subject(
        'checkout.test.ts',
        `it('a', () => { vi.spyOn(db, 'query'); expect(f()).toBe(1); });`
      )
    ).toEqual([]);
  });

  it('flags retry budgets and raised timeouts as flake masking', () => {
    const OPT = (key, value) => `{ ${key}: ${value} }`;
    const renders = '() => { expect(f()).toBe(1); }';
    expect(rules(`it('a', ${OPT('retry', 2)}, ${renders});`)).toEqual([
      'flake-mask',
    ]);
    expect(rules(`describe('d', ${OPT('retries', 3)}, ${renders});`)).toEqual([
      'flake-mask',
    ]);
    expect(
      rules(
        `it('a', () => { ${['this', 'retries'].join('.')}(_n); expect(f()).toBe(1); });`
      )
    ).toEqual(['flake-mask']);
    expect(
      rules(`test.${['re', 'try'].join('')}(2)('a', ${renders});`)
    ).toEqual(['flake-mask']);
    expect(
      rules(`jest.${['set', 'Timeout'].join('')}(30000); it('a', ${renders});`)
    ).toEqual(['flake-mask']);
    expect(rules(`it('a', ${OPT('timeout', 15000)}, ${renders});`)).toEqual([
      'flake-mask',
    ]);
    expect(
      rules(`test.use(${OPT('testTimeout', 20000)}); it('a', ${renders});`)
    ).toEqual(['flake-mask']);
  });

  it('keeps query configs, disabling retries and condition budgets clean', () => {
    const OPT = (key, value) => `{ ${key}: ${value} }`;
    const renders = '() => { expect(f()).toBe(1); }';
    expect(
      rules(
        "it('a', () => { mount(new QueryClient({ defaultOptions: { queries: { retry: false } } })); expect(f()).toBe(1); });"
      )
    ).toEqual([]);
    expect(rules(`it('a', ${OPT('timeout', 4000)}, ${renders});`)).toEqual([]);
    expect(
      rules(
        "it('a', async () => { await vi.waitFor(fn, { timeout: 8000 }); expect(f()).toBe(1); });"
      )
    ).toEqual([]);
    expect(
      rules(
        "it('a', async () => { await expect(row).toBeVisible({ timeout: 30000 }); });"
      )
    ).toEqual([]);
  });

  it('scans conditional and table tests, and does not take check() for an assertion', () => {
    expect(rules("it.skipIf(ci)('a', async () => { await go(); });")).toEqual([
      'no-assertion',
    ]);
    expect(rules("it.each`a\n${1}`('a $a', () => { f(); });")).toEqual([
      'no-assertion',
    ]);
    expect(
      rules(
        "test('a', async () => { await box.check(); await checkbox.click(); });"
      )
    ).toEqual(['no-assertion']);
    expect(
      rules(
        "test('a', async () => { await checkTotals(page); assertSaved(); });"
      )
    ).toEqual([]);
  });

  it('counts a timer inside an awaited promise executor as awaited', () => {
    const body =
      'resolve => { setTimeout(() => { expect(f()).toBe(1); resolve(); }, 1); }';
    expect(
      rules(`it('a', async () => { await new Promise(${body}); });`)
    ).toEqual([]);
    expect(rules(`it('a', () => { new Promise(${body}); });`)).toEqual([
      'unawaited-expect',
    ]);
  });

  it('flags expect inside an un-awaited .then, not an awaited or returned one', () => {
    expect(
      rules("it('a', () => { load().then(v => { expect(v).toBe(1); }); });")
    ).toEqual(['unawaited-expect']);
    expect(
      rules(
        "it('a', async () => { await load().then(v => { expect(v).toBe(1); }); });"
      )
    ).toEqual([]);
    expect(
      rules("it('a', () => load().then(v => { expect(v).toBe(1); }));")
    ).toEqual([]);
  });

  it('counts every vi.mock past the eighth as over-mocked', () => {
    const mocks = Array.from(
      { length: 10 },
      (_, i) => `vi.mock('./m${i}');`
    ).join('\n');
    expect(rules(`${mocks}\nit('a', () => { expect(f()).toBe(1); });`)).toEqual(
      ['over-mocked', 'over-mocked']
    );
  });
});

describe('ratchet', () => {
  const current = countFindings({
    'a.test.ts': [{ rule: 'skipped' }, { rule: 'skipped' }],
    'b.test.ts': [{ rule: 'focused' }, { rule: 'real-sleep' }],
  });

  it('fails on growth, on new files and on any focused test', () => {
    expect(
      compareToBaseline(
        { skipped: { 'a.test.ts': 2 }, focused: { 'b.test.ts': 1 } },
        current
      )
    ).toEqual([
      { rule: 'focused', file: 'b.test.ts', count: 1, allowed: 0 },
      { rule: 'real-sleep', file: 'b.test.ts', count: 1, allowed: 0 },
    ]);
    expect(
      compareToBaseline({ skipped: { 'a.test.ts': 1 } }, current)
    ).toContainEqual({
      rule: 'skipped',
      file: 'a.test.ts',
      count: 2,
      allowed: 1,
    });
  });

  it('never baselines zero-tolerance rules', () => {
    expect(
      compareToBaseline(
        { 'mocked-subject': { 'a.test.ts': 9 } },
        { 'mocked-subject': { 'a.test.ts': 1 } }
      )
    ).toEqual([
      { rule: 'mocked-subject', file: 'a.test.ts', count: 1, allowed: 0 },
    ]);
    expect(
      lowerBaseline(
        { 'mocked-subject': { 'a.test.ts': 3 } },
        { 'mocked-subject': { 'a.test.ts': 1 } }
      )
    ).toEqual({});
  });

  it('only lowers the baseline and drops fixed pairs', () => {
    expect(
      lowerBaseline(
        {
          skipped: { 'a.test.ts': 5, 'gone.test.ts': 3 },
          focused: { 'b.test.ts': 1 },
        },
        current
      )
    ).toEqual({ skipped: { 'a.test.ts': 2 } });
  });

  it('scans our own suites and judges skips only in unit suites', () => {
    expect(isScannedTestFile('.agents/skills/x.test.ts')).toBe(false);
    expect(isScannedTestFile('scripts/invariants/fixtures/red/a.test.ts')).toBe(
      false
    );
    expect(isScannedTestFile('apps/web/lib/a.test.ts')).toBe(true);
    expect(isUnitSuite('apps/web/tests/e2e/a.spec.ts')).toBe(false);
    expect(isUnitSuite('apps/web/lib/a.test.ts')).toBe(true);
  });
});
