import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const mocks = vi.hoisted(() => ({
  refetch: vi.fn(),
  query: {} as Record<string, unknown>,
}));

vi.mock('@/lib/queries/useOvieListsQuery', () => ({
  useOvieSidebarListsQuery: () => mocks.query,
}));

import { OvieListsIndex } from './OvieListsIndex';

const LONG_NAME =
  'Collaborators for the spring remix package, second round, with every vocalist who replied after the label showcase';

describe('OvieListsIndex certificate states', () => {
  beforeEach(() => {
    mocks.refetch.mockReset();
    mocks.query = { data: undefined, isError: false, refetch: mocks.refetch };
  });

  it('announces a named busy region while the lists load', async () => {
    const { container } = render(<OvieListsIndex />);
    expect(
      screen.getByRole('status', { name: 'Loading Lists' })
    ).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('list')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('retries the request from the error state', async () => {
    const user = userEvent.setup();
    mocks.query.isError = true;
    const { container } = render(<OvieListsIndex />);

    expect(screen.getByText('Lists unavailable')).toBeInTheDocument();
    expect(screen.getByText('Your lists could not load.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('keeps showing loaded lists when a background refetch fails', () => {
    mocks.query.isError = true;
    mocks.query.data = {
      lists: [{ id: 'press', name: 'Press', count: 5, pendingSuggestions: 0 }],
      smartViews: [],
    };
    render(<OvieListsIndex />);
    expect(screen.queryByText('Lists unavailable')).toBeNull();
    expect(screen.getByRole('link', { name: /Press/ })).toBeInTheDocument();
  });

  it('explains the empty state without a list region', async () => {
    mocks.query.data = { lists: [], smartViews: [] };
    const { container } = render(<OvieListsIndex />);
    expect(screen.getByText('No lists yet')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('links lists then smart views, truncating long names on one line', async () => {
    mocks.query.data = {
      lists: [
        { id: 'long', name: LONG_NAME, count: 1280, pendingSuggestions: 245 },
        { id: 'press', name: 'Press', count: 5, pendingSuggestions: 0 },
      ],
      smartViews: [{ id: 'favorites', name: 'Favorites', count: 4 }],
    };
    const { container } = render(<OvieListsIndex />);

    const list = screen.getByRole('list', { name: 'Lists And Smart Views' });
    const links = within(list).getAllByRole('link');
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAttribute('href', expect.stringContaining('long'));
    expect(links[2]).toHaveAttribute(
      'href',
      expect.stringContaining('favorites')
    );
    expect(screen.getByText(LONG_NAME)).toHaveClass('truncate');
    expect(screen.getByText('1280 · 245 suggested')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('stays axe clean inside a right-to-left document', async () => {
    mocks.query.data = {
      lists: [
        {
          id: 'collab',
          name: 'قائمة التعاون',
          count: 12,
          pendingSuggestions: 3,
        },
      ],
      smartViews: [{ id: 'favorites', name: 'المفضلة', count: 4 }],
    };
    const { container } = render(
      <div dir='rtl'>
        <OvieListsIndex />
      </div>
    );
    expect(screen.getByRole('link', { name: /قائمة التعاون/ })).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
