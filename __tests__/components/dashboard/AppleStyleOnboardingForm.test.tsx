import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppleStyleOnboardingForm } from '@/components/dashboard/organisms/AppleStyleOnboardingForm';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({ get: vi.fn() }),
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
  identify: vi.fn(),
}));

describe('AppleStyleOnboardingForm focus management', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('moves focus to step heading when navigating forward and backward', async () => {
    render(<AppleStyleOnboardingForm />);

    const step1Heading = screen.getByRole('heading', {
      name: /Let's get you live\./i,
    });
    expect(document.activeElement).toBe(step1Heading);

    fireEvent.click(screen.getByRole('button', { name: /Start/i }));
    await vi.advanceTimersByTimeAsync(300);

    const step2Heading = await screen.findByRole('heading', {
      name: /What's your name\?/i,
    });
    expect(document.activeElement).toBe(step2Heading);

    fireEvent.click(screen.getByRole('button', { name: /Back/i }));
    await vi.advanceTimersByTimeAsync(300);

    const backHeading = await screen.findByRole('heading', {
      name: /Let's get you live\./i,
    });
    expect(document.activeElement).toBe(backHeading);
  });
});
