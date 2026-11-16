import { TooltipProvider } from '@jovie/ui';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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
  generateTimestampedFilename: () => 'audience-2026-10-17.csv',
}));

const rows = [
  { name: 'Jamie Rivera', email: 'jamie@example.com', city: 'Los Angeles' },
];
const TRIGGER = 'Export CSV — Export data to CSV file';

describe('ExportCSVButton certificate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a busy, disabled trigger while rows are loading', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ExportCSVButton getData={() => new Promise<typeof rows>(() => {})} />
    );

    await user.click(screen.getByRole('button', { name: TRIGGER }));
    const busy = screen.getByRole('button', {
      name: 'Exporting... — Export data to CSV file',
    });
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(busy).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('reports an empty export and opens no confirmation', async () => {
    const user = userEvent.setup();
    const { container } = render(<ExportCSVButton getData={() => []} />);

    await user.click(screen.getByRole('button', { name: TRIGGER }));
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith('No data available to export')
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('button', { name: TRIGGER })).toBeEnabled();
    await expectNoA11yViolations(container);
  });

  it.each([
    [new Error('Audience service unavailable'), 'Audience service unavailable'],
    [new TypeError('Failed to fetch'), 'Failed to fetch'],
    ['offline', 'Failed to prepare CSV export'],
  ])('reports a failed preparation (%s)', async (reason, message) => {
    const user = userEvent.setup();
    render(<ExportCSVButton getData={() => Promise.reject(reason)} />);

    await user.click(screen.getByRole('button', { name: TRIGGER }));
    await waitFor(() => expect(error).toHaveBeenCalledWith(message));
    expect(screen.getByRole('button', { name: TRIGGER })).toBeEnabled();
  });

  it('confirms inferred columns, downloads once and reports success', async () => {
    const user = userEvent.setup();
    const getData = vi.fn().mockResolvedValue(rows);
    const { baseElement } = render(
      <ExportCSVButton getData={getData} filename='audience' />
    );

    await user.click(screen.getByRole('button', { name: TRIGGER }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Rows1');
    expect(dialog).toHaveTextContent('Columns3');
    await expectNoA11yViolations(baseElement);

    await user.click(screen.getByRole('button', { name: 'Download CSV' }));
    await waitFor(() => expect(download).toHaveBeenCalledOnce());
    expect(download.mock.calls[0][1]).toBe('audience-2026-10-17.csv');
    expect(success).toHaveBeenCalledWith(
      'Exported 1 rows to audience-2026-10-17.csv'
    );
    expect(getData).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('does nothing while disabled', async () => {
    const user = userEvent.setup();
    const getData = vi.fn().mockReturnValue(rows);
    const { container } = render(
      <ExportCSVButton getData={getData} disabled />
    );

    const trigger = screen.getByRole('button', { name: TRIGGER });
    expect(trigger).toBeDisabled();
    await user.click(trigger);
    expect(getData).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('names an icon-only toolbar action by its aria label', async () => {
    const { container } = render(
      <TooltipProvider delayDuration={0}>
        <ExportCSVButton
          getData={() => rows}
          iconOnly
          chrome='page-toolbar'
          tooltipLabel='Export CSV'
          ariaLabel='Export audience'
        />
      </TooltipProvider>
    );

    expect(
      screen.getByRole('button', { name: 'Export audience' })
    ).toBeInTheDocument();
    expect(screen.getByText('Export CSV')).toHaveClass('sr-only');
    await expectNoA11yViolations(container);
  });

  it('keeps a long RTL label readable', async () => {
    const { container } = render(
      <div dir='rtl'>
        <ExportCSVButton
          getData={() => rows}
          label='تصدير كل المشتركين مع الموقع'
          ariaLabel='تصدير البيانات'
        />
      </div>
    );

    expect(
      screen.getByRole('button', {
        name: 'تصدير كل المشتركين مع الموقع — تصدير البيانات',
      })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
