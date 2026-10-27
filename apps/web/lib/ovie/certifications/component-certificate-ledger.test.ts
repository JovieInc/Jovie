import { describe, expect, it } from 'vitest';
import type { CertificationRecordBackend } from '@/lib/agent-os/certification-cas';
import {
  COMPONENT_CERTIFICATE_LEDGER_KEY,
  type ComponentCertificateEntry,
  type ComponentCertificateReport,
  readComponentCertificateLedger,
  recordComponentCertificateReport,
  validateComponentCertificateReport,
} from './component-certificate-ledger';

function memoryBackend(): CertificationRecordBackend & {
  store: Map<string, string>;
} {
  const store = new Map<string, string>();
  return {
    store,
    get: async key => store.get(key) ?? null,
    setIfAbsent: async (key, value) => {
      if (store.has(key)) return false;
      store.set(key, value as string);
      return true;
    },
    compareAndSet: async (key, expected, next) => {
      if (store.get(key) !== expected) return false;
      store.set(key, next);
      return true;
    },
  };
}

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

const good: ComponentCertificateEntry = {
  component: 'apps/web/components/Good.tsx',
  certified: true,
  journeys: [],
  criteria: [
    { id: 'tokens', status: 'pass' },
    { id: 'journeys', status: 'na' },
  ],
  missing: [],
};
const bad: ComponentCertificateEntry = {
  component: 'apps/web/components/Bad.tsx',
  certified: false,
  journeys: ['signup'],
  criteria: [
    { id: 'tokens', status: 'fail' },
    { id: 'journeys', status: 'pass' },
  ],
  missing: [{ criterion: 'tokens', reason: 'raw color' }],
};

function report(
  overrides: Partial<ComponentCertificateReport> = {}
): ComponentCertificateReport {
  return {
    schema: 'jovie.component-certificate-report/v1',
    generatedAt: '2026-10-25T10:00:00.000Z',
    headSha: SHA_A,
    totals: {
      components: 2,
      certified: 1,
      byCriterion: {
        tokens: { pass: 1, fail: 1, unknown: 0, na: 0 },
        journeys: { pass: 1, fail: 0, unknown: 0, na: 1 },
      },
    },
    certificates: [good, bad],
    ...overrides,
  };
}

describe('component certificate ledger', () => {
  it('reads a missing ledger as null, never as zero', async () => {
    expect(await readComponentCertificateLedger(memoryBackend())).toBeNull();
  });

  it('records a report under the ledger key and reads it back', async () => {
    const backend = memoryBackend();
    const out = await recordComponentCertificateReport({
      backend,
      ingest: { report: report(), guards: null },
    });
    expect(out.status).toBe('recorded');
    expect(backend.store.has(COMPONENT_CERTIFICATE_LEDGER_KEY)).toBe(true);
    const ledger = await readComponentCertificateLedger(backend);
    expect(ledger?.latest?.headSha).toBe(SHA_A);
    expect(ledger?.latest?.totals.certified).toBe(1);
    expect(ledger?.history).toHaveLength(1);
  });

  it('replays an older or equal report instead of regressing the ledger', async () => {
    const backend = memoryBackend();
    await recordComponentCertificateReport({
      backend,
      ingest: { report: report(), guards: null },
    });
    const older = await recordComponentCertificateReport({
      backend,
      ingest: {
        report: report({
          generatedAt: '2026-10-25T09:00:00.000Z',
          headSha: SHA_B,
        }),
        guards: null,
      },
    });
    expect(older.status).toBe('stale');
    const ledger = await readComponentCertificateLedger(backend);
    expect(ledger?.latest?.headSha).toBe(SHA_A);
    expect(ledger?.history).toHaveLength(1);
  });

  it('rejects two head SHAs claiming the same generation time', async () => {
    const backend = memoryBackend();
    await recordComponentCertificateReport({
      backend,
      ingest: { report: report(), guards: null },
    });
    await expect(
      recordComponentCertificateReport({
        backend,
        ingest: { report: report({ headSha: SHA_B }), guards: null },
      })
    ).rejects.toThrow(/different head SHA/u);
  });

  it('applies a newer report', async () => {
    const backend = memoryBackend();
    await recordComponentCertificateReport({
      backend,
      ingest: { report: report(), guards: null },
    });
    const next = await recordComponentCertificateReport({
      backend,
      ingest: {
        report: report({
          generatedAt: '2026-10-25T11:00:00.000Z',
          headSha: SHA_B,
        }),
        guards: null,
      },
    });
    expect(next.status).toBe('recorded');
    const ledger = await readComponentCertificateLedger(backend);
    expect(ledger?.latest?.headSha).toBe(SHA_B);
    expect(ledger?.history).toHaveLength(2);
  });

  it('rejects totals that disagree with the certificates', () => {
    const errors = validateComponentCertificateReport(
      report({
        totals: { ...report().totals, certified: 2 },
      })
    );
    expect(errors.join()).toMatch(/totals.certified/u);
  });

  it('rejects a certified claim that its criteria contradict', () => {
    const errors = validateComponentCertificateReport(
      report({ certificates: [{ ...bad, certified: true, missing: [] }, good] })
    );
    expect(errors.join()).toMatch(/disagrees with its criteria/u);
  });

  it('rejects an uncertified component that names no missing criterion', () => {
    const errors = validateComponentCertificateReport(
      report({ certificates: [{ ...bad, missing: [] }, good] })
    );
    expect(errors.join()).toMatch(/without a missing criterion/u);
  });

  it('rejects per-criterion counts that disagree with the certificates', () => {
    const errors = validateComponentCertificateReport(
      report({
        totals: {
          ...report().totals,
          byCriterion: {
            ...report().totals.byCriterion,
            tokens: { pass: 2, fail: 0, unknown: 0, na: 0 },
          },
        },
      })
    );
    expect(errors.join()).toMatch(/byCriterion.tokens/u);
  });
});
