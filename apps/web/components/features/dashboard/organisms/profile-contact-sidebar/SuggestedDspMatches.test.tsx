import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  type ComponentProps,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SuggestedDspMatches } from './SuggestedDspMatches';

const { mockUseDspMatchesQuery, mockUseDspMatchActions } = vi.hoisted(() => ({
  mockUseDspMatchesQuery: vi.fn(),
  mockUseDspMatchActions: vi.fn(),
}));

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: { alt: string; [key: string]: unknown }) => (
    <img alt={alt} {...props} />
  ),
}));

vi.mock('@jovie/ui', async () => {
  const actual = await vi.importActual<object>('@jovie/ui');
  return {
    ...actual,
    Button: ({
      children,
      asChild,
      ...props
    }: ComponentProps<'button'> & { asChild?: boolean }) => {
      if (asChild && isValidElement(children)) {
        return cloneElement(children as ReactElement, props);
      }
      return (
        <button type='button' {...props}>
          {children}
        </button>
      );
    },
    // Keep the popover closed in unit tests so row actions are not nested
    // under always-open popover chrome for axe.
    Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
    PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
    PopoverContent: () => null,
  };
});

vi.mock('@/lib/queries', () => ({
  useDspMatchesQuery: mockUseDspMatchesQuery,
}));

vi.mock('@/features/dashboard/organisms/dsp-matches/hooks', () => ({
  useDspMatchActions: mockUseDspMatchActions,
}));

vi.mock('@/features/dashboard/atoms/DspProviderIcon', () => ({
  DspProviderIcon: ({ provider }: { provider: string }) => (
    <span data-testid={`dsp-icon-${provider}`}>{provider}</span>
  ),
  PROVIDER_LABELS: {
    spotify: 'Spotify',
    apple_music: 'Apple Music',
    deezer: 'Deezer',
    youtube_music: 'YouTube Music',
  },
}));

vi.mock('@/features/dashboard/atoms/ConfidenceBadge', () => ({
  ConfidenceBadge: ({ score }: { score: number }) => (
    <span data-testid='confidence-badge'>{Math.round(score * 100)}%</span>
  ),
}));

vi.mock('@/lib/utils/dsp-images', () => ({
  isExternalDspImage: () => false,
}));

vi.mock('@/components/feedback', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const match = {
  id: 'match-1',
  providerId: 'spotify',
  externalArtistId: 'ext-1',
  externalArtistName: 'Test Artist',
  externalArtistUrl: 'https://open.spotify.com/artist/1',
  externalArtistImageUrl: null,
  confidenceScore: 0.9,
  confidenceBreakdown: null,
  matchingIsrcCount: 2,
  matchingUpcCount: 0,
  totalTracksChecked: 4,
  status: 'suggested',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const actions = {
  confirmMatch: vi.fn(),
  rejectMatch: vi.fn(),
  isMatchConfirming: vi.fn().mockReturnValue(false),
  isMatchRejecting: vi.fn().mockReturnValue(false),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseDspMatchActions.mockReturnValue(actions);
  mockUseDspMatchesQuery.mockReturnValue({
    data: [match],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
});

describe('SuggestedDspMatches (colocated cert)', () => {
  it('has no axe violations in ready, error, and RTL frames', async () => {
    const { container, rerender } = render(
      <SuggestedDspMatches profileId='profile-1' />
    );
    await expectNoA11yViolations(container);

    mockUseDspMatchesQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('offline'),
      refetch: vi.fn(),
    });
    rerender(<SuggestedDspMatches profileId='profile-1' />);
    await screen.findByText(/Couldn.t load suggestions/i);
    await expectNoA11yViolations(container);

    mockUseDspMatchesQuery.mockReturnValue({
      data: [match],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    rerender(
      <div dir='rtl' className='w-40'>
        <SuggestedDspMatches profileId='profile-1' />
      </div>
    );
    await expectNoA11yViolations(container);
  });

  it('confirms a match from the row action', async () => {
    const user = userEvent.setup();
    render(<SuggestedDspMatches profileId='profile-1' />);

    await user.click(
      screen.getByRole('button', {
        name: 'Confirm Spotify match for Test Artist',
      })
    );
    expect(actions.confirmMatch).toHaveBeenCalledWith('match-1');
  });

  it('keeps a zero-footprint loading sentinel (JOV-4159)', () => {
    mockUseDspMatchesQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });
    render(<SuggestedDspMatches profileId='profile-1' />);
    const root = screen.getByTestId('suggested-dsp-matches');
    expect(root).toHaveAttribute('data-state', 'loading');
    expect(root).toHaveClass('contents');
  });
});
