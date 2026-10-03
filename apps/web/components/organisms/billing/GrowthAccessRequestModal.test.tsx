import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GrowthAccessRequestModal } from './GrowthAccessRequestModal';

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/queries', () => ({
  useGrowthAccessRequestMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

describe('GrowthAccessRequestModal', () => {
  it('uses one early-access status and semantic color tokens', () => {
    render(<GrowthAccessRequestModal open onOpenChange={vi.fn()} />);

    expect(
      screen.getByRole('heading', { name: 'Request Early Access' })
    ).toBeInTheDocument();
    expect(screen.getByText('Tell us what you want from Growth.')).toBeTruthy();
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('What would you use Growth for?')
    ).toBeTruthy();
    expect(document.body.innerHTML).not.toMatch(/violet-|emerald-/);
    expect(document.body.innerHTML).toContain('bg-accent/10');
  });
});
