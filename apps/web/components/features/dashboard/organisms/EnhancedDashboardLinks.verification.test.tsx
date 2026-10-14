import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { EnhancedDashboardLinks } from './EnhancedDashboardLinks';
import type { useLinksPersistence } from './links/hooks/useLinksPersistence';
import type { useProfileEditor } from './links/hooks/useProfileEditor';
import type { useSuggestionSync } from './links/hooks/useSuggestionSync';

const state = vi.hoisted(() => ({
  selectedProfile: {
    username: 'alex',
    isVerified: false,
    spotifyId: 'spotify-artist',
    settings: {},
  },
  setPreviewData: vi.fn(),
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => ({ selectedProfile: state.selectedProfile }),
}));
vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  usePreviewPanelData: () => ({ setPreviewData: state.setPreviewData }),
  usePreviewPanelState: () => ({ isOpen: true }),
}));
vi.mock('./links/hooks/useProfileEditor', () => ({
  useProfileEditor: () =>
    ({
      artist: null,
      isMusicProfile: true,
      profileId: 'alex',
      profileDisplayName: 'Alex Rivera',
      profileUsername: 'alex',
      editingField: null,
      setEditingField: vi.fn(),
      setProfileDisplayName: vi.fn(),
      setProfileUsername: vi.fn(),
      displayNameInputRef: { current: null },
      usernameInputRef: { current: null },
      profileSaveStatus: {
        saving: false,
        error: null,
        success: null,
        lastSaved: null,
      },
      debouncedProfileSave: Object.assign(
        vi.fn(async () => {}),
        { flush: vi.fn(async () => {}), cancel: vi.fn() }
      ),
      handleAvatarUpload: vi.fn(async () => '/avatar.jpg'),
      handleDisplayNameChange: vi.fn(),
      handleUsername: vi.fn(),
      handleInputKeyDown: vi.fn(),
      handleInputBlur: vi.fn(),
      lastProfileSavedRef: { current: null },
    }) satisfies ReturnType<typeof useProfileEditor>,
}));
vi.mock('./links/hooks/useLinksPersistence', () => ({
  useLinksPersistence: () =>
    ({
      links: [],
      setLinks: vi.fn(),
      linksVersion: 1,
      setLinksVersion: vi.fn(),
      suggestedLinks: [],
      setSuggestedLinks: vi.fn(),
      autoRefreshUntilMs: 0,
      setAutoRefreshUntilMs: vi.fn(),
      debouncedSave: Object.assign(vi.fn(), {
        flush: vi.fn(async () => {}),
        cancel: vi.fn(),
      }),
      enqueueSave: vi.fn(),
      linksRef: { current: [] },
    }) satisfies ReturnType<typeof useLinksPersistence>,
}));
vi.mock('./links/hooks/useSuggestionSync', () => ({
  useSuggestionSync: () =>
    ({
      syncSuggestionsFromServer: vi.fn(),
      handleAcceptSuggestion: vi.fn(async () => null),
      handleDismissSuggestion: vi.fn(async () => {}),
    }) satisfies ReturnType<typeof useSuggestionSync>,
}));

it('hydrates and refreshes source verification independently of a connected DSP', () => {
  state.setPreviewData.mockClear();
  const { rerender } = render(<EnhancedDashboardLinks initialLinks={[]} />);
  const initial = state.setPreviewData.mock.calls.at(-1)?.[0](null);
  expect(initial).toMatchObject({
    isVerified: false,
    dspConnections: { spotify: { connected: true } },
  });
  state.selectedProfile = { ...state.selectedProfile, isVerified: true };
  rerender(<EnhancedDashboardLinks initialLinks={[]} />);
  expect(state.setPreviewData.mock.calls.at(-1)?.[0](null)).toMatchObject({
    isVerified: true,
  });
});
