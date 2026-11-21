import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OpportunityRow } from './OpportunityRow';

function renderRow(props: Partial<Parameters<typeof OpportunityRow>[0]> = {}) {
  const onPrimaryAction = vi.fn();
  const onDismiss = vi.fn();
  const view = render(
    <ul>
      <OpportunityRow
        id='row-1'
        state='new'
        title='Detroit listeners up 340%'
        metadata='Magic Stick · Mar 15'
        onPrimaryAction={onPrimaryAction}
        onDismiss={onDismiss}
        {...props}
      />
    </ul>
  );
  return { ...view, onPrimaryAction, onDismiss };
}

describe('OpportunityRow certificate', () => {
  it('fires the primary action and dismiss with the row id and has no axe violations', async () => {
    const user = userEvent.setup();
    const { container, onPrimaryAction, onDismiss } = renderRow({
      primaryActionLabel: 'Approve buyer',
    });

    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'Approve buyer' }));
    expect(onPrimaryAction).toHaveBeenCalledWith('row-1');
    await user.click(screen.getByRole('button', { name: 'Dismiss Opportunity' }));
    expect(onDismiss).toHaveBeenCalledWith('row-1');
  });

  it('disables both actions while busy', async () => {
    const user = userEvent.setup();
    const { container, onPrimaryAction, onDismiss } = renderRow({
      isBusy: true,
    });

    await user.click(screen.getByRole('button', { name: 'Plan Opportunity' }));
    await user.click(screen.getByRole('button', { name: 'Dismiss Opportunity' }));
    expect(onPrimaryAction).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('renders an accepted row without metadata and no axe violations', async () => {
    const { container } = renderRow({ state: 'accepted', metadata: '' });

    expect(screen.getByRole('button', { name: 'Planned' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Dismiss Opportunity' })
    ).toBeNull();
    await expectNoA11yViolations(container);
  });
});
