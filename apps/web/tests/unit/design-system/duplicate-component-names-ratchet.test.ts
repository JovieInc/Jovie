import { describe, expect, it } from 'vitest';
import { evaluateBaseDesignRatchet } from '../../../../../scripts/design-system-base-ratchet.mjs';

describe('duplicate component names ratchet', () => {
  it('does not introduce duplicate component paths beyond trusted base source', () => {
    const result = evaluateBaseDesignRatchet();
    const added = result.newIdentities.filter(key =>
      key.includes('\tduplicate-component\t')
    );
    expect(
      added,
      `Reuse existing components instead of adding forks: ${added.join(', ')}`
    ).toEqual([]);
  });
});
