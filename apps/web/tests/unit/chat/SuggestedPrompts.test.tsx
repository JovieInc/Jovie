import { describe, expect, it, vi } from 'vitest';

import { SuggestedPrompts } from '@/components/jovie/components/SuggestedPrompts';
import { fastRender } from '@/tests/utils/fast-render';

describe('SuggestedPrompts', () => {
  it('renders default prompts', () => {
    const onSelect = vi.fn();
    const { getByText, getByTestId, queryByText } = fastRender(
      <SuggestedPrompts onSelect={onSelect} />
    );

    expect(getByTestId('suggested-prompts-rail')).toBeTruthy();
    expect(getByText('Preview my profile')).toBeTruthy();
    expect(getByText('Change profile photo')).toBeTruthy();
    expect(getByText('Set up a release link')).toBeTruthy();

    // First-session suggestions should not appear in default mode
    expect(queryByText('How do I get paid?')).toBeNull();
  });

  it('renders first-session prompts including all suggestions', () => {
    const onSelect = vi.fn();
    const { getByRole } = fastRender(
      <SuggestedPrompts
        onSelect={onSelect}
        isFirstSession
        latestReleaseTitle='Midnight Drive'
      />
    );

    // First-session suggestions
    expect(
      getByRole('button', {
        name: 'Set up a link for \u201CMidnight Drive\u201D',
      })
    ).toBeTruthy();
    expect(getByRole('button', { name: 'Preview my profile' })).toBeTruthy();
    expect(getByRole('button', { name: 'How do I get paid?' })).toBeTruthy();
  });

  it('calls onSelect with prompt when clicked', () => {
    const onSelect = vi.fn();
    const { getByText } = fastRender(<SuggestedPrompts onSelect={onSelect} />);
    getByText('Preview my profile').closest('button')?.click();
    expect(onSelect).toHaveBeenCalledWith('Preview my profile.');
  });

  it('renders pitch and feedback actions for returning users with advanced tools', () => {
    const onSelect = vi.fn();
    const { getByRole } = fastRender(
      <SuggestedPrompts
        onSelect={onSelect}
        canUseAdvancedTools
        latestReleaseTitle='Midnight Drive'
      />
    );

    expect(
      getByRole('button', {
        name: 'Generate pitches for “Midnight Drive”',
      })
    ).toBeTruthy();
    expect(getByRole('button', { name: 'Share feedback' })).toBeTruthy();
  });
});
