import { Input } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { InputAuraFrame } from './InputAuraFrame';

const LONG_NAME =
  'Tim White and the Late Night Los Angeles Orchestra featuring Everyone';

describe('InputAuraFrame certificate', () => {
  it('lets the wrapped field take focus and typing in the default treatment', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <InputAuraFrame>
        <Input aria-label='Search your name' />
      </InputAuraFrame>
    );

    const field = screen.getByRole('textbox', { name: 'Search your name' });
    await user.click(field);
    await user.type(field, LONG_NAME);
    expect(field).toHaveFocus();
    expect(field).toHaveValue(LONG_NAME);
    expect(container.firstElementChild).toHaveAttribute(
      'data-aura-treatment',
      'default'
    );
    await expectNoA11yViolations(container);
  });

  it('merges a caller class on the editorial treatment', async () => {
    const { container } = render(
      <InputAuraFrame treatment='editorial' className='hero-field'>
        <Input aria-label='Search your name' />
      </InputAuraFrame>
    );

    expect(container.firstElementChild).toHaveClass(
      'input-aura-frame',
      'input-aura-frame--editorial',
      'hero-field'
    );
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean with an Arabic field in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <InputAuraFrame>
          <Input aria-label='ابحث عن اسمك' defaultValue='تيم وايت' />
        </InputAuraFrame>
      </div>
    );

    expect(screen.getByRole('textbox', { name: 'ابحث عن اسمك' })).toHaveValue(
      'تيم وايت'
    );
    await expectNoA11yViolations(container);
  });
});
