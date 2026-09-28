import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { Paperclip } from 'lucide-react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SlashCommandMenu } from './SlashCommandMenu';

vi.mock('@/lib/queries/useReleasesQuery', () => ({
  useReleasesQuery: () => ({ data: [], isLoading: false }),
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
  useChatCapabilitiesQuery: () => ({ data: null, isLoading: false }),
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
});
