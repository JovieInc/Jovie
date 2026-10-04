import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
