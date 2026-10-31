import { describe, expect, it } from 'vitest';
import { OBJECTION_CATALOG } from '@/lib/ovie/conversation-insights';
import { isAutomatedEmail, isFeedbackTurn, urgentReasons } from './classify';

// Shapes of the two real complaints that started this loop (paraphrased, no
// identifying text). The old regex catalog matched neither.
const PRICE_PUSHBACK =
  '15usd a month? Wow. A lot? I get it but I want to try it first.';
const THIN_PREVIEW = 'Well the preview is just my name and a photo so...';

describe('isFeedbackTurn', () => {
  it('catches soft price pushback and thin-value complaints the objection catalog missed', () => {
    const catalogHit = (text: string) =>
      OBJECTION_CATALOG.some(c => c.patterns.some(p => p.test(text)));
    expect(catalogHit(PRICE_PUSHBACK)).toBe(false);
    expect(catalogHit(THIN_PREVIEW)).toBe(false);
    expect(isFeedbackTurn(PRICE_PUSHBACK)).toBe(true);
    expect(isFeedbackTurn(THIN_PREVIEW)).toBe(true);
  });

  it('catches bugs, confusion, asks and requests to reach the team', () => {
    for (const text of [
      'the page is broken on my phone',
      "I don't understand what this does",
      'would be great if it supported Bandcamp',
      'can I talk to someone on the team?',
    ]) {
      expect(isFeedbackTurn(text)).toBe(true);
    }
  });

  it('ignores ordinary product use', () => {
    for (const text of [
      'Piano music, soothing neoclassical for studying',
      'yes that is me',
      'add my instagram',
      'ok',
    ]) {
      expect(isFeedbackTurn(text)).toBe(false);
    }
  });
});

describe('urgentReasons', () => {
  it('flags bug, billing, angry, public and legal language', () => {
    expect(urgentReasons('I was charged twice, I want a refund')).toEqual([
      'billing',
    ]);
    expect(urgentReasons("can't log in, blank screen")).toEqual(['bug']);
    expect(urgentReasons('this is a scam!!!')).toEqual(['angry']);
    expect(urgentReasons('posting about this on reddit')).toEqual(['public']);
    expect(
      urgentReasons('delete my data under GDPR or I call a lawyer')
    ).toEqual(['legal']);
    expect(urgentReasons('love it, thanks')).toEqual([]);
  });
});

describe('isAutomatedEmail', () => {
  it('drops bounces, auto-replies and list mail', () => {
    expect(isAutomatedEmail({ from: 'MAILER-DAEMON@example.org' })).toBe(true);
    expect(isAutomatedEmail({ from: 'a@b.co', subject: 'Out of office' })).toBe(
      true
    );
    expect(
      isAutomatedEmail({
        from: 'a@b.co',
        headers: { 'Auto-Submitted': 'auto-replied' },
      })
    ).toBe(true);
    expect(
      isAutomatedEmail({
        from: 'a@b.co',
        headers: { 'List-Unsubscribe': '<x>' },
      })
    ).toBe(true);
    expect(
      isAutomatedEmail({
        from: 'Sam Lee <sam@b.co>',
        subject: 'Question about pricing',
      })
    ).toBe(false);
  });
});
