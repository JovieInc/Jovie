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
    expect(getByText('Plan A Release')).toBeTruthy();
    const generateAlbumArt = getByText('Generate Album Art').closest('button');
    expect(generateAlbumArt).toBeTruthy();
    expect(generateAlbumArt).toBeDisabled();
    expect(getByText('Build Artist Profile')).toBeTruthy();
    expect(getByText("What's Working Right Now?")).toBeTruthy();
    // Full title is always on the pill for truncated overflow discoverability.
    expect(
      getByText("What's Working Right Now?").closest('button')
    ).toHaveAttribute('title', "What's Working Right Now?");

    // Old task-list entries should be gone — they belong in the profile switcher.
    expect(queryByText('Preview profile')).toBeNull();
    expect(queryByText('Change photo')).toBeNull();
    expect(queryByText('Getting paid')).toBeNull();
  });

  it('keeps the rail as a single manually scrollable row', () => {
    const onSelect = vi.fn();
    const { getByTestId } = fastRender(
      <SuggestedPrompts onSelect={onSelect} />
    );

    const rail = getByTestId('suggested-prompts-rail');
    expect(rail.className).toContain('system-b-chat-prompt-rail-scroll');
    expect(rail.className).not.toContain('scroll-smooth');
    expect(rail.className).not.toContain('md:overflow-visible');
    const row = rail.firstElementChild;
    expect(row?.className).toContain('system-b-chat-prompt-rail');
    expect(row?.className).toContain('snap-x');
    expect(row?.className).not.toContain('flex-wrap');
    expect(row?.className).toContain('whitespace-nowrap');
  });

  it('hides chips that duplicate empty-state action card labels', () => {
    const onSelect = vi.fn();
    const { queryByText, getByText } = fastRender(
      <SuggestedPrompts
        onSelect={onSelect}
        excludeLabels={['Generate Album Art', 'Plan A Release']}
      />
    );

    expect(queryByText('Generate Album Art')).toBeNull();
    expect(queryByText('Plan A Release')).toBeNull();
    expect(getByText("What's Working Right Now?")).toBeTruthy();
  });

  it('uses flat prompt icons without always-on icon backgrounds', () => {
    const onSelect = vi.fn();
    const { getByRole } = fastRender(<SuggestedPrompts onSelect={onSelect} />);

    const iconShell = getByRole('button', {
      name: 'Plan A Release',
    }).firstElementChild;

    expect(iconShell?.className).toContain('text-tertiary-token');
    expect(iconShell?.className).not.toContain('rounded-full');
    expect(iconShell?.className).not.toContain('bg-black');
    expect(iconShell?.className).not.toContain('dark:bg-white');
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

    expect(getByRole('button', { name: 'Plan A Release' })).toBeTruthy();
    expect(getByRole('button', { name: 'Generate Album Art' })).toBeDisabled();
    expect(getByRole('button', { name: 'Generate Pitch' })).toBeTruthy();
    expect(getByRole('button', { name: 'Build Artist Profile' })).toBeTruthy();
  });

  it('calls onSelect with the full prompt when clicked', () => {
    const onSelect = vi.fn();
    const { getByText } = fastRender(<SuggestedPrompts onSelect={onSelect} />);
    getByText('Plan A Release').closest('button')?.click();
    expect(onSelect).toHaveBeenCalledWith('Help me plan my next release.');
  });

  it('hides the profile chip when the profile is already complete', () => {
    const onSelect = vi.fn();
    const { queryByText } = fastRender(
      <SuggestedPrompts onSelect={onSelect} isProfileComplete />
    );

    expect(queryByText('Build Artist Profile')).toBeNull();
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
        name: 'Pitch for “Midnight Drive”',
      })
    ).toBeTruthy();
    expect(getByRole('button', { name: 'Share Feedback' })).toBeTruthy();
  });

  it('disables album art when capability is unavailable and enables a draft brief action', () => {
    const onSelect = vi.fn();
    const { getByRole } = fastRender(
      <SuggestedPrompts
        onSelect={onSelect}
        albumArtCapability={{
          availability: 'unavailable',
          reason: 'Album art generation is not available for this profile.',
          reasonCode: 'PROFILE_REQUIRED',
        }}
      />
    );

    getByRole('button', { name: 'Generate Album Art' }).click();
    expect(onSelect).not.toHaveBeenCalled();

    const draftBrief = getByRole('button', { name: 'Draft Album-art Brief' });
    expect(draftBrief).toBeEnabled();

    draftBrief.click();
    expect(onSelect).toHaveBeenCalledWith(
      'Draft an album-art brief for my latest release with visual direction, mood, palette, typography, and production notes.'
    );
  });

  it('disables album art while capability is unknown without adding the draft brief action', () => {
    const onSelect = vi.fn();
    const { getByRole, queryByRole } = fastRender(
      <SuggestedPrompts
        onSelect={onSelect}
        albumArtCapability={{
          availability: 'unknown',
          reason: 'Checking album art availability...',
          reasonCode: 'CHECKING',
        }}
      />
    );

    getByRole('button', { name: 'Generate Album Art' }).click();

    expect(onSelect).not.toHaveBeenCalled();
    expect(queryByRole('button', { name: 'Draft Album-art Brief' })).toBeNull();
  });

  it('omits "Generate album art" entirely when provider is unavailable and surfaces the brief in its place', () => {
    const onSelect = vi.fn();
    const { queryByRole, getByRole } = fastRender(
      <SuggestedPrompts
        onSelect={onSelect}
        albumArtCapability={{
          availability: 'unavailable',
          reason: 'Album art generation is temporarily unavailable.',
          reasonCode: 'PROVIDER_UNAVAILABLE',
        }}
      />
    );

    // Provider broken → don't advertise a capability we can't deliver.
    expect(queryByRole('button', { name: 'Generate Album Art' })).toBeNull();

    // Brief fallback still surfaces a useful creative action.
    const draftBrief = getByRole('button', { name: 'Draft Album-art Brief' });
    expect(draftBrief).toBeEnabled();
    draftBrief.click();
    expect(onSelect).toHaveBeenCalledWith(
      'Draft an album-art brief for my latest release with visual direction, mood, palette, typography, and production notes.'
    );
  });

  it('omits "Generate album art" entirely when the feature flag is disabled', () => {
    const onSelect = vi.fn();
    const { queryByRole, getByRole } = fastRender(
      <SuggestedPrompts
        onSelect={onSelect}
        albumArtCapability={{
          availability: 'unavailable',
          reason: 'Album art generation is not enabled for this workspace.',
          reasonCode: 'FEATURE_DISABLED',
        }}
      />
    );

    expect(queryByRole('button', { name: 'Generate Album Art' })).toBeNull();
    expect(
      getByRole('button', { name: 'Draft Album-art Brief' })
    ).toBeEnabled();
  });

  it('keeps "Generate album art" visible-but-disabled for plan-gated users (upsell)', () => {
    const onSelect = vi.fn();
    const { getByRole } = fastRender(
      <SuggestedPrompts
        onSelect={onSelect}
        albumArtCapability={{
          availability: 'unavailable',
          reason: 'Album art generation requires a Pro plan.',
          reasonCode: 'PLAN_UNAVAILABLE',
        }}
      />
    );

    // Plan-gated → keep the pill as a Pro upsell affordance.
    const albumArt = getByRole('button', { name: 'Generate Album Art' });
    expect(albumArt).toBeDisabled();

    // Brief fallback still surfaces for the free-tier user.
    expect(
      getByRole('button', { name: 'Draft Album-art Brief' })
    ).toBeEnabled();
  });
});
