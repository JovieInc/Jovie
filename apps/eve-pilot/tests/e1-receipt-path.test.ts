import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  E1_RECEIPT_NAME,
  resolveE1ReceiptPath,
} from '../agent/lib/e1-receipt-path.ts';

describe('resolveE1ReceiptPath (Gem-writable)', () => {
  const scratchDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      scratchDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))
    );
  });

  it('prefers E1_RECEIPT_PATH when set', async () => {
    const path = await resolveE1ReceiptPath({
      E1_RECEIPT_PATH: '/tmp/custom-e1-receipt.json',
      RUNNER_TEMP: '/tmp/should-not-use',
    });
    expect(path).toBe('/tmp/custom-e1-receipt.json');
  });

  it('uses RUNNER_TEMP before /opt/cursor (Gem EACCES regression for JOV-6163)', async () => {
    const runnerTemp = await mkdtemp(join(tmpdir(), 'e1-runner-temp-'));
    scratchDirs.push(runnerTemp);
    const path = await resolveE1ReceiptPath({
      RUNNER_TEMP: runnerTemp,
    });
    expect(path).toBe(join(runnerTemp, E1_RECEIPT_NAME));
    expect(path.startsWith('/opt/cursor')).toBe(false);
  });
});
