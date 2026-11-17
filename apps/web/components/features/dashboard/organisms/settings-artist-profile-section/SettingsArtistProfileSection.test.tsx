import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { Artist } from '@/types/db';

interface SectionProps {
  readonly artist: Artist;
  readonly onArtistUpdate?: (updatedArtist: Artist) => void;
  readonly onRefresh: () => void;
}

const sectionProps = vi.hoisted(() => ({ last: null as unknown }));

vi.mock('@/features/dashboard/organisms/settings-profile-section', () => ({
  SettingsProfileSection: (props: SectionProps) => {
    sectionProps.last = props;
    return (
      <section aria-label='Profile settings'>
        <p>{props.artist.name}</p>
        {props.onArtistUpdate ? (
          <button
            type='button'
            onClick={() =>
              props.onArtistUpdate?.({ ...props.artist, name: 'Renamed' })
            }
          >
            Save
          </button>
        ) : null}
        <button type='button' onClick={props.onRefresh}>
          Refresh
        </button>
      </section>
    );
  },
}));

import { SettingsArtistProfileSection } from './SettingsArtistProfileSection';

const artist = {
  id: 'artist-1',
  handle: 'sashawaves',
  name: 'Sasha Waves',
} as unknown as Artist;

describe('SettingsArtistProfileSection', () => {
  it('forwards the artist and both callbacks to the profile section', async () => {
    const user = userEvent.setup();
    const onArtistUpdate = vi.fn();
    const onRefresh = vi.fn();
    const { container } = render(
      <SettingsArtistProfileSection
        artist={artist}
        onArtistUpdate={onArtistUpdate}
        onRefresh={onRefresh}
      />
    );

    expect(sectionProps.last).toEqual({ artist, onArtistUpdate, onRefresh });
    expect(
      screen.getByRole('region', { name: 'Profile settings' })
    ).toHaveTextContent('Sasha Waves');
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onArtistUpdate).toHaveBeenCalledWith({ ...artist, name: 'Renamed' });
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('leaves the update callback undefined when the caller omits it', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const { container } = render(
      <SettingsArtistProfileSection artist={artist} onRefresh={onRefresh} />
    );

    expect(sectionProps.last).toEqual({
      artist,
      onArtistUpdate: undefined,
      onRefresh,
    });
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
