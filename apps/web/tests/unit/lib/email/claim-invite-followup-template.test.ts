import { describe, expect, it } from 'vitest';
import type { FollowUpTemplateData } from '@/lib/email/templates/claim-invite-followup';
import {
  getFollowUpEmail,
  getFollowUpHtml,
  getFollowUpSubject,
  getFollowUpText,
} from '@/lib/email/templates/claim-invite-followup';

const buildData = (
  followUpNumber: FollowUpTemplateData['followUpNumber']
): FollowUpTemplateData => ({
  creatorName: 'Tom River',
  username: 'tomriver',
  claimToken: 'claim-token-123',
  recipientEmail: 'tom@example.com',
  followUpNumber,
});

describe('claim invite follow-up founder copy', () => {
  it('uses the approved follow-up subjects', () => {
    expect(getFollowUpSubject(buildData(1))).toBe(
      'Did you see the profile I made for you?'
    );
    expect(getFollowUpSubject(buildData(2))).toBe('Curious what you think');
    expect(getFollowUpSubject(buildData(3))).toBe('Last note on this');
  });

  it('uses founder-led plain text copy for follow-ups', () => {
    const first = getFollowUpText(buildData(1));
    const second = getFollowUpText(buildData(2));
    const third = getFollowUpText(buildData(3));

    expect(first.startsWith('Hey Tom,\n\n')).toBe(true);
    expect(first).toContain('Just bumping this in case you missed it.');
    expect(first).toContain("Saw you're on Linktree");
    expect(first).toContain(
      'Claim it here: https://jov.ie/claim/claim-token-123'
    );
    expect(first).toContain(
      "If you try it, let me know what you think. If you claim it and message me, I'll get it verified."
    );
    expect(second).toContain('Would still love your take on this.');
    expect(third).toContain(
      "If you want the profile, grab it here. If you claim it and message me, I'll get it verified."
    );

    expect(first).toContain('\nCheers,\nTim');
    expect(second).toContain('\nCheers,\nTim');
    expect(third).toContain('\nCheers,\nTim');
    expect(first).not.toContain(`- The Jovie Team`);
    expect(second).not.toContain(`- The Jovie Team`);
    expect(third).not.toContain(`- The Jovie Team`);
  });

  it('uses a single claim CTA in html follow-ups', () => {
    const html = getFollowUpHtml(buildData(2));

    expect(html).toContain('Hey Tom,');
    expect(html).toContain('Would still love your take on this.');
    expect(html).toContain(
      "Even if you don't end up using it, a quick reply on what turned you off would be super helpful."
    );
    expect(html).toContain('href="https://jov.ie/claim/claim-token-123"');
    expect(html).not.toContain('href="https://jov.ie/tomriver"');
  });

  it('returns the updated follow-up subject in the full email payload', () => {
    const email = getFollowUpEmail(buildData(3));

    expect(email.subject).toBe('Last note on this');
  });

  it('falls back to a generic greeting in follow-ups when the name looks like a handle', () => {
    const text = getFollowUpText({
      ...buildData(1),
      creatorName: 'timwhite',
      username: 'timwhite',
    });
    const html = getFollowUpHtml({
      ...buildData(1),
      creatorName: 'timwhite',
      username: 'timwhite',
    });

    expect(text.startsWith('Hey,\n\n')).toBe(true);
    expect(text).not.toContain('Hey timwhite,');
    expect(html).toContain('Hey,');
    expect(html).not.toContain('Hey timwhite');
  });
});
