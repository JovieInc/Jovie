import { describe, expect, it } from 'vitest';
import {
  appendSourceUtmParams,
  buildSourceLinkCode,
} from '@/lib/audience/source-links';

describe('audience source link codes', () => {
  it('generates URL-safe QR-friendly codes', () => {
    const code = buildSourceLinkCode('London - O2 Arena');

    expect(code).toMatch(/^london-o2-arena-[a-z2-9]{8}$/);
    expect(code.length).toBeLessThanOrEqual(32);
  });

  it('generates short codes without a seed', () => {
    const code = buildSourceLinkCode();

    expect(code).toMatch(/^[a-z2-9]{8}$/);
  });

  it('appends UTM params without overwriting non-UTM destination params', () => {
    const url = appendSourceUtmParams(
      'https://example.com/profile?existing=true',
      {
        source: 'qr_code',
        medium: 'print',
        campaign: 'tour-flyers',
        content: 'london-o2-arena',
      }
    );

    expect(url).toBe(
      'https://example.com/profile?existing=true&utm_source=qr_code&utm_medium=print&utm_campaign=tour-flyers&utm_content=london-o2-arena'
    );
  });
});
