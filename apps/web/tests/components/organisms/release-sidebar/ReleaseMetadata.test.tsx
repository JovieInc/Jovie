import { TooltipProvider } from '@jovie/ui';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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
  it('renders empty metadata fields in read mode first and enters edit mode on click', async () => {
    const user = userEvent.setup();

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

    expect(screen.getByLabelText('Edit ISRC')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Add ISRC')).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('Edit ISRC'));

    expect(screen.getByLabelText('Edit ISRC')).toHaveAttribute(
      'placeholder',
      'Add ISRC'
    );
  });

  it('saves on blur and normalizes ISRC', async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByLabelText('Edit ISRC'));
    const input = screen.getByLabelText('Edit ISRC');
    await user.type(input, 'us-abc-1234567');
    await user.tab();

    await waitFor(() => {
      expect(onSavePrimaryIsrc).toHaveBeenCalledWith(
        'release_1',
        'USABC1234567'
      );
    });
  });

  it('saves label changes on blur', async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByLabelText('Edit Label'));
    const input = screen.getByLabelText('Edit Label');
    await user.type(input, 'New Label');
    await user.tab();

    await waitFor(() => {
      expect(onSaveMetadata).toHaveBeenCalledWith('release_1', {
        upc: '123456789012',
        label: 'New Label',
      });
    });
  });
});

describe('ReleaseMetadata canvas status', () => {
  it('renders correctly in flat mode without the nested card chrome', () => {
    render(
      <TooltipProvider>
        <ReleaseMetadata release={buildRelease()} variant='flat' />
      </TooltipProvider>
    );

    expect(screen.getByTestId('release-metadata-card')).toHaveAttribute(
      'data-variant',
      'flat'
    );
    expect(screen.getByTestId('release-metadata-grid')).toBeInTheDocument();
    expect(screen.getByText('ISRC')).toBeInTheDocument();
  });

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
