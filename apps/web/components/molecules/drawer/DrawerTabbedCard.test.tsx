import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DrawerTabbedCard } from './DrawerTabbedCard';

const ACTIVITY_ROWS = Array.from(
  { length: 24 },
  (_, index) => `Activity ${index + 1}`
);

describe('DrawerTabbedCard', () => {
  it('renders tabs, controls and the internal scroll region', async () => {
    const onRefresh = vi.fn();
    const { container } = render(
      <DrawerTabbedCard
        sectionKind='details'
        testId='tabbed'
        tabs={<p>Details · Activity</p>}
        controls={
          <button type='button' onClick={onRefresh}>
            Refresh
          </button>
        }
      >
        <p>Entity details</p>
      </DrawerTabbedCard>
    );

    const card = screen.getByTestId('tabbed');
    expect(card).toHaveAttribute('data-variant', 'card');
    expect(card).toHaveAttribute('data-right-rail-section', 'details');
    expect(screen.getByTestId('tabbed-scroll-region')).toHaveAttribute(
      'data-scroll-mode',
      'internal'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onRefresh).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('renders an empty tab body and the flat surface', async () => {
    const { container } = render(
      <DrawerTabbedCard
        testId='tabbed'
        surfaceVariant='flat'
        tabs={<p>Details · Activity</p>}
      >
        <p>No activity yet.</p>
      </DrawerTabbedCard>
    );

    expect(screen.getByTestId('tabbed')).toHaveAttribute(
      'data-variant',
      'flat'
    );
    expect(screen.getByText('No activity yet.')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('keeps long content inside the scroll region', async () => {
    const { container } = render(
      <DrawerTabbedCard testId='tabbed' tabs={<p>Activity history</p>}>
        <ul>
          {ACTIVITY_ROWS.map(row => (
            <li key={row}>{row}</li>
          ))}
        </ul>
      </DrawerTabbedCard>
    );

    const region = screen.getByTestId('tabbed-scroll-region');
    expect(region).toHaveClass('overflow-y-auto', 'overflow-x-hidden');
    expect(region.querySelectorAll('li')).toHaveLength(24);
    await expectNoA11yViolations(container);
  });

  it('renders in a right-to-left drawer', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <DrawerTabbedCard tabs={<p>التفاصيل · النشاط</p>}>
          <p>تفاصيل العنصر</p>
        </DrawerTabbedCard>
      </div>
    );

    expect(screen.getByText('تفاصيل العنصر')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
