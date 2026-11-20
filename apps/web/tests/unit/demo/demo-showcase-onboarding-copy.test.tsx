import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ONBOARDING_STEPS } from '@/features/dashboard/organisms/onboarding-v2/shared/types';

vi.mock('next/navigation', () => ({
  usePathname: () => '/demo/showcase/onboarding-handle',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams('profile=tim-white'),
}));

const { DemoShowcaseSurface } = await import(
  '@/features/demo/DemoShowcaseSurface'
);

// The setup product shots (lib/screenshots/product-shots.ts) capture these
// demos, so they must show the onboarding copy the app ships, not a copy.
describe('DemoShowcaseSurface onboarding copy', () => {
  it.each([
    ['onboarding-handle', 0],
    ['onboarding-dsp', 1],
  ] as const)('renders the shipped %s title and prompt', (surface, index) => {
    render(<DemoShowcaseSurface surface={surface} />);
    const step = ONBOARDING_STEPS[index];

    expect(
      screen.getByRole('heading', { name: step.title })
    ).toBeInTheDocument();
    expect(screen.getByText(step.prompt)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/\bfans?\b/i);
  });
});
