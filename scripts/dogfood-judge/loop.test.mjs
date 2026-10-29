import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readCases, score, validateCase } from './calibrate.mjs';
import { signReceipt } from './receipt.mjs';
import { resolveBindings } from './registry.mjs';
import {
  finding,
  miniRegistry,
  sampleReceipt,
  tempRegistryRoot,
} from './test-fixtures.mjs';

describe('calibration', () => {
  test('checked-in eval set is valid and covers both verdicts', () => {
    const cases = readCases();
    for (const c of cases) assert.deepEqual(validateCase(c), [], c.id);
    assert.ok(
      cases.some(c => c.truth === 'reject') &&
        cases.some(c => c.truth === 'approve')
    );
  });

  test('score treats reject as positive; a passed reject is a miss', () => {
    const s = score([
      {
        id: 'r1',
        truth: 'reject',
        expect: ['TT-03'],
        predicted: 'fail',
        criteria: ['TT-03'],
      },
      {
        id: 'r2',
        truth: 'reject',
        expect: ['TT-02'],
        predicted: 'pass',
        criteria: [],
      },
      { id: 'a1', truth: 'approve', predicted: 'fail', criteria: ['TT-09'] },
      { id: 'a2', truth: 'approve', predicted: 'pass', criteria: [] },
    ]);
    assert.equal(s.precision, 0.5);
    assert.equal(s.recall, 0.5);
    assert.deepEqual(s.misses, ['r2']);
    assert.deepEqual(s.falseAlarms, ['a1']);
    assert.equal(s.criterionRecall, 0.5);
    assert.equal(s.meetsFloors, false);
  });

  test('a reject must name the criteria it maps to', () => {
    assert.match(
      validateCase({
        id: 'abc',
        truth: 'reject',
        images: ['x'],
        words: 'w',
        source: 's',
      }).join(),
      /expected criterion/u
    );
  });
});

describe('report', () => {
  test('renders from design tokens with verdict, findings and no document skeleton', async () => {
    const { renderReport } = await import('./report.mjs');
    const f = {
      ...finding(),
      id: '4e-1',
      t: 92,
      video: 'v.mp4',
      imagePath: null,
      crop: null,
    };
    const html = renderReport({
      receipt: sampleReceipt({ verdict: 'fail', findings: [f] }),
      penRefs: [],
      title: 'Waitlist Judge Run',
    });
    assert.match(html, /^<title>Waitlist Judge Run<\/title>/u);
    assert.match(html, /--canvas:#[0-9a-f]{6}/iu);
    assert.doesNotMatch(html, /undefined|<html|<body/u);
    assert.match(html, /Value before price/u);
    assert.match(html, /v\.mp4 1:32/u);
  });
});

describe('publish: design-judge ledger for the waitlist gate (#23720)', () => {
  test('a pass is written only for a real, signed-off, current, signed pass; everything else is fail or absent', async () => {
    const { buildLedger, designLegDecision, LEDGER_SCHEMA, judgeFingerprint } =
      await import('./publish.mjs');
    const reg = miniRegistry();
    const resolved = resolveBindings(reg, tempRegistryRoot());
    const key = 'k';
    const good = signReceipt(sampleReceipt(), key);
    const ledger = buildLedger({
      registry: reg,
      receipts: { waitlist: good },
      resolved,
      signingKey: key,
    });
    assert.equal(ledger.schema, LEDGER_SCHEMA);
    assert.deepEqual(ledger.requiredSurfaces, ['waitlist']);
    assert.equal(ledger.surfaces.waitlist.verdict, 'pass');
    assert.equal(ledger.surfaces.waitlist.fingerprint, judgeFingerprint(good));
    assert.equal(
      ledger.surfaces.outbound,
      undefined,
      'never judged = absent, never a pass'
    );
    assert.equal(
      designLegDecision(ledger, 'a'.repeat(40)).ok,
      ledger.surfaces.waitlist.fingerprint === ledger.currentFingerprint
    );
    assert.equal(
      designLegDecision(ledger, 'b'.repeat(40)).ok,
      false,
      'another deploy is not signed off'
    );
    for (const bad of [
      sampleReceipt(),
      signReceipt(sampleReceipt({ verdict: 'fail', cold: 'fail' }), key),
      signReceipt(sampleReceipt({ cold: 'fail' }), key),
    ]) {
      assert.equal(
        buildLedger({
          registry: reg,
          receipts: { waitlist: bad },
          resolved,
          signingKey: key,
        }).surfaces.waitlist.verdict,
        'fail'
      );
    }
    assert.equal(
      buildLedger({
        registry: reg,
        receipts: { waitlist: good },
        resolved,
        signingKey: '',
      }).surfaces.waitlist.verdict,
      'fail',
      'no signing key available: never publish a pass'
    );
    const stale = buildLedger({
      registry: reg,
      receipts: { waitlist: good },
      resolved: { ...resolved, chat: 'zai/glm-6' },
      signingKey: key,
    });
    assert.equal(
      stale.surfaces.waitlist.verdict,
      'fail',
      'a surface model change unsigns the surface'
    );
  });

  test('POST needs CRON_SECRET and sends the ledger', async () => {
    const { postLedger } = await import('./publish.mjs');
    await assert.rejects(postLedger({}, { secret: '' }), /CRON_SECRET/u);
    /** @type {any} */
    let seen;
    const res = await postLedger(
      { schema: 'x' },
      {
        secret: 's',
        fetchImpl: async (url, init) => {
          seen = { url: String(url), init };
          return { ok: true, text: async () => '{"ok":true}' };
        },
      }
    );
    assert.deepEqual(res, { ok: true });
    assert.match(seen.url, /\/api\/internal\/ovie\/dogfood-judge-evidence$/u);
    assert.equal(seen.init.headers.authorization, 'Bearer s');
  });
});
