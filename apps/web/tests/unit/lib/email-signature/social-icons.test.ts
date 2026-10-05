import { existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { EMAIL_SIGNATURE_ICON_BASE_PATH } from '@/lib/email-signature/icon-path';
import {
  getEmailSignatureIconKey,
  getEmailSignatureIconUrl,
} from '@/lib/email-signature/social-icons';
import {
  normalizeSocialIconKey,
  SOCIAL_ICON_DATA,
} from '@/lib/social-icons/icon-data';

const PUBLIC_ICON_DIR = path.join(
  process.cwd(),
  'public',
  ...EMAIL_SIGNATURE_ICON_BASE_PATH.split('/').filter(Boolean)
);

describe('email signature social icons', () => {
  it('resolves platform ids, slugs, and display names to one icon key', () => {
    expect(getEmailSignatureIconKey('instagram')).toBe('instagram');
    expect(getEmailSignatureIconKey('Apple Music')).toBe('applemusic');
    expect(getEmailSignatureIconKey('apple_music')).toBe('applemusic');
    expect(getEmailSignatureIconKey('x')).toBe('x');
    expect(getEmailSignatureIconKey('not-a-platform')).toBeNull();
  });

  it('builds versioned https icon URLs under the Jovie host', () => {
    expect(getEmailSignatureIconUrl('spotify')).toBe(
      'https://jov.ie/email-signature/social-icons/v1/spotify.png'
    );
    expect(getEmailSignatureIconUrl('unknown')).toBeNull();
  });

  it('keeps every canonical icon key backed by a generated PNG', () => {
    const expectedKeys = new Set(
      Object.keys(SOCIAL_ICON_DATA).map(normalizeSocialIconKey).filter(Boolean)
    );
    for (const key of expectedKeys) {
      expect(getEmailSignatureIconKey(key), `missing map entry: ${key}`).toBe(
        key
      );
      expect(
        existsSync(path.join(PUBLIC_ICON_DIR, `${key}.png`)),
        `missing generated PNG: ${key}.png`
      ).toBe(true);
    }
  });
});
