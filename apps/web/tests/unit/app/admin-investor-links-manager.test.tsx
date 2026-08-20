import { TooltipProvider } from '@jovie/ui';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock('@/components/feedback', () => ({ toast: toastMocks }));

vi.mock('@/components/atoms/table-action-menu/TableActionMenu', () => ({
  TableActionMenu: ({
    items,
  }: {
    items: ReadonlyArray<{
      id: string;
      label: string;
      onClick?: () => void;
    }>;
  }) => (
    <div>
      {items
        .filter(item => item.id !== 'separator')
        .map(item => (
          <button key={item.id} type='button' onClick={item.onClick}>
            {item.label}
          </button>
        ))}
    </div>
  ),
}));

import { InvestorLinksManager } from '@/app/app/(shell)/admin/investors/links/InvestorLinksManager';

const investorLink = {
  id: 'link-1',
  token: 'token-1',
  label: 'Seed Round',
  investorName: 'Acme Ventures',
  email: 'partner@acme.test',
  stage: 'engaged',
  engagementScore: 61,
  notes: null,
  isActive: true,
  expiresAt: null,
  lastEmailSentAt: null,
  emailSequenceStep: 0,
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-02T00:00:00Z',
  viewCount: 4,
  lastViewed: '2026-08-17T12:00:00Z',
};

describe('InvestorLinksManager', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders supplied review state without a network request', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <TooltipProvider>
        <InvestorLinksManager
          initialLinks={[
            {
              ...investorLink,
              createdAt: new Date(investorLink.createdAt),
              updatedAt: new Date(investorLink.updatedAt),
            },
          ]}
        />
      </TooltipProvider>
    );

    expect(screen.getByText('Seed Round')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads investor links into the canonical management table', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        links: [investorLink],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <TooltipProvider>
        <InvestorLinksManager />
      </TooltipProvider>
    );

    const table = await screen.findByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map(header => header.textContent)
    ).toEqual(['Label', 'Investor', 'Stage', 'Status', 'Created', 'Actions']);
    expect(screen.getByText('Seed Round')).toBeInTheDocument();
    expect(screen.getByText('Acme Ventures')).toBeInTheDocument();
    expect(screen.getByText('Engaged')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/investors/links');
  });

  it('renders canonical empty and recoverable error states', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ links: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <TooltipProvider>
        <InvestorLinksManager />
      </TooltipProvider>
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Could not load investor links',
      })
    ).toBeInTheDocument();
    screen.getByRole('button', { name: 'Retry' }).click();
    expect(
      await screen.findByRole('heading', { name: 'No investor links yet' })
    ).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('creates a personalized link and adds it to the table', async () => {
    const createdLink = {
      ...investorLink,
      id: 'link-2',
      token: 'token-2',
      label: 'Series A',
      investorName: 'Northstar Capital',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ links: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ link: createdLink }),
      });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <TooltipProvider>
        <InvestorLinksManager />
      </TooltipProvider>
    );

    await screen.findByRole('heading', { name: 'No investor links yet' });
    fireEvent.click(screen.getByRole('button', { name: 'Create Link' }));

    const dialog = screen.getByRole('dialog');
    fireEvent.change(
      within(dialog).getByPlaceholderText('E.g., Sequoia Scout Fund'),
      {
        target: { value: '  Series A  ' },
      }
    );
    fireEvent.change(
      within(dialog).getByPlaceholderText('E.g., Michael Seibel'),
      {
        target: { value: ' Northstar Capital ' },
      }
    );
    fireEvent.change(within(dialog).getByPlaceholderText('Investor@fund.com'), {
      target: { value: ' partner@northstar.test ' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Create Link' })
    );

    expect(await within(dialog).findByText('Link Created')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/admin/investors/links',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          label: 'Series A',
          investorName: 'Northstar Capital',
          email: 'partner@northstar.test',
        }),
      })
    );

    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(await screen.findByText('Series A')).toBeInTheDocument();
    expect(screen.getByText('Northstar Capital')).toBeInTheDocument();
  });

  it('copies, deactivates, and deletes an investor link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      'navigator',
      Object.assign(Object.create(navigator), {
        clipboard: { writeText },
      })
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ links: [investorLink] }),
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <TooltipProvider>
        <InvestorLinksManager />
      </TooltipProvider>
    );

    await screen.findByText('Seed Round');
    fireEvent.click(screen.getByRole('button', { name: 'Copy shareable URL' }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('token-1'))
    );

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    await waitFor(() =>
      expect(screen.getByText('Disabled')).toBeInTheDocument()
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/admin/investors/links/link-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ isActive: false }),
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const confirmDialog = screen.getByRole('dialog', {
      name: 'Delete investor link?',
    });
    expect(
      within(confirmDialog).getByText('Delete investor link?')
    ).toBeInTheDocument();
    fireEvent.click(
      within(confirmDialog).getByRole('button', { name: 'Delete' })
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenNthCalledWith(
        3,
        '/api/admin/investors/links/link-1',
        { method: 'DELETE' }
      )
    );
    expect(toastMocks.success).toHaveBeenCalledWith('Investor link deleted');
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('rolls back failed mutations and keeps the recovery feedback local', async () => {
    let resolvePatch!: (response: { ok: boolean }) => void;
    const pendingPatch = new Promise<{ ok: boolean }>(resolve => {
      resolvePatch = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ links: [investorLink] }),
      })
      .mockReturnValueOnce(pendingPatch)
      .mockResolvedValueOnce({ ok: false });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <TooltipProvider>
        <InvestorLinksManager />
      </TooltipProvider>
    );

    await screen.findByText('Seed Round');
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    expect(await screen.findByText('Disabled')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/admin/investors/links/link-1',
      expect.objectContaining({ method: 'PATCH' })
    );
    resolvePatch({ ok: false });
    await waitFor(() => expect(screen.getByText('Active')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const confirmDialog = screen.getByRole('dialog', {
      name: 'Delete investor link?',
    });
    fireEvent.click(
      within(confirmDialog).getByRole('button', { name: 'Delete' })
    );

    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith(
        "Couldn't delete investor link"
      )
    );
    expect(screen.getByText('Active')).toBeInTheDocument();
  });
});
