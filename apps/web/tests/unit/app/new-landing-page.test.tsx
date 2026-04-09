import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import NewLandingPage from '@/app/(marketing)/new/page';

vi.mock('@/constants/app', async importOriginal => {
  const actual = await importOriginal<typeof import('@/constants/app')>();
  return {
    ...actual,
    APP_NAME: 'Jovie',
    BASE_URL: 'https://jov.ie',
  };
});

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('@/features/home/claim-handle', () => ({
  ClaimHandleForm: () => (
    <div data-testid='claim-handle-form'>claim handle form</div>
  ),
}));

describe('NewLandingPage', () => {
  it('renders the marketing-native hero and route-local CTA flow', () => {
    render(<NewLandingPage />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Drop More Music. Crush Every Release.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Get started free' })
    ).toHaveAttribute('href', '/signup');
    expect(screen.getByTestId('landing-hero-proof')).toBeInTheDocument();
    expect(screen.getByTestId('claim-handle-form')).toBeInTheDocument();
  });
});
