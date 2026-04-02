import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomePageNarrative } from '@/features/home/HomePageNarrative';

vi.mock('@/components/atoms/DspLogo', () => ({
  DspLogo: ({ provider }: { provider: string }) => (
    <div data-testid={`dsp-logo-${provider}`}>{provider}</div>
  ),
}));

vi.mock('@/features/home/ProductScreenshot', () => ({
  ProductScreenshot: ({
    testId,
    title,
  }: {
    testId?: string;
    title?: string;
  }) => <div data-testid={testId ?? 'product-screenshot'}>{title}</div>,
}));

vi.mock('@/features/home/phone-showcase-primitives', () => ({
  MODES: [
    {
      id: 'profile',
      headline: 'Profile',
      description: 'Profile mode',
      outcome: 'Grow',
    },
    {
      id: 'tour',
      headline: 'Tour',
      description: 'Tour mode',
      outcome: 'Sell tickets',
    },
    {
      id: 'tip',
      headline: 'Tip',
      description: 'Tip mode',
      outcome: 'Earn tips',
    },
    {
      id: 'listen',
      headline: 'Listen',
      description: 'Listen mode',
      outcome: 'Boost streams',
    },
  ],
  PhoneShowcase: () => <div data-testid='phone-showcase'>phone showcase</div>,
}));

describe('HomePageNarrative', () => {
  it('renders the redesigned homepage narrative in order', () => {
    render(<HomePageNarrative />);

    expect(
      screen.getByRole('heading', {
        name: 'Drop More Music. Run Every Release.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText('One system across the release stack')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'One profile. All the fan modes.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Every release gets a clean destination.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'AI that knows the context.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Your catalog and profile presence, in one view.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'A promotion plan, generated for every release.',
      })
    ).toBeInTheDocument();
  });
});
