import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  evaluateCertificateGates,
  formatGateResult,
} from '../component-certificate-gate.mjs';

const cert = (component, rows) => ({
  component,
  criteria: Object.entries(rows).map(([id, status]) =>
    typeof status === 'string' ? { id, status } : { id, ...status }
  ),
});

const report = {
  certificates: [
    cert('packages/ui/atoms/a.tsx', { tokens: 'pass', a11y: 'pass' }),
    cert('packages/ui/atoms/b.tsx', {
      tokens: 'pass',
      a11y: { status: 'unknown', detail: 'no axe evidence' },
      states: {
        status: 'fail',
        states: { rtl: { status: 'pass' }, 'rtl-overflow': { status: 'fail' } },
      },
    }),
    cert('apps/web/components/c.tsx', { tokens: 'fail' }),
  ],
};

describe('component certificate gate', () => {
  it('passes when every gated criterion is pass or na', () => {
    const r = evaluateCertificateGates(
      {
        certificates: [
          cert('packages/ui/x.tsx', { tokens: 'pass', journeys: 'na' }),
        ],
      },
      { 'packages/ui/': ['tokens', 'journeys'] }
    );
    assert.equal(r.ok, true);
    assert.equal(r.gated, 1);
    assert.match(formatGateResult(r), /1 gated component\(s\) pass/);
  });

  it('fails closed on unknown and fail, naming component, criterion and missing states', () => {
    const r = evaluateCertificateGates(report, {
      'packages/ui/': ['tokens', 'a11y', 'states'],
    });
    assert.equal(r.ok, false);
    assert.deepEqual(
      r.failures.map(f => `${f.component}:${f.criterion}:${f.status}`),
      [
        'packages/ui/atoms/a.tsx:states:unknown',
        'packages/ui/atoms/b.tsx:a11y:unknown',
        'packages/ui/atoms/b.tsx:states:fail',
      ]
    );
    assert.equal(r.failures[2].detail, 'rtl-overflow');
    const text = formatGateResult(r);
    assert.match(text, /b\.tsx \[a11y\] unknown: no axe evidence/);
    assert.match(text, /written waiver/);
  });

  it('only gates components under the configured prefix', () => {
    const r = evaluateCertificateGates(report, { 'packages/ui/': ['tokens'] });
    assert.equal(r.ok, true);
    assert.equal(r.gated, 2);
  });

  it('rejects gates that are empty, unknown, or match nothing', () => {
    const r = evaluateCertificateGates(report, {
      'packages/ui/': [],
      'apps/web/': ['colour'],
      'packages/none/': ['tokens'],
    });
    assert.equal(r.ok, false);
    assert.deepEqual(r.errors, [
      'gate packages/ui/: needs a non-empty criteria list',
      'gate apps/web/: unknown criterion colour',
      'gate packages/none/: matches no component',
    ]);
    assert.match(formatGateResult(r), /config: gate apps\/web\/: unknown/);
  });

  it('passes with no gates configured', () => {
    assert.equal(evaluateCertificateGates(report).ok, true);
  });
});
