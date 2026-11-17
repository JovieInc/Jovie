import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MenuView } from './MenuView';

describe('MenuView certificate', () => {
  it('navigates to each entry by pointer and keyboard', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const onOpenReleaseCredits = vi.fn();
    const { container } = render(
      <MenuView
        onNavigate={onNavigate}
        hasReleases
        hasTourDates={false}
        hasTip
        hasContacts
        onOpenReleaseCredits={onOpenReleaseCredits}
      />
    );

    await user.click(screen.getByRole('menuitem', { name: 'Pay' }));
    expect(onNavigate).toHaveBeenLastCalledWith('pay');

    screen.getByRole('menuitem', { name: 'Contact' }).focus();
    await user.keyboard('{Enter}');
    expect(onNavigate).toHaveBeenLastCalledWith('contact');

    await user.click(screen.getByRole('menuitem', { name: 'Release credits' }));
    expect(onOpenReleaseCredits).toHaveBeenCalledTimes(1);
    for (const item of screen.getAllByRole('menuitem')) {
      expect(item).toHaveAttribute('type', 'button');
    }
    await expectNoA11yViolations(container);
  });

  it('keeps Share as the only entry when nothing else is available', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const { container } = render(
      <MenuView
        onNavigate={onNavigate}
        hasReleases={false}
        hasTourDates={false}
        hasTip={false}
        hasContacts={false}
      />
    );

    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
    await user.click(screen.getByRole('menuitem', { name: 'Share Profile' }));
    expect(onNavigate).toHaveBeenCalledWith('share');
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <MenuView
          onNavigate={vi.fn()}
          hasReleases
          hasTourDates
          hasTip
          hasContacts
        />
      </div>
    );

    expect(
      screen.getAllByRole('menuitem').map(item => item.textContent)
    ).toEqual(['Share Profile', 'Pay', 'Contact']);
    await expectNoA11yViolations(container);
  });
});
