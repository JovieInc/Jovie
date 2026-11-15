import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CollapsibleSectionHeading } from './CollapsibleSectionHeading';

describe('CollapsibleSectionHeading certificate', () => {
  it('toggles from the keyboard and stays axe-clean open and closed', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { container, rerender } = render(
      <div>
        <CollapsibleSectionHeading
          isOpen
          onToggle={onToggle}
          aria-controls='details-panel'
        >
          Details
        </CollapsibleSectionHeading>
        <div id='details-panel'>Details content</div>
      </div>
    );
    await expectNoA11yViolations(container);

    await user.tab();
    const heading = screen.getByRole('button', { name: 'Details' });
    expect(heading).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onToggle).toHaveBeenCalledOnce();

    rerender(
      <div>
        <CollapsibleSectionHeading isOpen={false} onToggle={onToggle}>
          Details
        </CollapsibleSectionHeading>
      </div>
    );
    expect(heading).toHaveAttribute('aria-expanded', 'false');
    expect(heading).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('renders a long RTL heading without violations', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <CollapsibleSectionHeading isOpen={false} onToggle={vi.fn()}>
          تفاصيل الجمهور وأهم المدن واتجاهات المستمعين العائدين
        </CollapsibleSectionHeading>
      </div>
    );
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    await expectNoA11yViolations(container);
  });
});
