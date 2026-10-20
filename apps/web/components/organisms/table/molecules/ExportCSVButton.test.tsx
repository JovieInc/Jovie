import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExportCSVButton } from './ExportCSVButton';

const { download, success, error } = vi.hoisted(() => ({
  download: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({ success, error }),
}));
vi.mock('@/lib/utils/download', () => ({
  downloadCSVBlob: download,
  generateTimestampedFilename: () => 'subscribers-2026-10-17.csv',
}));

const columns = [
  { header: 'Name', accessor: 'name' as const },
  { header: 'Email', accessor: 'email' as const },
];
const oldRows = [{ name: 'Old consent', email: 'old@example.com' }];
const readBlob = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

describe('ExportCSVButton confirmation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('preserves the existing unprotected export and downloads its actual CSV once', async () => {
    const getData = vi.fn().mockResolvedValue(oldRows);
    render(<ExportCSVButton getData={getData} columns={columns} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Export data to CSV file' })
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Download CSV' })
    );
    await waitFor(() => expect(download).toHaveBeenCalledOnce());
    expect(getData).toHaveBeenCalledOnce();
    expect(await readBlob(download.mock.calls[0][0])).toBe(
      'Name,Email\nOld consent,old@example.com'
    );
    expect(success).toHaveBeenCalledWith(
      'Exported 1 rows to subscribers-2026-10-17.csv'
    );
  });

  it('checks again at download and serializes only the fresh server result with correct CSV escaping', async () => {
    const getData = vi
      .fn()
      .mockResolvedValueOnce(oldRows)
      .mockResolvedValueOnce([
        { name: 'Zoë, "Live"\nArtist', email: 'fresh@example.com' },
      ]);
    render(
      <ExportCSVButton
        getData={getData}
        columns={columns}
        revalidateBeforeDownload
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Export data to CSV file' })
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Download CSV' })
    );
    await waitFor(() => expect(download).toHaveBeenCalledOnce());
    expect(getData).toHaveBeenCalledTimes(2);
    const csv = await readBlob(download.mock.calls[0][0]);
    expect(csv).toBe('Name,Email\n"Zoë, ""Live""\nArtist",fresh@example.com');
    expect(csv).not.toContain('old@example.com');
  });

  it.each([
    { reason: 'revoked consent', result: [] },
    {
      reason: 'revoked entitlement',
      result: new Error('Export requires a paid entitlement.'),
    },
    {
      reason: 'expired session or network failure',
      result: new Error('Could not verify export authority.'),
    },
  ])(
    'creates no file when $reason changes with confirmation open',
    async ({ result }) => {
      const getData = vi.fn().mockResolvedValueOnce(oldRows);
      if (result instanceof Error) getData.mockRejectedValueOnce(result);
      else getData.mockResolvedValueOnce(result);
      render(
        <ExportCSVButton
          getData={getData}
          columns={columns}
          revalidateBeforeDownload
        />
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Export data to CSV file' })
      );
      fireEvent.click(
        await screen.findByRole('button', { name: 'Download CSV' })
      );
      await waitFor(() => expect(error).toHaveBeenCalledOnce());
      expect(getData).toHaveBeenCalledTimes(2);
      expect(download).not.toHaveBeenCalled();
      expect(success).not.toHaveBeenCalled();
    }
  );

  it('cancels without a download or a second request', async () => {
    const getData = vi.fn().mockResolvedValue(oldRows);
    render(<ExportCSVButton getData={getData} revalidateBeforeDownload />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Export data to CSV file' })
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(
      screen.queryByRole('button', { name: 'Download CSV' })
    ).not.toBeInTheDocument();
    expect(getData).toHaveBeenCalledOnce();
    expect(download).not.toHaveBeenCalled();
  });

  it.each(['Cancel', 'Escape'] as const)(
    'restores initiating focus after %s and allows keyboard reopening',
    async dismissal => {
      const user = userEvent.setup();
      const getData = vi.fn().mockResolvedValue(oldRows);
      render(<ExportCSVButton getData={getData} revalidateBeforeDownload />);
      const origin = screen.getByRole('button', {
        name: 'Export data to CSV file',
      });
      await user.tab();
      expect(origin).toHaveFocus();
      await user.keyboard('{Enter}');
      const dialog = await screen.findByRole('alertdialog', {
        name: 'Confirm CSV export',
      });
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
      if (dismissal === 'Cancel')
        await user.click(screen.getByRole('button', { name: 'Cancel' }));
      else await user.keyboard('{Escape}');
      await waitFor(() => expect(dialog).not.toBeInTheDocument());
      expect(origin).toBeEnabled();
      await waitFor(() => expect(origin).toHaveFocus());
      expect(document.body).not.toHaveFocus();
      expect(getData).toHaveBeenCalledOnce();
      expect(download).not.toHaveBeenCalled();
      await user.keyboard('{Enter}');
      expect(
        await screen.findByRole('alertdialog', { name: 'Confirm CSV export' })
      ).toBeVisible();
      expect(getData).toHaveBeenCalledTimes(2);
      expect(download).not.toHaveBeenCalled();
    }
  );

  it('restores initiating focus after a protected download and permits keyboard reopening', async () => {
    const user = userEvent.setup();
    let resolveCheck!: (rows: typeof oldRows) => void;
    const getData = vi
      .fn()
      .mockResolvedValueOnce(oldRows)
      .mockImplementationOnce(
        () =>
          new Promise<typeof oldRows>(resolve => {
            resolveCheck = resolve;
          })
      )
      .mockResolvedValueOnce(oldRows);
    render(
      <ExportCSVButton
        getData={getData}
        columns={columns}
        revalidateBeforeDownload
      />
    );
    const origin = screen.getByRole('button', {
      name: 'Export data to CSV file',
    });
    await user.tab();
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Confirm CSV export',
    });
    await user.click(screen.getByRole('button', { name: 'Download CSV' }));
    expect(download).not.toHaveBeenCalled();
    await act(async () => resolveCheck(oldRows));
    await waitFor(() => expect(download).toHaveBeenCalledOnce());
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(origin).toBeEnabled();
    await waitFor(() => expect(origin).toHaveFocus());
    expect(document.body).not.toHaveFocus();
    expect(getData).toHaveBeenCalledTimes(2);
    expect(await readBlob(download.mock.calls[0][0])).toBe(
      'Name,Email\nOld consent,old@example.com'
    );
    await user.keyboard('{Enter}');
    expect(
      await screen.findByRole('alertdialog', { name: 'Confirm CSV export' })
    ).toBeVisible();
    expect(getData).toHaveBeenCalledTimes(3);
    expect(download).toHaveBeenCalledOnce();
  });

  it('keeps confirmation during a delayed authority check and permits a fresh retry after denial', async () => {
    const user = userEvent.setup();
    let rejectCheck!: (reason: Error) => void;
    const freshRows = [{ name: 'Fresh consent', email: 'fresh@example.com' }];
    const getData = vi
      .fn()
      .mockResolvedValueOnce(oldRows)
      .mockImplementationOnce(
        () =>
          new Promise<typeof oldRows>((_, reject) => {
            rejectCheck = reject;
          })
      )
      .mockResolvedValueOnce(freshRows);
    render(
      <ExportCSVButton
        getData={getData}
        columns={columns}
        revalidateBeforeDownload
      />
    );
    const origin = screen.getByRole('button', {
      name: 'Export data to CSV file',
    });
    await user.tab();
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Confirm CSV export',
    });
    await user.click(screen.getByRole('button', { name: 'Download CSV' }));
    expect(dialog).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exporting...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    // The named review remains the focus target while both actions are unavailable.
    await waitFor(() => expect(dialog).toHaveFocus());
    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.tab({ shift: true });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard('{Escape}');
    expect(dialog).toBeVisible();
    expect(download).not.toHaveBeenCalled();
    expect(getData).toHaveBeenCalledTimes(2);
    await act(async () =>
      rejectCheck(new Error('Could not verify export authority.'))
    );
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith('Could not verify export authority.')
    );
    expect(dialog).toBeVisible();
    const retry = screen.getByRole('button', { name: 'Download CSV' });
    expect(retry).toBeEnabled();
    expect(download).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    await user.click(retry);
    await waitFor(() => expect(download).toHaveBeenCalledOnce());
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await waitFor(() => expect(origin).toHaveFocus());
    expect(getData).toHaveBeenCalledTimes(3);
    const csv = await readBlob(download.mock.calls[0][0]);
    expect(csv).toBe('Name,Email\nFresh consent,fresh@example.com');
    expect(csv).not.toContain('old@example.com');
  });

  it('prevents a second download while the authority recheck is pending', async () => {
    let resolveCheck!: (rows: typeof oldRows) => void;
    const getData = vi
      .fn()
      .mockResolvedValueOnce(oldRows)
      .mockImplementationOnce(
        () =>
          new Promise<typeof oldRows>(resolve => {
            resolveCheck = resolve;
          })
      );
    render(
      <ExportCSVButton
        getData={getData}
        columns={columns}
        revalidateBeforeDownload
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Export data to CSV file' })
    );
    const confirm = await screen.findByRole('button', { name: 'Download CSV' });
    fireEvent.click(confirm);
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(getData).toHaveBeenCalledTimes(2);
    expect(download).not.toHaveBeenCalled();
    resolveCheck(oldRows);
    await waitFor(() => expect(download).toHaveBeenCalledOnce());
  });

  it('discards a pending download when the bound profile is replaced', async () => {
    let resolveCheck!: (rows: typeof oldRows) => void;
    const getData = vi
      .fn()
      .mockResolvedValueOnce(oldRows)
      .mockImplementationOnce(
        () =>
          new Promise<typeof oldRows>(resolve => {
            resolveCheck = resolve;
          })
      );
    const { rerender } = render(
      <ExportCSVButton
        key='profile-a'
        getData={getData}
        revalidateBeforeDownload
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Export data to CSV file' })
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Download CSV' })
    );
    rerender(
      <ExportCSVButton
        key='profile-b'
        getData={() => []}
        revalidateBeforeDownload
      />
    );
    await act(async () => resolveCheck(oldRows));
    expect(
      screen.queryByRole('button', { name: 'Download CSV' })
    ).not.toBeInTheDocument();
    expect(download).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
