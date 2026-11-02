import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AgentClaimPreview } from '@/lib/agent-acquisition/draft-claim.server';
import { AgentClaimScreen } from './AgentClaimScreen';

const draftId = '9efebd98-39b7-4a77-8965-04b5aafad9ad';
const handoff = 'Besf6yDvKw9YeXFyVLdKhGRgi-LjGGtu_CCLOElEqPI';
const preview: AgentClaimPreview = {
  artistName: 'Signal Artist',
  provider: 'spotify',
  sourceUrl: 'https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb',
  imageUrl: null,
  bio: null,
  release: {
    title: 'Signal Fire',
    artistName: 'Signal Artist',
    releaseDate: '2026-11-07',
    artworkUrl: null,
    links: { spotify: 'https://open.spotify.com/album/0sNOF9WDwhWunNAHPD3Baj' },
  },
  expiresAt: '2026-11-04T12:00:00.000Z',
  digest: 'Wn0aWl0n7d5j2C3TzMvCw2yYk0b2k2n2tQ8o3m3e8xQ',
};

const render = (props: Partial<Parameters<typeof AgentClaimScreen>[0]> = {}) =>
  renderToStaticMarkup(
    <AgentClaimScreen
      draftId={draftId}
      handoff={handoff}
      view={{ state: 'ready', preview }}
      signedIn
      error={null}
      claimAction={async () => {}}
      {...props}
    />
  );

describe('AgentClaimScreen', () => {
  it('shows the preview and a claim form carrying the reviewed digest', () => {
    const html = render();
    expect(html).toContain('Signal Artist');
    expect(html).toContain('Signal Fire (2026-11-07)');
    expect(html).toContain(
      'https://open.spotify.com/album/0sNOF9WDwhWunNAHPD3Baj'
    );
    expect(html).toContain('2026-11-04');
    expect(html).toContain('Claim This Draft');
    expect(html).toContain(`value="${preview.digest}"`);
    expect(html).toContain(`value="${draftId}"`);
  });

  it('sends signed-out visitors to auth with a return path', () => {
    const html = render({ signedIn: false });
    expect(html).toContain('Sign Up To Claim');
    expect(html).toContain('redirect_url=');
    expect(html).not.toContain('Claim This Draft');
  });

  it('renders release and artist artwork with the right alt text', () => {
    const withRelease = render({
      view: {
        state: 'ready',
        preview: {
          ...preview,
          release: {
            ...preview.release!,
            artworkUrl: 'https://i.scdn.co/image/abc',
          },
        },
      },
    });
    expect(withRelease).toContain('Artwork for Signal Fire');
    const withArtist = render({
      view: {
        state: 'ready',
        preview: {
          ...preview,
          release: null,
          imageUrl: 'https://i.scdn.co/image/def',
        },
      },
    });
    expect(withArtist).toContain('alt="Signal Artist"');
  });

  it('shows an error card above the preview', () => {
    const html = render({ error: 'draft_changed' });
    expect(html).toContain('agent-claim-state');
    expect(html).toContain('agent-claim-page');
  });

  it.each(['invalid', 'expired'] as const)('renders the %s state', state => {
    const html = render({ view: { state } });
    expect(html).toContain('agent-claim-state');
    expect(html).toContain('Create Your Profile');
  });

  it('distinguishes a claim owned by the viewer', () => {
    const owned = render({
      view: {
        state: 'claimed',
        ownedByViewer: true,
        handle: 'signal',
      } as never,
    });
    expect(owned).toContain('This Profile Is Yours');
    expect(owned).toContain('@signal');
    const other = render({
      view: { state: 'claimed', ownedByViewer: false, handle: null } as never,
    });
    expect(other).not.toContain('This Profile Is Yours');
  });
});
