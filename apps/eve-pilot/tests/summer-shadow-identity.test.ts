import { describe, expect, it } from 'vitest';
import summerShadowInstructions, {
  summerShadowInstructionsForMetadata,
} from '../agent/instructions/summer-shadow';

describe('Summer shadow runtime identity', () => {
  it('binds the Summer pack only for exact no-authority channel metadata', () => {
    const instructions = summerShadowInstructionsForMetadata({
      dispatchAuthority: 'none',
      identity: 'summer',
      source: 'ovie-summer-shadow',
    });

    expect(instructions).toMatchObject({
      content: expect.stringContaining(
        'The `ovie-summer-shadow` source stays Read-only'
      ),
    });
  });

  it.each([
    undefined,
    { source: 'ovie-summer-shadow', identity: 'summer' },
    {
      source: 'ovie-summer-shadow',
      identity: 'summer',
      dispatchAuthority: 'write',
    },
    { source: 'photon', identity: 'summer', dispatchAuthority: 'none' },
  ])('fails closed for non-exact metadata %#', metadata => {
    expect(summerShadowInstructionsForMetadata(metadata)).toBeNull();
  });

  it('resolves the same pack from Eve session metadata', () => {
    const resolver = summerShadowInstructions.events['session.started'];
    const result = resolver?.(undefined, {
      channel: {
        metadata: {
          dispatchAuthority: 'none',
          identity: 'summer',
          source: 'ovie-summer-shadow',
        },
      },
      messages: [],
      session: {
        auth: { current: null, initiator: null },
        id: 'ses_shadow',
      },
    });

    expect(result).toMatchObject({
      content: expect.stringContaining('company operations identity'),
    });
  });
});
