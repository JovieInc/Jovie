import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DrawerStatGrid } from './DrawerStatGrid';
import { StatTile } from './StatTile';

function stats() {
  return (
    <>
      <StatTile label='Views' value='12.4k' hint='+8% vs last week' />
      <StatTile label='Clicks' value='3,204' />
    </>
  );
}

describe('DrawerStatGrid', () => {
  it('renders a flush two-column grid by default', async () => {
    const { container } = render(<DrawerStatGrid>{stats()}</DrawerStatGrid>);

    const grid = container.firstElementChild as HTMLElement;
    expect(grid).toHaveClass('grid', 'grid-cols-2', 'divide-x');
    expect(grid).toHaveClass('border-x-0', 'p-0', 'bg-transparent');
    expect(grid.querySelectorAll('[data-slot="stat-tile"]')).toHaveLength(2);
    expect(screen.getByText('12.4k')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('pads the card variant and merges a class', async () => {
    const { container } = render(
      <DrawerStatGrid variant='card' className='mt-2'>
        {stats()}
      </DrawerStatGrid>
    );

    const grid = container.firstElementChild as HTMLElement;
    expect(grid).toHaveClass('p-3', 'mt-2');
    expect(grid).not.toHaveClass('border-x-0');
    await expectNoA11yViolations(container);
  });

  it('shows a not-measured stat beside a measured one (partial)', async () => {
    const { container } = render(
      <DrawerStatGrid variant='card'>
        <StatTile label='Views' value='12.4k' />
        <StatTile
          label='Streams'
          state='not-measured'
          notMeasuredSource='streaming ingestion'
        />
      </DrawerStatGrid>
    );

    expect(screen.getByText('Not measured')).toHaveAttribute(
      'title',
      'Not measured yet — waiting on streaming ingestion'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps long and RTL stats axe-clean', async () => {
    const label = 'Top referrer territory this quarter';
    const { container } = render(
      <div dir='rtl'>
        <DrawerStatGrid>
          <StatTile label={label} value='1,234,567' />
          <StatTile label='النقرات' value='٣٬٢٠٤' />
        </DrawerStatGrid>
      </div>
    );

    expect(screen.getByText(label)).toBeVisible();
    expect(screen.getByText('٣٬٢٠٤')).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
