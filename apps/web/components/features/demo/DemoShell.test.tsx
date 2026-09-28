import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DemoShell } from './DemoShell';

describe('DemoShell', () => {
  it('uses the banned-icon-safe CircleCheck glyph for the Current catalog tab', () => {
    const { container } = render(
      <DemoShell activeTab='current' onTabChange={vi.fn()}>
        <div>Demo content</div>
      </DemoShell>
    );

    expect(screen.getAllByText('Current').length).toBeGreaterThan(0);
    expect(container.querySelector('svg.lucide-circle-check')).toBeTruthy();
    expect(container.querySelector('svg.lucide-circle-dot')).toBeNull();
  });

  it('renders the provided children', () => {
    render(
      <DemoShell activeTab='inbox' onTabChange={vi.fn()}>
        <div>Demo content</div>
      </DemoShell>
    );

    expect(screen.getByText('Demo content')).toBeInTheDocument();
  });
});
