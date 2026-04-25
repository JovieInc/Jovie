import { describe, expect, it, vi } from 'vitest';

import { SuggestedPrompts } from '@/components/jovie/components/SuggestedPrompts';
import { fastRender } from '@/tests/utils/fast-render';

describe('SuggestedPrompts', () => {
  it('renders default hero-style pills (mirrors homepage intent)', () => {
    const onSelect = vi.fn();
    const { getByText, getByTestId, queryByText } = fastRender(
      <SuggestedPrompts onSelect={onSelect} />
    );

    expect(getByTestId('suggested-prompts-rail')).toBeTruthy();
    expect(getByText('Plan a release')).toBeTruthy();
    expect(getByText('Generate album art')).toBeTruthy();
    expect(getByText('Pitch playlists')).toBeTruthy();
    expect(getByText('Build artist profile')).toBeTruthy();
    expect(getByText('Analyze momentum')).toBeTruthy();

    // Old task-list entries should be gone — they belong in the profile switcher.
    expect(queryByText('Preview profile')).toBeNull();
    expect(queryByText('Change photo')).toBeNull();
    expect(queryByText('Getting paid')).toBeNull();
  });

  it('renders a grid layout when requested', () => {
    const onSelect = vi.fn();
    const { getByTestId } = fastRender(
      <SuggestedPrompts onSelect={onSelect} layout='grid' />
    );

    expect(getByTestId('suggested-prompts-grid')).toBeTruthy();
  });

  it('renders a flat layout when requested', () => {
    const onSelect = vi.fn();
    const { getByTestId } = fastRender(
      <SuggestedPrompts onSelect={onSelect} layout='flat' />
    );

    expect(getByTestId('suggested-prompts-flat')).toBeTruthy();
  });

  it('renders first-session pills including all four starter suggestions', () => {
    const onSelect = vi.fn();
    const { getByRole } = fastRender(
      <SuggestedPrompts
        onSelect={onSelect}
        isFirstSession
        latestReleaseTitle='Midnight Drive'
      />
    );

    expect(getByRole('button', { name: 'Plan a release' })).toBeTruthy();
    expect(getByRole('button', { name: 'Generate album art' })).toBeTruthy();
    expect(getByRole('button', { name: 'Pitch playlists' })).toBeTruthy();
    expect(getByRole('button', { name: 'Build artist profile' })).toBeTruthy();
  });

  it('calls onSelect with the full prompt when clicked', () => {
    const onSelect = vi.fn();
    const { getByText } = fastRender(<SuggestedPrompts onSelect={onSelect} />);
    getByText('Plan a release').closest('button')?.click();
    expect(onSelect).toHaveBeenCalledWith('Help me plan my next release.');
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
