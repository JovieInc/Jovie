import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ProfileQuickActions } from './ProfileQuickActions';

describe('ProfileQuickActions certificate', () => {
  it('routes every pane action through onModeSelect and stays axe-clean', async () => {
    const user = userEvent.setup();
    const onModeSelect = vi.fn();
    const onBookClick = vi.fn();
    const { container } = render(
      <ProfileQuickActions
        activeMode='profile'
        onModeSelect={onModeSelect}
        onBookClick={onBookClick}
      />
    );

    expect(
      screen.getByRole('navigation', { name: 'Profile Actions' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(5);

    await user.click(screen.getByRole('button', { name: 'Profile' }));
    await user.click(screen.getByRole('button', { name: 'Events' }));
    await user.click(screen.getByRole('button', { name: 'Pay' }));
    await user.click(screen.getByRole('button', { name: 'About' }));
    expect(onModeSelect.mock.calls).toEqual([
      ['profile'],
      ['tour'],
      ['pay'],
      ['about'],
    ]);

    await user.click(screen.getByRole('button', { name: 'Book' }));
    expect(onBookClick).toHaveBeenCalledTimes(1);
    expect(onModeSelect).toHaveBeenCalledTimes(4);
    await expectNoA11yViolations(container);
  });

  it('ignores Book while booking is disabled and stays axe-clean in RTL', async () => {
    const user = userEvent.setup();
    const onModeSelect = vi.fn();
    const onBookClick = vi.fn();
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ProfileQuickActions
          activeMode='about'
          onModeSelect={onModeSelect}
          onBookClick={onBookClick}
          bookingDisabled
        />
      </div>
    );

    const book = screen.getByRole('button', { name: 'Book' });
    expect(book).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'About' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await user.click(book);
    expect(onBookClick).not.toHaveBeenCalled();
    expect(onModeSelect).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });
});
