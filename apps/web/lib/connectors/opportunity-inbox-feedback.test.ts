import { describe, expect, it } from 'vitest';
import { buildOpportunityInboxFeedbackMessage } from './opportunity-inbox-feedback';

describe('buildOpportunityInboxFeedbackMessage', () => {
  it('builds a thumbs-only message that satisfies feedback length validation', () => {
    expect(buildOpportunityInboxFeedbackMessage('positive')).toBe(
      'Helpful suggestion'
    );
    expect(buildOpportunityInboxFeedbackMessage('negative')).toBe(
      'Not helpful suggestion'
    );
  });

  it('appends optional comments', () => {
    expect(
      buildOpportunityInboxFeedbackMessage('positive', '  More like this  ')
    ).toBe('Helpful suggestion: More like this');
  });
});
