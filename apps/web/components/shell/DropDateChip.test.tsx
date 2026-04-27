import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DropDateChip } from './DropDateChip';

describe('DropDateChip', () => {
  it('renders the provided label', () => {
    render(<DropDateChip label='Released Mar 12' tone='past' />);
    expect(screen.getByText('Released Mar 12')).toBeInTheDocument();
  });

  it('lights up cyan when tone is soon', () => {
    const { container } = render(
      <DropDateChip label='Drops in 4 days' tone='soon' />
    );
    expect((container.firstElementChild as HTMLElement).className).toContain(
      'cyan'
    );
  });

  it('stays neutral when tone is past or future', () => {
    const past = render(<DropDateChip label='Released Jan 1' tone='past' />);
    expect(
      (past.container.firstElementChild as HTMLElement).className
    ).not.toContain('cyan-500/10');
    past.unmount();

    const future = render(<DropDateChip label='Drops Jun 20' tone='future' />);
    expect(
      (future.container.firstElementChild as HTMLElement).className
    ).not.toContain('cyan-500/10');
  });
});
