import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { type ReleaseStatus, StatusBadge } from './StatusBadge';

describe('shell StatusBadge', () => {
  it.each<[ReleaseStatus, string]>([
    ['announced', 'Announced'],
    ['draft', 'Draft'],
    ['hidden', 'Hidden'],
    ['live', 'Live'],
    ['scheduled', 'Scheduled'],
  ])('preserves %s label casing and chip geometry', (status, label) => {
    const { container } = render(<StatusBadge status={status} />);

    expect(screen.getByText(label)).toBeInTheDocument();
    expect((container.firstElementChild as HTMLElement).className).toContain(
      'h-5'
    );
    expect(screen.getByText(label)).toHaveClass('tracking-normal');
    expect(screen.getByText(label)).not.toHaveClass('uppercase');
    expect(screen.getByText(label).className).not.toMatch(/tracking-\[/);
  });
});
