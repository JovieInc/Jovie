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
    const ref = sourceFixture().sourceRefs[0];
    const message = (id: string, fact: ReturnType<typeof sourceFixture>) => ({
      id,
      role: 'assistant' as const,
      parts: [receipt([fact])],
    });
    const facts = sourceFactsByMessage([
      message('private', sourceFixture({ permission: 'private' })),
      message(
        'wrong',
        sourceFixture({ sourceRefs: [{ ...ref, subjectId: 'other' }] })
      ),
      message(
        'unsafe',
        sourceFixture({
          sourceRefs: [{ ...ref, url: 'javascript:alert(1)', originUrl: null }],
        })
      ),
    ]);
    expect(facts.get('private')).toEqual([]);
    expect(facts.get('wrong')).toEqual([]);
    const unsafe = facts.get('unsafe')?.[0];
    expect(unsafe).toMatchObject({ value: null, status: 'unknown' });
    expect(unsafe?.sourceRefs[0].url).toBeNull();
  });
});
