import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getEnabledBioProviders } from './providers';
import { unsupportedApiBioSync } from './service';

describe('DSP bio API sync', () => {
  it('keeps API providers disabled and out of the enabled set', () => {
    const enabled = getEnabledBioProviders();
    expect(enabled.length).toBeGreaterThan(0);
    expect(enabled.every(([, provider]) => provider.method !== 'api')).toBe(
      true
    );
    expect(enabled.map(([id]) => id)).not.toContain('soundcloud');
    expect(enabled.map(([id]) => id)).not.toContain('youtube_music');
  });

  it('reports API sync as unavailable without a stored request id', () => {
    expect(unsupportedApiBioSync('soundcloud', 'SoundCloud')).toEqual({
      providerId: 'soundcloud',
      method: 'api',
      status: 'unsupported',
      syncRequestId: '',
      error: 'SoundCloud bio sync is not available yet',
    });
  });

  it('lists only enabled providers from the bio-sync route', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/api/dsp/bio-sync/route.ts'),
      'utf8'
    );
    expect(source).toContain('getEnabledBioProviders()');
    expect(source).not.toContain('Object.entries(DSP_BIO_PROVIDERS)');
  });
});
