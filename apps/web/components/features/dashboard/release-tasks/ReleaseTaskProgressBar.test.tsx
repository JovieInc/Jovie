import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ReleaseTaskProgressBar } from './ReleaseTaskProgressBar';

describe('ReleaseTaskProgressBar', () => {
  it('renders the overdue count with the error token, not raw red-* (JOV-6773)', () => {
    render(<ReleaseTaskProgressBar done={2} total={5} overdueCount={1} />);

    const overdue = screen.getByText('· 1 overdue');
    expect(overdue.className).toContain('text-error');
    expect(overdue.className).not.toMatch(/\bred-\d/);
  });

  it('does not render an overdue count when there is none', () => {
    render(<ReleaseTaskProgressBar done={2} total={5} />);

    expect(screen.queryByText(/overdue/)).toBeNull();
  });

  it('names the progressbar for assistive technology (aria-progressbar-name)', () => {
    render(<ReleaseTaskProgressBar done={2} total={5} />);

    expect(
      screen.getByRole('progressbar', { name: '2 of 5 tasks done' })
    ).toBeInTheDocument();
  });

  it('renders nothing when there are no tasks', () => {
    const { container } = render(<ReleaseTaskProgressBar done={0} total={0} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('confirms a finished campaign without an exclamation mark', () => {
    render(<ReleaseTaskProgressBar done={4} total={4} />);

    expect(
      screen.getByText('Campaign complete. All 4 tasks done.')
    ).toBeInTheDocument();
  });

  it.each([
    ['in progress', { done: 3, total: 8 }],
    ['overdue', { done: 2, total: 8, overdueCount: 3 }],
    ['not started', { done: 0, total: 8 }],
    ['complete', { done: 8, total: 8 }],
    ['large counts', { done: 1_234, total: 5_678, overdueCount: 987 }],
  ])('passes axe when %s', async (_label, props) => {
    const { container } = render(<ReleaseTaskProgressBar {...props} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute(
      'aria-valuenow',
      String(Math.round((props.done / props.total) * 100))
    );
    await expectNoA11yViolations(container);
  });

  it('reports zero progress before any task is done', () => {
    render(<ReleaseTaskProgressBar done={0} total={8} />);
    expect(screen.getByText('0/8 done')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '0'
    );
  });

  it('stays accessible right to left', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ReleaseTaskProgressBar done={2} total={8} overdueCount={1} />
      </div>
    );
    expect(
      screen.getByRole('progressbar', { name: '2 of 8 tasks done' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
