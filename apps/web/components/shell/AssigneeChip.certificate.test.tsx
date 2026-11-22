import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AssigneeChip } from './AssigneeChip';

describe('AssigneeChip certificate', () => {
  it('keeps the compact and expanded Jovie assignee axe-clean', async () => {
    const { container, rerender } = render(<AssigneeChip kind='jovie' />);

    expect(screen.getByTitle('Assigned to Jovie')).toBeInTheDocument();
    await expectNoA11yViolations(container);

    rerender(<AssigneeChip kind='jovie' expanded name='Jovie Assistant' />);
    expect(screen.getByText('Jovie Assistant')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows a human avatar slot and long right-to-left name', async () => {
    const { container } = render(
      <div dir='rtl'>
        <AssigneeChip
          kind='human'
          expanded
          name='تيم وايت'
          avatar={<span>TW</span>}
          className='custom'
        />
      </div>
    );

    expect(screen.getByText('TW')).toBeInTheDocument();
    expect(screen.getByTitle('Assigned to تيم وايت')).toHaveClass('custom');
    await expectNoA11yViolations(container);
  });

  it('titles an unnamed human generically', async () => {
    const { container } = render(<AssigneeChip kind='human' />);

    expect(screen.getByTitle('Assigned')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
