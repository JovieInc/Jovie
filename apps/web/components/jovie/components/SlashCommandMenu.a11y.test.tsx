import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Paperclip } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SlashCommandMenu } from './SlashCommandMenu';

const { mockUseReleasesQuery } = vi.hoisted(() => ({
  mockUseReleasesQuery: vi.fn(),
}));

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
  useChatCapabilitiesQuery: () => ({
    data: null,
    isLoading: false,
    isError: false,
  }),
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

function FilterablePalette({
  onClose = vi.fn(),
}: {
  readonly onClose?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [tick, setTick] = useState(0);
  return (
    <div data-tick={tick}>
      <SlashCommandMenu
        state={{ status: 'root', query, startIdx: 0, selectedIndex: 0 }}
        profileId='profile-test'
        onSelectSkill={vi.fn()}
        onSelectEntity={vi.fn()}
        onSetSelected={vi.fn()}
        onMoveSelected={vi.fn()}
        onClose={onClose}
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
        onQueryChange={value => {
          setQuery(value);
          setTick(tick + 1);
        }}
      />
    </div>
  );
}

beforeEach(() => {
  mockUseReleasesQuery.mockReturnValue({ data: [], isLoading: false });
});

describe('SlashCommandMenu filter field', () => {
  it('is a labelled combobox wired to the list it filters', () => {
    render(withProviders(<FilterablePalette />));

    const filter = screen.getByRole('combobox', {
      name: 'Filter Commands And References',
    });
    expect(filter).toHaveAttribute('aria-expanded', 'true');
    expect(filter).toHaveAttribute('aria-autocomplete', 'list');
    const listId = filter.getAttribute('aria-controls');
    expect(listId).toBeTruthy();
    expect(filter.getAttribute('aria-activedescendant')).toBe(
      `${listId}-row-0`
    );
  });

  it('keeps the typed filter and focus across parent re-renders', async () => {
    const user = userEvent.setup();
    render(withProviders(<FilterablePalette />));

    const filter = screen.getByRole('combobox', {
      name: 'Filter Commands And References',
    });
    await user.type(filter, 'attach');

    expect(filter).toHaveValue('attach');
    expect(filter).toHaveFocus();
    expect(screen.getByText('Attach Files')).toBeInTheDocument();
  });

  it('closes on Escape without clearing what was typed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(withProviders(<FilterablePalette onClose={onClose} />));

    const filter = screen.getByRole('combobox', {
      name: 'Filter Commands And References',
    });
    await user.type(filter, 'zzzz');
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(filter).toHaveValue('zzzz');
    expect(screen.getByText('No matches')).toBeInTheDocument();
  });

  it('has no accessibility violations with rows and with no matches', async () => {
    const user = userEvent.setup();
    const { container } = render(withProviders(<FilterablePalette />));
    await expectNoA11yViolations(container);

    await user.type(
      screen.getByRole('combobox', { name: 'Filter Commands And References' }),
      'zzzz'
    );
    await expectNoA11yViolations(container);
  });
});
