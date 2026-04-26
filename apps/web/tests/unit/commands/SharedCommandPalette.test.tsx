/**
 * Tests for the cmd+k surface of SharedCommandPalette.
 *
 * Asserts surface filtering (cmdk includes nav + skills, chat-slash skips
 * nav), commit routing for nav and skill items, and recent-thread injection
 * via the additional-sections slot.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CmdKPalette } from '@/components/organisms/CmdKPalette';
import { commandsForSurface } from '@/lib/commands/registry';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span data-testid='img' data-src={src} data-alt={alt} />
  ),
}));

vi.mock('@jovie/ui', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div role='dialog'>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@radix-ui/react-dialog', () => ({
  Title: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
  Description: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
}));

vi.mock('@/lib/queries/useReleasesQuery', () => ({
  useReleasesQuery: () => ({
    data: [
      {
        id: 'rel-1',
        title: 'Midnight Run',
        artworkUrl: null,
        artistNames: ['Test Artist'],
        releaseDate: '2024-01-01',
        releaseType: 'single',
        spotifyPopularity: 50,
        totalTracks: 1,
        totalDurationMs: 200_000,
      },
    ],
    isLoading: false,
  }),
}));

vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => ({
    results: [],
    state: 'idle',
    search: vi.fn(),
  }),
}));

describe('SharedCommandPalette (cmd+k surface)', () => {
  it('exposes both skills and navs from the registry on the cmdk surface', () => {
    const cmds = commandsForSurface('cmdk');
    const skills = cmds.filter(c => c.kind === 'skill');
    const navs = cmds.filter(c => c.kind === 'nav');
    expect(skills.length).toBeGreaterThan(0);
    expect(navs.length).toBeGreaterThan(0);
  });

  it('omits nav entries from the chat-slash surface', () => {
    const slashCmds = commandsForSurface('chat-slash');
    const slashNavs = slashCmds.filter(c => c.kind === 'nav');
    expect(slashNavs).toHaveLength(0);
  });

  it('renders nav, skill, and release sections when open', () => {
    render(<CmdKPalette profileId='profile-1' open onOpenChange={vi.fn()} />);
    expect(screen.getByTestId('shared-command-palette')).toBeInTheDocument();
    // Section headings render as uppercased labels — entries with the same
    // text exist as nav-row labels, so target the heading by its style class.
    const sectionLabels = screen
      .getAllByText(/^(Go to|Skills|Releases|Artists)$/)
      .map(el => el.textContent);
    expect(sectionLabels).toContain('Go to');
    expect(sectionLabels).toContain('Skills');
    expect(sectionLabels).toContain('Releases');
    expect(screen.getByText('Midnight Run')).toBeInTheDocument();
  });

  it('navigates to the nav href when a nav item is committed', () => {
    pushMock.mockClear();
    render(<CmdKPalette profileId='profile-1' open onOpenChange={vi.fn()} />);
    // Click the Releases nav row.
    const releasesNav = screen
      .getAllByRole('option')
      .find(el => el.textContent?.includes('Manage your release catalog'));
    expect(releasesNav).toBeDefined();
    fireEvent.mouseDown(releasesNav!);
    expect(pushMock).toHaveBeenCalledWith('/app/dashboard/releases');
  });

  it('routes a skill commit to chat with the ?skill= handoff', () => {
    pushMock.mockClear();
    render(<CmdKPalette profileId='profile-1' open onOpenChange={vi.fn()} />);
    // Click the "Generate album art" skill row.
    const skillRow = screen
      .getAllByRole('option')
      .find(el => el.textContent?.includes('Generate album art'));
    expect(skillRow).toBeDefined();
    fireEvent.mouseDown(skillRow!);
    expect(pushMock).toHaveBeenCalledWith('/app/chat?skill=generateAlbumArt');
  });

  it('routes a release entity commit to its tasks page', () => {
    pushMock.mockClear();
    render(<CmdKPalette profileId='profile-1' open onOpenChange={vi.fn()} />);
    const releaseRow = screen
      .getAllByRole('option')
      .find(el => el.textContent?.includes('Midnight Run'));
    expect(releaseRow).toBeDefined();
    fireEvent.mouseDown(releaseRow!);
    expect(pushMock).toHaveBeenCalledWith(
      '/app/dashboard/releases/rel-1/tasks'
    );
  });

  it('renders additional sections (e.g. recent threads) and routes via callback', () => {
    pushMock.mockClear();
    const onAdditionalSelect = vi.fn();
    render(
      <CmdKPalette
        profileId='profile-1'
        open
        onOpenChange={vi.fn()}
        additionalSectionsAfter={[
          {
            id: 'recent-threads',
            label: 'Recent threads',
            items: [
              {
                kind: 'entity',
                entity: {
                  kind: 'track',
                  id: 'thread:abc',
                  label: 'Album planning',
                  meta: { kind: 'track', subtitle: 'Thread' },
                },
              },
            ],
          },
        ]}
        onAdditionalSelect={onAdditionalSelect}
      />
    );
    expect(screen.getByText('Recent threads')).toBeInTheDocument();
    const threadRow = screen
      .getAllByRole('option')
      .find(el => el.textContent?.includes('Album planning'));
    expect(threadRow).toBeDefined();
    fireEvent.mouseDown(threadRow!);
    expect(onAdditionalSelect).toHaveBeenCalledWith('thread:abc');
    // The additional path delegates to the caller; no router.push.
    expect(pushMock).not.toHaveBeenCalled();
  });
});
