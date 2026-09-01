import { render, screen } from '@testing-library/react';
import type { FormEvent, ImgHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Artist } from '@/types/db';

const {
  mockProfileFormState,
  mockMusicLinksFormState,
} = vi.hoisted(() => {
  const mockHandleSubmit = vi.fn((event: FormEvent) => event.preventDefault());
  const mockSetFormData = vi.fn();
  return {
    mockProfileFormState: {
      formRef: { current: null },
      nameInputRef: { current: null },
      loading: false as boolean,
      error: undefined as string | undefined,
      success: false as boolean,
      formSubmitted: false as boolean,
      validationErrors: {} as Record<string, string>,
      formData: {
        name: 'Test Artist',
        tagline: 'Producer and DJ',
        imageUrl: '',
      },
      formErrors: {} as Record<string, string>,
      setFormData: mockSetFormData,
      handleSubmit: mockHandleSubmit,
    },
    mockMusicLinksFormState: {
      primaryFields: {
        spotifyUrl: '',
        appleMusicUrl: '',
        youtubeUrl: '',
      },
      additionalLinks: [],
      connectedDspInfo: {},
      updatePrimaryField: vi.fn(),
      schedulePrimaryNormalize: vi.fn(),
      handlePrimaryBlur: vi.fn(),
      addAdditionalLink: vi.fn(),
      removeAdditionalLink: vi.fn(),
      updateAdditionalLink: vi.fn(),
      scheduleAdditionalNormalize: vi.fn(),
      handleAdditionalBlur: vi.fn(),
      handleSubmit: vi.fn((event: FormEvent) => event.preventDefault()),
      loading: false as boolean,
      initialLoading: false as boolean,
      error: undefined as string | undefined,
      success: false as boolean,
    },
  };
});

vi.mock('@/features/dashboard/organisms/profile-form/useProfileForm', () => ({
  useProfileForm: () => mockProfileFormState,
}));

vi.mock(
  '@/features/dashboard/organisms/listen-now-form/useMusicLinksForm',
  () => ({
    useMusicLinksForm: () => mockMusicLinksFormState,
  })
);

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'dark' }),
}));

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: ImgHTMLAttributes<HTMLImageElement>) => (
    <img alt={alt} {...props} />
  ),
}));

vi.mock('@/components/organisms/artist-search-palette', () => ({
  ArtistSearchCommandPalette: () => null,
}));

import { ListenNowForm } from '@/features/dashboard/organisms/listen-now-form';
import { ProfileForm } from '@/features/dashboard/organisms/profile-form/ProfileForm';

const artist: Artist = {
  id: 'artist-1',
  owner_user_id: 'user-1',
  handle: 'test-artist',
  spotify_id: '',
  name: 'Test Artist',
  tagline: 'Producer and DJ',
  image_url: '',
  spotify_url: '',
  apple_music_url: '',
  youtube_url: '',
  settings: {},
  published: true,
  is_verified: false,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2026-01-01T00:00:00.000Z',
};

describe('dashboard form validation consolidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfileFormState.loading = false;
    mockProfileFormState.success = false;
    mockProfileFormState.error = undefined;
    mockProfileFormState.formSubmitted = false;
    mockProfileFormState.validationErrors = {};
    mockProfileFormState.formErrors = {};
    mockMusicLinksFormState.loading = false;
    mockMusicLinksFormState.success = false;
    mockMusicLinksFormState.error = undefined;
  });

  it('renders ProfileForm submit progress through the Button loading contract', () => {
    mockProfileFormState.loading = true;

    const { container } = render(
      <ProfileForm artist={artist} onUpdate={vi.fn()} />
    );

    const submitButton = container.querySelector('button[type="submit"]');
    expect(submitButton).toHaveAttribute('data-state', 'loading');
    expect(submitButton).toHaveAttribute('aria-busy', 'true');
    expect(submitButton).toBeDisabled();
    expect(screen.getByText('Update Profile')).toBeInTheDocument();
  });

  it('renders ProfileForm validation with the summary and reserved field feedback slots', () => {
    mockProfileFormState.formSubmitted = true;
    mockProfileFormState.validationErrors = {
      name: 'Artist name is required',
    };
    mockProfileFormState.formErrors = {
      name: 'Artist name is required',
    };

    const { container } = render(
      <ProfileForm artist={artist} onUpdate={vi.fn()} />
    );

    expect(
      screen
        .getAllByRole('alert')
        .some(alert => /artist name is required/i.test(alert.textContent ?? ''))
    ).toBe(true);
    expect(screen.getByLabelText('Artist Name')).toHaveAttribute(
      'aria-invalid',
      'true'
    );
    expect(
      container.querySelectorAll('[data-slot="field-feedback"]')
    ).toHaveLength(2);
  });

  it('renders ListenNowForm submit outcomes through Button loading and FormStatus', () => {
    mockMusicLinksFormState.loading = true;
    mockMusicLinksFormState.error = 'Failed to save music links';

    const { container } = render(
      <ListenNowForm artist={artist} onUpdate={vi.fn()} />
    );

    const submitButton = container.querySelector('button[type="submit"]');
    expect(submitButton).toHaveAttribute('data-state', 'loading');
    expect(submitButton).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Failed to save music links'
    );
    expect(container.querySelector('[data-slot="form-status"]')).toHaveClass(
      'min-h-5'
    );
  });
});
