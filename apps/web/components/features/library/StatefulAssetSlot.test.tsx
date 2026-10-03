import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import { LibraryFilesPanel } from './LibraryFilesPanel';
import { StatefulAssetSlot } from './StatefulAssetSlot';

vi.mock('@/lib/audio/decode-waveform-peaks', () => ({
  decodeWaveformPeaks: vi
    .fn()
    .mockResolvedValue({ peaks: [0.4, 0.8], durationMs: 120_000 }),
  isAudioPreviewError: () => false,
}));

const baseSlot = {
  cardinality: 'single' as const,
  acquireMode: 'file' as const,
  testIdPrefix: 'library-artwork',
  objectTitle: 'Artwork',
  acquireLabel: 'Drop artwork',
  accept: 'image/jpeg',
};

describe('StatefulAssetSlot', () => {
  it('shows a drop zone only when the single-file slot is empty', () => {
    render(
      <StatefulAssetSlot
        kind='artwork'
        occupancy='empty'
        {...baseSlot}
        onFile={vi.fn()}
      />
    );
    expect(screen.getByTestId('library-artwork-dropzone')).toBeInTheDocument();
    expect(screen.queryByTestId('library-artwork-object')).toBeNull();
  });

  it('renders populated object UI with secondary replace and no drop zone', () => {
    const onFile = vi.fn();
    render(
      <StatefulAssetSlot
        kind='artwork'
        occupancy='populated'
        {...baseSlot}
        previewSrc='https://cdn.example.com/art.jpg'
        onFile={onFile}
      />
    );
    expect(screen.queryByTestId('library-artwork-dropzone')).toBeNull();
    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Replace'), {
      target: {
        files: [new File(['art'], 'cover.jpg', { type: 'image/jpeg' })],
      },
    });
    expect(onFile).toHaveBeenCalledTimes(1);
  });

  it('keeps add secondary on populated stems', () => {
    render(
      <StatefulAssetSlot
        kind='stems'
        occupancy='populated'
        cardinality='multi'
        acquireMode='action'
        testIdPrefix='library-stems'
        objectTitle='2 stem files'
        acquireLabel='Add stems'
        addHref='/app/releases/release-1/downloads'
      />
    );
    expect(screen.queryByTestId('library-stems-dropzone')).toBeNull();
    expect(screen.getByTestId('library-stems-add')).toHaveAttribute(
      'href',
      '/app/releases/release-1/downloads'
    );
  });
});

describe('LibraryFilesPanel', () => {
  const asset = (overrides: Partial<LibraryReleaseAsset> = {}) =>
    ({
      id: 'release-1',
      title: 'Take Me Over',
      artworkUrl: 'https://cdn.example.com/artwork.jpg',
      hasArtwork: true,
      ...overrides,
    }) as LibraryReleaseAsset;

  it('renders a flat list of real files and never empty media sections', () => {
    render(
      <LibraryFilesPanel
        asset={asset({ previewUrl: 'https://cdn.example.com/master.mp3' })}
        downloads={[
          {
            id: 'download-1',
            releaseId: 'release-1',
            title: 'Stem pack',
            fileName: 'stems.zip',
          },
        ]}
      />
    );

    const list = screen.getByTestId('library-files-list');
    expect(list).toHaveTextContent('master.mp3');
    expect(list).toHaveTextContent('Private recording');
    expect(list).toHaveTextContent('artwork.jpg');
    expect(list).toHaveTextContent('Published artwork');
    expect(list).toHaveTextContent('stems.zip');
    expect(list).toHaveTextContent('Restricted');
    expect(screen.queryByText('Video')).toBeNull();
    expect(screen.queryByText('Documents')).toBeNull();
    expect(screen.queryByText('Stems')).toBeNull();
  });

  it('collects acquisition behind one Add File section', () => {
    render(<LibraryFilesPanel asset={asset()} downloads={[]} />);

    expect(screen.getByText('Add File')).toBeInTheDocument();
    expect(screen.getByTestId('library-add-audio-acquisition')).toBeDefined();
    expect(screen.getByTestId('library-add-video-acquisition')).toHaveAttribute(
      'href',
      '/app/library?view=videos'
    );
    expect(
      screen.getByTestId('library-add-document-acquisition')
    ).toHaveAttribute('href', '/app/library?view=documents');
    expect(
      screen.getByTestId('library-add-download-acquisition')
    ).toHaveAttribute('href', '/app/releases/release-1/downloads');
  });

  it('opens focused file detail with a Back path', async () => {
    render(
      <LibraryFilesPanel
        asset={asset({ previewUrl: 'https://cdn.example.com/master.mp3' })}
        downloads={[]}
      />
    );

    fireEvent.click(screen.getByTestId('library-file-audio:release-1'));
    expect(screen.getByTestId('library-file-detail')).toBeInTheDocument();
    expect(screen.getByTestId('library-audio-ready')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('library-file-back'));
    expect(screen.getByTestId('library-files-list')).toBeInTheDocument();
  });

  it('keeps the audio upload dropzone behind the Add audio action', async () => {
    render(<LibraryFilesPanel asset={asset()} downloads={[]} />);
    expect(screen.queryByTestId('library-audio-dropzone')).toBeNull();

    fireEvent.click(screen.getByTestId('library-add-audio-acquisition'));
    expect(screen.getByTestId('library-audio-dropzone')).toBeInTheDocument();
  });

  it('keeps uploaded artwork in Files without refreshed asset props', async () => {
    const artworkUrl = 'https://cdn.example.com/uploaded.jpg';
    const upload = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ artworkUrl }));
    try {
      render(
        <LibraryFilesPanel
          asset={asset({ artworkUrl: null, hasArtwork: false })}
          downloads={[]}
        />
      );
      expect(screen.queryByTestId('library-artwork-dropzone')).toBeNull();
      fireEvent.click(screen.getByTestId('library-add-artwork-acquisition'));
      expect(
        screen.getByTestId('library-artwork-dropzone')
      ).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Drop artwork'), {
        target: {
          files: [new File(['art'], 'uploaded.jpg', { type: 'image/jpeg' })],
        },
      });
      await screen.findByTestId('library-artwork-object');
      expect(upload).toHaveBeenCalledWith(
        '/api/images/artwork/upload?releaseId=release-1',
        expect.objectContaining({ method: 'POST' })
      );
      fireEvent.click(screen.getByTestId('library-file-back'));
      const row = screen.getByTestId('library-file-artwork:release-1');
      expect(row).toHaveTextContent('uploaded.jpg');
      expect(
        screen.queryByTestId('library-add-artwork-acquisition')
      ).toBeNull();
      fireEvent.click(row);
      expect(screen.getByAltText('Artwork for Take Me Over')).toHaveAttribute(
        'src',
        artworkUrl
      );
    } finally {
      upload.mockRestore();
    }
  });
});
