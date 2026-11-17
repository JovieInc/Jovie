import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { Artist } from '@/types/db';
import { ListenNowForm } from './ListenNowForm';

type MutationOptions = {
  onSuccess: (data: { profile: Record<string, unknown> }) => void;
  onError: (error: unknown) => void;
};

const mutation = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  options: null as null | MutationOptions,
}));

vi.mock('@/lib/queries', () => ({
  useProfileMutation: (options: MutationOptions) => {
    mutation.options = options;
    return { mutate: mutation.mutate, isPending: mutation.isPending };
  },
}));

const artist = {
  id: 'artist-1',
  owner_user_id: 'user-1',
  handle: 'mina',
  spotify_id: '',
  name: 'Mina Vale',
  spotify_url: 'https://open.spotify.com/artist/mina',
  apple_music_url: '',
  youtube_url: '',
  published: true,
  is_verified: false,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2026-01-01T00:00:00.000Z',
} satisfies Artist;

beforeEach(() => {
  vi.clearAllMocks();
  mutation.isPending = false;
  mutation.options = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ListenNowForm', () => {
  it('submits every link, sending empty fields as null', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ListenNowForm artist={artist} onUpdate={vi.fn()} />
    );
    expect(screen.getByLabelText('Spotify URL')).toHaveValue(
      'https://open.spotify.com/artist/mina'
    );
    await user.type(
      screen.getByLabelText('YouTube URL'),
      'https://youtube.com/@mina'
    );
    await user.click(screen.getByRole('button', { name: 'Update Links' }));

    expect(mutation.mutate).toHaveBeenCalledWith({
      profileId: 'artist-1',
      updates: {
        spotifyUrl: 'https://open.spotify.com/artist/mina',
        appleMusicUrl: null,
        youtubeUrl: 'https://youtube.com/@mina',
      },
    });
    await expectNoA11yViolations(container);
  });

  it('keeps typed links and focus through a parent rerender and blur', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const { rerender } = render(
      <ListenNowForm artist={artist} onUpdate={onUpdate} />
    );
    const apple = screen.getByLabelText('Apple Music URL');
    await user.type(apple, 'https://music.apple.com/artist/mina');

    rerender(<ListenNowForm artist={artist} onUpdate={onUpdate} />);
    expect(screen.getByLabelText('Apple Music URL')).toHaveValue(
      'https://music.apple.com/artist/mina'
    );
    expect(screen.getByLabelText('Apple Music URL')).toHaveFocus();

    await user.tab();
    expect(screen.getByLabelText('Apple Music URL')).toHaveValue(
      'https://music.apple.com/artist/mina'
    );
  });

  it('shows the saved message and hands the updated artist back', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<ListenNowForm artist={artist} onUpdate={onUpdate} />);
    await user.click(screen.getByRole('button', { name: 'Update Links' }));

    act(() => {
      mutation.options?.onSuccess({
        profile: { id: 'artist-1', username: 'mina', displayName: 'Mina Vale' },
      });
    });
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'artist-1' })
    );
    expect(screen.getByText('Links updated!')).toBeInTheDocument();
  });

  it('shows the failure and keeps the typed links', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ListenNowForm artist={artist} onUpdate={vi.fn()} />
    );
    await user.type(
      screen.getByLabelText('YouTube URL'),
      'https://youtube.com/@mina'
    );
    await user.click(screen.getByRole('button', { name: 'Update Links' }));
    act(() => {
      mutation.options?.onError(new Error('offline'));
    });
    expect(
      screen.getByText('Failed to update music links')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('YouTube URL')).toHaveValue(
      'https://youtube.com/@mina'
    );
    await expectNoA11yViolations(container);
  });

  it('marks the submit button busy while saving', async () => {
    mutation.isPending = true;
    const { container } = render(
      <ListenNowForm artist={artist} onUpdate={vi.fn()} />
    );
    expect(container.querySelector('button[type="submit"]')).toHaveAttribute(
      'aria-busy',
      'true'
    );
    await expectNoA11yViolations(container);
  });

  it('renders right to left', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ListenNowForm artist={artist} onUpdate={vi.fn()} />
      </div>
    );
    expect(screen.getByLabelText('Spotify URL')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
