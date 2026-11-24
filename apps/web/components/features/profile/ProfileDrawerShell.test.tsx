import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ProfileDrawerShell } from './ProfileDrawerShell';

describe('ProfileDrawerShell', () => {
  it.each([
    { presentation: 'modal' as const, label: 'modal' },
    { presentation: 'embedded' as const, label: 'embedded' },
  ])(
    'has no axe violations in $label presentation',
    async ({ presentation }) => {
      const { container } = render(
        <ProfileDrawerShell
          open
          onOpenChange={vi.fn()}
          title='Menu'
          presentation={presentation}
          dataTestId='profile-drawer'
        >
          <p>Share Profile</p>
        </ProfileDrawerShell>
      );
      expect(screen.getByTestId('profile-drawer')).toBeInTheDocument();
      await expectNoA11yViolations(container);
    }
  );

  it('has no axe violations with a long truncated title', async () => {
    const title =
      'A very long drawer title that should truncate cleanly across the header';
    const { container } = render(
      <ProfileDrawerShell
        open
        onOpenChange={vi.fn()}
        title={title}
        presentation='modal'
        navigationLevel='direct'
      >
        <p>Body</p>
      </ProfileDrawerShell>
    );
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('has no axe violations in an RTL overflow frame', async () => {
    const title = 'قائمة الملف الشخصي';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ProfileDrawerShell
          open
          onOpenChange={vi.fn()}
          title={title}
          presentation='modal'
          navigationLevel='direct'
        >
          <p>المحتوى</p>
        </ProfileDrawerShell>
      </div>
    );
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('uses PlainButton for the close control', () => {
    render(
      <ProfileDrawerShell
        open
        onOpenChange={vi.fn()}
        title='Pay'
        presentation='modal'
        navigationLevel='direct'
      >
        <p>Body</p>
      </ProfileDrawerShell>
    );
    const close = screen.getByTestId('profile-drawer-close-button');
    expect(close.getAttribute('data-slot')).toBe('plain-button');
    expect(close).toHaveClass('h-11', 'w-11');
  });

  it('dismisses via the close control', async () => {
    const onOpenChange = vi.fn();
    render(
      <ProfileDrawerShell
        open
        onOpenChange={onOpenChange}
        title='Pay'
        presentation='modal'
        navigationLevel='direct'
      >
        <p>Body</p>
      </ProfileDrawerShell>
    );
    await userEvent.click(screen.getByTestId('profile-drawer-close-button'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders the embedded surface as a role=dialog card (not a native dialog)', () => {
    const { container } = render(
      <ProfileDrawerShell
        open
        onOpenChange={vi.fn()}
        title='Menu'
        presentation='embedded'
        dataTestId='embedded-drawer'
      >
        <p>Share</p>
      </ProfileDrawerShell>
    );
    expect(screen.getByTestId('embedded-drawer')).toHaveAttribute(
      'role',
      'dialog'
    );
    expect(container.querySelector('dialog')).toBeNull();
  });
});
