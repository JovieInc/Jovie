import { describe, expect, it, vi } from 'vitest';
import {
  classifyLighthouseFailure,
  runWithClassifiedRetries,
} from '../../lighthouse-retry.mjs';

describe('Lighthouse classified retry', () => {
  it.each([
    'PROTOCOL_TIMEOUT: DOMSnapshot.disable timed out',
    'Waiting for DevTools protocol response has exceeded the allotted time',
  ])('classifies exact Chrome DevTools transport failures: %s', output => {
    expect(classifyLighthouseFailure(output)).toBe('transient_protocol');
  });

  it.each([
    'assertion failure for color-contrast audit: expected score of at least 1, but got 0',
    'expected score >= 0.95, received 0.78',
    'errors-in-console failure for minScore assertion\nexpected: >=0.9\nfound: 0\nAssertion failed.',
  ])('classifies deterministic Lighthouse assertions: %s', output => {
    expect(classifyLighthouseFailure(output)).toBe('deterministic_assertion');
  });

  it('does not retry a deterministic assertion', async () => {
    const executeAttempt = vi.fn().mockResolvedValue({
      code: 1,
      output: 'assertion failure for color-contrast: expected 1, but got 0',
    });
    const sleep = vi.fn();

    const result = await runWithClassifiedRetries({
      executeAttempt,
      sleep,
      report: vi.fn(),
    });

    expect(result.failureClass).toBe('deterministic_assertion');
    expect(result.attempts).toBe(1);
    expect(executeAttempt).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries only a transient protocol failure within the bounded budget', async () => {
    const executeAttempt = vi
      .fn()
      .mockResolvedValueOnce({ code: 1, output: 'PROTOCOL_TIMEOUT' })
      .mockResolvedValueOnce({ code: 0, output: '' });
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await runWithClassifiedRetries({
      executeAttempt,
      cooldownMs: 7,
      sleep,
      report: vi.fn(),
    });

    expect(result.failureClass).toBeNull();
    expect(result.attempts).toBe(2);
    expect(executeAttempt).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(7);
  });

  it('fails unknown errors immediately', async () => {
    const executeAttempt = vi
      .fn()
      .mockResolvedValue({ code: 2, output: 'Chrome exited unexpectedly' });

    const result = await runWithClassifiedRetries({
      executeAttempt,
      sleep: vi.fn(),
      report: vi.fn(),
    });

    expect(result).toMatchObject({
      code: 2,
      attempts: 1,
      failureClass: 'unknown',
    });
    expect(executeAttempt).toHaveBeenCalledTimes(1);
  });
});
