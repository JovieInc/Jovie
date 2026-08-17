import { describe, expect, it } from 'vitest';
import {
  assertScriptCanBeApproved,
  creatorDocumentContentSchema,
  hashRevision,
  ideaContent,
  nextRevision,
  saveIdeaInputSchema,
} from './domain';

describe('creator document domain', () => {
  it('turns a private idea into durable versioned editor JSON', () => {
    expect(ideaContent('First thought\n\nConcrete story')).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'First thought' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Concrete story' }],
        },
      ],
    });
  });

  it('rejects empty ideas and weak idempotency keys', () => {
    expect(
      saveIdeaInputSchema.safeParse({
        title: ' ',
        body: '',
        idempotencyKey: 'x',
      }).success
    ).toBe(false);
  });

  it('hashes the exact revision content deterministically', () => {
    const revision = {
      title: 'Why people misunderstand recovery',
      kind: 'script',
      content: ideaContent('Evidence first.'),
    };
    expect(hashRevision(revision)).toBe(hashRevision(revision));
    expect(hashRevision(revision)).not.toBe(
      hashRevision({ ...revision, title: 'Changed title' })
    );
  });

  it('requires evidence for factual claims but not labeled opinion', () => {
    expect(() =>
      assertScriptCanBeApproved([
        { kind: 'fact', evidenceState: 'unresolved', sourceRecordId: null },
      ])
    ).toThrow('supporting evidence');
    expect(() =>
      assertScriptCanBeApproved([
        { kind: 'opinion', evidenceState: 'unresolved', sourceRecordId: null },
      ])
    ).not.toThrow();
  });

  it('advances revisions only from a valid optimistic version', () => {
    expect(nextRevision(3)).toBe(4);
    expect(() => nextRevision(0)).toThrow('positive integer');
  });

  it('rejects unsupported and excessively deep editor documents', () => {
    expect(
      creatorDocumentContentSchema.safeParse({
        type: 'doc',
        content: [{ type: 'iframe', attrs: { src: 'https://example.com' } }],
      }).success
    ).toBe(false);

    let nested: Record<string, unknown> = { type: 'paragraph' };
    for (let index = 0; index < 30; index += 1) {
      nested = { type: 'blockquote', content: [nested] };
    }
    expect(
      creatorDocumentContentSchema.safeParse({ type: 'doc', content: [nested] })
        .success
    ).toBe(false);
  });

  it('rejects executable link protocols in editor marks', () => {
    expect(
      creatorDocumentContentSchema.safeParse({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'unsafe',
                marks: [
                  { type: 'link', attrs: { href: 'javascript:alert(1)' } },
                ],
              },
            ],
          },
        ],
      }).success
    ).toBe(false);
  });
});
