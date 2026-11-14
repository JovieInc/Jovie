import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DashboardCard } from './DashboardCard';

describe('DashboardCard certificate', () => {
  it('renders a static surface without button semantics', async () => {
    const { container } = render(
      <DashboardCard data-testid='card' aria-label='Summary' role='region'>
        <p>Card body</p>
      </DashboardCard>
    );

    const card = screen.getByTestId('card');
    expect(card.tagName).toBe('DIV');
    expect(card).not.toHaveAttribute('type');
    expect(screen.getByRole('region', { name: 'Summary' })).toHaveTextContent(
      'Card body'
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('becomes a button that calls onClick when clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <DashboardCard variant='interactive' onClick={onClick}>
        Open analytics
      </DashboardCard>
    );

    const button = screen.getByRole('button', { name: 'Open analytics' });
    expect(button).toHaveAttribute('type', 'button');
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('activates from the keyboard', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<DashboardCard onClick={onClick}>Keyboard card</DashboardCard>);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Keyboard card' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps long content and right-to-left content accessible', async () => {
    const long =
      'Release-day checklist for every connected streaming platform and region';
    const { container } = render(
      <div dir='rtl'>
        <DashboardCard variant='empty-state' className='w-80'>
          <h3>{long}</h3>
          <p>هذه بطاقة لوحة تحكم افتراضية.</p>
        </DashboardCard>
      </div>
    );

    expect(screen.getByRole('heading', { name: long })).toBeInTheDocument();
    expect(screen.getByText('هذه بطاقة لوحة تحكم افتراضية.')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
