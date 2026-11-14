import { render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { createReleaseProvider } from './release-provider';

interface StoryRelease {
  readonly id: string;
  readonly title: string;
  readonly artworkUrl?: string | null;
  readonly artistNames?: readonly string[];
  readonly releaseDate?: string;
  readonly releaseType?: string;
  readonly totalTracks?: number;
}

const releasesState: {
  data: StoryRelease[] | undefined;
  isLoading: boolean;
} = { data: undefined, isLoading: false };
const useReleasesQuery = vi.fn((_profileId: string) => releasesState);

vi.mock('@/lib/queries/useReleasesQuery', () => ({
  useReleasesQuery: (profileId: string) => useReleasesQuery(profileId),
}));

const catalog: StoryRelease[] = [
  {
    id: 'rel_1',
    title: 'Midnight Drive',
    artistNames: ['Example Artist'],
    releaseDate: '2026-11-14T12:00:00Z',
    releaseType: 'single',
    totalTracks: 1,
  },
  {
    id: 'rel_2',
    title: 'Daylight',
    artistNames: ['Guest Singer'],
    releaseDate: '2026-08-01T12:00:00Z',
    releaseType: 'ep',
    artworkUrl: '/daylight.png',
  },
  {
    id: 'rel_3',
    title: 'Long Player',
    artistNames: ['Example Artist'],
    releaseType: 'album',
  },
];

const provider = createReleaseProvider('profile-1');

function ReleaseSearchDemo() {
  const [query, setQuery] = useState('');
  const { items, isLoading } = provider.useSearch(query);
  return (
    <div>
      <label>
        Search releases
        <input value={query} onChange={event => setQuery(event.target.value)} />
      </label>
      <output aria-busy={isLoading}>
        {isLoading ? 'Loading releases' : `${items.length} releases`}
      </output>
      <ul>
        {items.map(item => (
          <li key={item.id}>
            {provider.renderChip(item)} {item.meta?.subtitle}
          </li>
        ))}
      </ul>
    </div>
  );
}

describe('createReleaseProvider', () => {
  beforeEach(() => {
    releasesState.data = catalog;
    releasesState.isLoading = false;
    useReleasesQuery.mockClear();
  });

  it('scopes the provider and its query to the profile', () => {
    expect(provider.registryKey).toBe('release:profile-1');
    renderHook(() => provider.useSearch(''));
    expect(useReleasesQuery).toHaveBeenCalledWith('profile-1');
  });

  it('filters the catalog by title or artist as the user types', async () => {
    const user = userEvent.setup();
    const { container } = render(<ReleaseSearchDemo />);
    const input = screen.getByLabelText('Search releases');

    expect(screen.getByRole('status')).toHaveTextContent('3 releases');

    await user.type(input, 'MIDNIGHT');
    expect(screen.getByRole('status')).toHaveTextContent('1 releases');
    expect(screen.getByTestId('entity-chip')).toHaveAttribute(
      'data-entity-label',
      'Midnight Drive'
    );

    await user.clear(input);
    await user.type(input, 'guest');
    expect(screen.getByTestId('entity-chip')).toHaveAttribute(
      'data-entity-label',
      'Daylight'
    );
    await expectNoA11yViolations(container);
  });

  it('shows nothing when no release matches', async () => {
    const user = userEvent.setup();
    const { container } = render(<ReleaseSearchDemo />);
    await user.type(screen.getByLabelText('Search releases'), 'zzqx');
    expect(screen.getByRole('status')).toHaveTextContent('0 releases');
    await expectNoA11yViolations(container);
  });

  it('builds subtitles from type and date, falling back for missing data', () => {
    releasesState.data = [
      ...catalog,
      { id: 'rel_4', title: 'Untitled Demo' },
      {
        id: 'rel_5',
        title: 'Odd Format',
        releaseType: 'compilation',
        releaseDate: 'not-a-date',
      },
    ];
    const { result } = renderHook(() => provider.useSearch(''));
    const subtitles = result.current.items.map(item => item.meta?.subtitle);

    expect(subtitles).toEqual([
      'Single · Nov 14',
      'EP · Aug 1',
      'Album',
      'Release',
      'compilation',
    ]);
    expect(result.current.items[1]?.thumbnail).toBe('/daylight.png');
    expect(result.current.items[0]?.thumbnail).toBeUndefined();
  });

  it('returns at most eight releases', () => {
    releasesState.data = Array.from({ length: 12 }, (_, index) => ({
      id: `rel_many_${index + 1}`,
      title: `Release ${index + 1}`,
    }));
    const { result } = renderHook(() => provider.useSearch('release'));
    expect(result.current.items).toHaveLength(8);
  });

  it('reports loading before the catalog arrives', async () => {
    releasesState.data = undefined;
    releasesState.isLoading = true;
    const { container } = render(<ReleaseSearchDemo />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading releases');
    await expectNoA11yViolations(container);
  });

  it('returns no releases when the catalog failed to load offline', async () => {
    releasesState.data = undefined;
    const { container } = render(<ReleaseSearchDemo />);
    expect(screen.getByRole('status')).toHaveTextContent('0 releases');
    await expectNoA11yViolations(container);
  });

  it('renders long and right-to-left titles as input chips', async () => {
    releasesState.data = [
      {
        id: 'rel_long',
        title:
          'Midnight Drive (Extended Deluxe Anniversary Edition With Acoustic Sessions and Remixes)',
      },
      { id: 'rel_rtl', title: 'ليلة منتصف الطريق', releaseType: 'single' },
    ];
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ReleaseSearchDemo />
      </div>
    );
    const chips = screen.getAllByTestId('entity-chip');
    expect(chips).toHaveLength(2);
    expect(chips[1]).toHaveAttribute('data-entity-label', 'ليلة منتصف الطريق');
    await expectNoA11yViolations(container);
  });
});
