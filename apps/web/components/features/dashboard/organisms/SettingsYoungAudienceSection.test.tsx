import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { Artist } from '@/types/db';
import { SettingsYoungAudienceSection } from './SettingsYoungAudienceSection';

const { save } = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('@/lib/queries/useSettingsMutation', () => ({
  useUpdateSettingsMutation: () => ({ mutateAsync: save }),
}));

const artist = (youngAudience?: boolean): Artist =>
  ({
    id: 'profile-a',
    owner_user_id: 'owner',
    handle: 'profile-a',
    name: 'Artist',
    spotify_id: '',
    published: true,
    settings: youngAudience === undefined ? {} : { youngAudience },
  }) as Artist;

const control = () => screen.getByRole('switch', { name: 'Young audience' });

beforeEach(() => {
  save.mockReset();
});

describe('SettingsYoungAudienceSection', () => {
  it('saves the young-audience choice and reports it to the parent', async () => {
    const user = userEvent.setup();
    save.mockResolvedValue({});
    const onArtistUpdate = vi.fn();
    const { container } = render(
      <SettingsYoungAudienceSection
        artist={artist(false)}
        onArtistUpdate={onArtistUpdate}
      />
    );

    expect(control()).not.toBeChecked();
    await user.click(control());

    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(save).toHaveBeenCalledWith({
      updates: { settings: { youngAudience: true } },
    });
    expect(onArtistUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ settings: { youngAudience: true } })
    );
    await expectNoA11yViolations(container);
  });

  it('reverts and explains a failed save', async () => {
    const user = userEvent.setup();
    save.mockRejectedValue(new Error('offline'));
    const onArtistUpdate = vi.fn();
    render(
      <SettingsYoungAudienceSection
        artist={artist(true)}
        onArtistUpdate={onArtistUpdate}
      />
    );

    await user.click(control());
    expect(
      await screen.findByText(
        'Could not save young-audience preference. Try again.'
      )
    ).toBeInTheDocument();
    await waitFor(() => expect(control()).toBeChecked());
    expect(onArtistUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ settings: { youngAudience: true } })
    );
  });
});
