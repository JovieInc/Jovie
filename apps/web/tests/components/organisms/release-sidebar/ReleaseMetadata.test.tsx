import { TooltipProvider } from '@jovie/ui';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReleaseMetadata } from '@/components/organisms/release-sidebar/ReleaseMetadata';
import type { Release } from '@/components/organisms/release-sidebar/types';

function buildRelease(overrides: Partial<Release> = {}): Release {
  return {
    profileId: 'profile_1',
    id: 'release_1',
    title: 'Midnight Echo',
    releaseDate: '2025-06-01T00:00:00.000Z',
    artworkUrl: 'https://example.com/artwork.jpg',
    slug: 'midnight-echo',
    smartLinkPath: '/r/midnight-echo--profile_1',
    spotifyPopularity: 72,
    providers: [],
    releaseType: 'single',
    isExplicit: false,
    upc: '123456789012',
    label: 'North Star Records',
    totalTracks: 1,
    totalDurationMs: 185000,
    primaryIsrc: 'USRC17607839',
    genres: ['Indie Pop'],
    canvasStatus: 'not_set',
    ...overrides,
  };
}

function renderReleaseMetadata(release: Release) {
  return render(
    <TooltipProvider>
      <ReleaseMetadata release={release} />
    </TooltipProvider>
  );
}

describe('ReleaseMetadata editable fields', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders empty metadata fields as editable inputs in admin mode', () => {
    render(
      <TooltipProvider>
        <ReleaseMetadata
          release={buildRelease({ primaryIsrc: null, upc: null, label: null })}
          isEditable
          onSavePrimaryIsrc={vi.fn().mockResolvedValue(undefined)}
          onSaveMetadata={vi.fn().mockResolvedValue(undefined)}
        />
      </TooltipProvider>
    );

    expect(screen.getByLabelText('ISRC')).toHaveAttribute(
      'placeholder',
      'Add ISRC'
    );
    expect(screen.getByLabelText('UPC')).toHaveAttribute(
      'placeholder',
      'Add UPC'
    );
    expect(screen.getByLabelText('Label')).toHaveAttribute(
      'placeholder',
      'Add Label'
    );
  });

  it('auto-saves metadata after debounce and normalizes ISRC', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onSavePrimaryIsrc = vi.fn().mockResolvedValue(undefined);

    render(
      <TooltipProvider>
        <ReleaseMetadata
          release={buildRelease({ primaryIsrc: null })}
          isEditable
          onSavePrimaryIsrc={onSavePrimaryIsrc}
          onSaveMetadata={vi.fn().mockResolvedValue(undefined)}
        />
      </TooltipProvider>
    );

    await user.type(screen.getByLabelText('ISRC'), 'us-abc-1234567');
    vi.advanceTimersByTime(1600);

    await waitFor(() => {
      expect(onSavePrimaryIsrc).toHaveBeenCalledWith(
        'release_1',
        'USABC1234567'
      );
    });
  });

  it('flushes pending saves on blur', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onSaveMetadata = vi.fn().mockResolvedValue(undefined);

    render(
      <TooltipProvider>
        <ReleaseMetadata
          release={buildRelease({ label: null })}
          isEditable
          onSavePrimaryIsrc={vi.fn().mockResolvedValue(undefined)}
          onSaveMetadata={onSaveMetadata}
        />
      </TooltipProvider>
    );

    const input = screen.getByLabelText('Label');
    await user.type(input, 'New Label');
    await user.tab();

    await waitFor(() => {
      expect(onSaveMetadata).toHaveBeenCalledWith('release_1', {
        upc: '123456789012',
        label: 'New Label',
      });
    });
  });

  it('keeps draft text visible and shows inline error when save fails', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onSaveMetadata = vi
      .fn()
      .mockRejectedValue(
        new Error('This UPC is already used on another release')
      );

    render(
      <TooltipProvider>
        <ReleaseMetadata
          release={buildRelease({ upc: null })}
          isEditable
          onSavePrimaryIsrc={vi.fn().mockResolvedValue(undefined)}
          onSaveMetadata={onSaveMetadata}
        />
      </TooltipProvider>
    );

    const input = screen.getByLabelText('UPC');
    await user.type(input, '12345678');
    vi.advanceTimersByTime(1600);

    await waitFor(() => {
      expect(screen.getByDisplayValue('12345678')).toBeInTheDocument();
      expect(
        screen.getByText('This UPC is already used on another release')
      ).toBeInTheDocument();
    });
  });
});

describe('ReleaseMetadata canvas status', () => {
  it('renders metadata as a single divider-free grid', () => {
    renderReleaseMetadata(buildRelease());

    expect(screen.getByTestId('release-metadata-grid')).toHaveAttribute(
      'data-dividers',
      'false'
    );
  });

  it('shows set status when canvas is uploaded', () => {
    renderReleaseMetadata(buildRelease({ canvasStatus: 'uploaded' }));

    expect(screen.getByText('Canvas')).toBeInTheDocument();
    expect(screen.getByText('Has video')).toBeInTheDocument();
  });

  it('shows ready to upload when canvas is generated', () => {
    renderReleaseMetadata(buildRelease({ canvasStatus: 'generated' }));

    expect(screen.getByText('Ready to upload')).toBeInTheDocument();
  });

  it('falls back to not-set badge for unknown canvas status values', () => {
    renderReleaseMetadata(
      buildRelease({
        canvasStatus: 'unknown_value' as Release['canvasStatus'],
      })
    );

    expect(screen.getByText('Canvas')).toBeInTheDocument();
    expect(screen.getAllByText('Has video').length).toBeGreaterThanOrEqual(1);
  });

  it('defaults to not-set badge when canvas status is missing', () => {
    renderReleaseMetadata(buildRelease({ canvasStatus: undefined }));

    expect(screen.getByText('Canvas')).toBeInTheDocument();
    expect(screen.getAllByText('Has video').length).toBeGreaterThanOrEqual(1);
  });
});

describe('ReleaseMetadata copyright labels', () => {
  it('renders both ℗ and © copyright lines when both values exist', () => {
    renderReleaseMetadata(
      buildRelease({
        copyrightLine: '2020 To Mine Limited',
        distributor: '2020 To Mine Limited',
      })
    );

    expect(screen.getByText('℗')).toBeInTheDocument();
    expect(screen.getByText('©')).toBeInTheDocument();
    expect(screen.getByText('℗ 2020 To Mine Limited')).toBeInTheDocument();
    expect(screen.getByText('© 2020 To Mine Limited')).toBeInTheDocument();
  });

  it('shows only the available copyright type', () => {
    renderReleaseMetadata(
      buildRelease({
        copyrightLine: undefined,
        distributor: '2020 To Mine Limited',
      })
    );

    expect(screen.queryByText('℗')).not.toBeInTheDocument();
    expect(screen.getByText('©')).toBeInTheDocument();
    expect(screen.getByText('© 2020 To Mine Limited')).toBeInTheDocument();
  });

  it('normalizes existing leading symbols to avoid duplication', () => {
    renderReleaseMetadata(
      buildRelease({
        copyrightLine: '℗ 2020 To Mine Limited',
        distributor: '© 2020 To Mine Limited',
      })
    );

    expect(screen.getByText('℗ 2020 To Mine Limited')).toBeInTheDocument();
    expect(screen.getByText('© 2020 To Mine Limited')).toBeInTheDocument();
    expect(
      screen.queryByText('℗ ℗ 2020 To Mine Limited')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('© © 2020 To Mine Limited')
    ).not.toBeInTheDocument();
  });
});
