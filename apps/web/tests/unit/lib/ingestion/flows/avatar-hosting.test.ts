import { describe, expect, it } from 'vitest';
import { isSafeExternalHttpsUrl } from '@/lib/ingestion/flows/avatar-hosting';

describe('isSafeExternalHttpsUrl', () => {
  it('allows public https URLs', () => {
    expect(isSafeExternalHttpsUrl('https://example.com/avatar.png')).toBe(true);
  });

  it('rejects non-https URLs', () => {
    expect(isSafeExternalHttpsUrl('http://example.com/avatar.png')).toBe(false);
  });

  it('rejects private and internal hosts', () => {
    expect(isSafeExternalHttpsUrl('https://localhost/avatar.png')).toBe(false);
    expect(isSafeExternalHttpsUrl('https://foo.local/avatar.png')).toBe(false);
    expect(isSafeExternalHttpsUrl('https://foo.internal/avatar.png')).toBe(
      false
    );
    expect(isSafeExternalHttpsUrl('https://127.0.0.1/avatar.png')).toBe(false);
    expect(isSafeExternalHttpsUrl('https://[::1]/avatar.png')).toBe(false);
  });

  it('rejects private IP literals and link-local ranges', () => {
    expect(isSafeExternalHttpsUrl('https://10.0.0.1/avatar.png')).toBe(false);
    expect(isSafeExternalHttpsUrl('https://172.16.0.1/avatar.png')).toBe(false);
    expect(isSafeExternalHttpsUrl('https://192.168.1.1/avatar.png')).toBe(
      false
    );
    expect(isSafeExternalHttpsUrl('https://0.0.0.0/avatar.png')).toBe(false);
    expect(isSafeExternalHttpsUrl('https://[fe80::1]/avatar.png')).toBe(false);
    expect(
      isSafeExternalHttpsUrl('https://[::ffff:127.0.0.1]/avatar.png')
    ).toBe(false);
  });

  it('rejects metadata endpoints', () => {
    expect(
      isSafeExternalHttpsUrl('https://169.254.169.254/latest/meta-data')
    ).toBe(false);
    expect(
      isSafeExternalHttpsUrl(
        'https://metadata.google.internal/computeMetadata/v1/'
      )
    ).toBe(false);
  });
});
