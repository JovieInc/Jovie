import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockToastError = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

const { useReleaseHeaderParts } = await import(
  '@/components/organisms/release-sidebar/ReleaseSidebarHeader'
);

const release = {
  id: 'release_1',
  profileId: 'profile_1',
  title: 'Test Release',
  releaseDate: '2025-06-01T00:00:00.000Z',
  artworkUrl: 'https://example.com/art.jpg',
  slug: 'test-release',
  smartLinkPath: '/r/test-release--profile_1',
  spotifyPopularity: 72,
  providers: [],
  releaseType: 'single' as const,
  isExplicit: false,
  upc: '123456789012',
  label: 'Test Label',
  totalTracks: 1,
  totalDurationMs: 185000,
  primaryIsrc: 'USRC17607839',
  genres: ['Indie Pop'],
  canvasStatus: 'not_set' as const,
  hasVideoLinks: false,
  generatedPitches: [],
};

function TestHarness(props: Parameters<typeof useReleaseHeaderParts>[0]) {
  const { headerLabel, primaryActions, overflowActions } =
    useReleaseHeaderParts(props);

  return (
    <div>
      <div data-testid='header-label'>{headerLabel || 'none'}</div>
      <div>
        {primaryActions.map(action => (
          <button key={action.id} type='button' onClick={action.onClick}>
            {action.label}
          </button>
        ))}
        {overflowActions.map(action => (
          <button key={action.id} type='button' onClick={action.onClick}>
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

describe('useReleaseHeaderParts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('omits duplicate visible header copy and smart-link primary actions', () => {
    render(<TestHarness release={release} hasRelease />);

    expect(screen.getByTestId('header-label')).toHaveTextContent('none');
    expect(
      screen.queryByRole('button', { name: /copy smart link/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /open smart link/i })
    ).not.toBeInTheDocument();
  });

  it('keeps release utilities in overflow actions', async () => {
    const refreshSpy = vi.fn();
    const user = userEvent.setup();
    render(<TestHarness release={release} hasRelease onRefresh={refreshSpy} />);

    await user.click(screen.getByRole('button', { name: /refresh release/i }));
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: /copy release id/i })
    ).toBeInTheDocument();
  });

  it('uses toast feedback instead of native alerts when copy fails', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('clipboard blocked')),
      },
    });

    render(<TestHarness release={release} hasRelease />);

    await user.click(screen.getByRole('button', { name: /copy release id/i }));

    expect(mockToastError).toHaveBeenCalledWith(
      'Failed to copy the release ID. Your browser may not allow clipboard access.'
    );
    expect(alertSpy).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });
});
