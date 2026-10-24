import { TooltipProvider } from '@jovie/ui';
import {
  act,
  fireEvent,
  render as renderComponent,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ComponentProps, ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudienceMember } from '@/types';
import { AudienceTableSubheader } from './AudienceTableSubheader';

const { download, success, error } = vi.hoisted(() => ({
  download: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@/components/organisms/table', async () => ({
  PageToolbar: ({
    start,
    end,
  }: {
    start: React.ReactNode;
    end: React.ReactNode;
  }) => (
    <div>
      {start}
      {end}
    </div>
  ),
  ExportCSVButton: (
    await import('@/components/organisms/table/molecules/ExportCSVButton')
  ).ExportCSVButton,
}));
vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({ success, error }),
}));
vi.mock('@/lib/utils/download', () => ({
  downloadCSVBlob: download,
  generateTimestampedFilename: () => 'export.csv',
}));
vi.mock('./AudienceFilterDropdown', () => ({
  AudienceFilterDropdown: () => null,
}));
vi.mock('./AudienceHeaderBadge', () => ({ AudienceHeaderBadge: () => null }));

const render = (ui: ReactElement) =>
  renderComponent(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <TooltipProvider>{children}</TooltipProvider>
    ),
  });

const profileId = '11111111-1111-4111-8111-111111111111';
const rowId = '22222222-2222-4222-8222-222222222222';
const staleRows = [
  { id: rowId, email: 'unconfirmed@example.com' },
] as AudienceMember[];
const eligible = [
  {
    id: rowId,
    email: 'consented@example.com',
    name: null,
    countryCode: null,
    consentedAt: '2026-10-17T00:00:00.000Z',
  },
];
const fetchMock = vi.fn();
const base = {
  view: 'all' as const,
  onViewChange: vi.fn(),
  filters: { segments: [] },
  onFiltersChange: vi.fn(),
  rows: staleRows,
  selectedIds: new Set([rowId]),
  subscriberCount: 1,
  total: 1,
};
const exportButton = () =>
  screen.getByRole('button', { name: 'Export data to CSV file' });
const response = (rows = eligible) => ({
  ok: true,
  json: async () => ({ rows }),
});
const readBlob = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

function renderSubscribers(
  overrides: Partial<ComponentProps<typeof AudienceTableSubheader>> = {}
) {
  return render(
    <AudienceTableSubheader
      {...base}
      mode='subscribers'
      profileId={profileId}
      {...overrides}
    />
  );
}

describe('subscriber export preparation', () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('revalidates selected subscribers on the server and downloads only its exact CSV', async () => {
    fetchMock.mockResolvedValue(response());
    renderSubscribers();
    fireEvent.click(exportButton());
    fireEvent.click(
      await screen.findByRole('button', { name: 'Download CSV' })
    );
    await waitFor(() => expect(download).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/dashboard/audience/subscribers',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ profileId, selectedIds: [rowId] }),
      })
    );
    expect(await readBlob(download.mock.calls[0][0])).toBe(
      'Name,Email,Country,Consented At\n,consented@example.com,,2026-10-17T00:00:00.000Z'
    );
  });

  it('does not fall back to loaded subscriber PII when server eligibility or billing fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Export requires a paid entitlement.' }),
    });
    renderSubscribers();
    fireEvent.click(exportButton());
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith('Export requires a paid entitlement.')
    );
    expect(download).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
  });

  it('disables subscriber export without an immutable profile binding', () => {
    renderSubscribers({ profileId: undefined });
    expect(exportButton()).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves the existing general audience export without a server request', async () => {
    renderSubscribers({ mode: 'members' });
    fireEvent.click(exportButton());
    fireEvent.click(
      await screen.findByRole('button', { name: 'Download CSV' })
    );
    await waitFor(() => expect(download).toHaveBeenCalledOnce());
    expect(await readBlob(download.mock.calls[0][0])).toContain(
      'unconfirmed@example.com'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      failure: 'network',
      reply: () => Promise.reject(new Error('Network unavailable')),
    },
    {
      failure: 'malformed JSON',
      reply: () =>
        Promise.resolve({
          ok: true,
          json: async () => {
            throw new Error('Invalid JSON');
          },
        }),
    },
    {
      failure: 'invalid server row',
      reply: () =>
        Promise.resolve({ ok: true, json: async () => ({ rows: staleRows }) }),
    },
    {
      failure: 'empty eligible list',
      reply: () => Promise.resolve(response([])),
    },
  ])('creates no file for $failure', async ({ reply }) => {
    fetchMock.mockImplementation(reply);
    renderSubscribers();
    fireEvent.click(exportButton());
    await waitFor(() => expect(error).toHaveBeenCalledOnce());
    expect(download).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
  });

  it('invalidates a prepared confirmation when the active profile changes', async () => {
    fetchMock.mockResolvedValue(response());
    const { rerender } = renderSubscribers();
    fireEvent.click(exportButton());
    await screen.findByRole('button', { name: 'Download CSV' });
    rerender(
      <AudienceTableSubheader {...base} mode='subscribers' profileId={rowId} />
    );
    expect(
      screen.queryByRole('button', { name: 'Download CSV' })
    ).not.toBeInTheDocument();
    expect(download).not.toHaveBeenCalled();
  });

  it('discards old-profile preparation that resolves after switching profiles', async () => {
    let resolveCheck!: (value: ReturnType<typeof response>) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<ReturnType<typeof response>>(resolve => {
          resolveCheck = resolve;
        })
    );
    const { rerender } = renderSubscribers();
    fireEvent.click(exportButton());
    rerender(
      <AudienceTableSubheader {...base} mode='subscribers' profileId={rowId} />
    );
    await act(async () => resolveCheck(response()));
    expect(
      screen.queryByRole('button', { name: 'Download CSV' })
    ).not.toBeInTheDocument();
    expect(download).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
  });
});
