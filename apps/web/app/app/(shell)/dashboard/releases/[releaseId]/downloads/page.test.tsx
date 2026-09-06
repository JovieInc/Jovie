import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROMO_DOWNLOAD_RIGHTS_ATTESTATION_LABEL,
  PROMO_DOWNLOAD_RIGHTS_REQUIRED_ERROR,
} from '@/lib/promo-downloads/rights-attestation';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  upload: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ releaseId: 'release-1' }),
}));
vi.mock('@/hooks/useJovieAuth', () => ({
  useAuthSafe: () => ({ userId: 'user-1' }),
}));
vi.mock('@vercel/blob/client', () => ({ uploadPresigned: mocks.upload }));

import PromoDownloadsPage from './page';

const emptyListResponse = {
  ok: true,
  json: vi.fn().mockResolvedValue({ files: [] }),
};

const promoDownload = {
  id: 'download-1',
  title: 'radio-edit',
  fileName: 'radio-edit.mp3',
  fileMimeType: 'audio/mpeg',
  fileSizeBytes: 1_024,
  isActive: true,
  position: 1,
};

function attestRecordingControl() {
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: PROMO_DOWNLOAD_RIGHTS_ATTESTATION_LABEL,
    })
  );
}

describe('PromoDownloadsPage', () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.upload.mockReset();
    vi.stubGlobal('fetch', mocks.fetch);
  });

  it('loads the release-scoped list into the canonical page and table states', async () => {
    mocks.fetch.mockResolvedValueOnce(emptyListResponse);

    render(<PromoDownloadsPage />);

    expect(screen.getByTestId('release-downloads-shell')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Promo downloads' })
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledWith(
        '/api/promo-downloads/confirm?releaseId=release-1&list=true'
      );
    });
    expect(await screen.findByText('No Downloads Yet')).toBeInTheDocument();
  });

  it('uploads a supported file and appends the confirmed download', async () => {
    mocks.fetch.mockResolvedValueOnce(emptyListResponse).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        promoDownload,
      }),
    });
    mocks.upload.mockResolvedValue({
      url: 'https://blob.example/radio-edit.mp3',
      pathname: 'promo-downloads/user-1/radio-edit.mp3',
    });

    render(<PromoDownloadsPage />);
    await screen.findByText('No Downloads Yet');
    attestRecordingControl();

    const file = new File(['audio'], 'radio-edit.mp3', {
      type: 'audio/mpeg',
    });
    fireEvent.change(
      screen.getByLabelText('Upload Promo Download Audio File'),
      { target: { files: [file] } }
    );

    expect(await screen.findByText('radio-edit')).toBeInTheDocument();
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.stringContaining('radio-edit.mp3'),
      file,
      expect.objectContaining({
        access: 'public',
        handleUploadUrl: '/api/promo-downloads/upload-token',
        contentType: 'audio/mpeg',
      })
    );
    expect(mocks.fetch).toHaveBeenLastCalledWith(
      '/api/promo-downloads/confirm',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('rejects unsupported files before blob upload', async () => {
    mocks.fetch.mockResolvedValueOnce(emptyListResponse);

    render(<PromoDownloadsPage />);
    await screen.findByText('No Downloads Yet');
    attestRecordingControl();

    fireEvent.change(
      screen.getByLabelText('Upload Promo Download Audio File'),
      {
        target: {
          files: [new File(['text'], 'notes.txt', { type: 'text/plain' })],
        },
      }
    );

    expect(
      await screen.findByText(/Invalid file type\. Supported:/)
    ).toBeInTheDocument();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('requires recording-control attestation before opening the file picker', async () => {
    mocks.fetch.mockResolvedValueOnce(emptyListResponse);

    render(<PromoDownloadsPage />);
    await screen.findByText('No Downloads Yet');

    fireEvent.change(
      screen.getByLabelText('Upload Promo Download Audio File'),
      {
        target: {
          files: [
            new File(['audio'], 'radio-edit.mp3', { type: 'audio/mpeg' }),
          ],
        },
      }
    );

    expect(
      await screen.findByText(PROMO_DOWNLOAD_RIGHTS_REQUIRED_ERROR)
    ).toBeInTheDocument();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('updates visibility and deletes the release-scoped row', async () => {
    mocks.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ files: [promoDownload] }),
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });

    render(<PromoDownloadsPage />);

    fireEvent.click(
      await screen.findByRole('switch', {
        name: 'Toggle radio-edit visibility',
      })
    );
    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledWith(
        '/api/promo-downloads/download-1',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: false }),
        }
      );
    });
    expect(screen.getByText('Hidden')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete radio-edit' }));
    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledWith(
        '/api/promo-downloads/download-1',
        {
          method: 'DELETE',
        }
      );
    });
    expect(await screen.findByText('No Downloads Yet')).toBeInTheDocument();
  });

  it('surfaces list and mutation failures in stable live regions', async () => {
    mocks.fetch.mockResolvedValueOnce({ ok: false });
    const firstRender = render(<PromoDownloadsPage />);

    expect(
      await screen.findByText('Unable to load promo downloads right now.')
    ).toBeInTheDocument();
    firstRender.unmount();

    mocks.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ files: [promoDownload] }),
      })
      .mockResolvedValueOnce({ ok: false });
    render(<PromoDownloadsPage />);

    fireEvent.click(
      await screen.findByRole('switch', {
        name: 'Toggle radio-edit visibility',
      })
    );
    expect(
      await screen.findByText(
        'Unable to update file visibility. Please try again.'
      )
    ).toBeInTheDocument();
  });
});
