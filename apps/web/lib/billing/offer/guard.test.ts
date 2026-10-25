import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  guardOfferText,
  hasMoneyHint,
  isOfferGuardedFeature,
  OFFER_GUARD_CALL_SITES,
  OfferStreamGate,
  offerClaimViolations,
  offerFactsBlock,
  offerGuardFallback,
} from './guard';
import { OFFER, type Offer } from './offer';

const INCIDENT =
  'Artist Presence is $12/mo after a 14-day trial with no card; the free profile stays free.';

describe('offerClaimViolations', () => {
  it('passes every registered claim and the facts block', () => {
    expect(offerClaimViolations(offerGuardFallback())).toEqual([]);
    for (const line of offerFactsBlock().split('\n').slice(0, -1)) {
      expect(offerClaimViolations(line), line).toEqual([]);
    }
  });

  it('ignores text without money language', () => {
    expect(hasMoneyHint('Your latest single is gaining listeners.')).toBe(
      false
    );
    expect(
      offerClaimViolations('Your latest single is gaining listeners.')
    ).toEqual([]);
  });

  it('rejects the incident sentence, wrong prices, wrong trial length, discounts, refunds, annual', () => {
    expect(offerClaimViolations(INCIDENT)).toContain('trial.price_after_trial');
    expect(offerClaimViolations('Pro is $199 a month.').length).toBeGreaterThan(
      0
    );
    expect(offerClaimViolations('Upgrade to Pro for $39.')).toContain(
      'plan_amount:$39'
    );
    expect(offerClaimViolations('Enjoy a 30-day Pro trial.').join()).toContain(
      'trial_days'
    );
    expect(offerClaimViolations('Use code SAVE for 20% off.')).toContain(
      'discount_claim'
    );
    expect(
      offerClaimViolations('We offer a 30-day money-back guarantee.')
    ).toContain('refund_or_guarantee');
    expect(offerClaimViolations('Billed monthly or annually.')).toContain(
      'annual_billing_offered'
    );
  });

  it('rejects trial and no-card talk when the trial is off', () => {
    const off = {
      ...OFFER,
      trial: { ...OFFER.trial, enabled: false },
    } as unknown as Offer;
    expect(
      offerClaimViolations('Try the 14-day trial, no card needed.', {
        offer: off,
      })
    ).toEqual(
      expect.arrayContaining(['trial_not_offered', 'no_card_not_offered'])
    );
  });

  it('strict mode rejects every money sentence', () => {
    expect(
      offerClaimViolations('Artist Presence is $12/month.', { strict: true })
    ).toContain('strict_templates_only');
    expect(offerClaimViolations('Nice release.', { strict: true })).toEqual([]);
  });
});

describe('guardOfferText', () => {
  it('replaces only the bad sentence, once', () => {
    const r = guardOfferText(
      `Nice profile. ${INCIDENT} Want me to set this up? Also ${INCIDENT}`
    );
    expect(r.replaced).toBe(true);
    expect(r.text).toContain('Nice profile.');
    expect(r.text).toContain('Want me to set this up?');
    expect(r.text).toContain(offerGuardFallback());
    expect(r.text.split(offerGuardFallback()).length - 1).toBe(1);
    expect(r.text).not.toMatch(/no card/i);
  });

  it('leaves true statements alone', () => {
    const ok =
      'Artist Presence is $12/month. Cancel anytime. Access continues to the end of the billing period.';
    expect(guardOfferText(ok)).toEqual({
      text: ok,
      violations: [],
      replaced: false,
    });
  });
});

describe('OfferStreamGate', () => {
  const run = (deltas: string[], opts = {}) => {
    const g = new OfferStreamGate(opts);
    return deltas.map(d => g.push(d)).concat(g.flush());
  };

  it('streams non-money text through immediately', () => {
    expect(run(['Your ', 'release ', 'is out.'])).toEqual([
      'Your ',
      'release ',
      'is out.',
      '',
    ]);
  });

  it('holds a money sentence until it completes, then releases it when true', () => {
    const out = run(['Artist Presence is ', '$12/month', '. Want to start?']);
    expect(out.join('')).toContain('Artist Presence is $12/month. ');
  });

  it('DELIBERATE RED: the incident sentence never reaches the client, however it is chunked', () => {
    for (const size of [1, 3, 7, 200]) {
      const chunks = INCIDENT.match(new RegExp(`.{1,${size}}`, 'g')) ?? [];
      const out = run([...chunks, ' Want to start there?']).join('');
      expect(out, `chunk size ${size}`).not.toMatch(/no card/i);
      expect(out).not.toMatch(/14-day/);
      expect(out).toContain('jov.ie/pricing');
    }
  });

  it('strict mode swaps true money sentences for the template', () => {
    const out = run(['Artist Presence is $12/month. Nice track.'], {
      strict: true,
    }).join('');
    expect(out).toContain('Details are at jov.ie/pricing.');
    expect(out).toContain('Nice track.');
  });
});

describe('guarded features', () => {
  it('matches the chat features exactly, not titles or retouching', () => {
    expect(isOfferGuardedFeature('jovie-chat')).toBe(true);
    expect(isOfferGuardedFeature('summer.card')).toBe(true);
    expect(isOfferGuardedFeature('jovie-chat-title')).toBe(false);
    expect(isOfferGuardedFeature(undefined)).toBe(false);
  });
});

describe('every LLM call site is classified', () => {
  const WEB = join(__dirname, '../../..');
  const CALL = /\b(?:streamText|generateText|generateObject|streamObject)\(/;
  const IMPORT = /@\/lib\/ai\/sdk|from 'ai'|@ai-sdk\//;
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      if (['node_modules', '.next', '.cache', 'coverage'].includes(name))
        continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (
        /\.tsx?$/.test(name) &&
        !/\.(test|spec|stories)\./.test(name) &&
        !name.endsWith('.d.ts')
      )
        out.push(p);
    }
    return out;
  };

  it('matches the registry in both directions', () => {
    const found = walk(WEB)
      .filter(f => {
        const src = readFileSync(f, 'utf8');
        return CALL.test(src) && IMPORT.test(src);
      })
      .map(f => relative(WEB, f))
      .sort();
    expect(found).toEqual(Object.keys(OFFER_GUARD_CALL_SITES).sort());
  });
});
