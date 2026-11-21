import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const { mockPush, mockPrefetch, mockTrack } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockPrefetch: vi.fn(),
  mockTrack: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isSignedIn: false }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, prefetch: mockPrefetch }),
}));

vi.mock('@/lib/analytics', () => ({ track: mockTrack }));

import { ClaimHandleForm } from './ClaimHandleForm';

beforeEach(() => {
  mockPush.mockReset();
  mockPrefetch.mockReset();
  mockTrack.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ available: true }),
    })
  );
});

function getInput() {
  return screen.getByRole('textbox', { name: /choose your handle/i });
}

describe('ClaimHandleForm', () => {
  it('draws the handle field as a host-drawn input that keeps its own focus ring', async () => {
    const { container } = render(<ClaimHandleForm />);

    const input = getInput();
    expect(input).toHaveAttribute('data-host-drawn');
    // JOV-INV-019: the ring lives on the input itself.
    expect(input).toHaveClass(
      'focus-ring-themed',
      'system-b-claim-handle-input'
    );
    expect(input.className).not.toMatch(/bg-|text-|placeholder:/);
    await expectNoA11yViolations(container);
  });

  it('lowercases typed input and shows a validation error for short handles', async () => {
    const user = userEvent.setup();
    const { container } = render(<ClaimHandleForm />);

    await user.type(getInput(), 'AB');
    expect(getInput()).toHaveValue('ab');
    expect(getInput()).toHaveAttribute('aria-invalid', 'true');
    expect(
      screen.getByText(/Handle must be at least 3 characters/i)
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('focuses the field and does not navigate when submitted empty', async () => {
    const user = userEvent.setup();
    render(<ClaimHandleForm />);

    await user.click(screen.getByRole('button', { name: 'Claim' }));
    expect(getInput()).toHaveFocus();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('sends a signed-out visitor to signup with the handle and tracks the submit', async () => {
    const user = userEvent.setup();
    render(
      <ClaimHandleForm
        submitTracking={{ eventName: 'claim_submit', section: 'hero' }}
      />
    );

    await user.type(getInput(), 'newartist');
    await user.click(screen.getByRole('button', { name: /^Claim/ }));

    expect(mockTrack).toHaveBeenCalledWith('claim_submit', {
      section: 'hero',
      handle: 'newartist',
    });
    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    const target = String(mockPush.mock.calls[0]?.[0]);
    expect(target).toContain('/signup');
    expect(decodeURIComponent(target)).toContain('handle=newartist');
  });

  it('reports the typed handle to the parent', () => {
    const onHandleChange = vi.fn();
    render(<ClaimHandleForm onHandleChange={onHandleChange} />);

    fireEvent.change(getInput(), { target: { value: 'abc' } });
    expect(onHandleChange).toHaveBeenLastCalledWith('abc');
  });
});
