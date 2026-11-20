import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';
import {
  applyBenchmarkReview,
  benchmarkReviewErrors,
} from '../component-benchmark-review.mjs';
import { certifyComponent } from '../component-certificate.mjs';

const source = 'export const Kbd = () => <kbd>K</kbd>;';
const sourceHash = createHash('sha256').update(source).digest('hex');
const certify = benchmark =>
  applyBenchmarkReview(
    certifyComponent({
      path: 'packages/ui/atoms/kbd.tsx',
      source,
      evidence: { benchmark },
      packagesUi: true,
    }),
    benchmark
  );
const status = cert => cert.criteria.find(c => c.id === 'benchmark').status;
const current = extra => ({ libraryVersion: 1, sourceHash, ...extra });

describe('component benchmark review rule', () => {
  it('fails a current record that asserts no gaps without naming a reference', () => {
    const cert = certify(current({ gaps: [] }));
    assert.equal(status(cert), 'fail');
    assert.ok(cert.missing.some(m => m.criterion === 'benchmark'));
    assert.equal(cert.certified, false);
  });

  it('passes a record with a reference, or a written no-pattern reason', () => {
    assert.equal(
      status(certify(current({ reference: 'shadcn/ui Kbd', gaps: [] }))),
      'pass'
    );
    assert.equal(
      status(certify(current({ noPatternReason: 'static text', gaps: [] }))),
      'pass'
    );
  });

  it('requires item, decision, reference and status on every gap', () => {
    const errors = benchmarkReviewErrors({
      reference: 'APG Tabs',
      gaps: [
        { decision: 'adopt', reference: 'APG Tabs', status: 'done' },
        { item: 'x', decision: 'maybe', reference: 'APG Tabs' },
        { item: 'y', decision: 'adapt', status: 'done' },
        { item: 'z', decision: 'adopt', reference: 'APG Tabs' },
      ],
    });
    assert.deepEqual(errors, [
      'gap 1: item required',
      'gap 2: decision must be adopt, adapt or skip',
      'gap 2: status must be open or done',
      'gap 3: reference required',
      'gap 4: status must be open or done',
    ]);
    assert.deepEqual(benchmarkReviewErrors(null), ['record missing']);
  });

  it('keeps an open adopted gap failing and leaves stale records unknown', () => {
    const gap = { item: 'dir', decision: 'adopt', reference: 'APG Tabs' };
    const open = current({
      reference: 'APG Tabs',
      gaps: [{ ...gap, status: 'open' }],
    });
    assert.equal(status(certify(open)), 'fail');
    const done = current({
      reference: 'APG Tabs',
      gaps: [{ ...gap, status: 'done' }],
    });
    assert.equal(status(certify(done)), 'pass');
    const stale = { ...done, sourceHash: 'old' };
    assert.equal(status(certify(stale)), 'unknown');
    assert.equal(status(certify(undefined)), 'unknown');
  });

  it('every recorded @jovie/ui judgment satisfies the review rule', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
    const file = join(root, 'docs/design-system/component-benchmarks.json');
    const { components } = JSON.parse(readFileSync(file, 'utf8'));
    for (const [path, record] of Object.entries(components))
      assert.deepEqual(benchmarkReviewErrors(record), [], path);
  });
});
