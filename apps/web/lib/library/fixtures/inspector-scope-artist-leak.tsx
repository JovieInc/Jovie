import type { ScopedInspectorItem } from '@/lib/library/inspector-scope';

export const INSPECTOR_SCOPE_ARTIST_LEAK_TEST_ID =
  'inspector-scope-artist-leak-fixture';

/**
 * Deliberate-red artist Presence dump. Production Library track/release
 * inspectors must never render this shape.
 */
export const ARTIST_PRESENCE_LEAK_RECOMMENDATIONS = [
  {
    scopeType: 'artist',
    scopeId: 'profile-1',
    category: 'presence',
    primitive: 'recommendation',
    blocksSelectedObject: false,
    status: 'open',
    title: 'Add a canonical Jovie link on Last.fm',
    platform: 'Last.fm',
  },
  {
    scopeType: 'artist',
    scopeId: 'profile-1',
    category: 'presence',
    primitive: 'recommendation',
    blocksSelectedObject: false,
    status: 'open',
    title: 'Add a canonical Jovie link on Genius',
    platform: 'Genius',
  },
  {
    scopeType: 'artist',
    scopeId: 'profile-1',
    category: 'presence',
    primitive: 'recommendation',
    blocksSelectedObject: false,
    status: 'open',
    title: 'Add a canonical Jovie link on MusicBrainz',
    platform: 'MusicBrainz',
  },
] as const satisfies readonly (ScopedInspectorItem & {
  readonly title: string;
  readonly platform: string;
})[];

export function InspectorScopeArtistLeakFixture() {
  return (
    <div
      data-testid={INSPECTOR_SCOPE_ARTIST_LEAK_TEST_ID}
      data-inspector-kind='track'
      data-deliberate-red=''
    >
      {ARTIST_PRESENCE_LEAK_RECOMMENDATIONS.map(item => (
        <p key={item.platform}>{item.title}</p>
      ))}
    </div>
  );
}
