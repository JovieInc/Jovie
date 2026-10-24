import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { Paperclip } from 'lucide-react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlbumArtCapability } from '@/lib/chat/album-art-capability';

import { SlashCommandMenu } from './SlashCommandMenu';

const { mockUseReleasesQuery, mockUseChatCapabilitiesQuery } = vi.hoisted(
  () => ({
    mockUseReleasesQuery: vi.fn(),
    mockUseChatCapabilitiesQuery: vi.fn(),
  })
);

vi.mock('@/lib/queries/useReleasesQuery', () => ({
  useReleasesQuery: mockUseReleasesQuery,
}));

vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => ({
    results: [],
    state: 'idle' as const,
    search: vi.fn(),
  }),
}));

vi.mock('@/lib/queries/useEventsQuery', () => ({
  useEventsQuery: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/lib/queries/useChatCapabilitiesQuery', () => ({
  useChatCapabilitiesQuery: mockUseChatCapabilitiesQuery,
}));

function withProviders(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  mockUseReleasesQuery.mockReturnValue({ data: [], isLoading: false });
  mockUseChatCapabilitiesQuery.mockReturnValue({
    data: null,
    isLoading: false,
    isError: false,
  });
});

describe('SlashCommandMenu attachment actions', () => {
  it('puts matching attachment actions first and commits them without a skill', () => {
    const onSelect = vi.fn();
    const onSelectSkill = vi.fn();

    render(
      withProviders(
        <SlashCommandMenu
          state={{ status: 'root', query: '', startIdx: 0, selectedIndex: 0 }}
          profileId='profile-test'
          onSelectSkill={onSelectSkill}
          onSelectEntity={vi.fn()}
          onSetSelected={vi.fn()}
          onMoveSelected={vi.fn()}
          onClose={vi.fn()}
          attachmentActions={[
            {
              kind: 'action',
              action: {
                id: 'attach-files',
                label: 'Attach Files',
                description: 'Drop or browse',
                icon: Paperclip,
                onSelect,
              },
            },
          ]}
        />
      )
    );

    expect(screen.getAllByRole('option')[0]).toHaveTextContent('Attach Files');
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelectSkill).not.toHaveBeenCalled();
  });

  it('focuses the plus-mode filter field for the shared command palette', () => {
    render(
      withProviders(
        <SlashCommandMenu
          state={{ status: 'root', query: '', startIdx: 0, selectedIndex: 0 }}
          profileId='profile-test'
          onSelectSkill={vi.fn()}
          onSelectEntity={vi.fn()}
          onSetSelected={vi.fn()}
          onMoveSelected={vi.fn()}
          onClose={vi.fn()}
          onQueryChange={vi.fn()}
        />
      )
    );

    expect(
      screen.getByLabelText('Filter Commands And References')
    ).toHaveFocus();
  });

  it('drops the retired Disc3 release-kind glyph (banned icon guard, Tim, 2026-09-25)', () => {
    const source = readFileSync(
      resolve(__dirname, './SlashCommandMenu.tsx'),
      'utf8'
    );

    expect(source).not.toContain('Disc3');
    expect(source).toContain('release: Layers,');
  });

  it('moves selection when Firefox reports keyCode 229 for ArrowDown', () => {
    const onMoveSelected = vi.fn();
    render(
      withProviders(
        <SlashCommandMenu
          state={{ status: 'root', query: '', startIdx: 0, selectedIndex: 0 }}
          profileId='profile-test'
          onSelectSkill={vi.fn()}
          onSelectEntity={vi.fn()}
          onSetSelected={vi.fn()}
          onMoveSelected={onMoveSelected}
          onClose={vi.fn()}
          onQueryChange={vi.fn()}
        />
      )
    );

    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        keyCode: 229,
        bubbles: true,
        cancelable: true,
      })
    );

    expect(onMoveSelected).toHaveBeenCalledWith(1, expect.any(Number));
  });
});

function renderAlbumArtMenu(profileId = 'profile-test') {
  const onSelectSkill = vi.fn();
  const onSelectPrompt = vi.fn();
  render(
    withProviders(
      <SlashCommandMenu
        state={{
          status: 'root',
          query: 'album art',
          startIdx: 0,
          selectedIndex: 0,
        }}
        profileId={profileId}
        onSelectSkill={onSelectSkill}
        onSelectEntity={vi.fn()}
        onSetSelected={vi.fn()}
        onMoveSelected={vi.fn()}
        onClose={vi.fn()}
        promptActions={[
          { label: 'Generate Album Art', prompt: 'Generate album art' },
        ]}
        onSelectPrompt={onSelectPrompt}
      />
    )
  );
  return { onSelectSkill, onSelectPrompt };
}

const availableAlbumArt: AlbumArtCapability = {
  availability: 'available',
  reason: null,
  reasonCode: null,
};
const unavailableAlbumArt: AlbumArtCapability = {
  availability: 'unavailable',
  reason: 'Album art generation is temporarily unavailable.',
  reasonCode: 'PROVIDER_UNAVAILABLE',
};

describe('SlashCommandMenu album-art availability', () => {
  it.each([
    { catalog: 'empty', releases: [], capability: availableAlbumArt },
    { catalog: 'empty', releases: [], capability: unavailableAlbumArt },
    {
      catalog: 'populated',
      releases: [{ id: 'release-1', title: 'First Release' }],
      capability: availableAlbumArt,
    },
    {
      catalog: 'populated',
      releases: [{ id: 'release-1', title: 'First Release' }],
      capability: unavailableAlbumArt,
    },
  ])(
    'keeps the signed-in skill selectable with a $catalog catalog and $capability.availability provider',
    ({ releases, capability }) => {
      mockUseReleasesQuery.mockReturnValue({
        data: releases,
        isLoading: false,
      });
      mockUseChatCapabilitiesQuery.mockReturnValue({
        data: { tools: { albumArt: capability } },
        isLoading: false,
        isError: false,
      });
      const { onSelectSkill, onSelectPrompt } = renderAlbumArtMenu();

      const options = screen.getAllByRole('option', {
        name: /generate album art/i,
      });
      // The suggestion is hidden when the provider is down, but the skill remains.
      expect(options).toHaveLength(
        capability.availability === 'available' ? 2 : 1
      );
      fireEvent.mouseDown(options.at(-1)!);
      expect(onSelectSkill).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ id: 'generateAlbumArt' })
      );
      expect(onSelectPrompt).not.toHaveBeenCalled();
    }
  );

  it('hides the release-dependent skill for anonymous users without releases', () => {
    const { onSelectSkill, onSelectPrompt } = renderAlbumArtMenu('');

    // Anonymous prompt suggestions remain independent of release-dependent skills.
    const options = screen.getAllByRole('option', {
      name: /generate album art/i,
    });
    expect(options).toHaveLength(1);
    fireEvent.mouseDown(options[0]);
    expect(onSelectSkill).not.toHaveBeenCalled();
    expect(onSelectPrompt).toHaveBeenCalledExactlyOnceWith(
      'Generate album art'
    );
  });

  it('keeps the skill for anonymous users with release context', () => {
    mockUseReleasesQuery.mockReturnValue({
      data: [{ id: 'release-1', title: 'First Release' }],
      isLoading: false,
    });
    const { onSelectSkill } = renderAlbumArtMenu('');

    const options = screen.getAllByRole('option', {
      name: /generate album art/i,
    });
    fireEvent.mouseDown(options.at(-1)!);
    expect(onSelectSkill).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: 'generateAlbumArt' })
    );
  });
});

describe('SlashCommandMenu combobox wiring (JOV-8873)', () => {
  it('wires aria-controls and activedescendant without an explicit listId', () => {
    render(
      withProviders(
        <SlashCommandMenu
          state={{ status: 'root', query: '', startIdx: 0, selectedIndex: 0 }}
          profileId='profile-test'
          onSelectSkill={vi.fn()}
          onSelectEntity={vi.fn()}
          onSetSelected={vi.fn()}
          onMoveSelected={vi.fn()}
          onClose={vi.fn()}
          onQueryChange={vi.fn()}
          attachmentActions={[
            {
              kind: 'action',
              action: {
                id: 'attach-files',
                label: 'Attach Files',
                description: 'Drop or browse',
                icon: Paperclip,
                onSelect: vi.fn(),
              },
            },
          ]}
        />
      )
    );

    const combobox = screen.getByRole('combobox', {
      name: 'Filter Commands And References',
    });
    const listId = combobox.getAttribute('aria-controls');
    expect(listId).toBeTruthy();
    expect(document.getElementById(listId as string)).not.toBeNull();
    expect(combobox).toHaveAttribute('aria-activedescendant', `${listId}-row-0`);
  });
});
