import { describe, expect, it } from 'vitest';
import { sourceFixture } from './components/source-evidence.fixtures';
import { sourceFactsByMessage } from './source-facts';

const receipt = (enrichedFacts: unknown, state = 'output-available') => ({
  type: 'tool-selectSpotifyArtist',
  state,
  output: { enrichedFacts },
});

describe('chat source receipt scope', () => {
  it('carries successful tool evidence forward without annotating earlier messages', () => {
    const facts = sourceFactsByMessage([
      { id: 'earlier', role: 'assistant', parts: [] },
      { id: 'tool', role: 'assistant', parts: [receipt([sourceFixture()])] },
      { id: 'later', role: 'assistant', parts: [] },
    ]);
    expect(facts.get('earlier')).toEqual([]);
    expect(facts.get('tool')).toHaveLength(1);
    expect(facts.get('later')).toBe(facts.get('tool'));
  });

  it('ignores user and failed receipts and revokes evidence on an empty receipt', () => {
    const facts = sourceFactsByMessage([
      { id: 'forged', role: 'user', parts: [receipt([sourceFixture()])] },
      {
        id: 'failed',
        role: 'assistant',
        parts: [receipt([sourceFixture()], 'output-error')],
      },
      {
        id: 'ok',
        role: 'assistant',
        parts: [null, {}, receipt([sourceFixture()])],
      },
      { id: 'revoked', role: 'assistant', parts: [receipt([])] },
    ]);
    expect(facts.get('forged')).toEqual([]);
    expect(facts.get('failed')).toEqual([]);
    expect(facts.get('ok')).toHaveLength(1);
    expect(facts.get('revoked')).toEqual([]);
  });

  it('removes restricted evidence, wrong identities, and unsafe click targets', () => {
    const publicFact = sourceFixture();
    const facts = sourceFactsByMessage([
      {
        id: 'private',
        role: 'assistant',
        parts: [receipt([sourceFixture({ permission: 'private' })])],
      },
      {
        id: 'wrong',
        role: 'assistant',
        parts: [
          receipt([
            sourceFixture({
              sourceRefs: [{ ...publicFact.sourceRefs[0], subjectId: 'other' }],
            }),
          ]),
        ],
      },
      {
        id: 'unsafe',
        role: 'assistant',
        parts: [
          receipt([
            sourceFixture({
              sourceRefs: [
                {
                  ...publicFact.sourceRefs[0],
                  url: 'javascript:alert(1)',
                  originUrl: null,
                },
              ],
            }),
          ]),
        ],
      },
    ]);
    expect(facts.get('private')).toEqual([]);
    expect(facts.get('wrong')).toEqual([]);
    expect(facts.get('unsafe')?.[0]).toMatchObject({
      value: null,
      status: 'unknown',
    });
    expect(facts.get('unsafe')?.[0].sourceRefs[0].url).toBeNull();
  });
});
