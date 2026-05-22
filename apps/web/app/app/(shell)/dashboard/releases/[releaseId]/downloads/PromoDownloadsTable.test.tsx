import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PromoDownloadsTable } from './PromoDownloadsTable';

describe('PromoDownloadsTable', () => {
  it('reserves table space while files are loading', () => {
    const { container } = render(
      <PromoDownloadsTable
        loaded={false}
        files={[]}
        onToggleActive={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(container.firstElementChild).toHaveClass('min-h-[220px]');
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders shared table rows for promo downloads', () => {
    const onToggleActive = vi.fn();
    const onDelete = vi.fn();

    render(
      <PromoDownloadsTable
        loaded={true}
        files={[
          {
            id: 'download_1',
            title: 'Radio Edit',
            fileName: 'radio-edit.mp3',
            fileMimeType: 'audio/mpeg',
            fileSizeBytes: 2_048_000,
            isActive: true,
            position: 1,
          },
          {
            id: 'download_2',
            title: 'Instrumental',
            fileName: 'instrumental.wav',
            fileMimeType: 'audio/wav',
            fileSizeBytes: null,
            isActive: false,
            position: 2,
          },
        ]}
        onToggleActive={onToggleActive}
        onDelete={onDelete}
      />
    );

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'File' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Status' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Actions' })
    ).toBeInTheDocument();

    expect(screen.getByText('Radio Edit')).toBeInTheDocument();
    expect(screen.getByText('MP3 · 2.0 MB')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Active' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete Radio Edit' })
    ).toBeInTheDocument();

    expect(screen.getByText('Instrumental')).toBeInTheDocument();
    expect(screen.getByText('WAV')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hidden' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Active' }));
    expect(onToggleActive).toHaveBeenCalledWith('download_1', false);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Radio Edit' }));
    expect(onDelete).toHaveBeenCalledWith('download_1');

    fireEvent.click(screen.getByRole('button', { name: 'Hidden' }));
    expect(onToggleActive).toHaveBeenCalledWith('download_2', true);
  });

  it('renders the shared empty state after loading with no files', () => {
    render(
      <PromoDownloadsTable
        loaded={true}
        files={[]}
        onToggleActive={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText('No Downloads Yet')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Upload audio files to create an email-gated download page for this release.'
      )
    ).toBeInTheDocument();
  });
});
