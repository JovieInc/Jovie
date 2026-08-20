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
  it('renders Title Case request copy when open', () => {
    render(<GrowthAccessRequestModal open onOpenChange={vi.fn()} />);

    expect(
      screen.getByRole('heading', { name: 'Growth Is In Early Access' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('What Feature Are You Most Excited About?')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Request Early Access' })
    ).toBeInTheDocument();
  });
});
