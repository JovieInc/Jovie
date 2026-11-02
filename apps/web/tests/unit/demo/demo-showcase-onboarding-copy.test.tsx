import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEMO_SHOWCASE_SURFACE_IDS } from '@/components/features/demo/showcase-surfaces';
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

describe('DemoShowcaseSurface homepage moments', () => {
  it('registers the homepage moment surfaces the product shots capture', () => {
    expect(DEMO_SHOWCASE_SURFACE_IDS).toEqual(
      expect.arrayContaining(['homepage-moment', 'homepage-email'])
    );
  });

  it('leaves the server-only email moment to the showcase page', () => {
    const { container } = render(
      <DemoShowcaseSurface surface='homepage-email' />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
