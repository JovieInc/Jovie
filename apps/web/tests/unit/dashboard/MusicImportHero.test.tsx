import { describe, expect, it } from 'vitest';
import { MusicImportHero } from '@/features/dashboard/organisms/MusicImportHero';
import type { RecentRelease } from '@/lib/queries';
import { fastRender } from '@/tests/utils/fast-render';

const mockReleases: RecentRelease[] = [
  {
    id: '1',
    title: 'First Album',
    artworkUrl: 'https://example.com/art1.jpg',
    releaseDate: '2024-01-01',
    releaseType: 'album',
  },
  {
    id: '2',
    title: 'Hit Single',
    artworkUrl: 'https://example.com/art2.jpg',
    releaseDate: '2024-06-01',
    releaseType: 'single',
  },
];

describe('MusicImportHero', () => {
  it('renders importing state with loading indicator', () => {
    const { getByText } = fastRender(
      <MusicImportHero
        ingestionStatus='processing'
        releases={[]}
        isLoading={true}
      />
    );
    expect(getByText("We're importing your music")).toBeDefined();
  });

  it('renders idle state with releases and CTA', () => {
    const { getByText } = fastRender(
      <MusicImportHero
        ingestionStatus='idle'
        releases={mockReleases}
        isLoading={false}
      />
    );
    expect(getByText('2 releases ready')).toBeDefined();
    expect(getByText('Explore Your Releases')).toBeDefined();
    expect(getByText('First Album')).toBeDefined();
    expect(getByText('Hit Single')).toBeDefined();
  });

  it('renders nothing when idle with no releases', () => {
    const { container } = fastRender(
      <MusicImportHero ingestionStatus='idle' releases={[]} isLoading={false} />
    );
    // Component returns null — wrapper div exists but has no meaningful content
    const wrapper =
      container.querySelector('[data-testid="test-wrapper"]') ?? container;
    expect(wrapper.children.length).toBe(0);
  });

  it('renders error state when failed', () => {
    const { getByText } = fastRender(
      <MusicImportHero
        ingestionStatus='failed'
        releases={[]}
        isLoading={false}
      />
    );
    expect(getByText(/trouble importing your music/)).toBeDefined();
    expect(getByText('releases page')).toBeDefined();
  });
});
