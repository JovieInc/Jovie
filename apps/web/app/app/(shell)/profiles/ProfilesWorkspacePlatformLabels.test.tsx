import { data } from './profiles-workspace-fixtures';
// Load the real lazy rail before assertions, matching the main suite.
import './AddConnectionRail';
import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HeaderActionsProvider,
  useHeaderActions,
} from '@/contexts/HeaderActionsContext';
import type { ProfilesWorkspaceData } from './data';
import { ProfilesWorkspace } from './ProfilesWorkspace';

const navigationMock = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: navigationMock.push,
    replace: navigationMock.replace,
    refresh: navigationMock.refresh,
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => navigationMock.searchParams,
}));

vi.mock('@/hooks/useRegisterRightPanel', () => ({
  useRegisterRightPanel: vi.fn(),
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderWorkspace(workspaceData: ProfilesWorkspaceData) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <HeaderActionsProvider>
        <TooltipProvider>
          <RegisteredHeaderActions />
          <ProfilesWorkspace
            scope={{
              actorId: 'test-actor',
              workspaceId: 'test-workspace',
              target: 'creator',
            }}
            data={workspaceData}
          />
        </TooltipProvider>
      </HeaderActionsProvider>
    </QueryClientProvider>
  );
}

function RegisteredHeaderActions() {
  const { headerActions } = useHeaderActions();
  return <div data-testid='registered-header-actions'>{headerActions}</div>;
}

describe('ProfilesWorkspace platform labels and handles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigationMock.searchParams = new URLSearchParams();
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise(() => {}) // never resolves for tests that don't opt in
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Dogfood 2026-11-10: a DSP row carrying the generic "/artist?id=…" path
  // rendered the invented handle "@artist", and non-registry platforms
  // title-cased naively ("Line" instead of "LINE").
  it('renders canonical row titles and never infers a handle from a generic /artist path', () => {
    const spotifyBase = data.rows[1];
    if (spotifyBase.rowType !== 'surface') {
      throw new Error('Missing DSP fixture');
    }
    renderWorkspace({
      ...data,
      rows: [
        {
          ...spotifyBase,
          id: 'spotify-artist-id',
          label: 'spotify',
          handle: null,
          url: 'https://open.spotify.com/artist?id=06HL4z0CvFAxyc27GXpf02',
          trackedUrl: null,
        },
        {
          id: 'line',
          rowType: 'surface',
          kind: 'social',
          platform: 'line',
          label: 'Line',
          handle: null,
          url: 'https://line.me/timwhite',
          trackedUrl: null,
          qualificationStatus: 'qualified',
          isOfficial: true,
          monitoringState: 'active',
          rank: null,
          previousRank: null,
          lastObservedAt: null,
        },
      ],
    });

    // The generic DSP path names a resource kind, not a handle.
    expect(screen.queryByText('@artist')).not.toBeInTheDocument();

    // The canonical name is the ROW TITLE, not just the unchanged subtitle:
    // scope to the title cell (div.truncate.text-sm) inside each row.
    const subtitles = screen.getAllByTestId('presence-page-identity');
    const spotifySubtitle = subtitles.find(node =>
      node.textContent?.includes('Spotify')
    );
    if (!spotifySubtitle) throw new Error('Missing Spotify subtitle');
    const spotifyRow = spotifySubtitle.closest('tr');
    if (!spotifyRow) throw new Error('Missing Spotify table row');
    expect(
      within(spotifyRow as HTMLElement).getByText('Spotify', {
        selector: 'div.truncate.text-sm',
      })
    ).toBeInTheDocument();
    // Subtitle outcome: the platform, and no invented handle.
    expect(spotifySubtitle).toHaveTextContent(/^Spotify$/);

    const lineSubtitle = subtitles.find(node =>
      node.textContent?.includes('LINE')
    );
    if (!lineSubtitle) throw new Error('Missing LINE subtitle');
    const lineRow = lineSubtitle.closest('tr');
    if (!lineRow) throw new Error('Missing LINE table row');
    expect(
      within(lineRow as HTMLElement).getByText('LINE', {
        selector: 'div.truncate.text-sm',
      })
    ).toBeInTheDocument();
    // Username-rooted platforms still infer the handle in the subtitle.
    expect(lineSubtitle).toHaveTextContent('LINE · @timwhite');
  });
});
