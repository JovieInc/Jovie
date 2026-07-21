import { describe, expect, it } from 'vitest';
import {
  getPromoDownloadAudioUploadPath,
  isPromoDownloadAudioUploadPath,
} from '@/lib/audio/upload-paths';

describe('promo download audio upload paths', () => {
  const releaseId = '00000000-0000-4000-8000-000000000001';

  it('scopes upload paths to a release and strips caller path segments', () => {
    expect(getPromoDownloadAudioUploadPath(releaseId, '../mix.wav')).toBe(
      `promo-downloads/${releaseId}/mix.wav`
    );
    expect(getPromoDownloadAudioUploadPath(releaseId, '')).toBe(
      `promo-downloads/${releaseId}/audio`
    );
  });

  it('accepts only direct files inside the expected release namespace', () => {
    expect(
      isPromoDownloadAudioUploadPath(
        releaseId,
        `promo-downloads/${releaseId}/mix-abc123.wav`
      )
    ).toBe(true);
    expect(
      isPromoDownloadAudioUploadPath(
        '00000000-0000-4000-8000-000000000002',
        `promo-downloads/${releaseId}/mix.wav`
      )
    ).toBe(false);
    expect(
      isPromoDownloadAudioUploadPath(
        releaseId,
        `promo-downloads/${releaseId}/nested/mix.wav`
      )
    ).toBe(false);
  });
});
