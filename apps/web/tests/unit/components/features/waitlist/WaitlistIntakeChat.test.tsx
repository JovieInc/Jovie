import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs', () => ({
  SignOutButton: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/features/auth', () => ({
  AuthLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

global.fetch = fetchMock as unknown as typeof fetch;

import { WaitlistIntakeChat } from '@/components/features/waitlist/WaitlistIntakeChat';

async function answerRequired(value: string, final = false) {
  const input = screen.getByRole('textbox');
  await userEvent.clear(input);
  await userEvent.type(input, value);
  await userEvent.click(
    screen.getByRole('button', {
      name: final ? /save request/i : /send answer/i,
    })
  );
}

describe('WaitlistIntakeChat', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('does not advance required steps on incomplete ack answers', async () => {
    render(<WaitlistIntakeChat userEmail='artist@example.com' />);

    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'k');
    await userEvent.click(screen.getByRole('button', { name: /send answer/i }));

    expect(
      screen.getByText(/real answer|short acks|real handle/i)
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces rate-limited intake responses from non-OK submissions', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          outcome: 'rate_limited',
          code: 'rate_limited',
          error: 'Too many onboarding attempts. Please try again in 1 hour.',
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      )
    );

    render(<WaitlistIntakeChat userEmail='artist@example.com' />);

    await answerRequired('artist');
    await answerRequired('https://instagram.com/artist');
    await userEvent.click(screen.getByRole('button', { name: /skip/i }));
    await userEvent.click(screen.getByRole('button', { name: /skip/i }));
    await answerRequired('A new single rollout');
    await answerRequired('Keeping assets organized');
    await answerRequired('Launch with less manual follow-up', true);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/onboarding/intake',
      expect.objectContaining({ method: 'POST' })
    );
    expect(
      await screen.findByRole('heading', { name: /too many attempts/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/we couldn't save this/i)
    ).not.toBeInTheDocument();
  });
});
