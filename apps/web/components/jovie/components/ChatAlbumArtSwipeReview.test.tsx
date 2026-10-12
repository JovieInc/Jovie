import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatAlbumArtCandidate } from '../types';
import {
  ALBUM_ART_SWIPE_PREFERENCE_KEY,
  ChatAlbumArtSwipeReview,
  readAlbumArtSwipePreference,
  writeAlbumArtSwipePreference,
} from './ChatAlbumArtSwipeReview';

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

const CANDIDATES: ChatAlbumArtCandidate[] = [
  {
    id: 'candidate-1',
    styleId: 'dream-pop',
    styleLabel: 'Dream Pop',
    previewUrl: 'https://placehold.co/256x256',
    fullResUrl: 'https://placehold.co/1024x1024',
  },
  {
    id: 'candidate-2',
    styleId: 'vaporwave',
    styleLabel: 'Vaporwave',
    previewUrl: 'https://placehold.co/256x256',
    fullResUrl: 'https://placehold.co/1024x1024',
  },
];

function renderReview(
  overrides: Partial<Parameters<typeof ChatAlbumArtSwipeReview>[0]> = {}
) {
  const props = {
    releaseTitle: 'Skyline Dreams',
    candidates: CANDIDATES,
    appliedCandidateId: null,
    isActionPending: false,
    onAccept: vi.fn(),
    onRequestMore: vi.fn(),
    onExitSwipeMode: vi.fn(),
    ...overrides,
  };
  render(<ChatAlbumArtSwipeReview {...props} />);
  return props;
}

function drag(startX: number, endX: number) {
  const region = screen.getByTestId('album-art-swipe-region');
  fireEvent.pointerDown(region, {
    pointerId: 1,
    button: 0,
    clientX: startX,
    clientY: 10,
    timeStamp: 0,
  });
  fireEvent.pointerMove(region, {
    pointerId: 1,
    clientX: endX,
    clientY: 10,
    timeStamp: 16,
  });
  fireEvent.pointerUp(region, {
    pointerId: 1,
    clientX: endX,
    clientY: 10,
    timeStamp: 32,
  });
  return region;
}

describe('swipe preference storage', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('defaults to undecided when nothing is stored', () => {
    expect(readAlbumArtSwipePreference()).toBe('undecided');
  });

  it('round-trips on/off values and ignores garbage', () => {
    writeAlbumArtSwipePreference('on');
    expect(readAlbumArtSwipePreference()).toBe('on');
    writeAlbumArtSwipePreference('off');
    expect(readAlbumArtSwipePreference()).toBe('off');
    globalThis.localStorage.setItem(ALBUM_ART_SWIPE_PREFERENCE_KEY, 'junk');
    expect(readAlbumArtSwipePreference()).toBe('undecided');
  });
});

describe('ChatAlbumArtSwipeReview', () => {
  it('shows the first candidate with a screen-reader position status', () => {
    renderReview();
    expect(
      screen.getByAltText('Skyline Dreams album art in Dream Pop style')
    ).toBeInTheDocument();
    expect(screen.getByTestId('album-art-swipe-status')).toHaveTextContent(
      'Candidate 1 of 2: Dream Pop'
    );
  });

  it('reject button advances to the next candidate', () => {
    renderReview();
    fireEvent.click(
      screen.getByRole('button', { name: 'Reject Dream Pop artwork' })
    );
    expect(screen.getByTestId('album-art-swipe-status')).toHaveTextContent(
      'Candidate 2 of 2: Vaporwave'
    );
  });

  it('accept button calls onAccept with the current candidate', () => {
    const props = renderReview();
    fireEvent.click(
      screen.getByRole('button', { name: 'Accept Dream Pop artwork' })
    );
    expect(props.onAccept).toHaveBeenCalledWith(CANDIDATES[0]);
  });

  it('arrow keys reject and accept while focus is inside the region', () => {
    const props = renderReview();
    const region = screen.getByTestId('album-art-swipe-region');
    fireEvent.keyDown(region, { key: 'ArrowLeft' });
    expect(screen.getByTestId('album-art-swipe-status')).toHaveTextContent(
      'Candidate 2 of 2: Vaporwave'
    );
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    expect(props.onAccept).toHaveBeenCalledWith(CANDIDATES[1]);
  });

  it('a rightward drag past the threshold accepts the candidate', () => {
    const props = renderReview();
    drag(10, 200);
    expect(props.onAccept).toHaveBeenCalledWith(CANDIDATES[0]);
  });

  it('a leftward drag past the threshold rejects and advances', () => {
    renderReview();
    drag(200, 10);
    expect(screen.getByTestId('album-art-swipe-status')).toHaveTextContent(
      'Candidate 2 of 2: Vaporwave'
    );
  });

  it('shows the exhausted state after the last rejection and requests a new set', () => {
    const props = renderReview();
    fireEvent.click(
      screen.getByRole('button', { name: 'Reject Dream Pop artwork' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Reject Vaporwave artwork' })
    );
    expect(screen.getByTestId('album-art-swipe-exhausted')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Request Another Set' })
    );
    expect(props.onRequestMore).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Review Again/ }));
    expect(screen.getByTestId('album-art-swipe-status')).toHaveTextContent(
      'Candidate 1 of 2: Dream Pop'
    );
  });

  it('marks the applied candidate after accept', () => {
    renderReview({ appliedCandidateId: 'candidate-1' });
    expect(screen.getByText('Artwork Applied')).toBeInTheDocument();
  });

  it('exit control hands back to the grid via onExitSwipeMode', () => {
    const props = renderReview();
    fireEvent.click(
      screen.getByRole('button', { name: 'Switch To Grid View' })
    );
    expect(props.onExitSwipeMode).toHaveBeenCalled();
  });
});
