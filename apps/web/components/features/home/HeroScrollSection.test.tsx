import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HeroScrollSection } from './HeroScrollSection';

vi.mock('@/components/marketing/MarketingScreenshot', () => ({
  MarketingScreenshot: ({ testId }: Readonly<{ testId?: string }>) => (
    <div data-testid={testId ?? 'marketing-screenshot'}>dashboard shot</div>
  ),
}));

vi.mock('./claim-handle', () => ({
  ClaimHandleForm: () => (
    <form data-testid='claim-handle-form'>
      <input aria-label='Artist handle' />
      <button type='submit'>Claim</button>
    </form>
  ),
}));

describe('HeroScrollSection', () => {
  it('renders bounded hero copy, claim form, and dashboard receipt', () => {
    render(<HeroScrollSection />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'The link your music deserves.',
      })
    ).toHaveClass('line-clamp-2');
    expect(screen.getByTestId('claim-handle-form')).toBeInTheDocument();
    expect(screen.getByTestId('hero-dashboard-screenshot')).toBeInTheDocument();
  });
});
