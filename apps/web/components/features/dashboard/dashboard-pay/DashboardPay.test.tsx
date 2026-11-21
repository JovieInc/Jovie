import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DashboardPay } from './DashboardPay';

const mockUseDashboardData = vi.fn();
const mockUseDashboardPay = vi.fn();

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  DashboardDataContext: {
    Provider: ({ children }: { readonly children: ReactNode }) => children,
    Consumer: () => null,
    displayName: 'DashboardDataContext',
  },
  useDashboardData: () => mockUseDashboardData(),
}));

vi.mock('@/components/organisms/Dialog', () => ({
  Dialog: ({ children }: { readonly children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogBody: ({ children }: { readonly children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { readonly children: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogTitle: ({ children }: { readonly children: ReactNode }) => (
    <h2>{children}</h2>
  ),
}));

vi.mock('@/features/dashboard/organisms/EarningsTab', () => ({
  EarningsTab: () => <div data-testid='earnings-tab'>Earnings tab content</div>,
}));

vi.mock('@/features/dashboard/organisms/shopify/ShopifyStoreCard', () => ({
  ShopifyStoreCard: () => (
    <div data-testid='shopify-store-card'>Shopify store card</div>
  ),
}));

vi.mock('./useDashboardPay', () => ({
  useDashboardPay: () => mockUseDashboardPay(),
}));

function mockDashboardData() {
  mockUseDashboardData.mockReturnValue({
    tippingStats: {
      tipClicks: 42,
      qrTipClicks: 12,
      linkTipClicks: 30,
    },
  });
}

function mockDashboardPay(overrides = {}) {
  mockUseDashboardPay.mockReturnValue({
    artist: { handle: 'artist-handle', venmo_handle: undefined },
    venmoHandle: '',
    setVenmoHandle: vi.fn(),
    isEditing: false,
    setIsEditing: vi.fn(),
    isSaving: false,
    saveSuccess: null,
    hasVenmoHandle: false,
    handleSaveVenmo: vi.fn(),
    handleCancel: vi.fn(),
    handleDisconnect: vi.fn(),
    ...overrides,
  });
}

describe('DashboardPay', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the Venmo empty state before earnings are unlocked', () => {
    mockDashboardData();
    mockDashboardPay();

    render(<DashboardPay />);

    expect(
      screen.getByRole('heading', { name: 'Connect Venmo To Unlock Earnings' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Connect Venmo' })
    ).toBeInTheDocument();
    expect(screen.queryByTestId('earnings-tab')).not.toBeInTheDocument();
    expect(screen.getByTestId('shopify-store-card')).toBeInTheDocument();
  });

  it('renders bounded earnings metrics and pay link when Venmo is connected', () => {
    mockDashboardData();
    mockDashboardPay({
      artist: { handle: 'artist-handle', venmo_handle: '@artist' },
      hasVenmoHandle: true,
      venmoHandle: 'artist',
    });

    render(<DashboardPay />);

    expect(screen.getByText('QR Scans')).toBeInTheDocument();
    expect(screen.getByText('Link Clicks')).toBeInTheDocument();
    expect(screen.getByText('Total Visits')).toBeInTheDocument();
    for (const [label, value, description] of [
      ['QR Scans', '12', 'Fans who scanned your QR'],
      ['Link Clicks', '30', 'Fans who clicked your link'],
      ['Total Visits', '42', 'QR + link combined'],
    ]) {
      const metric = within(
        screen.getByRole('region', { name: `${label} Metric` })
      );
      expect(metric.getByRole('term')).toHaveTextContent(label);
      expect(
        metric.getAllByRole('definition').map(node => node.textContent)
      ).toEqual([value, description]);
    }
    expect(
      screen.getByText(/artist-handle\/pay\?source=link/)
    ).toBeInTheDocument();
    expect(screen.getByTestId('earnings-tab')).toBeInTheDocument();
  });
});

function statefulPay(handle: string) {
  mockUseDashboardPay.mockImplementation(function useStatefulPay() {
    const [venmoHandle, setVenmoHandle] = useState(handle);
    return {
      artist: { handle: 'artist-handle', venmo_handle: undefined },
      venmoHandle,
      setVenmoHandle,
      isEditing: false,
      setIsEditing: vi.fn(),
      isSaving: false,
      saveSuccess: null,
      hasVenmoHandle: false,
      handleSaveVenmo: vi.fn(),
      handleCancel: vi.fn(),
      handleDisconnect: vi.fn(),
    };
  });
}

describe('DashboardPay interactions', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the typed Venmo handle and focus across a rerender and blur', async () => {
    const user = userEvent.setup();
    mockDashboardData();
    statefulPay('');
    const { rerender, container } = render(<DashboardPay />);
    const field = screen.getByLabelText('Venmo Username');
    await user.type(field, 'midnight-signal');
    rerender(<DashboardPay />);
    expect(screen.getByLabelText('Venmo Username')).toHaveValue(
      'midnight-signal'
    );
    expect(screen.getByLabelText('Venmo Username')).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('Venmo Username')).toHaveValue(
      'midnight-signal'
    );
    await expectNoA11yViolations(container);
  });

  it('focuses the handle field when the form mounts, without autoFocus', () => {
    mockDashboardData();
    mockDashboardPay();
    render(<DashboardPay />);
    expect(
      screen
        .getAllByPlaceholderText('your-username')
        .some(field => field === document.activeElement)
    ).toBe(true);
  });

  it('saves a typed handle through the connect action', async () => {
    const user = userEvent.setup();
    mockDashboardData();
    const handleSaveVenmo = vi.fn();
    mockDashboardPay({ venmoHandle: 'artist', handleSaveVenmo });
    render(<DashboardPay />);
    const [save] = screen.getAllByRole('button', { name: /^Save/ });
    await user.click(save);
    expect(handleSaveVenmo).toHaveBeenCalledTimes(1);
  });

  it('opens the connected handle menu and runs Edit and Disconnect', async () => {
    const user = userEvent.setup();
    mockDashboardData();
    const handleDisconnect = vi.fn();
    mockDashboardPay({
      artist: { handle: 'artist-handle', venmo_handle: '@artist' },
      hasVenmoHandle: true,
      venmoHandle: 'artist',
      handleDisconnect,
    });
    const { container } = render(<DashboardPay />);
    await user.click(screen.getByRole('button', { name: /@artist/ }));
    await user.click(
      await screen.findByRole('menuitem', { name: /Disconnect/ })
    );
    expect(handleDisconnect).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('renders long and right-to-left handles axe-clean', async () => {
    mockDashboardData();
    mockDashboardPay({
      artist: { handle: 'artist-handle', venmo_handle: '@فرقة' },
      hasVenmoHandle: true,
      venmoHandle: 'فرقة-منتصف-الليل-the-extraordinarily-long-handle',
    });
    const { container } = render(<DashboardPay />);
    expect(screen.getByRole('button', { name: /@فرقة/ })).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('draws the pay link icon with the info token instead of a palette class', () => {
    mockDashboardData();
    mockDashboardPay({
      artist: { handle: 'artist-handle', venmo_handle: '@artist' },
      hasVenmoHandle: true,
      venmoHandle: 'artist',
    });
    const { container } = render(<DashboardPay />);
    expect(
      screen.getByRole('heading', { name: 'Pay Link', level: 2 })
    ).toBeInTheDocument();
    expect(container.querySelector('svg.text-info')).not.toBeNull();
    expect(container.querySelector('svg.text-blue-500')).toBeNull();
  });
});

describe('DashboardPay scale tokens', () => {
  it('uses the 16px text-base step instead of the text-lg alias', () => {
    const source = readFileSync(
      resolve(__dirname, './DashboardPay.tsx'),
      'utf8'
    );

    expect(source).not.toMatch(/(?<![\w-])text-lg\b/);
  });
});

describe('DashboardPay icon geometry', () => {
  it('keeps glyphs on the 4px grid (16px, never the 18px half step)', () => {
    const source = readFileSync(
      resolve(__dirname, './DashboardPay.tsx'),
      'utf8'
    );
    expect(source).not.toMatch(/\b[hw]-4\.5\b|\bsize-4\.5\b/);
  });
});
