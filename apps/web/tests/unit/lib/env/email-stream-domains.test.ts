import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMAIL_STREAMS, getStreamDomain } from '@/lib/email/streams';
import { env } from '@/lib/env-server';

afterEach(() => vi.unstubAllEnvs());

describe('email stream server environment', () => {
  it.each(EMAIL_STREAMS)(
    'exposes the %s domain override to reports',
    stream => {
      const key = `EMAIL_STREAM_${stream.toUpperCase()}_DOMAIN`;
      const domain = `${stream}.example.com`;
      vi.stubEnv(key, domain);
      expect(getStreamDomain(stream, env)).toBe(domain);
    }
  );
});
