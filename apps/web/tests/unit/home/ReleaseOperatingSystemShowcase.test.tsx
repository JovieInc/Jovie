import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReleaseOperatingSystemShowcase } from '@/features/home/ReleaseOperatingSystemShowcase';

vi.mock('@/features/home/AiDemo', () => ({
  AiDemo: () => <div data-testid='ai-demo'>ai demo</div>,
}));

vi.mock('@/features/home/HomepageLabelLogoMark', () => ({
  HomepageLabelLogoMark: ({ partner }: { partner: string }) => (
    <div data-testid={`label-logo-${partner}`}>{partner}</div>
  ),
}));

vi.mock('@/features/home/MarketingSurfaceCard', () => ({
  MarketingSurfaceCard: () => (
    <div data-testid='operating-system-task-surface'>tasks</div>
  ),
}));

describe('ReleaseOperatingSystemShowcase', () => {
  it('renders the merged ai, monitoring, and tasks proof surfaces', () => {
    render(<ReleaseOperatingSystemShowcase />);

    expect(
      screen.getByTestId('homepage-release-operating-system-surface')
    ).toBeInTheDocument();
    expect(
      screen.getAllByTestId('homepage-release-operating-system-ai')[0]
    ).toBeInTheDocument();
    expect(
      screen.getAllByTestId('homepage-release-operating-system-monitoring')[0]
    ).toBeInTheDocument();
    expect(
      screen.getAllByTestId('homepage-release-operating-system-tasks')[0]
    ).toBeInTheDocument();
    expect(screen.getAllByTestId('label-logo-orchard').length).toBeGreaterThan(
      0
    );
  });
});
