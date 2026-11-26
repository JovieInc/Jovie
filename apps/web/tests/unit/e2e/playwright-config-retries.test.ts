import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FALLBACK_CI_E2E_DEFAULT_RETRIES,
  resolveE2eDefaultRetries,
} from '../../e2e/utils/e2e-retry-budget';

const ledgerPath = path.resolve(__dirname, '../../quarantine.json');

function ledgerWith(retryBudget: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-retry-ledger-'));
  const file = path.join(dir, 'quarantine.json');
  fs.writeFileSync(
    file,
    JSON.stringify({ schemaVersion: 1, retryBudget, entries: [] })
  );
  return file;
}

describe('resolveE2eDefaultRetries', () => {
  it('reads retryBudget.e2eDefaultRetries from the ledger in CI', () => {
    expect(
      resolveE2eDefaultRetries({
        isCI: true,
        ledgerPath: ledgerWith({ e2eDefaultRetries: 1 }),
      })
    ).toBe(1);
    expect(
      resolveE2eDefaultRetries({
        isCI: true,
        ledgerPath: ledgerWith({ e2eDefaultRetries: 0 }),
      })
    ).toBe(0);
  });

  it('never retries locally', () => {
    expect(
      resolveE2eDefaultRetries({
        isCI: false,
        ledgerPath: ledgerWith({ e2eDefaultRetries: 2 }),
      })
    ).toBe(0);
  });

  it('keeps the pre-ledger CI default when the ledger is missing or invalid', () => {
    expect(FALLBACK_CI_E2E_DEFAULT_RETRIES).toBe(2);
    for (const retryBudget of [
      undefined,
      {},
      { e2eDefaultRetries: -1 },
      { e2eDefaultRetries: 1.5 },
      { e2eDefaultRetries: '2' },
    ]) {
      expect(
        resolveE2eDefaultRetries({
          isCI: true,
          ledgerPath: ledgerWith(retryBudget),
        })
      ).toBe(FALLBACK_CI_E2E_DEFAULT_RETRIES);
    }
    expect(
      resolveE2eDefaultRetries({
        isCI: true,
        ledgerPath: path.join(os.tmpdir(), 'missing-e2e-ledger.json'),
      })
    ).toBe(FALLBACK_CI_E2E_DEFAULT_RETRIES);
    expect(
      resolveE2eDefaultRetries({
        isCI: true,
        ledgerPath: 'unused',
        readFile: () => '{not json',
      })
    ).toBe(FALLBACK_CI_E2E_DEFAULT_RETRIES);
  });

  // JOV-12621: CI keeps the two retries it already ran with; the ledger now
  // states that value instead of a 0 that nothing read.
  it('the committed ledger keeps E2E CI retries at the current 2', () => {
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    expect(ledger.retryBudget.e2eDefaultRetries).toBe(2);
  });
});

describe('playwright config retries', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  async function loadRetries(): Promise<number | undefined> {
    vi.resetModules();
    const { default: config } = await import('../../../playwright.config');
    return config.retries;
  }

  it('takes CI retries from the quarantine ledger', async () => {
    process.env.CI = 'true';
    process.env.BASE_URL = 'http://localhost:3220';
    const readFileSync = fs.readFileSync;
    const reads: string[] = [];
    vi.spyOn(fs, 'readFileSync').mockImplementation(((
      file: fs.PathOrFileDescriptor,
      ...rest: unknown[]
    ) => {
      if (String(file) === ledgerPath) {
        reads.push(String(file));
        return JSON.stringify({ retryBudget: { e2eDefaultRetries: 1 } });
      }
      return (readFileSync as (...args: unknown[]) => unknown)(file, ...rest);
    }) as typeof fs.readFileSync);
    expect(await loadRetries()).toBe(1);
    expect(reads).toEqual([ledgerPath]);
  });

  it('uses the committed ledger value in CI', async () => {
    process.env.CI = 'true';
    process.env.BASE_URL = 'http://localhost:3220';
    expect(await loadRetries()).toBe(2);
  });

  it('does not retry outside CI', async () => {
    delete process.env.CI;
    delete process.env.BASE_URL;
    expect(await loadRetries()).toBe(0);
  });
});
