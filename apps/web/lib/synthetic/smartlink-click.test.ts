import { describe, expect, it } from 'vitest';
import { classifySyntheticClick, SYNTHETIC_CLICK_TAG } from './smartlink-click';

describe('classifySyntheticClick', () => {
  it('tags a passage-granted click synthetic and classifies it as a bot', () => {
    // The bot predicate is what every user-facing analytics aggregate
    // filters on (is_bot = false), so a synthetic click is excluded from all
    // of them by construction.
    const classification = classifySyntheticClick(
      { isBot: false, reason: '' },
      { actorId: 'prodcert' }
    );
    expect(classification).toEqual({
      isBot: true,
      reason: 'synthetic_passage_token',
      synthetic: SYNTHETIC_CLICK_TAG,
    });
    expect(SYNTHETIC_CLICK_TAG).toBe('prodcert');
  });

  it('leaves an ordinary visitor click untouched', () => {
    const classification = classifySyntheticClick(
      { isBot: false, reason: '' },
      null
    );
    expect(classification).toEqual({
      isBot: false,
      reason: '',
      synthetic: null,
    });
  });

  it('keeps real bot classification without inventing a synthetic tag', () => {
    const classification = classifySyntheticClick(
      { isBot: true, reason: 'self_declared_synthetic' },
      null
    );
    expect(classification).toEqual({
      isBot: true,
      reason: 'self_declared_synthetic',
      synthetic: null,
    });
  });

  it('lets a passage grant override an existing bot reason', () => {
    // A synthetic certification click that also self-declares (the cert sends
    // x-synthetic-monitoring) keeps a single, unambiguous reason.
    const classification = classifySyntheticClick(
      { isBot: true, reason: 'self_declared_synthetic' },
      { actorId: 'prodcert' }
    );
    expect(classification).toEqual({
      isBot: true,
      reason: 'synthetic_passage_token',
      synthetic: SYNTHETIC_CLICK_TAG,
    });
  });
});
