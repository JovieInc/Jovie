import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { Artist } from '@/types/db';
import { ProfileForm } from './ProfileForm';

const hoisted = vi.hoisted(() => ({
  mutateAsync: vi.fn(async () => undefined),
  state: {
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null as Error | null,
  },
}));

vi.mock('@/lib/queries', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/queries')>()),
  useProfileMutation: () => ({
    mutateAsync: hoisted.mutateAsync,
    reset: vi.fn(),
    ...hoisted.state,
  }),
}));

const artist = {
  id: 'artist-1',
  owner_user_id: 'user-1',
  handle: 'mina',
  spotify_id: '',
  name: 'Mina Vale',
  tagline: 'Independent producer and vocalist',
  image_url: '',
  spotify_url: '',
  apple_music_url: '',
  youtube_url: '',
  settings: {},
  published: true,
  is_verified: true,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2026-01-01T00:00:00.000Z',
} satisfies Artist;

function renderForm() {
  const onUpdate = vi.fn();
  const view = render(<ProfileForm artist={artist} onUpdate={onUpdate} />);
  return { ...view, onUpdate };
}

describe('ProfileForm', () => {
  beforeEach(() => {
    hoisted.mutateAsync.mockClear();
    hoisted.state = {
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
    };
  });

  it('renders the saved profile axe-clean', async () => {
    const { container } = renderForm();
    expect(screen.getByPlaceholderText('Your artist name')).toHaveValue(
      'Mina Vale'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps typed name and tagline and focus across a rerender and Escape', async () => {
    const user = userEvent.setup();
    const { rerender, onUpdate } = renderForm();

    const name = screen.getByPlaceholderText('Your artist name');
    await user.clear(name);
    await user.type(name, 'Mina V');
    const tagline = screen.getByPlaceholderText(/Share your story/);
    await user.clear(tagline);
    await user.type(tagline, 'Late-night pop');
    rerender(<ProfileForm artist={{ ...artist }} onUpdate={onUpdate} />);
    await user.keyboard('{Escape}');

    expect(screen.getByPlaceholderText('Your artist name')).toHaveValue(
      'Mina V'
    );
    expect(screen.getByPlaceholderText(/Share your story/)).toHaveValue(
      'Late-night pop'
    );
    expect(screen.getByPlaceholderText(/Share your story/)).toHaveFocus();
  });

  it('submits the edited fields', async () => {
    const user = userEvent.setup();
    renderForm();

    const name = screen.getByPlaceholderText('Your artist name');
    await user.clear(name);
    await user.type(name, 'Mina V');
    await user.click(screen.getByRole('button', { name: /Update Profile/ }));

    expect(hoisted.mutateAsync).toHaveBeenCalledWith({
      profileId: 'artist-1',
      updates: {
        displayName: 'Mina V',
        bio: 'Independent producer and vocalist',
        avatarUrl: undefined,
      },
    });
  });

  it('blocks an empty name with a validation error axe-clean', async () => {
    const user = userEvent.setup();
    const { container } = renderForm();

    await user.clear(screen.getByPlaceholderText('Your artist name'));
    await user.click(screen.getByRole('button', { name: /Update Profile/ }));

    expect(hoisted.mutateAsync).not.toHaveBeenCalled();
    expect(
      screen.getAllByText('Artist name is required').length
    ).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });

  it('rejects a tagline over 160 characters', async () => {
    const user = userEvent.setup();
    renderForm();

    const tagline = screen.getByPlaceholderText(/Share your story/);
    await user.clear(tagline);
    await user.click(tagline);
    await user.paste('x'.repeat(161));
    await user.click(screen.getByRole('button', { name: /Update Profile/ }));

    expect(hoisted.mutateAsync).not.toHaveBeenCalled();
    expect(
      screen.getAllByText('Tagline must be less than 160 characters').length
    ).toBeGreaterThan(0);
  });

  it('marks the submit button busy while saving', async () => {
    hoisted.state = { ...hoisted.state, isPending: true };
    const { container } = renderForm();
    expect(
      screen.getByRole('button', { name: /Update Profile/ })
    ).toHaveAttribute('aria-busy', 'true');
    await expectNoA11yViolations(container);
  });

  it('shows a failed save in the error summary axe-clean', async () => {
    hoisted.state = {
      ...hoisted.state,
      isError: true,
      error: new Error('Failed to fetch'),
    };
    const { container } = renderForm();
    expect(screen.getAllByText('Failed to fetch').length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });

  it('confirms a successful save', () => {
    hoisted.state = { ...hoisted.state, isSuccess: true };
    renderForm();
    expect(screen.getByText('Profile updated')).toBeInTheDocument();
  });
});
