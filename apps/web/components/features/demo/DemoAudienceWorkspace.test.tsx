import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudienceActionAdapter } from '@/features/dashboard/organisms/dashboard-audience-table';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const h = vi.hoisted(() => ({
  params: new URLSearchParams(),
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
  copy: vi.fn(),
  download: vi.fn(),
  qr: vi.fn(),
  toBlob: vi.fn(() => new Blob(['qr'])),
}));

vi.mock('next/navigation', () => ({ useSearchParams: () => h.params }));
vi.mock('@/components/feedback', () => ({ toast: h.toast }));
vi.mock(
  '@/features/dashboard/organisms/dashboard-audience-table/utils',
  () => ({ copyTextToClipboard: h.copy })
);
vi.mock('@/lib/utils/download', () => ({ downloadBlob: h.download }));
vi.mock('@/lib/utils/qr-code', () => ({
  generateQrCodeDataUrl: h.qr,
  qrCodeDataUrlToBlob: h.toBlob,
}));

// The shell and the audience workspace are certified on their own; these
// stand-ins expose the props and adapter this demo wrapper owns.
vi.mock('./DemoAuthShell', () => ({
  DemoAuthShell: ({ children }: { readonly children: ReactNode }) => (
    <main>{children}</main>
  ),
}));
vi.mock('@/features/dashboard/organisms/AudiencePanelContext', () => ({
  AudiencePanelProvider: ({
    children,
    initialMode,
  }: {
    readonly children: ReactNode;
    readonly initialMode: string | null;
  }) => (
    <div data-testid='panel' data-initial-mode={String(initialMode)}>
      {children}
    </div>
  ),
}));
vi.mock('@/features/dashboard/organisms/DashboardAudienceWorkspace', () => ({
  DashboardAudienceWorkspace: (props: {
    readonly rows: readonly { id: string; displayName: string | null }[];
    readonly total: number;
    readonly profileUrl: string;
    readonly testId: string;
    readonly analyticsSidebarTestId: string;
    readonly actionAdapter: AudienceActionAdapter;
  }) => {
    const first = props.rows[0] as never;
    return (
      <section aria-label='Audience' data-testid={props.testId}>
        <p data-testid='sidebar-id'>{props.analyticsSidebarTestId}</p>
        <p data-testid='profile-url'>{props.profileUrl}</p>
        <ol aria-label='Members'>
          {props.rows.map(row => (
            <li key={row.id}>{row.displayName ?? row.id}</li>
          ))}
        </ol>
        <button
          type='button'
          onClick={() => props.actionAdapter.onBlockMember?.(first)}
        >
          Block
        </button>
        <button
          type='button'
          onClick={() => props.actionAdapter.onSendNotification?.(first)}
        >
          Notify
        </button>
        <button
          type='button'
          onClick={() => props.actionAdapter.onSourceLinkAction?.('copy')}
        >
          Copy link
        </button>
        <button
          type='button'
          onClick={() => props.actionAdapter.onSourceLinkAction?.('open')}
        >
          Open link
        </button>
        <button
          type='button'
          onClick={() => props.actionAdapter.onSourceLinkAction?.('download')}
        >
          Download QR
        </button>
      </section>
    );
  },
}));

import { DemoAudienceWorkspace } from './DemoAudienceWorkspace';
import {
  DEMO_AUDIENCE_ROWS,
  DEMO_SOURCE_LINK_URL,
} from './demo-surface-fixtures';

describe('DemoAudienceWorkspace certificate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.params = new URLSearchParams();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the demo audience with the analytics panel open by default', async () => {
    const { container } = render(<DemoAudienceWorkspace />);

    expect(screen.getByTestId('demo-audience-shell')).toBeInTheDocument();
    expect(screen.getByTestId('panel')).toHaveAttribute(
      'data-initial-mode',
      'analytics'
    );
    expect(screen.getByTestId('sidebar-id')).toHaveTextContent(
      'demo-analytics-sidebar'
    );
    expect(screen.getByTestId('profile-url')).toHaveTextContent(
      /^https:\/\/jov\.ie\//
    );
    expect(screen.getByRole('list', { name: 'Members' }).children).toHaveLength(
      DEMO_AUDIENCE_ROWS.length
    );
    await expectNoA11yViolations(container);
  });

  it.each([
    ['quality', 'demo-audience-capture-quality', 'null'],
    ['crm', 'demo-audience-capture-crm', 'null'],
    ['retargeting', 'demo-audience-capture-retargeting', 'null'],
    ['geo', 'demo-audience-shell', 'analytics'],
    ['unknown', 'demo-audience-shell', 'analytics'],
  ])('uses the %s capture mode', async (mode, testId, panel) => {
    h.params = new URLSearchParams({ capture: mode });
    const { container } = render(<DemoAudienceWorkspace />);

    expect(screen.getByTestId(testId)).toBeInTheDocument();
    expect(screen.getByTestId('panel')).toHaveAttribute(
      'data-initial-mode',
      panel
    );
    if (mode === 'geo') {
      expect(screen.getByTestId('sidebar-id')).toHaveTextContent(
        'demo-audience-capture-geo'
      );
    }
    await expectNoA11yViolations(container);
  });

  it('keeps block and notify disabled in demo mode', async () => {
    const user = userEvent.setup();
    render(<DemoAudienceWorkspace />);

    await user.click(screen.getByRole('button', { name: 'Block' }));
    await user.click(screen.getByRole('button', { name: 'Notify' }));
    expect(h.toast.info).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/^Blocking .* disabled in demo mode$/)
    );
    expect(h.toast.info).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/^Notifications for .* disabled in demo mode$/)
    );
  });

  it('copies and opens the source link', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(globalThis, 'open').mockReturnValue(null);
    h.copy.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    render(<DemoAudienceWorkspace />);

    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(h.copy).toHaveBeenCalledWith(DEMO_SOURCE_LINK_URL);
    expect(h.toast.success).toHaveBeenCalledWith('Source link copied');
    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(h.toast.error).toHaveBeenCalledWith('Unable to copy source link');

    await user.click(screen.getByRole('button', { name: 'Open link' }));
    expect(open).toHaveBeenCalledWith(
      DEMO_SOURCE_LINK_URL,
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('downloads the QR code and reports a failure', async () => {
    const user = userEvent.setup();
    h.qr.mockResolvedValueOnce('data:image/png;base64,AAAA');
    render(<DemoAudienceWorkspace />);

    await user.click(screen.getByRole('button', { name: 'Download QR' }));
    expect(h.qr).toHaveBeenCalledWith(DEMO_SOURCE_LINK_URL, 1024);
    expect(h.download).toHaveBeenCalledWith(
      expect.any(Blob),
      'demo-source-link-qr.png'
    );
    expect(h.toast.success).toHaveBeenCalledWith('QR code downloaded');

    h.qr.mockRejectedValueOnce(new Error('canvas unavailable'));
    await user.click(screen.getByRole('button', { name: 'Download QR' }));
    expect(h.toast.error).toHaveBeenCalledWith('Unable to download QR code');
  });
});
