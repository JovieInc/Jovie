import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PreviewPanelLink } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ProfileLinkList } from './ProfileLinkList';

describe('profile link empty-state guidance', () => {
  it.each(['social', 'dsp', 'earnings', 'custom'] as const)(
    'does not advertise an add action in a read-only %s category',
    selectedCategory => {
      render(
        <ProfileLinkList links={[]} selectedCategory={selectedCategory} />
      );
      expect(screen.getByText(/links yet\./)).toBeVisible();
      expect(screen.queryByText(/Click \+ to add/)).toBeNull();
    }
  );

  it('keeps add guidance when the parent supplies an add action', () => {
    render(
      <ProfileLinkList
        links={[]}
        selectedCategory='earnings'
        onAddLink={vi.fn()}
      />
    );
    expect(
      screen.getByText('No earnings links yet. Click + to add one.')
    ).toBeVisible();
  });

  it('does not advertise adding a disconnected music provider in a read-only list', () => {
    render(
      <ProfileLinkList
        links={[]}
        selectedCategory='dsp'
        dspConnections={{
          spotify: { connected: false, artistName: null },
          appleMusic: { connected: false, artistName: null },
        }}
      />
    );
    expect(screen.getByText('No music links yet.')).toBeVisible();
  });
});

const instagram: PreviewPanelLink = {
  id: 'ig',
  title: 'Instagram',
  url: 'https://instagram.com/artist',
  platform: 'instagram',
  category: 'social',
  isVisible: true,
};

describe('ProfileLinkList states', () => {
  it('shows a malformed stored URL as raw text', async () => {
    const url = 'artist dot example slash home';
    const { container } = render(
      <ProfileLinkList
        links={[
          {
            id: 'bad',
            title: 'Website',
            url,
            platform: 'website',
            category: 'other',
            isVisible: true,
          },
        ]}
        selectedCategory='custom'
      />
    );
    expect(screen.getAllByText(url).length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });

  it('names a connected provider without an artist name and disconnects it', async () => {
    const onDisconnectDsp = vi.fn();
    const { container } = render(
      <ProfileLinkList
        links={[]}
        selectedCategory='dsp'
        dspConnections={{
          spotify: { connected: true, artistName: null },
          appleMusic: { connected: false, artistName: null },
        }}
        onDisconnectDsp={onDisconnectDsp}
      />
    );
    expect(screen.getAllByText('Spotify').length).toBeGreaterThan(0);
    expect(screen.queryByText('Apple Music')).toBeNull();
    await expectNoA11yViolations(container);

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Actions for Spotify' })
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    expect(onDisconnectDsp).toHaveBeenCalledWith('spotify');
  });

  it('groups many long links and removes the chosen one', async () => {
    const onRemoveLink = vi.fn();
    const handle = 'the_extremely_long_artist_handle_for_a_collective';
    const { container } = render(
      <ProfileLinkList
        links={[
          { ...instagram, url: `https://instagram.com/${handle}` },
          {
            id: 'site',
            title: 'Site',
            url: 'https://www.the-extremely-long-artist-name.example.com',
            platform: 'website',
            category: 'other',
            isVisible: true,
          },
        ]}
        selectedCategory='all'
        onRemoveLink={onRemoveLink}
      />
    );
    expect(screen.getByText('Social links')).toBeInTheDocument();
    expect(screen.getByText('Web links')).toBeInTheDocument();
    await expectNoA11yViolations(container);

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: `Actions for @${handle}` })
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    expect(onRemoveLink).toHaveBeenCalledWith('ig');
  });

  it('renders right-to-left links accessibly', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ProfileLinkList links={[instagram]} selectedCategory='all' />
      </div>
    );
    expect(screen.getAllByText('@artist').length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });
});
