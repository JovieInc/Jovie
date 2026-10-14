import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    expect(screen.queryByTestId('library-add-download-acquisition')).toBeNull();
    expect(screen.queryByText('Video')).toBeNull();
    expect(screen.queryByText('Documents')).toBeNull();
    expect(screen.queryByText('Stems')).toBeNull();
  });

  it('offers ONE Attach File control instead of a button per media type', () => {
    render(<LibraryFilesPanel asset={asset()} downloads={[]} />);

    const attach = screen.getByTestId('library-attach-file');
    expect(attach).toHaveTextContent('Attach File');
    expect(attach).toHaveAttribute('aria-keyshortcuts', 'Meta+U');
    expect(screen.queryByText('Add File')).toBeNull();
    expect(screen.queryByTestId('library-add-audio-acquisition')).toBeNull();
    expect(screen.queryByTestId('library-add-video-acquisition')).toBeNull();
    expect(screen.queryByText('No files attached yet.')).toBeNull();
    expect(screen.getByTestId('library-attach-file-input')).not.toHaveAttribute(
      'accept'
    );
  });

  it('opens the picker once when the inspector requests attach (Cmd+U)', () => {
    const click = vi
      .spyOn(HTMLInputElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const onHandled = vi.fn();
    try {
      render(
        <LibraryFilesPanel
          asset={asset()}
          downloads={[]}
          attachRequested
          onAttachRequestHandled={onHandled}
        />
      );
      expect(click).toHaveBeenCalledTimes(1);
      expect(onHandled).toHaveBeenCalledTimes(1);
    } finally {
      click.mockRestore();
    }
  });

  it('routes a dropped audio file to the audio upload without a type button', () => {
    const upload = vi
      .spyOn(globalThis, 'fetch')
      .mockReturnValue(new Promise<Response>(() => undefined));
    try {
      render(<LibraryFilesPanel asset={asset()} downloads={[]} />);
      const file = new File(['audio'], 'master.mp3', { type: 'audio/mpeg' });

      fireEvent.drop(screen.getByTestId('library-files-panel'), {
        dataTransfer: { files: [file], types: ['Files'] },
      });

      expect(screen.getByTestId('library-file-detail')).toBeInTheDocument();
      expect(screen.getByTestId('library-audio-dropzone')).toBeInTheDocument();
    } finally {
      upload.mockRestore();
    }
  });

  it('attaches a pasted image as artwork and shows it attaching in place', () => {
    const upload = vi
      .spyOn(globalThis, 'fetch')
      .mockReturnValue(new Promise<Response>(() => undefined));
    try {
      render(
        <LibraryFilesPanel
          asset={asset({ artworkUrl: null, hasArtwork: false })}
          downloads={[]}
        />
      );
      const paste = new Event('paste', { bubbles: true }) as ClipboardEvent;
      Object.defineProperty(paste, 'clipboardData', {
        value: {
          files: [new File(['art'], 'cover.png', { type: 'image/png' })],
        },
      });
      document.body.dispatchEvent(paste);

      expect(upload).toHaveBeenCalledWith(
        '/api/images/artwork/upload?releaseId=release-1',
        expect.objectContaining({ method: 'POST' })
      );
    } finally {
      upload.mockRestore();
    }
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

  it.each([false, true])(
    'keeps uploads bound to their work when switching during upload: %s',
    async switchWork => {
      const artworkUrl = 'https://cdn.example.com/uploaded.jpg';
      const emptyAsset = asset({ artworkUrl: null, hasArtwork: false });
      const response = Promise.withResolvers<Response>();
      const onArtworkUploaded = vi.fn();
      const upload = vi
        .spyOn(globalThis, 'fetch')
        .mockReturnValue(response.promise);
      try {
        const { rerender } = render(
          <LibraryFilesPanel
            asset={emptyAsset}
            downloads={[]}
            onArtworkUploaded={onArtworkUploaded}
          />
        );
        expect(screen.queryByTestId('library-artwork-dropzone')).toBeNull();
        fireEvent.change(screen.getByTestId('library-attach-file-input'), {
          target: {
            files: [new File(['art'], 'uploaded.jpg', { type: 'image/jpeg' })],
          },
        });
        expect(
          screen.getByTestId('library-attach-uploading')
        ).toHaveTextContent('Attaching uploaded.jpg');
        if (switchWork)
          rerender(
            <LibraryFilesPanel
              asset={{ ...emptyAsset, id: 'release-2' }}
              downloads={[]}
            />
          );
        response.resolve(Response.json({ artworkUrl }));
        await waitFor(() =>
          expect(onArtworkUploaded.mock.calls).toEqual([
            ['release-1', artworkUrl],
          ])
        );
        if (switchWork) {
          expect(screen.queryByText('uploaded.jpg')).toBeNull();
          expect(
            screen.queryByTestId('library-file-artwork:release-2')
          ).toBeNull();
          return;
        }
        expect(upload).toHaveBeenCalledWith(
          '/api/images/artwork/upload?releaseId=release-1',
          expect.objectContaining({ method: 'POST' })
        );
        const row = await screen.findByTestId('library-file-artwork:release-1');
        expect(row).toHaveTextContent('uploaded.jpg');
        expect(screen.queryByTestId('library-attach-uploading')).toBeNull();
        fireEvent.click(row);
        expect(screen.getByAltText('Artwork for Take Me Over')).toHaveAttribute(
          'src',
          artworkUrl
        );
      } finally {
        upload.mockRestore();
      }
    }
  );
});
