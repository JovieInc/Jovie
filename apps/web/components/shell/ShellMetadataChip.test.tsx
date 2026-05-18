import { render, screen } from '@testing-library/react';
import { Calendar } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { ShellMetadataChip } from './ShellMetadataChip';

describe('ShellMetadataChip', () => {
  it('renders compact shell metadata with the shared row-chip geometry', () => {
    const { container } = render(<ShellMetadataChip>Live</ShellMetadataChip>);

    const chip = container.firstElementChild as HTMLElement;
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(chip.className).toContain('h-[18px]');
    expect(chip.className).toContain('rounded');
  });

  it('supports icon and dot adornments without adding interactive styling', () => {
    const { container } = render(
      <ShellMetadataChip
        icon={<Calendar data-testid='calendar-icon' className='h-2.5 w-2.5' />}
        dotClassName='bg-white/35'
      >
        Drops Apr 27
      </ShellMetadataChip>
    );

    expect(screen.getByTestId('calendar-icon')).toBeInTheDocument();
    expect(container.querySelector('.bg-white\\/35')).toBeInTheDocument();
    expect(
      (container.firstElementChild as HTMLElement).className
    ).not.toContain('hover:');
  });
});
