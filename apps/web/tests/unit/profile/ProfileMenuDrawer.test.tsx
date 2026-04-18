import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@jovie/ui', () => ({
  Switch: ({
    checked,
    onCheckedChange,
    'aria-label': ariaLabel,
  }: {
    readonly checked: boolean;
    readonly onCheckedChange: () => void;
    readonly 'aria-label': string;
    readonly className?: string;
  }) => (
    <button
      type='button'
      role='switch'
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onCheckedChange}
    />
  ),
}));

vi.mock('@/features/profile/ProfileDrawerShell', () => ({
  ProfileDrawerShell: ({
    children,
    title,
    open,
  }: {
    readonly children: ReactNode;
    readonly title: string;
    readonly open: boolean;
  }) =>
    open ? (
      <div role='dialog' aria-label={title}>
        {children}
      </div>
    ) : null,
}));

describe('ProfileMenuDrawer', () => {
  it('uses plain dialog buttons instead of menu semantics for profile actions', async () => {
    const { ProfileMenuDrawer } = await import(
      '@/features/profile/ProfileMenuDrawer'
    );

    render(
      <ProfileMenuDrawer
        open
        onOpenChange={() => {}}
        isSubscribed={false}
        contentPrefs={{
          newMusic: true,
          tourDates: true,
          merch: false,
          general: true,
        }}
        onTogglePref={() => {}}
        onUnsubscribe={() => {}}
        isUnsubscribing={false}
        onShare={() => {}}
        onOpenAbout={() => {}}
        onOpenTour={() => {}}
        onOpenTip={() => {}}
        onOpenContact={() => {}}
        onOpenSubscribe={() => {}}
        hasAbout
        hasTourDates
        hasTip
        hasContacts
      />
    );

    expect(screen.getByRole('dialog', { name: 'Menu' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Share Profile' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'About' })).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  it('opens the notifications view as dialog content with switches', async () => {
    const { ProfileMenuDrawer } = await import(
      '@/features/profile/ProfileMenuDrawer'
    );

    render(
      <ProfileMenuDrawer
        open
        onOpenChange={() => {}}
        isSubscribed
        contentPrefs={{
          newMusic: true,
          tourDates: false,
          merch: false,
          general: true,
        }}
        onTogglePref={() => {}}
        onUnsubscribe={() => {}}
        isUnsubscribing={false}
        onShare={() => {}}
        onOpenAbout={() => {}}
        onOpenTour={() => {}}
        onOpenTip={() => {}}
        onOpenContact={() => {}}
        onOpenSubscribe={() => {}}
        hasAbout
        hasTourDates
        hasTip
        hasContacts
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));

    expect(
      screen.getByRole('switch', { name: 'New Music' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Turn off notifications' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });
});
