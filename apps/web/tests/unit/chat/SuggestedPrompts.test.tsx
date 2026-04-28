import { describe, expect, it, vi } from 'vitest';

import { SuggestedPrompts } from '@/components/jovie/components/SuggestedPrompts';
import { fastRender } from '@/tests/utils/fast-render';

describe('SuggestedPrompts', () => {
  it('renders default hero-style pills (catalog-aware after chat-rag-eval)', () => {
    const onSelect = vi.fn();
    const { getByText, getByTestId, queryByText } = fastRender(
      <SuggestedPrompts onSelect={onSelect} />
    );

    expect(getByTestId('suggested-prompts-rail')).toBeTruthy();
    // First two pills exercise the new artist-data lookup tools — design
    // phase wanted catalog-aware prompts up front.
    expect(getByText('Recap last release')).toBeTruthy();
    expect(getByText('Catalog health')).toBeTruthy();
    expect(getByText('Generate album art')).toBeTruthy();
    expect(getByText('Pitch playlists')).toBeTruthy();
    expect(getByText('Link analytics')).toBeTruthy();

    // Old task-list entries should be gone — they belong in the profile switcher.
    expect(queryByText('Preview profile')).toBeNull();
    expect(queryByText('Change photo')).toBeNull();
    expect(queryByText('Getting paid')).toBeNull();
    // Generic "Build artist profile" replaced by catalog-aware prompts.
    expect(queryByText('Build artist profile')).toBeNull();
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
    getByText('Recap last release').closest('button')?.click();
    expect(onSelect).toHaveBeenCalledWith('How did my last release perform?');
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
