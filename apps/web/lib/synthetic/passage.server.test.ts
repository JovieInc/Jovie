import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  env: {
    E2E_PROD_SIGNUP_EMAIL_BASE: 'canary@mail.example' as string | undefined,
  },
  checkGateForUser: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env-server', () => ({ env: hoisted.env }));
vi.mock('@/lib/flags/server', () => ({
  checkGateForUser: hoisted.checkGateForUser,
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: hoisted.info, warn: hoisted.warn },
}));

import {
  isControlledSyntheticMailbox,
  resolveSyntheticPassage,
  SYNTHETIC_PASSAGE_GATE,
} from './passage.server';

function session(email: string | null, emailVerified: boolean | null = true) {
  return { user: { id: 'ba-user-1', email, emailVerified } };
}

describe('resolveSyntheticPassage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    hoisted.env.E2E_PROD_SIGNUP_EMAIL_BASE = 'canary@mail.example';
    hoisted.checkGateForUser.mockResolvedValue(true);
  });

  it('grants an active roster actor on the controlled mailbox', async () => {
    const principal = await resolveSyntheticPassage(
      session('canary+synthetic-grokbot-run42@mail.example'),
      'onboarding_chat',
      { requestId: 'req-1' }
    );

    expect(principal?.actorId).toBe('grokbot');
    expect(hoisted.checkGateForUser).toHaveBeenCalledWith(
      'ba-user-1',
      SYNTHETIC_PASSAGE_GATE,
      false
    );
    expect(hoisted.info).toHaveBeenCalledWith(
      '[synthetic-passage] granted',
      expect.objectContaining({
        actorId: 'grokbot',
        scenario: 'onboarding_chat',
        requestId: 'req-1',
      })
    );
  });

  it('grants the existing waitlist canary identity as the canary actor', async () => {
    const principal = await resolveSyntheticPassage(
      session('canary+jovie-prod-waitlist-canary@mail.example'),
      'onboarding_chat'
    );
    expect(principal?.actorId).toBe('canary');
  });

  describe('normal traffic gets no passage', () => {
    it.each([
      ['anonymous visitor', null],
      ['session without a user email', session(null)],
      ['real customer', session('artist@band.com')],
      [
        'unverified email',
        session('canary+synthetic-grokbot@mail.example', false),
      ],
      [
        'synthetic tag on an attacker-controlled mailbox',
        session('attacker+synthetic-grokbot@gmail.com'),
      ],
      [
        'synthetic tag on another local part of the same domain',
        session('other+synthetic-grokbot@mail.example'),
      ],
      [
        'unknown actor on the controlled mailbox',
        session('canary+synthetic-evilbot@mail.example'),
      ],
      ['untagged controlled mailbox', session('canary@mail.example')],
    ])('%s', async (_label, value) => {
      expect(await resolveSyntheticPassage(value, 'onboarding_chat')).toBe(
        null
      );
      expect(hoisted.checkGateForUser).not.toHaveBeenCalled();
    });

    it('logs a synthetic tag on an uncontrolled mailbox as an abuse signal', async () => {
      await resolveSyntheticPassage(
        session('attacker+synthetic-grokbot@gmail.com'),
        'onboarding_chat'
      );
      expect(hoisted.warn).toHaveBeenCalledWith(
        '[synthetic-passage] denied: uncontrolled mailbox',
        expect.objectContaining({ userId: 'ba-user-1' })
      );
    });

    it('denies a scenario outside the actor grant', async () => {
      expect(
        await resolveSyntheticPassage(
          session('canary+synthetic-instinct@mail.example'),
          'checkout_test'
        )
      ).toBeNull();
    });

    it('denies everything when no controlled mailbox is configured', async () => {
      hoisted.env.E2E_PROD_SIGNUP_EMAIL_BASE = undefined;
      expect(
        await resolveSyntheticPassage(
          session('canary+synthetic-grokbot@mail.example'),
          'onboarding_chat'
        )
      ).toBeNull();
    });

    it('denies an approved actor while the kill-switch gate is off', async () => {
      hoisted.checkGateForUser.mockResolvedValue(false);
      expect(
        await resolveSyntheticPassage(
          session('canary+synthetic-grokbot@mail.example'),
          'onboarding_chat'
        )
      ).toBeNull();
      expect(hoisted.info).toHaveBeenCalledWith(
        '[synthetic-passage] denied: gate off',
        expect.objectContaining({ actorId: 'grokbot' })
      );
    });
  });
});

describe('isControlledSyntheticMailbox', () => {
  it('matches the exact untagged base, case-insensitively', () => {
    expect(
      isControlledSyntheticMailbox(
        'Canary+synthetic-muse@Mail.Example',
        'canary@mail.example'
      )
    ).toBe(true);
  });

  it('rejects a tagged base configuration', () => {
    expect(
      isControlledSyntheticMailbox(
        'canary+synthetic-muse@mail.example',
        'canary+x@mail.example'
      )
    ).toBe(false);
  });

  it('rejects subdomain and lookalike mailboxes', () => {
    expect(
      isControlledSyntheticMailbox(
        'canary+synthetic-muse@evil.mail.example',
        'canary@mail.example'
      )
    ).toBe(false);
    expect(
      isControlledSyntheticMailbox(
        'canary+synthetic-muse@mail.example.evil',
        'canary@mail.example'
      )
    ).toBe(false);
  });
});
