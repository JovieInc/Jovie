import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Artist } from '@/types/db';
import { SettingsYoungAudienceSection } from './SettingsYoungAudienceSection';

const { save, refresh, options } = vi.hoisted(() => ({
  save: vi.fn(),
  refresh: vi.fn(),
  options: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/lib/queries/useSettingsMutation', () => ({
  useUpdateSettingsMutation: (input: unknown) => {
    options(input);
    return { mutateAsync: save };
  },
}));
const artist = {
  id: 'synthetic-a',
  young_audience: false,
  published: true,
} as Artist;
beforeEach(() => vi.clearAllMocks());
describe('young audience setting', () => {
  it('saves the selected profile, retains focus and refreshes server state', async () => {
    save.mockResolvedValue({});
    const update = vi.fn();
    render(
      <SettingsYoungAudienceSection artist={artist} onArtistUpdate={update} />
    );
    const control = screen.getByRole('switch', { name: 'Young audience' });
    control.focus();
    fireEvent.click(control);
    await screen.findByText('Saved');
    expect(save).toHaveBeenCalledWith({ updates: { youngAudience: true } });
    expect(options).toHaveBeenCalledWith({
      profileId: artist.id,
      silentSuccess: true,
    });
    expect(update).toHaveBeenCalledWith({ ...artist, young_audience: true });
    expect(control).toHaveFocus();
    expect(control).toBeChecked();
    expect(refresh).toHaveBeenCalledOnce();
  });
  it('rolls back a failed write and follows profile selection', async () => {
    save.mockRejectedValue(new Error('offline'));
    const { rerender } = render(
      <SettingsYoungAudienceSection artist={artist} />
    );
    fireEvent.click(screen.getByRole('switch'));
    await screen.findByText('Could not save audience preference. Try again.');
    expect(screen.getByRole('switch')).not.toBeChecked();
    expect(refresh).not.toHaveBeenCalled();
    rerender(
      <SettingsYoungAudienceSection
        artist={{ ...artist, id: 'synthetic-b', young_audience: true }}
      />
    );
    await waitFor(() => expect(screen.getByRole('switch')).toBeChecked());
  });
});
