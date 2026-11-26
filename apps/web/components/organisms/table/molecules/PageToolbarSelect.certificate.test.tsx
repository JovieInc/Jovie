import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PageToolbarSelect } from './PageToolbarSelect';

type Identity = 'all' | 'identified';

describe('PageToolbarSelect certificate', () => {
  it('opens, selects an option and stays axe-clean closed and open', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { container } = render(
      <PageToolbarSelect<Identity>
        label='Identity'
        value='all'
        defaultValue='all'
        onValueChange={onValueChange}
        options={[
          { value: 'all', label: 'All People' },
          {
            value: 'identified',
            label: 'Identified',
            menuLabel: 'Identified (3)',
          },
        ]}
      />
    );

    await expectNoA11yViolations(container);
    await user.click(
      screen.getByRole('button', { name: 'Identity: All People' })
    );
    await user.click(
      screen.getByRole('menuitemradio', { name: 'Identified (3)' })
    );
    expect(onValueChange).toHaveBeenCalledWith('identified');
  });

  it('falls back to the raw value with no options and renders right-to-left axe-clean', async () => {
    const { container } = render(
      <div dir='rtl'>
        <PageToolbarSelect<Identity>
          label='الهوية'
          value='all'
          options={[]}
          onValueChange={vi.fn()}
          data-testid='sel'
        />
      </div>
    );

    expect(screen.getByTestId('sel')).toHaveTextContent('all');
    await expectNoA11yViolations(container);
  });
});
