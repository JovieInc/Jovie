import { describe, expect, it } from 'vitest';
import agent from '../agent/agent';
import channelIdentityInstructions, {
  channelIdentityInstructionsForAttributes,
} from '../agent/instructions/channel-identity';
import {
  EVE_PILOT_COMPACTION_THRESHOLD_PERCENT,
  EVE_PILOT_CONTEXT_TARGET_TOKENS,
  EVE_PILOT_MODEL_CONTEXT_WINDOW_TOKENS,
} from '../agent/lib/context-budget';

describe('Eve pilot context cost', () => {
  it('compacts near 60K input tokens instead of 90% of the 1M window', () => {
    expect(
      EVE_PILOT_COMPACTION_THRESHOLD_PERCENT *
        EVE_PILOT_MODEL_CONTEXT_WINDOW_TOKENS
    ).toBeCloseTo(EVE_PILOT_CONTEXT_TARGET_TOKENS);
    expect(EVE_PILOT_COMPACTION_THRESHOLD_PERCENT).toBeLessThan(0.1);
    expect(agent).toMatchObject({
      compaction: { thresholdPercent: EVE_PILOT_COMPACTION_THRESHOLD_PERCENT },
    });
  });

  it.each([
    ['telegram', 'summer', 'You are Summer'],
    ['imessage', 'summer', 'You are Summer'],
    ['imessage', 'jovie', 'Jovie Eve'],
  ])(
    'binds the %s %s pack as session system context',
    (source, identity, text) => {
      const instructions = channelIdentityInstructionsForAttributes({
        identity,
        source,
      });
      expect(instructions).toMatchObject({
        content: expect.stringContaining(text),
      });
      expect(instructions).not.toMatchObject({ role: 'user' });
    }
  );

  it.each([
    undefined,
    { source: 'telegram' },
    { source: 'telegram', identity: 'ovie' },
    { source: 'ovie-summer-shadow', identity: 'summer' },
  ])('binds nothing for other sessions %#', attributes => {
    expect(channelIdentityInstructionsForAttributes(attributes)).toBeNull();
  });

  it('resolves from Eve session auth once per session', () => {
    const resolver = channelIdentityInstructions.events['session.started'];
    const result = resolver?.(undefined, {
      channel: { metadata: {} },
      messages: [],
      session: {
        auth: {
          current: { attributes: { identity: 'summer', source: 'telegram' } },
          initiator: null,
        },
        id: 'ses_telegram',
      },
    } as never);
    expect(result).toMatchObject({
      content: expect.stringContaining('You are Summer'),
    });
    expect(channelIdentityInstructions.events).not.toHaveProperty(
      'turn.started'
    );
  });
});
