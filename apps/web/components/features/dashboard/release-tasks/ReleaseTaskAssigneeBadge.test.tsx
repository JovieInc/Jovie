import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ReleaseTaskAssigneeBadge } from './ReleaseTaskAssigneeBadge';

describe('ReleaseTaskAssigneeBadge', () => {
  it.each([
    { assigneeType: 'human' as const, label: 'Me', otherLabel: 'Jovie' },
    { assigneeType: 'ai_workflow' as const, label: 'Jovie', otherLabel: 'Me' },
  ])(
    'identifies the $assigneeType assignee without relying on its color',
    async ({ assigneeType, label, otherLabel }) => {
      const { container, rerender } = render(
        <ReleaseTaskAssigneeBadge assigneeType={assigneeType} />
      );

      expect(screen.getByText(label)).toBeVisible();
      expect(screen.queryByText(otherLabel)).not.toBeInTheDocument();
      expect(
        container.querySelector('[aria-hidden="true"]')
      ).toBeEmptyDOMElement();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      await expectNoA11yViolations(container);

      rerender(
        <div dir='rtl'>
          <ReleaseTaskAssigneeBadge assigneeType={assigneeType} />
        </div>
      );
      expect(screen.getByText(label)).toBeVisible();
      await expectNoA11yViolations(container);
    }
  );

  it('updates the visible assignee when the task is reassigned', () => {
    const { rerender } = render(
      <ReleaseTaskAssigneeBadge assigneeType='human' />
    );
    expect(screen.getByText('Me')).toBeVisible();

    rerender(<ReleaseTaskAssigneeBadge assigneeType='ai_workflow' />);
    expect(screen.getByText('Jovie')).toBeVisible();
    expect(screen.queryByText('Me')).not.toBeInTheDocument();

    rerender(<ReleaseTaskAssigneeBadge assigneeType='human' />);
    expect(screen.getByText('Me')).toBeVisible();
    expect(screen.queryByText('Jovie')).not.toBeInTheDocument();
  });
});
