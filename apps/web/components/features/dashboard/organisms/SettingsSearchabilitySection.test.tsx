import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { Artist } from '@/types/db';
import { SettingsSearchabilitySection } from './SettingsSearchabilitySection';

const { save } = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('@/lib/queries/useSettingsMutation', () => ({
  useUpdateSettingsMutation: () => ({ mutateAsync: save }),
}));

const artist = (searchable?: boolean): Artist =>
  ({
    id: 'profile-a',
    owner_user_id: 'owner',
    handle: 'profile-a',
    name: 'Artist',
    spotify_id: '',
    published: true,
    settings: searchable === undefined ? {} : { searchable },
  }) as Artist;

const control = () =>
  screen.getByRole('switch', { name: 'Show in Jovie discovery' });

beforeEach(() => {
  save.mockReset();
});

describe('SettingsSearchabilitySection certificate', () => {
  it('saves the new choice and reports it to the parent', async () => {
    const user = userEvent.setup();
    save.mockResolvedValue({});
    const onArtistUpdate = vi.fn();
    const { container } = render(
      <SettingsSearchabilitySection
        artist={artist(true)}
        onArtistUpdate={onArtistUpdate}
      />
    );

    expect(control()).toBeChecked();
    await user.click(control());

    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(save).toHaveBeenCalledWith({
      updates: { settings: { searchable: false } },
    });
    expect(onArtistUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ settings: { searchable: false } })
    );
    await expectNoA11yViolations(container);
  });

  it('shows Saving while the request is pending', async () => {
    const user = userEvent.setup();
    save.mockReturnValue(new Promise(() => {}));
    const { container } = render(
      <SettingsSearchabilitySection artist={artist(false)} />
    );

    await user.click(control());
    expect(await screen.findByText('Saving…')).toBeInTheDocument();
    expect(control()).toHaveAttribute('aria-busy', 'true');
    await expectNoA11yViolations(container);
  });

  it('reverts and explains a failed save', async () => {
    const user = userEvent.setup();
    save.mockRejectedValue(new Error('offline'));
    const onArtistUpdate = vi.fn();
    const { container } = render(
      <SettingsSearchabilitySection
        artist={artist(true)}
        onArtistUpdate={onArtistUpdate}
      />
    );

    await user.click(control());
    expect(
      await screen.findByText('Could not save discovery preference. Try again.')
    ).toBeInTheDocument();
    await waitFor(() => expect(control()).toBeChecked());
    expect(onArtistUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ settings: { searchable: true } })
    );
    await expectNoA11yViolations(container);
  });

  it('renders inside an RTL document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <SettingsSearchabilitySection artist={artist(false)} />
      </div>
    );
    expect(control()).not.toBeChecked();
    await expectNoA11yViolations(container);
  });
});
