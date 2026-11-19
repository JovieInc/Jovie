import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SettingsPaymentsSection } from './SettingsPaymentsSection';

const json = (data: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json' },
    status,
  });

const connected = {
  connected: true,
  onboardingComplete: true,
  payoutsEnabled: true,
  email: 'artist@example.com',
};
const disconnected = {
  connected: false,
  onboardingComplete: false,
  payoutsEnabled: false,
  email: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SettingsPaymentsSection certificate', () => {
  it('disconnects Stripe and reloads the status', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(connected))
      .mockResolvedValueOnce(json({ success: true }))
      .mockResolvedValueOnce(json(disconnected));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<SettingsPaymentsSection />);

    expect(await screen.findByText('Stripe connected')).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));

    expect(await screen.findByText('Stripe not connected')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/stripe-connect/disconnect',
      { method: 'POST' }
    );
    await expectNoA11yViolations(container);
  });

  it('shows an onboarding failure under the connect action', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(disconnected))
      .mockResolvedValueOnce(json({ error: 'Onboarding failed' }, 500));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<SettingsPaymentsSection />);

    await user.click(
      await screen.findByRole('button', { name: 'Connect Stripe' })
    );

    expect(await screen.findByText('Onboarding failed')).toHaveClass(
      'text-error'
    );
    expect(fetchMock).toHaveBeenLastCalledWith('/api/stripe-connect/onboard', {
      method: 'POST',
    });
    await expectNoA11yViolations(container);
  });

  it('retries after an offline status load', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json(connected));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<SettingsPaymentsSection />);

    expect(
      await screen.findByText('Failed to load payment status')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(await screen.findByText('Stripe connected')).toBeInTheDocument();
  });

  it('keeps loading, partial onboarding and RTL states axe-clean', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {}))
    );
    const loading = render(<SettingsPaymentsSection />);
    expect(screen.getByText('Loading payments')).toBeInTheDocument();
    await expectNoA11yViolations(loading.container);
    loading.unmount();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ ...connected, onboardingComplete: false }))
    );
    const partial = render(
      <div dir='rtl'>
        <SettingsPaymentsSection />
      </div>
    );
    expect(await screen.findByText('Finish Stripe setup')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Complete Setup' })
      ).toBeInTheDocument()
    );
    await expectNoA11yViolations(partial.container);
  });
});
