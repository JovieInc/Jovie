import { describe, expect, it } from 'vitest';
import { contentApprovalProof, contentReviewIdentity } from './publication';

const version = {
  id: 'version-a',
  kind: 'marketing-page',
  key: 'home',
  schemaVersion: 1,
  data: {
    sections: [{ copy: { title: 'Fixture', subhead: 'A saved payload' } }],
  },
};
const renderer = { commitSha: 'a'.repeat(40), buildId: 'build-a' };

describe('exact content review identity', () => {
  it('binds the same immutable version, payload, renderer, schema and expected pointer', () => {
    const identity = contentReviewIdentity(version, renderer, null)!;
    expect(identity.reviewDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(
      contentReviewIdentity(structuredClone(version), renderer, null)
    ).toEqual(identity);
    expect(JSON.parse(contentApprovalProof(identity))).toMatchObject({
      identity,
      smoke: 'passed',
    });
    for (const candidate of [
      { ...version, id: 'other-version' },
      { ...version, kind: 'site-chrome' },
      { ...version, key: 'other' },
      { ...version, schemaVersion: 2 },
      { ...version, data: { changed: true } },
    ])
      expect(
        contentReviewIdentity(candidate, renderer, null)?.reviewDigest
      ).not.toBe(identity.reviewDigest);
    expect(
      contentReviewIdentity(
        version,
        { ...renderer, commitSha: 'b'.repeat(40) },
        null
      )?.reviewDigest
    ).not.toBe(identity.reviewDigest);
    expect(
      contentReviewIdentity(version, { ...renderer, buildId: 'build-b' }, null)
        ?.reviewDigest
    ).not.toBe(identity.reviewDigest);
    expect(
      contentReviewIdentity(version, renderer, 'newer')?.reviewDigest
    ).not.toBe(identity.reviewDigest);
    expect(
      contentReviewIdentity(version, renderer, null, 'alternate')?.reviewDigest
    ).not.toBe(identity.reviewDigest);
  });

  it('does not confuse object key order with a changed payload', () => {
    const one = { ...version, data: { first: 1, second: [2, 3] } };
    const two = { ...version, data: { second: [2, 3], first: 1 } };
    expect(contentReviewIdentity(one, renderer, null)).toEqual(
      contentReviewIdentity(two, renderer, null)
    );
    expect(
      contentReviewIdentity(
        { ...two, data: { second: [3, 2], first: 1 } },
        renderer,
        null
      )
    ).not.toEqual(contentReviewIdentity(one, renderer, null));
  });

  it.each([undefined, '', 'development', 'a'.repeat(7)])(
    'fails closed on unbound renderer %s',
    revision => {
      expect(
        contentReviewIdentity(
          version,
          { ...renderer, commitSha: revision },
          null
        )
      ).toBeNull();
    }
  );

  it.each([undefined, '', 'development', 'unknown'])(
    'rejects an unbound build %s',
    buildId => {
      expect(
        contentReviewIdentity(version, { ...renderer, buildId }, null)
      ).toBeNull();
    }
  );
});
