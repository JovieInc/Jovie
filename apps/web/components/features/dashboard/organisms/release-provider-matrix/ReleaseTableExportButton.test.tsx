import { TooltipProvider } from '@jovie/ui';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ReleaseTableExportButton } from './ReleaseTableExportButton';

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
  generateTimestampedFilename: () => 'releases-2026-10-17.csv',
}));

function release(id: string, title: string): ReleaseViewModel {
  return {
    profileId: 'profile-1',
    id,
    title,
    slug: id,
    releaseType: 'single',
    isExplicit: false,
    releaseDate: '2026-01-01',
    totalTracks: 1,
    providers: [],
    smartLinkPath: `/${id}`,
  } as unknown as ReleaseViewModel;
}

const releases = [
  release('rel-1', 'Skyline Dreams'),
  release('rel-2', 'Seaside Heights'),
  release('rel-3', 'Night Drive'),
];

const readBlob = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

function renderButton(
  rows: ReleaseViewModel[],
  selectedIds = new Set<string>()
) {
  return render(
    <TooltipProvider>
      <ReleaseTableExportButton releases={rows} selectedIds={selectedIds} />
    </TooltipProvider>
  );
}

// These render full tables and Radix menus; a loaded CI runner needs more than
// the default five seconds.
vi.setConfig({ testTimeout: 20_000 });

describe('ReleaseTableExportButton certificate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exports every release when nothing is selected', async () => {
    const user = userEvent.setup();
    const { container } = renderButton(releases);

    const trigger = screen.getByRole('button', {
      name: 'Export data to CSV file',
    });
    await expectNoA11yViolations(container);

    await user.click(trigger);
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Confirm CSV export',
    });
    expect(dialog).toHaveTextContent('Rows3');
    await expectNoA11yViolations(dialog);

    await user.click(screen.getByRole('button', { name: 'Download CSV' }));
    await waitFor(() => expect(download).toHaveBeenCalledOnce());
    expect(download.mock.calls[0][1]).toBe('releases-2026-10-17.csv');
    const csv = await readBlob(download.mock.calls[0][0]);
    expect(csv.split('\n')[0]).toMatch(/^Title,Type,Release Date/);
    expect(csv).toContain('Skyline Dreams');
    expect(csv).toContain('Night Drive');
    expect(success).toHaveBeenCalledWith(
      'Exported 3 rows to releases-2026-10-17.csv'
    );
  });

  it('exports only the selected releases', async () => {
    const user = userEvent.setup();
    renderButton(releases, new Set(['rel-2']));

    await user.click(
      screen.getByRole('button', { name: 'Export data to CSV file' })
    );
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Rows1');
    await user.click(screen.getByRole('button', { name: 'Download CSV' }));
    await waitFor(() => expect(download).toHaveBeenCalledOnce());
    const csv = await readBlob(download.mock.calls[0][0]);
    expect(csv).toContain('Seaside Heights');
    expect(csv).not.toContain('Skyline Dreams');
  });

  it('cancels without downloading', async () => {
    const user = userEvent.setup();
    renderButton(releases);

    await user.click(
      screen.getByRole('button', { name: 'Export data to CSV file' })
    );
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(download).not.toHaveBeenCalled();
  });

  it('reports that there is nothing to export when the table is empty', async () => {
    const user = userEvent.setup();
    const { container } = renderButton([]);

    await user.click(
      screen.getByRole('button', { name: 'Export data to CSV file' })
    );
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith('No data available to export')
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(download).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });
});
