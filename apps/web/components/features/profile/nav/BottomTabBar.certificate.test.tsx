import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { BottomTabBar } from './BottomTabBar';

describe('BottomTabBar certificate', () => {
  it('selects destinations by pointer and keyboard and stays axe-clean', async () => {
    const user = userEvent.setup();
    const onTabSelect = vi.fn();
    const { container } = render(
      <BottomTabBar
        activeTab='profile'
        hasTourDates
        onTabSelect={onTabSelect}
      />
    );

    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await user.click(screen.getByRole('button', { name: 'Events' }));
    expect(onTabSelect).toHaveBeenLastCalledWith('tour');

    screen.getByRole('button', { name: 'About' }).focus();
    await user.keyboard('{Enter}');
    expect(onTabSelect).toHaveBeenLastCalledWith('about');
    expect(screen.getByRole('button', { name: 'About' })).toHaveAttribute(
      'type',
      'button'
    );
    await expectNoA11yViolations(container);
  });

  it('hides Events when there are no tour dates (JOV-14241)', async () => {
    const { container } = render(
      <BottomTabBar
        activeTab='profile'
        hasTourDates={false}
        onTabSelect={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: 'Events' })).toBeNull();
    expect(screen.getByRole('button', { name: 'About' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('marks no destination active while the menu is open', async () => {
    const { container } = render(
      <BottomTabBar
        activeTab='listen'
        hasTourDates
        isMenuOpen
        onTabSelect={vi.fn()}
      />
    );

    for (const name of ['Home', 'Music', 'Events', 'About']) {
      expect(screen.getByRole('button', { name })).not.toHaveAttribute(
        'aria-current'
      );
    }
    await expectNoA11yViolations(container);
  });

  it('keeps a long claim bar and right-to-left document axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <BottomTabBar
          activeTab='about'
          hasTourDates
          onTabSelect={vi.fn()}
          aboveNav={
            <p>
              Is this your profile? Claim it to edit your links, see who is
              listening and turn on alerts for every new release.
            </p>
          }
        />
      </div>
    );

    expect(screen.getByText(/Is this your profile/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'About' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expectNoA11yViolations(container);
  });
});
