import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type CatalogBrowserCluster,
  type CatalogBrowserRow,
  CatalogTaskBuilderDialog,
} from '@/components/features/dashboard/release-tasks/CatalogTaskBuilderDialog';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

const CLUSTERS: CatalogBrowserCluster[] = [
  { id: 1, slug: 'editorial-pitching', displayName: 'Editorial Pitching' },
  { id: 2, slug: 'dj-promotion', displayName: 'DJ Promotion' },
];

const CATALOG: CatalogBrowserRow[] = [
  {
    slug: 'spotify-editorial-pitch',
    name: 'Pitch Spotify editorial',
    shortDescription: 'Submit via Spotify for Artists.',
    clusterId: 1,
    category: 'editorial',
  },
  {
    slug: 'amazon-editorial-pitch',
    name: 'Pitch Amazon Music editorial',
    shortDescription: 'Submit via Amazon Music for Artists.',
    clusterId: 1,
    category: 'editorial',
  },
  {
    slug: 'dj-promo-pool-bpm-supreme',
    name: 'DJ promo pool submission',
    shortDescription: 'BPM Supreme / DJcity.',
    clusterId: 2,
    category: 'dj',
  },
];

const base = {
  open: true,
  releaseId: 'rel-1',
  catalog: CATALOG,
  clusters: CLUSTERS,
  alreadyAddedSlugs: [] as string[],
  onClose: vi.fn(),
};

describe('CatalogTaskBuilderDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders catalog rows grouped by cluster', () => {
    render(<CatalogTaskBuilderDialog {...base} addAction={vi.fn()} />);
    expect(screen.getByText('Editorial Pitching')).toBeInTheDocument();
    expect(screen.getByText('DJ Promotion')).toBeInTheDocument();
    expect(
      screen.getByTestId('catalog-row-spotify-editorial-pitch')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('catalog-row-dj-promo-pool-bpm-supreme')
    ).toBeInTheDocument();
  });

  it('renders an accessible search control with canonical field and keyboard-focus styling', () => {
    render(<CatalogTaskBuilderDialog {...base} addAction={vi.fn()} />);

    const search = screen.getByRole('searchbox', { name: 'Search Tasks' });
    expect(search).toBe(screen.getByTestId('catalog-search'));
    expect(search).toHaveAttribute('placeholder', 'Search tasks');
    expect(search).toHaveValue('');
    expect(search).toHaveClass(
      'border-subtle',
      'bg-surface-1',
      'focus-visible:ring-2'
    );
  });

  it.each([
    ['a case-insensitive name', 'aMaZoN'],
    ['a description', 'Amazon Music for Artists'],
  ])('search filters rows by %s', (_field, query) => {
    render(<CatalogTaskBuilderDialog {...base} addAction={vi.fn()} />);
    fireEvent.change(screen.getByTestId('catalog-search'), {
      target: { value: query },
    });
    expect(
      screen.getByTestId('catalog-row-amazon-editorial-pitch')
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('catalog-row-spotify-editorial-pitch')
    ).toBeNull();
    expect(
      screen.queryByTestId('catalog-row-dj-promo-pool-bpm-supreme')
    ).toBeNull();
  });

  it('keeps the search control and focus through filtering, empty results, and clearing', async () => {
    const user = userEvent.setup();
    render(<CatalogTaskBuilderDialog {...base} addAction={vi.fn()} />);
    const search = screen.getByRole('searchbox', { name: 'Search Tasks' });

    await user.click(search);
    await user.type(search, 'DJcity');
    expect(search).toHaveValue('DJcity');
    expect(search).toHaveFocus();
    expect(screen.getAllByTestId(/^catalog-row-/)).toHaveLength(1);
    expect(
      screen.getByTestId('catalog-row-dj-promo-pool-bpm-supreme')
    ).toBeInTheDocument();

    await user.type(search, 'missing');
    expect(search).toHaveValue('DJcitymissing');
    expect(search).toHaveFocus();
    expect(screen.queryAllByTestId(/^catalog-row-/)).toHaveLength(0);
    expect(
      screen.getByText('No catalog tasks match that search.')
    ).toBeInTheDocument();

    await user.clear(search);
    expect(screen.getByRole('searchbox', { name: 'Search Tasks' })).toBe(
      search
    );
    expect(search).toHaveValue('');
    expect(search).toHaveFocus();
    expect(screen.getAllByTestId(/^catalog-row-/)).toHaveLength(CATALOG.length);
    expect(
      screen.queryByText('No catalog tasks match that search.')
    ).toBeNull();
  });

  it('adds a filtered task while preserving the query and other matches', async () => {
    const user = userEvent.setup();
    const addAction = vi.fn().mockResolvedValue(undefined);
    render(<CatalogTaskBuilderDialog {...base} addAction={addAction} />);
    const search = screen.getByRole('searchbox', { name: 'Search Tasks' });

    await user.type(search, 'editorial');
    await user.click(screen.getByTestId('catalog-add-amazon-editorial-pitch'));

    expect(addAction).toHaveBeenCalledExactlyOnceWith(
      'rel-1',
      'amazon-editorial-pitch'
    );
    await waitFor(() => {
      expect(
        screen.getByTestId('catalog-add-amazon-editorial-pitch')
      ).toBeDisabled();
    });
    expect(
      screen.getByTestId('catalog-add-amazon-editorial-pitch')
    ).toHaveTextContent('Added');
    expect(search).toHaveValue('editorial');
    expect(screen.getAllByTestId(/^catalog-row-/)).toHaveLength(2);
    expect(
      screen.getByTestId('catalog-add-spotify-editorial-pitch')
    ).toBeEnabled();
  });

  it('Add button calls the add action with the correct slug', async () => {
    const addAction = vi.fn().mockResolvedValue(undefined);
    render(<CatalogTaskBuilderDialog {...base} addAction={addAction} />);
    fireEvent.click(screen.getByTestId('catalog-add-spotify-editorial-pitch'));
    await waitFor(() => {
      expect(addAction).toHaveBeenCalledWith(
        'rel-1',
        'spotify-editorial-pitch'
      );
    });
  });

  it('already-added slugs render as disabled "Added"', () => {
    render(
      <CatalogTaskBuilderDialog
        {...base}
        alreadyAddedSlugs={['spotify-editorial-pitch']}
        addAction={vi.fn()}
      />
    );
    const btn = screen.getByTestId('catalog-add-spotify-editorial-pitch');
    expect(btn).toBeDisabled();
    expect(btn.textContent).toMatch(/added/i);
  });

  it('shows empty state when search has no matches', () => {
    render(<CatalogTaskBuilderDialog {...base} addAction={vi.fn()} />);
    fireEvent.change(screen.getByTestId('catalog-search'), {
      target: { value: 'xyznomatch' },
    });
    expect(screen.getByText(/No catalog tasks match/i)).toBeInTheDocument();
  });
});
