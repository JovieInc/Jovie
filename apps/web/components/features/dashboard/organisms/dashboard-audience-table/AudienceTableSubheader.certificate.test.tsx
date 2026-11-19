import { TooltipProvider } from '@jovie/ui';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AudienceTableSubheader } from './AudienceTableSubheader';

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
  generateTimestampedFilename: () => 'export.csv',
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/app/contacts',
  useSearchParams: () => new URLSearchParams(),
}));

const profileId = '11111111-1111-4111-8111-111111111111';
const fetchMock = vi.fn();

function renderSubheader(
  overrides: Partial<ComponentProps<typeof AudienceTableSubheader>> = {},
  dir?: 'rtl'
) {
  const onViewChange = vi.fn();
  const onFiltersChange = vi.fn();
  const view = render(
    <TooltipProvider>
      <div dir={dir}>
        <AudienceTableSubheader
          mode='subscribers'
          profileId={profileId}
          view='all'
          onViewChange={onViewChange}
          filters={{ segments: [] }}
          onFiltersChange={onFiltersChange}
          rows={[]}
          selectedIds={new Set()}
          subscriberCount={120}
          total={482}
          {...overrides}
        />
      </div>
    </TooltipProvider>
  );
  return { ...view, onViewChange, onFiltersChange };
}

const exportButton = () =>
  screen.getByRole('button', { name: 'Export data to CSV file' });

describe('AudienceTableSubheader certificate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('switches audience views and keeps the toolbar axe-clean', async () => {
    const user = userEvent.setup();
    const { container, onViewChange } = renderSubheader({
      totalAudienceCount: 482,
    });

    expect(screen.getAllByRole('tablist')).toHaveLength(1);
    const trigger = screen.getByRole('button', {
      name: 'Identity: All People',
    });
    expect(trigger).not.toHaveTextContent('482');
    await user.click(trigger);
    await user.click(
      screen.getByRole('menuitemradio', { name: 'Identified (120)' })
    );
    expect(onViewChange).toHaveBeenCalledWith('identified');
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('reports the server error when the export is denied', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Export requires a paid entitlement.' }),
    });
    const { container } = renderSubheader();

    await user.click(exportButton());

    await waitFor(() =>
      expect(error).toHaveBeenCalledWith('Export requires a paid entitlement.')
    );
    expect(download).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('disables export for an empty audience and without a profile', async () => {
    const empty = renderSubheader({ subscriberCount: 0, total: 0 });
    expect(exportButton()).toBeDisabled();
    await expectNoA11yViolations(empty.container);
    empty.unmount();

    renderSubheader({ profileId: undefined });
    expect(exportButton()).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders long counts inside an RTL document', async () => {
    const user = userEvent.setup();
    const { container } = renderSubheader(
      {
        subscriberCount: 2_345_678,
        total: 12_345_678,
        totalAudienceCount: 12_345_678,
      },
      'rtl'
    );
    const trigger = screen.getByRole('button', {
      name: 'Identity: All People',
    });
    expect(trigger).not.toHaveTextContent('12,345,678');
    await user.click(trigger);
    expect(
      screen.getByRole('menuitemradio', { name: 'All People (12,345,678)' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
