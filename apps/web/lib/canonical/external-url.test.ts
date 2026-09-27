import { describe, expect, it } from 'vitest';

import { admitExternalUrl } from './external-url';

const PROVENANCE = { producer: 'test-producer@1' };

describe('EXTERNAL_URL_CONTRACT (JOV-5922 second field type)', () => {
  it('accepts a single https URL and returns its canonical href', () => {
    const decision = admitExternalUrl(
      'https://open.spotify.com/artist/123',
      PROVENANCE
    );
    expect(decision.status).toBe('accepted');
    expect(decision.canonical).toBe('https://open.spotify.com/artist/123');
  });

  it('quarantines concatenated or delimiter-joined URL lists', () => {
    for (const raw of [
      'https://a.com/x,https://b.com/y',
      'https://a.com/x|https://b.com/y',
      'https://a.com/x https://b.com/y',
      '["https://a.com/x","https://b.com/y"]',
    ]) {
      expect(admitExternalUrl(raw, PROVENANCE).status).toBe('quarantined');
    }
  });

  it('quarantines bare handles and non-http schemes', () => {
    const handle = admitExternalUrl('notaurl', PROVENANCE);
    expect(handle.status).toBe('quarantined');
    expect(handle.rejections.map(r => r.code)).toContain('not_parseable');

    const mailto = admitExternalUrl('mailto:a@b.com', PROVENANCE);
    expect(mailto.status).toBe('quarantined');
    expect(mailto.rejections.map(r => r.code)).toContain('unsupported_scheme');
  });
});
