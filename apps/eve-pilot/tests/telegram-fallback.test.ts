import type { TelegramMessage } from 'eve/channels/telegram';
import { afterEach, describe, expect, it } from 'vitest';

import { onOvieTelegramMessage } from '../agent/channels/telegram';
import {
  admitOvieTelegramMessage,
  parseOvieTelegramAllowedUserIds,
} from '../agent/lib/telegram-allowlist';
import {
  bindEvePilotIdentity,
  eveIdentityForChannel,
} from '../agent/select-identity';

const TIM_ID = '782165716';

function message(overrides: {
  chatType?: TelegramMessage['chat']['type'];
  fromId?: string;
  isBot?: boolean;
  missingFrom?: boolean;
}): TelegramMessage {
  return {
    attachments: [],
    caption: '',
    chat: {
      id: overrides.fromId ?? TIM_ID,
      type: overrides.chatType ?? 'private',
    },
    from: overrides.missingFrom
      ? undefined
      : {
          id: overrides.fromId ?? TIM_ID,
          isBot: overrides.isBot ?? false,
        },
    messageId: '1',
    raw: {},
    text: 'need to talk to ovie',
  };
}

describe('Ovie Telegram fallback allowlist', () => {
  it('fails closed when the allowlist is empty', () => {
    expect(parseOvieTelegramAllowedUserIds('')).toEqual(new Set());
    expect(parseOvieTelegramAllowedUserIds('  ,  ')).toEqual(new Set());
    expect(
      admitOvieTelegramMessage(message({}), parseOvieTelegramAllowedUserIds(''))
    ).toBe(false);
  });

  it('admits only an allowlisted private human chat', () => {
    const allowed = parseOvieTelegramAllowedUserIds(` ${TIM_ID}, 99 `);
    expect(allowed).toEqual(new Set([TIM_ID, '99']));
    expect(admitOvieTelegramMessage(message({}), allowed)).toBe(true);
    expect(
      admitOvieTelegramMessage(message({ fromId: 'not-tim' }), allowed)
    ).toBe(false);
    expect(
      admitOvieTelegramMessage(message({ chatType: 'group' }), allowed)
    ).toBe(false);
    expect(
      admitOvieTelegramMessage(message({ chatType: 'supergroup' }), allowed)
    ).toBe(false);
    expect(admitOvieTelegramMessage(message({ isBot: true }), allowed)).toBe(
      false
    );
    expect(
      admitOvieTelegramMessage(message({ missingFrom: true }), allowed)
    ).toBe(false);
  });
});

describe('Ovie Telegram fallback identity', () => {
  const previousAllowlist = process.env.OVIE_TELEGRAM_ALLOWED_USER_IDS;
  const previousIdentity = process.env.EVE_IDENTITY;

  afterEach(() => {
    if (previousAllowlist === undefined) {
      delete process.env.OVIE_TELEGRAM_ALLOWED_USER_IDS;
    } else {
      process.env.OVIE_TELEGRAM_ALLOWED_USER_IDS = previousAllowlist;
    }
    if (previousIdentity === undefined) {
      delete process.env.EVE_IDENTITY;
    } else {
      process.env.EVE_IDENTITY = previousIdentity;
    }
  });

  it('binds Telegram to the Ovie pack even when the runtime default is Jovie', () => {
    delete process.env.EVE_IDENTITY;
    expect(eveIdentityForChannel('telegram').pack.id).toBe('ovie');
    expect(eveIdentityForChannel('jovie-core-chat').pack.id).toBe('jovie');
    const instructions = bindEvePilotIdentity('ovie').instructions;
    expect(instructions).toContain("You are Eve on Tim's Ovie door");
    expect(instructions).toContain('Do not self-identify as Ovie');
    expect(instructions.toLowerCase()).not.toMatch(/you are ovie/);
  });

  it('dispatches allowlisted Telegram mail as Ovie, not Jovie', () => {
    process.env.OVIE_TELEGRAM_ALLOWED_USER_IDS = TIM_ID;
    delete process.env.EVE_IDENTITY;

    const admitted = onOvieTelegramMessage(
      { telegram: {} as never },
      message({})
    );
    expect(admitted?.auth).toMatchObject({
      authenticator: 'telegram-webhook',
      principalId: `telegram:${TIM_ID}`,
      principalType: 'user',
      attributes: {
        identity: 'ovie',
        source: 'telegram',
        fallback: 'true',
      },
    });
    expect(admitted?.context?.[0]).toContain("You are Eve on Tim's Ovie door");
    expect(admitted?.context?.[0]).toContain('Do not self-identify as Ovie');
    expect(admitted?.context?.[0]).toContain('ingest and ack');
    expect(admitted?.context?.[0]?.toLowerCase()).not.toMatch(/you are ovie/);

    expect(
      onOvieTelegramMessage(
        { telegram: {} as never },
        message({ fromId: 'someone-else' })
      )
    ).toBeNull();
  });
});
