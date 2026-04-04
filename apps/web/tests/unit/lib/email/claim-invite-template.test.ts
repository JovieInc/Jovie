import { describe, expect, it } from 'vitest';
import type { ClaimInviteTemplateData } from '@/lib/email/templates/claim-invite';
import {
  getClaimInviteEmail,
  getClaimInviteHtml,
  getClaimInviteSubject,
  getClaimInviteText,
} from '@/lib/email/templates/claim-invite';

const baseData: ClaimInviteTemplateData = {
  creatorName: 'Tom River',
  username: 'tomriver',
  claimToken: 'claim-token-123',
  recipientEmail: 'tom@example.com',
};

describe('claim invite founder copy', () => {
  it('uses the founder-led subject line', () => {
    expect(getClaimInviteSubject(baseData)).toBe(
      'I made you a free Jovie profile'
    );
  });

  it('uses founder voice in plain text copy', () => {
    const text = getClaimInviteText(baseData);

    expect(text).toContain("I'm Tim. I'm an artist");
    expect(text).toContain('using tools like Linktree');
    expect(text).toContain("It's completely free");
    expect(text).toContain("I'll get you verified");
    expect(text).toContain('Cheers,');
    expect(text).toContain('\nTim\n');
  });

  it('uses founder voice in html copy', () => {
    const html = getClaimInviteHtml(baseData);

    expect(html).toContain("I'm Tim. I'm an artist");
    expect(html).toContain('made you a free profile to try');
    expect(html).toContain("It's completely free");
    expect(html).toContain("I'll get you verified");
    expect(html).toContain('Cheers,<br>Tim');
    expect(html).toContain('https://jov.ie/tomriver');
    expect(html).toContain(
      'href="https://jov.ie/tomriver/claim?token=claim-token-123"'
    );
  });

  it('returns the updated subject in the full email payload', () => {
    const email = getClaimInviteEmail(baseData);

    expect(email.subject).toBe('I made you a free Jovie profile');
  });
});
