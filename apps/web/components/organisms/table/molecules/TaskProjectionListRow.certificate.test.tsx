import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TaskProjectionListRow } from './TaskProjectionListRow';

const baseProps = {
  testId: 'task-projection-row',
  leading: <span aria-hidden='true'>◷</span>,
  title: 'Cache Symphony workspaces on NVMe',
  metadata: <div>Running · JOV-5544</div>,
};

describe('TaskProjectionListRow certificate', () => {
  it('passes clicks to a slotted action and stays axe-clean', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { container } = render(
      <TaskProjectionListRow
        {...baseProps}
        titleAfter={<span>Blocked</span>}
        actionSlot={
          <button type='button' onClick={onRetry}>
            Retry
          </button>
        }
      />
    );

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Blocked')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it.each(['full', 'muted', 'quiet'] as const)(
    'stays axe-clean at %s opacity',
    async opacity => {
      const { container } = render(
        <TaskProjectionListRow {...baseProps} opacity={opacity} />
      );

      expect(screen.getByTestId('task-projection-row')).toBeInTheDocument();
      await expectNoA11yViolations(container);
    }
  );

  it('stays axe-clean with metadata only and with a selected RTL row', async () => {
    const { container, rerender } = render(
      <TaskProjectionListRow {...baseProps} title={undefined} />
    );
    expect(container.querySelector('p')).toBeNull();
    await expectNoA11yViolations(container);

    rerender(
      <div dir='rtl'>
        <TaskProjectionListRow
          {...baseProps}
          title='تخزين مساحات العمل مؤقتًا'
          isSelected
        />
      </div>
    );
    expect(screen.getByText('تخزين مساحات العمل مؤقتًا')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
