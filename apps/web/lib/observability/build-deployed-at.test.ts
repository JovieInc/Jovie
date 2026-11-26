import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { parseTimestampMs, resolveDeployedAtMs } from './build-deployed-at';

const require = createRequire(import.meta.url);
const { parseTimestampMs: parseStampMs } =
  require('../../scripts/write-build-deployed-at.cjs') as {
    parseTimestampMs: (value: unknown) => number | null;
  };

const ISO_MS = Date.parse('2020-01-02T03:04:05.000Z');

describe('resolveDeployedAtMs', () => {
  it('parses the same timestamps as the build-stamp writer', () => {
    const samples = [
      undefined,
      null,
      '',
      '   ',
      'not-a-time',
      '0',
      '1700000000',
      '1700000000000',
      '2020-01-02T03:04:05.000Z',
      1_700_000_000_000,
      1_700_000_000,
    ];
    for (const sample of samples) {
      expect(parseTimestampMs(sample)).toBe(parseStampMs(sample));
    }
  });

  it('prefers an explicit deployment time over the compiled build stamp', () => {
    expect(
      resolveDeployedAtMs({
        vercelDeploymentTime: '2020-01-02T03:04:05.000Z',
        generatedDeployedAt: 1_762_000_000_000,
        buildDeployedAt: '1761000000000',
      })
    ).toBe(ISO_MS);
  });

  it('uses the compiled build stamp when deployment time is missing', () => {
    expect(
      resolveDeployedAtMs({
        vercelDeploymentTime: '',
        generatedDeployedAt: 1_762_000_000_000,
        buildDeployedAt: '1761000000000',
      })
    ).toBe(1_762_000_000_000);
  });

  it('returns null when every source is missing or junk', () => {
    expect(
      resolveDeployedAtMs({
        vercelDeploymentTime: 'soon',
        generatedDeployedAt: null,
        buildDeployedAt: '',
      })
    ).toBeNull();
  });
});
