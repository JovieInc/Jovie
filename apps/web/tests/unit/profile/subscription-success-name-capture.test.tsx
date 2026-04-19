import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionSuccess } from '@/features/profile/artist-notifications-cta/shared';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockMutateAsync = vi.fn();

vi.mock('@/lib/queries/useNotificationStatusQuery', () => ({
  useUpdateSubscriberNameMutation: () => ({
    mutateAsync: mockMutateAsync,
  }),
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseProps = {
  artistName: 'Test Artist',
  handle: 'testartist',
  subscribedChannels: { email: true, sms: false },
} as const;

const nameCaptureProps = {
  ...baseProps,
  artistId: 'artist-123',
  subscriberEmail: 'fan@example.com',
} as const;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SubscriptionSuccess — name capture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders name capture form when both artistId and subscriberEmail are provided', async () => {
    render(<SubscriptionSuccess {...nameCaptureProps} />);

    // Advance past the visibility timer (100 ms)
    await vi.advanceTimersByTimeAsync(150);

    expect(screen.getByPlaceholderText('First name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByText('What should we call you?')).toBeInTheDocument();
  });

  it('does NOT render name capture form when artistId is missing', () => {
    render(
      <SubscriptionSuccess {...baseProps} subscriberEmail='fan@example.com' />
    );

    expect(screen.queryByPlaceholderText('First name')).not.toBeInTheDocument();
    expect(screen.getByText('Email notifications on')).toBeInTheDocument();
  });

  it('does NOT render name capture form when subscriberEmail is missing', () => {
    render(<SubscriptionSuccess {...baseProps} artistId='artist-123' />);

    expect(screen.queryByPlaceholderText('First name')).not.toBeInTheDocument();
    expect(screen.getByText('Email notifications on')).toBeInTheDocument();
  });

  it('save button is disabled when input is empty', async () => {
    render(<SubscriptionSuccess {...nameCaptureProps} />);
    await vi.advanceTimersByTimeAsync(150);

    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeDisabled();
  });

  it('shows "Saving..." text during save', async () => {
    // Make the mutation hang so we can observe the saving state
    mockMutateAsync.mockReturnValue(new Promise(() => {}));

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SubscriptionSuccess {...nameCaptureProps} />);
    await vi.advanceTimersByTimeAsync(150);

    const input = screen.getByPlaceholderText('First name');
    await user.type(input, 'Alice');

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveButton);

    expect(screen.getByRole('button', { name: 'Saving…' })).toBeInTheDocument();
  });

  it('shows "Thanks, {name}!" after successful save', async () => {
    mockMutateAsync.mockResolvedValue({});

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SubscriptionSuccess {...nameCaptureProps} />);
    await vi.advanceTimersByTimeAsync(150);

    const input = screen.getByPlaceholderText('First name');
    await user.type(input, 'Alice');

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Thanks, Alice!')).toBeInTheDocument();
    });
  });

  it('shows default success after skip', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SubscriptionSuccess {...nameCaptureProps} />);
    await vi.advanceTimersByTimeAsync(150);

    const skipButton = screen.getByRole('button', { name: 'Skip' });
    await user.click(skipButton);

    // Should show default channel label, not name capture
    expect(screen.getByText('Email notifications on')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('First name')).not.toBeInTheDocument();
  });

  it('still shows personalized success even when mutation fails (best-effort)', async () => {
    mockMutateAsync.mockRejectedValue(new Error('Network error'));

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SubscriptionSuccess {...nameCaptureProps} />);
    await vi.advanceTimersByTimeAsync(150);

    const input = screen.getByPlaceholderText('First name');
    await user.type(input, 'Bob');

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Thanks, Bob!')).toBeInTheDocument();
    });
  });
});
