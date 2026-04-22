import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReleasePitchSection } from '@/components/organisms/release-sidebar/ReleasePitchSection';
import type { GeneratedPitches } from '@/lib/services/pitch/types';

// Mock sonner toast
const mockToast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
  loading: vi.fn(),
  dismiss: vi.fn(),
  message: vi.fn(),
  promise: vi.fn(),
  custom: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: mockToast,
  Toaster: () => null,
}));

// Mock the mutation hook
const mockMutate = vi.fn();
vi.mock('@/lib/queries/useReleasePitchMutation', () => ({
  useReleasePitchMutation: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}));

const MOCK_PITCHES: GeneratedPitches = {
  spotify:
    'An exciting new release from the artist, blending genres in unexpected ways.',
  appleMusic: 'A genre-defying release that pushes boundaries.',
  amazon: 'Fresh sounds that redefine the musical landscape.',
  generic:
    'This release showcases artistic growth and creative ambition across every track.',
  generatedAt: '2026-03-25T00:00:00Z',
  modelUsed: 'claude-haiku-4-5-20251001',
};

describe('ReleasePitchSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state when no pitches exist', () => {
    render(<ReleasePitchSection releaseId='test-id' />);

    expect(
      screen.getByText(
        'Generate AI-powered pitches formatted for each streaming platform.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Generate Pitch')).toBeInTheDocument();
  });

  it('renders default platform (Spotify) when pitches exist', () => {
    render(
      <ReleasePitchSection releaseId='test-id' existingPitches={MOCK_PITCHES} />
    );

    expect(screen.getByText(MOCK_PITCHES.spotify)).toBeInTheDocument();
    const spotifyTab = screen.getByRole('tab', { name: 'Spotify' });
    expect(spotifyTab).toHaveAttribute('aria-selected', 'true');
  });

  it('switches platform when clicking a tab', () => {
    render(
      <ReleasePitchSection releaseId='test-id' existingPitches={MOCK_PITCHES} />
    );

    // Click Apple tab
    fireEvent.click(screen.getByRole('tab', { name: 'Apple' }));

    expect(screen.getByText(MOCK_PITCHES.appleMusic)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Apple' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: 'Spotify' })).toHaveAttribute(
      'aria-selected',
      'false'
    );
  });

  it('updates character count when switching platforms', () => {
    render(
      <ReleasePitchSection releaseId='test-id' existingPitches={MOCK_PITCHES} />
    );

    // Spotify default: limit is 500
    expect(
      screen.getByText(`${MOCK_PITCHES.spotify.length}/500`)
    ).toBeInTheDocument();

    // Switch to Apple Music: limit is 300
    fireEvent.click(screen.getByRole('tab', { name: 'Apple' }));
    expect(
      screen.getByText(`${MOCK_PITCHES.appleMusic.length}/300`)
    ).toBeInTheDocument();

    // Switch to Generic: limit is 1000
    fireEvent.click(screen.getByRole('tab', { name: 'Generic' }));
    expect(
      screen.getByText(`${MOCK_PITCHES.generic.length}/1000`)
    ).toBeInTheDocument();
  });

  it('shows red character count when over limit', () => {
    const longPitch = 'x'.repeat(350);
    const pitchesOverLimit: GeneratedPitches = {
      ...MOCK_PITCHES,
      appleMusic: longPitch, // 350 > 300 limit
    };

    render(
      <ReleasePitchSection
        releaseId='test-id'
        existingPitches={pitchesOverLimit}
      />
    );

    // Switch to Apple Music
    fireEvent.click(screen.getByRole('tab', { name: 'Apple' }));

    const countEl = screen.getByText('350/300');
    expect(countEl).toHaveClass('text-red-500');
  });

  it('shows "Regenerate" when pitches exist', () => {
    render(
      <ReleasePitchSection releaseId='test-id' existingPitches={MOCK_PITCHES} />
    );

    expect(screen.getByText('Regenerate')).toBeInTheDocument();
  });

  it('triggers mutation when Generate is clicked', () => {
    render(<ReleasePitchSection releaseId='test-id' />);

    fireEvent.click(screen.getByText('Generate Pitch'));

    expect(mockMutate).toHaveBeenCalledWith('test-id', expect.any(Object));
  });

  it('has proper ARIA tablist/tab/tabpanel attributes', () => {
    render(
      <ReleasePitchSection releaseId='test-id' existingPitches={MOCK_PITCHES} />
    );

    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();
  });

  it('handles partial state when a platform has no pitch', () => {
    const partialPitches: GeneratedPitches = {
      ...MOCK_PITCHES,
      amazon: '',
    };

    render(
      <ReleasePitchSection
        releaseId='test-id'
        existingPitches={partialPitches}
      />
    );

    // Switch to Amazon
    fireEvent.click(screen.getByRole('tab', { name: 'Amazon' }));

    expect(
      screen.getByText('No pitch generated for this platform')
    ).toBeInTheDocument();
  });
});
