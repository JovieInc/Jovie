import { describe, expect, it } from 'vitest';
import type { ClaimInviteTemplateData } from '@/lib/email/templates/claim-invite';
import {
  getClaimInviteEmail,
  getClaimInviteHtml,
  getClaimInviteSubject,
  getClaimInviteText,
} from '@/lib/email/templates/claim-invite';
import { resolveSafeFirstName } from '@/lib/email/templates/personalization';

const baseData: ClaimInviteTemplateData = {
  creatorName: 'Tom River',
  username: 'tomriver',
  claimToken: 'claim-token-123',
  recipientEmail: 'tom@example.com',
};

describe('claim invite founder copy', () => {
  it('uses the softer founder-led subject line', () => {
    expect(getClaimInviteSubject(baseData)).toBe('I made you a Jovie profile');
  });

  it('uses founder voice in plain text copy', () => {
    const text = getClaimInviteText(baseData);

    expect(text.startsWith('Tom!\n\n')).toBe(true);
    expect(text).toContain(
      "What up. It's Tim White, artist and founder of Jovie."
    );
    expect(text).toContain(
      'I got sick of sending fans to a generic Linktree page and losing people there'
    );
    expect(text).toContain("Saw you're on Linktree");
    expect(text).toContain('https://jov.ie/tomriver');
    expect(text).toContain(
      'Claim it here: https://jov.ie/claim/claim-token-123'
    );
    expect(text).toContain('No pressure to use it');
    expect(text).toContain('Even if you hate it');
    expect(text).toContain("I'm still shaping this with artists");
    expect(text).toContain(
      "P.S. If you claim it and message me, I'll get your profile verified."
    );
    expect(text).toContain('\nTim\n\n---');
  });

  it('uses founder voice in html copy', () => {
    const html = getClaimInviteHtml(baseData);

    expect(html).toContain('Tom!');
    expect(html).toContain(
      "What up. It's Tim White, artist and founder of Jovie."
    );
    expect(html).toContain(
      'I got sick of sending fans to a generic Linktree page and losing people there'
    );
    expect(html).toContain("Saw you're on Linktree");
    expect(html).toContain(
      "Saw you're on Linktree, so I went ahead and made you a free Jovie profile."
    );
    expect(html).toContain('No pressure to use it');
    expect(html).toContain('Even if you hate it');
    expect(html).toContain("I'm still shaping this with artists");
    expect(html).toContain(
      "P.S. If you claim it and message me, I'll get your profile verified."
    );
    expect(html).toContain('https://jov.ie/tomriver');
    expect(html).toContain('href="https://jov.ie/claim/claim-token-123"');
    expect(html).toContain('href="https://jov.ie/tomriver"');
  });

  it('returns the updated subject in the full email payload', () => {
    const email = getClaimInviteEmail(baseData);

    expect(email.subject).toBe('I made you a Jovie profile');
  });

  it('only personalizes with a safe first name', () => {
    expect(resolveSafeFirstName('timwhite', 'timwhite')).toBeNull();
    expect(resolveSafeFirstName('tim_white', 'tim_white')).toBeNull();
    expect(resolveSafeFirstName('tim<3', 'tim<3')).toBeNull();
    expect(resolveSafeFirstName('Tim 💫 White', 'timwhite')).toBeNull();
    expect(
      resolveSafeFirstName('Claireistehbest87', 'claireistehbest87')
    ).toBeNull();
    expect(resolveSafeFirstName('DJ Shadow', 'djshadow')).toBeNull();
    expect(resolveSafeFirstName('Tom River Stone', 'tomriverstone')).toBeNull();
    expect(resolveSafeFirstName('José González', 'josegonzalez')).toBe('José');
    expect(resolveSafeFirstName('Tim White', 'timwhite')).toBe('Tim');
    expect(resolveSafeFirstName('TIM WHITE', 'timwhite')).toBe('Tim');
  });

  it('falls back to a generic greeting when the name looks like a handle', () => {
    const text = getClaimInviteText({
      ...baseData,
      creatorName: 'timwhite',
      username: 'timwhite',
    });
    const html = getClaimInviteHtml({
      ...baseData,
      creatorName: 'timwhite',
      username: 'timwhite',
    });

    expect(text.startsWith('Ayyy!\n\n')).toBe(true);
    expect(text).not.toContain('timwhite!');
    expect(html).toContain('Ayyy!');
    expect(html).not.toContain('timwhite!');
  });

  it('falls back to a generic greeting for symbols, emoji, and smashed names', () => {
    const weirdCases = [
      { creatorName: 'tim<3', username: 'tim<3' },
      { creatorName: 'tim🔥', username: 'timfire' },
      { creatorName: 'Claireistehbest87', username: 'claireistehbest87' },
      { creatorName: 'DJ Shadow', username: 'djshadow' },
    ] as const;

    for (const data of weirdCases) {
      const text = getClaimInviteText({
        ...baseData,
        creatorName: data.creatorName,
        username: data.username,
      });

      expect(text.startsWith('Ayyy!\n\n')).toBe(true);
      expect(text).not.toContain(`${data.creatorName}!`);
    }
  });
});
