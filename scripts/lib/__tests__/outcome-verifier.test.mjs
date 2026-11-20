import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  acceptedNegativeControls,
  assertOutcome,
  detectFailureSurface,
  FAILURE_SURFACE_RULES,
  foldVerdict,
  NEGATIVE_CONTROLS,
  POSITIVE_CONTROLS,
  verifyOutcome,
} from '../outcome-verifier.mjs';

const repoRoot = resolve(import.meta.dirname, '../../..');

describe('golden-path false green regression (JOV-9625, run 41165214531)', () => {
  // The exact predicate the cert used: "a reply element is visible", which in
  // text terms is "the reply bubble has any content".
  const legacyReplyVisible = text => text.trim().length > 0;
  const quotaWall =
    'You have reached your weekly AI message limit. Upgrade to Pro for 70 messages per week.';
  const artistContextError =
    'Jovie could not load your artist context for this request. Please refresh and try again.';

  it('reproduces the false green: the legacy predicate certifies error replies', () => {
    expect(legacyReplyVisible(quotaWall)).toBe(true);
    expect(legacyReplyVisible(artistContextError)).toBe(true);
    expect(acceptedNegativeControls(legacyReplyVisible).length).toBeGreaterThan(
      NEGATIVE_CONTROLS.length - 2
    );
  });

  it('fails the gate when Jovie replies with an error served as HTTP 200', () => {
    for (const reply of [quotaWall, artistContextError]) {
      const verdict = verifyOutcome(reply, {
        label: 'chat first-reply',
        expect: /\bok\b/i,
        expectDescription: 'the probe word "ok"',
      });
      expect(verdict.ok).toBe(false);
      expect(verdict.reasons.join(' ')).toMatch(/surface/);
    }
    expect(() =>
      assertOutcome(quotaWall, { label: 'chat first-reply' })
    ).toThrow(/quota surface \(quota\.message-limit\)/);
  });

  it('passes the gate on the real reply the probe asked for', () => {
    expect(
      assertOutcome('OK', { label: 'chat first-reply', expect: /\bok\b/i })
    ).toBe('OK');
  });
});

describe('negative and positive controls', () => {
  it.each(NEGATIVE_CONTROLS.map(c => [c.id, c.text]))(
    'rejects known-bad sample %s',
    (_id, text) => {
      expect(detectFailureSurface(text)).not.toBeNull();
      expect(verifyOutcome(text, { label: 'control' }).ok).toBe(false);
    }
  );

  it.each(POSITIVE_CONTROLS.map(c => [c.id, c.text]))(
    'accepts known-good sample %s',
    (_id, text) => {
      expect(detectFailureSurface(text)).toBeNull();
      expect(verifyOutcome(text, { label: 'control' }).ok).toBe(true);
    }
  );

  it('the shared verifier accepts no negative control (red before green)', () => {
    expect(
      acceptedNegativeControls(
        text => verifyOutcome(text, { label: 'self' }).ok
      )
    ).toEqual([]);
  });

  it('every rule is exercised by at least one negative control or source sample', () => {
    const hit = new Set(
      [...NEGATIVE_CONTROLS.map(c => c.text), ...sourceFailureCopy()]
        .map(text => detectFailureSurface(text)?.rule)
        .filter(Boolean)
    );
    const unexercised = FAILURE_SURFACE_RULES.map(r => r.id).filter(
      id => !hit.has(id)
    );
    expect(unexercised).toEqual([]);
  });

  it('treats a throwing check as rejecting, not accepting', () => {
    expect(
      acceptedNegativeControls(() => {
        throw new Error('boom');
      })
    ).toEqual([]);
  });
});

/**
 * Failure copy the chat surfaces actually emit, read from source so a new
 * error string cannot ship without the verifier recognizing it. Telemetry
 * codes (snake_case) and template literals are not user-visible text.
 */
function sourceFailureCopy() {
  const files = [
    'apps/web/app/api/chat/route.ts',
    'apps/web/app/api/chat/onboarding-handler.ts',
    'apps/web/lib/rate-limit/limiters.ts',
  ];
  const literal =
    /\b(?:error|message|replyText|errorMessage)\s*[:=]\s*(?:\n\s*)?(['`])((?:(?!\1).){12,}?)\1/g;
  const out = new Set();
  for (const file of files) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8');
    for (const match of source.matchAll(literal)) {
      const text = match[2];
      if (/^[a-z0-9_]+$/.test(text) || text.includes('${')) continue;
      out.add(text);
    }
  }
  return [...out];
}

/**
 * Reviewed exemptions: developer-facing validation copy only ever served with
 * a 4xx status (the transport check already fails it) and phrased too
 * generically to match without turning real advice red. Add with a reason.
 */
const SOURCE_COPY_EXEMPTIONS = new Set([
  // 400 from onboarding-handler request validation, never rendered as a reply.
  'messages array must include a user message',
]);

describe('source-wired failure copy', () => {
  it('extracts a meaningful sample of real chat failure copy', () => {
    expect(sourceFailureCopy().length).toBeGreaterThan(20);
  });

  it('detects every failure string /api/chat and the rate limiter can emit', () => {
    const missed = sourceFailureCopy().filter(
      text => !SOURCE_COPY_EXEMPTIONS.has(text) && !detectFailureSurface(text)
    );
    expect(missed).toEqual([]);
  });
});

describe('verifyOutcome', () => {
  it('fails missing, blank and too-short observations', () => {
    expect(verifyOutcome(undefined, { label: 'x' }).failure?.rule).toBe(
      'empty.blank'
    );
    expect(verifyOutcome(null, { label: 'x' }).ok).toBe(false);
    const short = verifyOutcome('a', { label: 'x' });
    expect(short.ok).toBe(false);
    expect(short.reasons[0]).toMatch(/need at least 2/);
    expect(verifyOutcome('hey', { label: 'x', minChars: 10 }).ok).toBe(false);
  });

  it('fails when the semantic oracle does not hold, even on clean text', () => {
    const verdict = verifyOutcome(
      'Here are some ideas for your next release.',
      {
        label: 'preview',
        expect: text => text.includes('UNMARKED'),
        expectDescription: 'the test artist name',
      }
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.failure).toBeNull();
    expect(verdict.reasons[0]).toMatch(/the test artist name/);
  });

  it('describes a regex oracle when no description is given', () => {
    const verdict = verifyOutcome('hello there', {
      label: 'x',
      expect: /\bok\b/i,
    });
    expect(verdict.reasons[0]).toContain('/\\bok\\b/i');
  });

  it('resets global regex state so repeated checks are deterministic', () => {
    const oracle = /ok/g;
    expect(verifyOutcome('ok ok', { label: 'x', expect: oracle }).ok).toBe(
      true
    );
    expect(verifyOutcome('ok ok', { label: 'x', expect: oracle }).ok).toBe(
      true
    );
  });

  it('allows a failure kind only when the check deliberately expects it', () => {
    const wall = "You're out of messages for this week";
    expect(verifyOutcome(wall, { label: 'quota test' }).ok).toBe(false);
    expect(
      verifyOutcome(wall, {
        label: 'quota test',
        allowKinds: ['quota'],
        expect: /out of messages/,
      }).ok
    ).toBe(true);
  });

  it('allowKinds only excuses the named kind, never another failure', () => {
    expect(
      verifyOutcome('Something went wrong. Please try again.', {
        label: 'quota test',
        allowKinds: ['quota'],
      }).ok
    ).toBe(false);
  });

  it('a failure surface and a satisfied oracle still fail', () => {
    // "ok" is present, but so is the error: the oracle cannot launder it.
    const verdict = verifyOutcome(
      'ok. Something went wrong. Please try again.',
      {
        label: 'x',
        expect: /\bok\b/i,
      }
    );
    expect(verdict.ok).toBe(false);
  });

  it('assertOutcome returns trimmed text and throws every reason', () => {
    expect(assertOutcome('  fine reply  ', { label: 'x' })).toBe('fine reply');
    expect(() =>
      assertOutcome('nope', { label: 'x', expect: /yes/, minChars: 10 })
    ).toThrow(/need at least 10.*expected outcome not observed/);
  });
});

describe('foldVerdict', () => {
  it('passes only a non-empty all-passed set', () => {
    expect(foldVerdict(['passed'])).toBe('passed');
    expect(foldVerdict(['passed', 'passed'])).toBe('passed');
  });

  it('never folds no checks into green (the [].every vacuous truth)', () => {
    expect(foldVerdict([])).toBe('blocked');
  });

  it('fails on any failure', () => {
    expect(foldVerdict(['passed', 'failed', 'blocked'])).toBe('failed');
  });

  it('blocks on skipped, blocked, unknown or missing statuses', () => {
    for (const status of [
      'skipped',
      'blocked',
      'pending',
      'ok',
      '',
      null,
      undefined,
    ]) {
      expect(foldVerdict(['passed', status])).toBe('blocked');
    }
  });

  it('the ship-verify dry-run shape is not green', () => {
    // scripts/ship-verify.mjs folds with `every(status !== 'failed')`, which
    // calls an all-skipped dry run "passed".
    const legacyFold = statuses =>
      statuses.every(s => s !== 'failed') ? 'passed' : 'failed';
    expect(legacyFold(['skipped', 'skipped'])).toBe('passed');
    expect(foldVerdict(['skipped', 'skipped'])).toBe('blocked');
  });
});
