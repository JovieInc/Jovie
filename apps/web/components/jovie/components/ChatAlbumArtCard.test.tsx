import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatAlbumArtToolResult } from '../types';
import { ChatAlbumArtCard } from './ChatAlbumArtCard';
import { ALBUM_ART_SWIPE_PREFERENCE_KEY } from './ChatAlbumArtSwipeReview';

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

const GENERATED_RESULT: ChatAlbumArtToolResult = {
  success: true,
  state: 'generated',
  releaseId: 'release-1',
  releaseTitle: 'Skyline Dreams',
  artistName: 'Sasha Waves',
  generationId: 'gen-1',
  hasExistingArtwork: false,
  candidates: [
    {
      id: 'candidate-1',
      styleId: 'dream-pop',
      styleLabel: 'Dream Pop',
      previewUrl: 'https://placehold.co/256x256',
      fullResUrl: 'https://placehold.co/1024x1024',
    },
  ],
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
