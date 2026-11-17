import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DrawerEntityAvatar } from './DrawerEntityAvatar';

describe('DrawerEntityAvatar certificate', () => {
  it('shows initials for a name-only avatar (partial), axe-clean', async () => {
    const { container } = render(
      <DrawerEntityAvatar name='Alex Rivera' testId='avatar' />
    );

    expect(screen.getByTestId('avatar')).toHaveTextContent('AR');
    expect(screen.getByRole('img', { name: 'Alex Rivera' })).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('keeps a long verified name as the accessible name', async () => {
    const name = 'Alexandria Catalina Rivera-Montgomery de la Cruz';
    const { container } = render(
      <DrawerEntityAvatar name={name} verified testId='avatar' />
    );

    expect(screen.getByRole('img', { name })).toBeVisible();
    expect(screen.getByTestId('avatar')).toHaveStyle({ width: '56px' });
    await expectNoA11yViolations(container);
  });

  it('renders an Arabic name inside an RTL drawer', async () => {
    const { container } = render(
      <div dir='rtl'>
        <DrawerEntityAvatar name='عمرو دياب' testId='avatar' />
      </div>
    );

    expect(screen.getByRole('img', { name: 'عمرو دياب' })).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
