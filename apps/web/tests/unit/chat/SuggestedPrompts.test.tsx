import { describe, expect, it, vi } from 'vitest';

import { SuggestedPrompts } from '@/components/jovie/components/SuggestedPrompts';
import { fastRender } from '@/tests/utils/fast-render';

describe('SuggestedPrompts', () => {
  it('renders default prompts when first-session mode is off', () => {
    const onSelect = vi.fn();
    const { getByText, queryByText } = fastRender(
      <SuggestedPrompts onSelect={onSelect} />
    );

    expect(getByText('Change profile photo')).toBeTruthy();
    expect(queryByText('Preview my profile')).toBeNull();
  });

  it('renders first-session prompts with release title personalization', () => {
    const onSelect = vi.fn();
    const { getByRole } = fastRender(
      <SuggestedPrompts
        onSelect={onSelect}
        isFirstSession
        latestReleaseTitle='Midnight Drive'
      />
    );

    expect(
      getByRole('button', { name: 'Set up a link for “Midnight Drive”' })
    ).toBeTruthy();
    expect(getByRole('button', { name: 'Preview my profile' })).toBeTruthy();
    expect(getByRole('button', { name: 'How do I get paid?' })).toBeTruthy();
  });
});
