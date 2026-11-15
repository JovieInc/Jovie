import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DisclosureRow } from './DisclosureRow';

const detail = 'Public composition observations, not master ownership.';

describe('DisclosureRow certificate', () => {
  it('toggles its region from pointer and keyboard, axe-clean both ways', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DisclosureRow label='Rightsholders' summary='2 observed'>
        <p>{detail}</p>
      </DisclosureRow>
    );

    const toggle = screen.getByRole('button', { name: /Rightsholders/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(detail)).toBeNull();
    await expectNoA11yViolations(container);

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const region = screen.getByText(detail).parentElement;
    expect(region).toHaveAttribute('id', toggle.getAttribute('aria-controls'));
    await expectNoA11yViolations(container);

    toggle.focus();
    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(detail)).toBeNull();
  });

  it('starts open without a summary (partial)', async () => {
    const { container } = render(
      <DisclosureRow label='Rightsholders' defaultOpen className='mt-1'>
        <p>{detail}</p>
      </DisclosureRow>
    );

    expect(
      screen.getByRole('button', { name: 'Rightsholders' })
    ).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(detail)).toBeVisible();
    expect(container.firstElementChild).toHaveClass('min-w-0', 'mt-1');
    await expectNoA11yViolations(container);
  });

  it('keeps long and RTL labels axe-clean', async () => {
    const label =
      'Rightsholders, publishers and collecting societies observed for this work';
    const { container } = render(
      <div dir='rtl'>
        <DisclosureRow label={label} summary='12 observed' defaultOpen>
          <p>{detail}</p>
        </DisclosureRow>
        <DisclosureRow label='أصحاب الحقوق' summary='٢ ملاحظة'>
          <p>ملاحظات عامة</p>
        </DisclosureRow>
      </div>
    );

    expect(screen.getByText(label)).toHaveClass('truncate');
    expect(screen.getByRole('button', { name: /أصحاب الحقوق/ })).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
