import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { ChatAlbumArtToolResult } from '../types';
import { ChatAlbumArtCard } from './ChatAlbumArtCard';
import { ALBUM_ART_SWIPE_PREFERENCE_KEY } from './ChatAlbumArtSwipeReview';

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    fill: _fill,
    unoptimized: _unoptimized,
    sizes: _sizes,
    ...rest
  }: ComponentProps<'img'> & {
    fill?: boolean;
    unoptimized?: boolean;
    sizes?: string;
  }) => <img src={src as string} alt={alt ?? ''} {...rest} />,
}));

const {
  mockUseApplyGeneratedAlbumArtMutation,
  mockUseCreateReleaseWithGeneratedAlbumArtMutation,
} = vi.hoisted(() => ({
  mockUseApplyGeneratedAlbumArtMutation: vi.fn(),
  mockUseCreateReleaseWithGeneratedAlbumArtMutation: vi.fn(),
}));

vi.mock('@/lib/queries', () => ({
  useApplyGeneratedAlbumArtMutation: mockUseApplyGeneratedAlbumArtMutation,
  useCreateReleaseWithGeneratedAlbumArtMutation:
    mockUseCreateReleaseWithGeneratedAlbumArtMutation,
}));

const DREAM_POP_CANDIDATE = {
  id: 'candidate-1',
  styleId: 'dream-pop',
  styleLabel: 'Dream Pop',
  previewUrl: 'https://placehold.co/256x256',
  fullResUrl: 'https://placehold.co/1024x1024',
} as const;

const GENERATED_RESULT: ChatAlbumArtToolResult = {
  success: true,
  state: 'generated',
  releaseId: 'release-1',
  releaseTitle: 'Skyline Dreams',
  artistName: 'Sasha Waves',
  generationId: 'gen-1',
  hasExistingArtwork: false,
  candidates: [DREAM_POP_CANDIDATE],
};

function mockMutations() {
  mockUseApplyGeneratedAlbumArtMutation.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  });
  mockUseCreateReleaseWithGeneratedAlbumArtMutation.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  });
}

describe('ChatAlbumArtCard', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it.each([
    {
      state: 'generated grid',
      result: GENERATED_RESULT,
      preference: 'off' as const,
    },
    {
      state: 'failed',
      result: {
        success: false,
        retryable: true,
        error: 'Album art generation failed. Please try again.',
      } satisfies ChatAlbumArtToolResult,
      preference: 'off' as const,
    },
    {
      state: 'empty candidates',
      result: { ...GENERATED_RESULT, candidates: [] },
      preference: 'off' as const,
    },
  ])(
    'has no axe violations in the $state state',
    async ({ result, preference }) => {
      globalThis.localStorage.setItem(
        ALBUM_ART_SWIPE_PREFERENCE_KEY,
        preference
      );
      mockMutations();
      const { container } = render(
        <ChatAlbumArtCard result={result} profileId='profile-123' />
      );
      await expectNoA11yViolations(container);
    }
  );

  it('has no axe violations in an RTL overflow frame', async () => {
    globalThis.localStorage.setItem(ALBUM_ART_SWIPE_PREFERENCE_KEY, 'off');
    mockMutations();
    const { container } = render(
      <div dir='rtl' className='w-56'>
        <ChatAlbumArtCard
          result={{
            ...GENERATED_RESULT,
            releaseTitle: 'ألبوم الأحلام الليلية',
            candidates: [
              {
                ...DREAM_POP_CANDIDATE,
                styleLabel: 'بوب الأحلام',
              },
            ],
          }}
          profileId='profile-123'
        />
      </div>
    );
    await expectNoA11yViolations(container);
  });

  it('uses PlainButton candidate tiles with semantic focus border tokens', () => {
    globalThis.localStorage.setItem(ALBUM_ART_SWIPE_PREFERENCE_KEY, 'off');
    mockMutations();
    render(
      <ChatAlbumArtCard result={GENERATED_RESULT} profileId='profile-123' />
    );

    const tile = screen.getByTestId('album-art-candidate-tile');
    expect(tile.tagName).toBe('BUTTON');
    expect(tile.getAttribute('data-slot')).toBe('plain-button');
    expect(tile.className).toContain('ring-focus/18');
    expect(tile.className).not.toMatch(/\bcyan-\d/);
    expect(tile.className).not.toMatch(/\brgb\(/);
  });

  it('renders an apply failure with the error token, not raw red-* (JOV-6773)', () => {
    mockUseApplyGeneratedAlbumArtMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: true,
    });
    mockUseCreateReleaseWithGeneratedAlbumArtMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    });

    render(
      <ChatAlbumArtCard result={GENERATED_RESULT} profileId='profile-123' />
    );

    const message = screen.getByText('Could not apply artwork. Try again.');
    expect(message.className).toContain('text-error');
    expect(message.className).not.toMatch(/\bred-\d/);
  });

  it('does not render the failure output without a mutation error', () => {
    mockUseApplyGeneratedAlbumArtMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    });
    mockUseCreateReleaseWithGeneratedAlbumArtMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    });

    render(
      <ChatAlbumArtCard result={GENERATED_RESULT} profileId='profile-123' />
    );

    expect(
      screen.queryByText('Could not apply artwork. Try again.')
    ).toBeNull();
  });

  it('keeps candidate labels off the artwork and never crops album art', () => {
    mockUseApplyGeneratedAlbumArtMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    });
    mockUseCreateReleaseWithGeneratedAlbumArtMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    });

    render(
      <ChatAlbumArtCard result={GENERATED_RESULT} profileId='profile-123' />
    );

    const artwork = screen.getByAltText(
      'Skyline Dreams album art in Dream Pop style'
    );
    expect(artwork).toHaveClass('object-contain');
    expect(artwork).not.toHaveClass('object-cover');
    expect(screen.getByText('Dream Pop')).not.toHaveClass('absolute');
  });

  it('shows the one-time swipe-mode prompt while undecided (JOV-3834)', async () => {
    mockMutations();
    render(
      <ChatAlbumArtCard result={GENERATED_RESULT} profileId='profile-123' />
    );

    expect(
      await screen.findByTestId('album-art-swipe-onboarding')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('album-art-swipe-region')).toBeNull();
  });

  it('enabling swipe review from the prompt persists the preference', async () => {
    mockMutations();
    render(
      <ChatAlbumArtCard result={GENERATED_RESULT} profileId='profile-123' />
    );

    fireEvent.click(
      await screen.findByRole('button', { name: 'Try Swipe Review' })
    );

    expect(screen.getByTestId('album-art-swipe-region')).toBeInTheDocument();
    expect(
      globalThis.localStorage.getItem(ALBUM_ART_SWIPE_PREFERENCE_KEY)
    ).toBe('on');
  });

  it('declining the prompt keeps the grid and persists off', async () => {
    mockMutations();
    render(
      <ChatAlbumArtCard result={GENERATED_RESULT} profileId='profile-123' />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Keep Grid' }));

    expect(screen.queryByTestId('album-art-swipe-region')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Use This Art' })
    ).toBeInTheDocument();
    expect(
      globalThis.localStorage.getItem(ALBUM_ART_SWIPE_PREFERENCE_KEY)
    ).toBe('off');
  });

  it('renders the swipe region directly when the preference is already on', async () => {
    globalThis.localStorage.setItem(ALBUM_ART_SWIPE_PREFERENCE_KEY, 'on');
    mockMutations();
    render(
      <ChatAlbumArtCard result={GENERATED_RESULT} profileId='profile-123' />
    );

    expect(
      await screen.findByTestId('album-art-swipe-region')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('album-art-swipe-onboarding')).toBeNull();
  });
});
