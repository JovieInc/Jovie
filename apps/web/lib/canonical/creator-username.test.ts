import { describe, expect, it } from 'vitest';
import {
  admitCreatorUsername,
  CREATOR_USERNAME_CONTRACT,
} from './creator-username';
import { requireCanonical, SemanticContractError } from './semantic-contract';

const PROVENANCE = {
  producer: 'test-producer@1',
  source: 'spotify',
  confidence: 'inferred' as const,
};

const rejectionCodes = (raw: unknown) =>
  admitCreatorUsername(raw, PROVENANCE).rejections.map(r => r.code);

describe('CREATOR_USERNAME_CONTRACT (JOV-5922 deliberate-red fixtures)', () => {
  it('accepts a normal handle and returns the normalized canonical value', () => {
    const decision = admitCreatorUsername(' FeddeLeGrand ', PROVENANCE);
    expect(decision.status).toBe('accepted');
    expect(decision.canonical).toBe('feddelegrand');
    expect(decision.field).toBe('creator_profiles.username');
    expect(decision.contractVersion).toBe(1);
    expect(decision.provenance.producer).toBe('test-producer@1');
  });

  it('quarantines delimiter-concatenated handle lists', () => {
    for (const raw of [
      'foo,bar',
      'foo, bar',
      'foo|bar',
      'foo;bar',
      'handle1,handle2,handle3',
    ]) {
      const decision = admitCreatorUsername(raw, PROVENANCE);
      expect(decision.status).toBe('quarantined');
      expect(decision.canonical).toBeUndefined();
      expect(rejectionCodes(raw)).toContain('list_delimiters');
    }
  });

  it('quarantines arrays serialized as strings', () => {
    for (const raw of [
      '["foo","bar"]',
      '["feddelegrand"]',
      '{"username":"foo"}',
      '["a", "b", "c"]',
    ]) {
      expect(admitCreatorUsername(raw, PROVENANCE).status).toBe('quarantined');
      expect(rejectionCodes(raw)).toContain('serialized_collection');
    }
  });

  it('quarantines non-string candidate sets (arrays, objects, null)', () => {
    for (const raw of [
      ['foo', 'bar'],
      { handle: 'foo' },
      null,
      undefined,
      42,
    ]) {
      expect(admitCreatorUsername(raw, PROVENANCE).status).toBe('quarantined');
      expect(rejectionCodes(raw)).toContain('not_a_string');
    }
  });

  it('quarantines URLs embedded in the username slot', () => {
    for (const raw of [
      'https://instagram.com/foo',
      'http://foo.com',
      'www.instagram.com/foo',
      'spotify:artist:123https://x.com',
    ]) {
      expect(admitCreatorUsername(raw, PROVENANCE).status).toBe('quarantined');
      expect(rejectionCodes(raw)).toContain('url_in_value');
    }
  });

  it('quarantines whitespace and sentence fragments', () => {
    for (const raw of [
      'foo bar',
      'the foo band',
      'foo  foo',
      'my\thandle',
      'two words here',
    ]) {
      expect(admitCreatorUsername(raw, PROVENANCE).status).toBe('quarantined');
      expect(rejectionCodes(raw)).toContain('whitespace_fragment');
    }
  });

  it('quarantines empty and whitespace-only values', () => {
    for (const raw of ['', '   ', '\n']) {
      expect(admitCreatorUsername(raw, PROVENANCE).status).toBe('quarantined');
      expect(rejectionCodes(raw)).toContain('empty');
    }
  });

  it('delegates format rules to the canonical username validator', () => {
    expect(rejectionCodes('ab')).toContain('format:TOO_SHORT');
    expect(rejectionCodes('9lives')).toContain(
      'format:STARTS_WITH_NUMBER_OR_HYPHEN'
    );
    expect(rejectionCodes('admin')).toContain('format:RESERVED');
    expect(rejectionCodes(`${'x'.repeat(31)}`)).toContain('format:TOO_LONG');
  });

  it('preserves collision detection as a downstream concern, not a contract concern', () => {
    // Two different raws normalizing to the same handle are both admitted;
    // uniqueness is enforced by the producer's in-transaction check and the
    // username_normalized unique index.
    expect(admitCreatorUsername('Foo', PROVENANCE).canonical).toBe('foo');
    expect(admitCreatorUsername('FOO', PROVENANCE).canonical).toBe('foo');
  });

  it('admits handles derived from legitimate international names (ASCII handle alphabet)', () => {
    // Producers transliterate international names upstream (e.g.
    // normalizeArtistNameToHandleBase('Beyoncé') -> 'beyonce'). The contract
    // admits the resulting handle, not the display name.
    expect(admitCreatorUsername('beyonce', PROVENANCE).status).toBe('accepted');
    expect(admitCreatorUsername('niha-oconnor', PROVENANCE).status).toBe(
      'accepted'
    );
    expect(admitCreatorUsername('ac-dc', PROVENANCE).status).toBe('accepted');
    // Raw non-ASCII observations are quarantined by format rules, not by any
    // language-specific heuristic — they belong to the display-name field.
    expect(rejectionCodes('beyoncé')).toContain('format:INVALID_CHARS');
  });

  it('records unknown provenance when the producer cannot identify itself', () => {
    const decision = admitCreatorUsername('foo', {
      producer: 'unknown',
      confidence: 'unknown',
    });
    expect(decision.status).toBe('accepted');
    expect(decision.provenance.confidence).toBe('unknown');
  });

  it('requireCanonical throws SemanticContractError carrying the decision', () => {
    expect(() =>
      requireCanonical(CREATOR_USERNAME_CONTRACT, 'foo,bar', PROVENANCE)
    ).toThrow(SemanticContractError);
    try {
      requireCanonical(CREATOR_USERNAME_CONTRACT, 'foo,bar', PROVENANCE);
    } catch (error) {
      const decision = (error as SemanticContractError).decision;
      expect(decision.status).toBe('quarantined');
      expect(decision.field).toBe('creator_profiles.username');
    }
  });
});
