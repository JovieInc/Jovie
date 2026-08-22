import { describe, expect, it, vi } from 'vitest';
import {
  FORBIDDEN_QUERY_KEYS,
  sanitizeErrorMessage,
} from '@/lib/ovie/shipping-state';
import {
  createLiveShippingStateReaders,
  isAllowlistedAuthorityPath,
  NAMED_AUTHORITY_PATHS,
  resolveNamedAuthorityPath,
} from '@/lib/ovie/shipping-state/live';

describe('shipping-state security', () => {
  it('refuses arbitrary file paths', () => {
    expect(isAllowlistedAuthorityPath('/etc/passwd')).toBe(false);
    expect(isAllowlistedAuthorityPath('/var/log/syslog')).toBe(false);
    expect(isAllowlistedAuthorityPath('~/.hermes/logs/jobs.jsonl')).toBe(false);
    expect(
      isAllowlistedAuthorityPath(NAMED_AUTHORITY_PATHS['fleet-receipt'])
    ).toBe(true);
    expect(resolveNamedAuthorityPath('exact-sha-ci')).toBeNull();
  });

  it('strips secrets, credentials, and filesystem paths from errors', () => {
    expect(
      sanitizeErrorMessage(
        'failed ghp_abcdefghijklmnopqrstuvwxyz012345 /home/timwhite/.ssh/id_rsa Bearer abcdef'
      )
    ).not.toMatch(/ghp_|Bearer abcdef|\/home\/timwhite/);
    expect(
      sanitizeErrorMessage(
        'system prompt leaked conversation at ~/secrets/token'
      )
    ).toContain('[redacted]');
    expect(
      sanitizeErrorMessage(
        'system prompt leaked conversation at ~/secrets/token'
      )
    ).toContain('[path]');
  });

  it('never executes commands or reads caller-supplied paths', async () => {
    const readFile = vi.fn(async (path: string) => {
      throw Object.assign(new Error(`refused ${path}`), { code: 'ENOENT' });
    });
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    });
    const readers = createLiveShippingStateReaders({
      readFile,
      fetch: fetchImpl,
    });
    await readers['fleet-receipt']();
    await readers['symphony-runtime']();
    expect(readFile).not.toHaveBeenCalledWith('/etc/passwd');
    expect(readFile).not.toHaveBeenCalledWith('/var/log/syslog');
    for (const call of readFile.mock.calls) {
      expect(isAllowlistedAuthorityPath(call[0])).toBe(true);
    }
    expect(FORBIDDEN_QUERY_KEYS).not.toContain('kiosk');
  });
});
