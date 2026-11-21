import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { Artist } from '@/types/db';
import { AlertGrowthLanding } from './AlertGrowthLanding';

const mutateAsync = vi.fn();

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/queries/useNotificationStatusQuery', () => ({
  useSubscribeNotificationsMutation: () => ({ mutateAsync }),
}));

const artist = {
  id: 'artist-1',
  handle: 'artisthandle',
  name: 'Mock Artist',
} as Artist;

beforeEach(() => {
  mutateAsync.mockReset();
});

describe('AlertGrowthLanding', () => {
  it('starts on the text channel with a labelled phone field and stays axe-clean', async () => {
    const { container } = render(<AlertGrowthLanding artist={artist} />);
    expect(screen.getByLabelText('Mobile number')).toHaveAttribute(
      'type',
      'tel'
    );
    expect(screen.getByRole('button', { name: 'Text Me' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(
      screen.getByRole('link', { name: 'Back To Mock Artist' })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('keeps typed input and focus across a rerender and blur', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<AlertGrowthLanding artist={artist} />);
    const phone = screen.getByLabelText('Mobile number');
    await user.type(phone, '5555551234');
    rerender(<AlertGrowthLanding artist={{ ...artist }} />);
    expect(screen.getByLabelText('Mobile number')).toHaveValue('5555551234');
    expect(screen.getByLabelText('Mobile number')).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('Mobile number')).toHaveValue('5555551234');
    await user.click(screen.getByRole('button', { name: 'Email Me' }));
    const email = screen.getByLabelText('Email address');
    await user.type(email, 'fan@example.com');
    rerender(<AlertGrowthLanding artist={{ ...artist }} />);
    expect(screen.getByLabelText('Email address')).toHaveValue(
      'fan@example.com'
    );
  });

  it('rejects an invalid phone number with an alert and does not submit', async () => {
    const user = userEvent.setup();
    const { container } = render(<AlertGrowthLanding artist={artist} />);
    await user.type(screen.getByLabelText('Mobile number'), '123');
    await user.click(screen.getByRole('button', { name: 'Get alerts' }));
    expect(screen.getByTestId('alerts-landing-error')).toHaveTextContent(
      'Please enter a valid US phone number.'
    );
    expect(mutateAsync).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('subscribes by text and shows the confirmation prompt', async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ pendingConfirmation: true });
    const { container } = render(<AlertGrowthLanding artist={artist} />);
    await user.type(screen.getByLabelText('Mobile number'), '5555551234');
    await user.click(screen.getByRole('button', { name: 'Get alerts' }));
    expect(await screen.findByTestId('alerts-landing-pending')).toBeVisible();
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'sms', phone: '+15555551234' })
    );
    await expectNoA11yViolations(container);
  });

  it('subscribes by email and shows the success state', async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ pendingConfirmation: false });
    render(<AlertGrowthLanding artist={artist} />);
    await user.click(screen.getByRole('button', { name: 'Email Me' }));
    await user.type(screen.getByLabelText('Email address'), 'fan@example.com');
    await user.click(screen.getByRole('button', { name: 'Get alerts' }));
    expect(await screen.findByTestId('alerts-landing-success')).toBeVisible();
  });

  it('keeps the form and shows the error when the request fails offline', async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(new TypeError('Failed to fetch'));
    const { container } = render(<AlertGrowthLanding artist={artist} />);
    await user.type(screen.getByLabelText('Mobile number'), '5555551234');
    await user.click(screen.getByRole('button', { name: 'Get alerts' }));
    await waitFor(() =>
      expect(screen.getByTestId('alerts-landing-error')).toHaveTextContent(
        'Failed to fetch'
      )
    );
    expect(screen.getByLabelText('Mobile number')).toHaveValue('5555551234');
    await expectNoA11yViolations(container);
  });

  it('disables the form while the request is pending', async () => {
    const user = userEvent.setup();
    mutateAsync.mockReturnValue(new Promise(() => {}));
    render(<AlertGrowthLanding artist={artist} />);
    await user.type(screen.getByLabelText('Mobile number'), '5555551234');
    await user.click(screen.getByRole('button', { name: 'Get alerts' }));
    expect(
      await screen.findByRole('button', { name: 'Sending…' })
    ).toBeDisabled();
    expect(screen.getByLabelText('Mobile number')).toBeDisabled();
  });

  it('falls back to the handle and renders right-to-left names axe-clean', async () => {
    const { container, rerender } = render(
      <AlertGrowthLanding artist={{ ...artist, name: '' }} />
    );
    expect(
      screen.getByRole('link', { name: 'Back To artisthandle' })
    ).toBeVisible();
    rerender(
      <AlertGrowthLanding artist={{ ...artist, name: 'فرقة منتصف الليل' }} />
    );
    expect(screen.getByText('فرقة منتصف الليل')).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
