import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderKey } from '@/lib/discography/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { renderWithQueryClient } from '@/tests/utils/test-utils';
import { ReleaseSidebar } from './ReleaseSidebar';
import { track } from './releaseTrackList.test-fixtures';
import type { Release } from './types';

const mockPush = vi.fn();
const mockPlanGate = vi.fn(() => ({
  canAccessTasksWorkspace: false,
  isLoading: false,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/app/releases',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/queries', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/queries')>()),
  usePlanGate: () => mockPlanGate(),
}));

const release: Release = {
  profileId: 'profile-1',
  id: 'release-midnight-echo',
  title: 'Midnight Echo',
  artistNames: ['Example Artist'],
  status: 'released',
  releaseDate: '2026-01-15T00:00:00.000Z',
  slug: 'midnight-echo',
  smartLinkPath: '/example/midnight-echo',
  providers: [],
  releaseType: 'single',
  isExplicit: false,
  totalTracks: 0,
  totalDiscs: 1,
};

const providerConfig = {} as Record<
  ProviderKey,
  { label: string; accent: string }
>;

function renderSidebar(
  props: Partial<Parameters<typeof ReleaseSidebar>[0]> = {}
) {
  return renderWithQueryClient(
    <ReleaseSidebar
      release={release}
      mode='admin'
      isOpen
      providerConfig={providerConfig}
      artistName='Example Artist'
      onClose={vi.fn()}
      analyticsOverride={null}
      showCredits={false}
      {...props}
    />
  );
}

describe('ReleaseSidebar', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockPlanGate.mockReturnValue({
      canAccessTasksWorkspace: false,
      isLoading: false,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps Audio and Artwork visible while Lyrics and Tracks disclose content, axe-clean', async () => {
    const user = userEvent.setup();
    const lyrics = 'City lights are fading into morning';
    const { container } = renderSidebar({
      release: { ...release, lyrics, totalTracks: 1 },
      tracksOverride: [{ ...track, releaseId: release.id }],
    });

    expect(screen.getByTestId('release-sidebar')).toBeInTheDocument();
    expect(screen.getAllByText('Midnight Echo').length).toBeGreaterThan(0);
    for (const title of ['Audio', 'Artwork']) {
      expect(screen.getByRole('heading', { name: title })).toBeVisible();
      expect(
        screen.queryByRole('button', { name: title })
      ).not.toBeInTheDocument();
    }
    const audioUpload = within(
      screen.getByTestId('release-audio-card')
    ).getByRole('button', { name: /Drop audio/ });
    const artworkDownloads = screen.getByRole('switch', {
      name: 'Allow artwork downloads on public pages',
    });
    expect(audioUpload).toBeVisible();
    expect(artworkDownloads).toBeVisible();

    const lyricsToggle = screen.getByRole('button', { name: 'Lyrics' });
    const tracksToggle = screen.getByRole('button', { name: 'Tracks' });
    expect(lyricsToggle).toHaveAttribute('aria-expanded', 'false');
    expect(tracksToggle).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByPlaceholderText('Paste your lyrics here')
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('tracklist')).not.toBeInTheDocument();

    await user.click(lyricsToggle);
    const lyricsField = screen.getByPlaceholderText('Paste your lyrics here');
    expect(lyricsToggle).toHaveAttribute('aria-expanded', 'true');
    expect(lyricsField).toBeVisible();
    expect(lyricsField).toHaveValue(lyrics);
    await user.keyboard('{Enter}');
    expect(lyricsToggle).toHaveAttribute('aria-expanded', 'false');
    expect(lyricsField).not.toBeVisible();

    await user.click(tracksToggle);
    const tracks = screen.getByTestId('tracklist');
    expect(tracksToggle).toHaveAttribute('aria-expanded', 'true');
    expect(tracks).toBeVisible();
    expect(within(tracks).getByText(track.title)).toBeVisible();
    await user.keyboard('{Enter}');
    expect(tracksToggle).toHaveAttribute('aria-expanded', 'false');
    expect(tracks).not.toBeVisible();
    expect(audioUpload).toBeVisible();
    expect(artworkDownloads).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('shows the empty prompt with no release selected, axe-clean', async () => {
    const { container } = renderSidebar({ release: null });

    expect(
      screen.getByText('Select a release in the table to view its details.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('switches to the tasks tab and shows the loading frame', async () => {
    mockPlanGate.mockReturnValue({
      canAccessTasksWorkspace: false,
      isLoading: true,
    });
    const user = userEvent.setup();
    const { container } = renderSidebar();

    const tabs = screen.getByRole('tablist', { name: 'Release sidebar tabs' });
    await user.click(within(tabs).getByRole('tab', { name: /tasks/i }));
    expect(
      await screen.findByTestId('release-tasks-loading-state')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('closes on Escape and keeps the actions menu reachable', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderSidebar({ onClose });

    screen.getByTestId('release-sidebar').focus();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    expect(
      screen.getByRole('button', { name: 'More actions' })
    ).toBeInTheDocument();
  });

  it('switches to the Links tab, axe-clean', async () => {
    const user = userEvent.setup();
    const { container } = renderSidebar();

    const tabs = screen.getByRole('tablist', { name: 'Release sidebar tabs' });
    const dspTab = within(tabs).getByRole('tab', { name: 'Links' });
    await user.click(dspTab);
    await waitFor(() =>
      expect(dspTab).toHaveAttribute('aria-selected', 'true')
    );
    await expectNoA11yViolations(container);
  });

  it('shows the plan upgrade on the tasks tab without workspace access', async () => {
    const user = userEvent.setup();
    const { container } = renderSidebar();

    const tabs = screen.getByRole('tablist', { name: 'Release sidebar tabs' });
    await user.click(within(tabs).getByRole('tab', { name: /tasks/i }));
    const card = await screen.findByTestId('release-tasks-card');
    expect(
      within(card).queryByTestId('release-tasks-loading-state')
    ).not.toBeInTheDocument();
    expect(card).not.toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean with a long title inside an RTL document', async () => {
    const { container } = renderWithQueryClient(
      <div dir='rtl'>
        <ReleaseSidebar
          release={{
            ...release,
            title:
              'A Very Long Release Title That Keeps Going Well Past The Sidebar Width (Extended Mix)',
          }}
          mode='admin'
          isOpen
          providerConfig={providerConfig}
          artistName='Example Artist'
          onClose={vi.fn()}
          analyticsOverride={null}
          showCredits={false}
        />
      </div>
    );

    expect(
      screen.getAllByText(/A Very Long Release Title/).length
    ).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });
});
