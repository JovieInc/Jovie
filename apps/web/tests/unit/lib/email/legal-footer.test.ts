import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getEmailPostalFooterHtml,
  getEmailPostalFooterText,
} from '@/lib/email/legal-footer';

describe('email legal footer', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prints the entity name when no mailing address is configured', () => {
    vi.stubEnv('LEGAL_MAILING_ADDRESS', '');
    expect(getEmailPostalFooterText()).toContain('Jovie Technology Inc.');
  });

  it('appends and escapes the configured mailing address', () => {
    vi.stubEnv('LEGAL_MAILING_ADDRESS', '1 Example St <Suite 2>');
    expect(getEmailPostalFooterText()).toContain('1 Example St <Suite 2>');
    const html = getEmailPostalFooterHtml();
    expect(html).toContain('1 Example St &lt;Suite 2&gt;');
    expect(html).not.toContain('<Suite 2>');
  });
});
