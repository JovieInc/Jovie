import { Input } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DrawerFormGridRow } from './DrawerFormGridRow';

describe('DrawerFormGridRow certificate', () => {
  it('focuses the inline control from its label, axe-clean', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DrawerFormGridRow label='Release date' htmlFor='release-date'>
        <Input id='release-date' defaultValue='' />
      </DrawerFormGridRow>
    );

    await user.click(screen.getByText('Release date'));
    const field = screen.getByLabelText('Release date');
    expect(field).toHaveFocus();
    await user.type(field, '2026-09-12');
    expect(field).toHaveValue('2026-09-12');
    expect(screen.getByText('Release date')).toHaveClass(
      'text-quaternary-token'
    );
    await expectNoA11yViolations(container);
  });

  it('merges a label class override and a row class', async () => {
    const { container } = render(
      <DrawerFormGridRow
        label='Distribution'
        htmlFor='distribution'
        labelClassName='text-secondary-token'
        className='py-1'
      >
        <Input id='distribution' defaultValue='Worldwide' />
      </DrawerFormGridRow>
    );

    expect(screen.getByText('Distribution')).toHaveClass(
      'text-secondary-token'
    );
    expect(container.firstElementChild).toHaveClass('grid', 'py-1');
    await expectNoA11yViolations(container);
  });

  it('keeps long and RTL labels axe-clean', async () => {
    const { container } = render(
      <div dir='rtl'>
        <DrawerFormGridRow
          label='Original release date across every territory'
          htmlFor='long-date'
        >
          <Input id='long-date' defaultValue='2026-09-12' />
        </DrawerFormGridRow>
        <DrawerFormGridRow label='تاريخ الإصدار' htmlFor='rtl-date'>
          <Input id='rtl-date' defaultValue='2026-09-12' />
        </DrawerFormGridRow>
      </div>
    );

    expect(
      screen.getByLabelText('Original release date across every territory')
    ).toBeVisible();
    expect(screen.getByLabelText('تاريخ الإصدار')).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
