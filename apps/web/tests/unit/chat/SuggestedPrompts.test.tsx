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
    expect(getByText('Preview profile')).toBeTruthy();
    expect(getByText('Change photo')).toBeTruthy();
    expect(getByText('Release link')).toBeTruthy();

    // First-session suggestions should not appear in default mode
    expect(queryByText('Getting paid')).toBeNull();
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
        name: 'Link \u201CMidnight Drive\u201D',
      })
    ).toBeTruthy();
    expect(getByRole('button', { name: 'Preview profile' })).toBeTruthy();
    expect(getByRole('button', { name: 'Getting paid' })).toBeTruthy();
  });

  it('calls onSelect with prompt when clicked', () => {
    const onSelect = vi.fn();
    const { getByRole } = fastRender(<SuggestedPrompts onSelect={onSelect} />);
    getByRole('button', { name: 'Preview profile' }).click();
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
        name: 'Pitches for “Midnight Drive”',
      })
    ).toBeTruthy();
    expect(getByRole('button', { name: 'Share feedback' })).toBeTruthy();
  });
});
