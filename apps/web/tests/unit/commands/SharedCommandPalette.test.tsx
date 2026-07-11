/**
 * Tests for the cmd+k surface of SharedCommandPalette.
 *
 * Asserts surface filtering (cmdk includes nav + skills, chat-slash skips
 * nav), commit routing for nav and skill items, and recent-chat injection
 * via the additional-sections slot.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CmdKPalette } from '@/components/organisms/CmdKPalette';
import { APP_ROUTES } from '@/constants/routes';
import { commandsForSurface } from '@/lib/commands/registry';

const pushMock = vi.fn();
const CMD_LABEL = String.fromCodePoint(0x2318);

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
  DialogContent: ({
    children,
    className,
    testId,
  }: {
    children: ReactNode;
    className?: string;
    testId?: string;
  }) => (
    <div data-testid={testId ?? 'dialog-content'} className={className}>
      {children}
    </div>
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
    clear: vi.fn(),
  }),
}));

vi.mock('@/lib/queries/useChatCapabilitiesQuery', () => ({
  useChatCapabilitiesQuery: () => ({
    data: {
      tools: {
        albumArt: {
          availability: 'available',
          reason: null,
          reasonCode: null,
        },
      },
    },
    isLoading: false,
    isError: false,
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

  it('keeps Feedback available on both command surfaces', () => {
    for (const surface of ['chat-slash', 'cmdk'] as const) {
      expect(commandsForSurface(surface)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'skill',
            id: 'submitFeedback',
            label: 'Send feedback',
          }),
        ])
      );
    }
  });

  it('adds Calendar as a cmd+k-only nav route', () => {
    expect(commandsForSurface('cmdk')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'nav',
          id: 'go-calendar',
          label: 'Calendar',
          href: APP_ROUTES.CALENDAR,
        }),
      ])
    );
    expect(commandsForSurface('chat-slash')).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'nav',
          id: 'go-calendar',
        }),
      ])
    );
  });

  it('adds Chats as a cmd+k-only nav route', () => {
    expect(commandsForSurface('cmdk')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'nav',
          id: 'go-chats',
          label: 'Chats',
          href: APP_ROUTES.CHATS,
        }),
      ])
    );
    expect(commandsForSurface('chat-slash')).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'nav',
          id: 'go-chats',
        }),
      ])
    );
  });

  it('renders nav, skill, and release sections when open', () => {
    render(<CmdKPalette profileId='profile-1' open onOpenChange={vi.fn()} />);
    expect(screen.getByTestId('shared-command-palette')).toBeInTheDocument();
    // Section headings render as uppercased labels — entries with the same
    // text exist as nav-row labels, so target the heading by its style class.
    const sectionLabels = screen
      .getAllByText(/^(Go To|Skills|Releases|Artists)$/)
      .map(el => el.textContent);
    expect(sectionLabels).toContain('Go To');
    expect(sectionLabels).toContain('Skills');
    expect(sectionLabels).toContain('Releases');
    expect(screen.getByText('Midnight Run')).toBeInTheDocument();
  });

  it('opens as a full-viewport search surface (JOV-2982)', () => {
    render(<CmdKPalette profileId='profile-1' open onOpenChange={vi.fn()} />);
    const shell = screen.getByTestId('cmdk-full-page');
    expect(shell.className).toContain('h-dvh');
    expect(shell.className).toContain('w-full');
    expect(shell.className).toContain('max-w-none');
    expect(shell.className).not.toContain('sm:max-w-140');
    // Results region fills remaining height (not a fixed max-h card)
    const listbox = screen.getByRole('listbox', {
      name: 'Command Palette Results',
    });
    expect(listbox.className).toContain('flex-1');
    expect(listbox.className).not.toContain('max-h-105');
  });

  it('shows aligned numbered shortcuts for the first three visible rows', () => {
    render(<CmdKPalette profileId='profile-1' open onOpenChange={vi.fn()} />);
    const rows = screen.getAllByRole('option');

    expect(rows[0]).toHaveTextContent(`${CMD_LABEL}1`);
    expect(rows[1]).toHaveTextContent(`${CMD_LABEL}2`);
    expect(rows[2]).toHaveTextContent(`${CMD_LABEL}3`);
    expect(rows[3]).not.toHaveTextContent(`${CMD_LABEL}4`);
  });

  it.each([
    ['1', 0],
    ['2', 1],
    ['3', 2],
  ])('selects visible row %s with its numbered shortcut', (key, rowIndex) => {
    pushMock.mockClear();
    render(<CmdKPalette profileId='profile-1' open onOpenChange={vi.fn()} />);

    fireEvent.keyDown(globalThis, { key, metaKey: true });

    const rows = screen.getAllByRole('option');
    expect(rows[rowIndex]).toHaveAttribute('aria-selected', 'true');
    expect(pushMock).not.toHaveBeenCalled();
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
    expect(pushMock).toHaveBeenCalledWith('/app/releases');
  });

  it('uses the canonical audience route for the Audience nav item', () => {
    pushMock.mockClear();
    render(<CmdKPalette profileId='profile-1' open onOpenChange={vi.fn()} />);
    const audienceNav = screen
      .getAllByRole('option')
      .find(el => el.textContent?.includes('Understand your audience'));
    expect(audienceNav).toBeDefined();
    fireEvent.mouseDown(audienceNav!);
    expect(pushMock).toHaveBeenCalledWith('/app/audience');
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

  it('routes Feedback from cmd+k through the same skill handoff', () => {
    pushMock.mockClear();
    render(<CmdKPalette profileId='profile-1' open onOpenChange={vi.fn()} />);
    const feedbackRow = screen
      .getAllByRole('option')
      .find(el => el.textContent?.includes('Share feedback'));
    expect(feedbackRow).toBeDefined();
    fireEvent.mouseDown(feedbackRow!);
    expect(pushMock).toHaveBeenCalledWith('/app/chat?skill=submitFeedback');
  });

  it('routes a release entity commit to its tasks page', () => {
    pushMock.mockClear();
    render(<CmdKPalette profileId='profile-1' open onOpenChange={vi.fn()} />);
    const releaseRow = screen
      .getAllByRole('option')
      .find(el => el.textContent?.includes('Midnight Run'));
    expect(releaseRow).toBeDefined();
    fireEvent.mouseDown(releaseRow!);
    expect(pushMock).toHaveBeenCalledWith('/app/releases/rel-1/tasks');
  });

  it('renders additional sections (e.g. recent chats) and routes via callback', () => {
    pushMock.mockClear();
    const onAdditionalSelect = vi.fn();
    render(
      <CmdKPalette
        profileId='profile-1'
        open
        onOpenChange={vi.fn()}
        additionalSectionsAfter={[
          {
            id: 'recent-chats',
            label: 'Recent chats',
            items: [
              {
                kind: 'entity',
                entity: {
                  kind: 'track',
                  id: 'thread:abc',
                  label: 'Album planning',
                  meta: { kind: 'track', subtitle: 'Chat' },
                },
              },
            ],
          },
        ]}
        onAdditionalSelect={onAdditionalSelect}
      />
    );
    expect(screen.getByText('Recent chats')).toBeInTheDocument();
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
