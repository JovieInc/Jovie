import { describe, expect, it } from 'vitest';

import { APP_NAME } from '@/constants/app';
import { SUPPORT_EMAIL } from '@/constants/domains';

import {
  getPaidWelcomeEmail,
  getPaidWelcomeHtml,
  getPaidWelcomeSubject,
  getPaidWelcomeText,
} from './paid-welcome';

describe('paid welcome template', () => {
  it('names the purchased offer in the subject', () => {
    expect(getPaidWelcomeSubject({ offerName: 'Pro' })).toBe(
      `Your ${APP_NAME} Pro plan is active`
    );
  });

  it('uses a generic greeting when no safe first name is provided', () => {
    const text = getPaidWelcomeText({ offerName: 'Pro' });
    expect(text.startsWith('Hey,')).toBe(true);
    expect(text).toContain('Pro subscription is confirmed');
    expect(text).toContain(SUPPORT_EMAIL);
    expect(text).toMatch(/Open /);
    expect(text).toContain('Manage billing or recover access');
  });

  it('personalizes only a provided first name', () => {
    const text = getPaidWelcomeText({
      firstName: 'Ada',
      offerName: 'Pro',
    });
    expect(text.startsWith('Hey Ada,')).toBe(true);
  });

  it('includes activation, billing, and support links in HTML', () => {
    const html = getPaidWelcomeHtml({
      offerName: 'Pro',
      activationUrl: 'https://jov.ie/app/',
      billingUrl: 'https://jov.ie/app/settings/billing',
      supportUrl: 'https://jov.ie/support',
    });
    expect(html).toContain('https://jov.ie/app/');
    expect(html).toContain('https://jov.ie/app/settings/billing');
    expect(html).toContain('https://jov.ie/support');
    expect(html).toContain(SUPPORT_EMAIL);
  });

  it('returns subject, text, and html together', () => {
    const email = getPaidWelcomeEmail({ offerName: 'Pro' });
    expect(email.subject).toContain('Pro');
    expect(email.text).toContain('Pro');
    expect(email.html).toContain('Pro');
  });
});
