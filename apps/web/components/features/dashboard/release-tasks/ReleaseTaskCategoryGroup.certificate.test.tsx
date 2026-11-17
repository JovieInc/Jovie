import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ReleaseTaskCategoryGroup } from './ReleaseTaskCategoryGroup';

describe('ReleaseTaskCategoryGroup certificate', () => {
  it('toggles its rows with a pointer and stays axe-clean open and closed', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ReleaseTaskCategoryGroup category='Creative' done={1} total={3}>
        <p>Shoot the cover art</p>
      </ReleaseTaskCategoryGroup>
    );

    expect(
      screen.getByRole('region', { name: 'Creative — 1 of 3 complete' })
    ).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: /Creative/ });
    expect(toggle).toHaveAttribute('type', 'button');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Shoot the cover art')).toBeVisible();
    await expectNoA11yViolations(container);

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Shoot the cover art')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('starts collapsed with a check when every task is done', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ReleaseTaskCategoryGroup
        category='Distribution'
        done={2}
        total={2}
        allDone
      >
        <p>Upload masters</p>
      </ReleaseTaskCategoryGroup>
    );

    const toggle = screen.getByRole('button', { name: /Distribution/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('(2/2)');
    expect(container.querySelector('svg.text-success')).not.toBeNull();
    await expectNoA11yViolations(container);

    toggle.focus();
    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Upload masters')).toBeVisible();
  });

  it('honours defaultOpen over the all-done default', () => {
    render(
      <ReleaseTaskCategoryGroup
        category='Press'
        done={1}
        total={1}
        allDone
        defaultOpen
      >
        <p>Send the press kit</p>
      </ReleaseTaskCategoryGroup>
    );

    expect(screen.getByRole('button', { name: /Press/ })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByText('Send the press kit')).toBeVisible();
  });

  it('stays axe-clean with an empty category in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ReleaseTaskCategoryGroup category='التسويق' done={0} total={0}>
          {null}
        </ReleaseTaskCategoryGroup>
      </div>
    );

    expect(screen.getByRole('button', { name: /التسويق/ })).toHaveTextContent(
      '(0/0)'
    );
    await expectNoA11yViolations(container);
  });
});
