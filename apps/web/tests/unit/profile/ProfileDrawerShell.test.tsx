import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { cloneElement, isValidElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ProfileDrawerShell } from '@/features/profile/ProfileDrawerShell';

vi.mock('vaul', () => ({
  Drawer: {
    Root: ({
      children,
    }: {
      readonly children: ReactNode;
      readonly open: boolean;
      readonly onOpenChange: (open: boolean) => void;
    }) => <>{children}</>,
    Portal: ({ children }: { readonly children: ReactNode }) => <>{children}</>,
    Overlay: (props: Record<string, unknown>) => <div {...props} />,
    Content: ({
      children,
      ...props
    }: {
      readonly children: ReactNode;
      [key: string]: unknown;
    }) => (
      <div role='dialog' aria-modal='true' {...props}>
        {children}
      </div>
    ),
    Title: ({
      children,
      asChild,
      ...props
    }: {
      readonly children: ReactNode;
      readonly asChild?: boolean;
      [key: string]: unknown;
    }) =>
      asChild && isValidElement(children) ? (
        cloneElement(children, props)
      ) : (
        <h2 {...props}>{children}</h2>
      ),
    Description: ({
      children,
      asChild,
      ...props
    }: {
      readonly children: ReactNode;
      readonly asChild?: boolean;
      [key: string]: unknown;
    }) =>
      asChild && isValidElement(children) ? (
        cloneElement(children, props)
      ) : (
        <p {...props}>{children}</p>
      ),
  },
}));

describe('ProfileDrawerShell', () => {
  it('exposes a labeled dialog contract with optional description', () => {
    render(
      <ProfileDrawerShell
        open
        onOpenChange={vi.fn()}
        title='Tour Dates'
        subtitle='Upcoming shows and ticket links.'
      >
        <div>Drawer body</div>
      </ProfileDrawerShell>
    );

    const dialog = screen.getByRole('dialog');

    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tour Dates' })).toBeVisible();
    expect(
      screen.getByText('Upcoming shows and ticket links.', { selector: 'p' })
    ).toBeVisible();
    expect(screen.getByText('Drawer body')).toBeInTheDocument();
  });

  it('renders an always-visible close button that invokes onOpenChange', () => {
    const onOpenChange = vi.fn();

    render(
      <ProfileDrawerShell open onOpenChange={onOpenChange} title='Menu'>
        <div>Drawer body</div>
      </ProfileDrawerShell>
    );

    const close = screen.getByTestId('profile-drawer-close-button');
    expect(close).toBeVisible();
    expect(close).toHaveAttribute('aria-label', 'Close');

    fireEvent.click(close);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('reserves the back-button slot for root-level drawers', () => {
    render(
      <ProfileDrawerShell open onOpenChange={vi.fn()} title='Menu'>
        <div>Drawer body</div>
      </ProfileDrawerShell>
    );

    expect(screen.getByTestId('profile-drawer-back-placeholder')).toBeVisible();
    expect(screen.getByTestId('profile-drawer-title-slot')).toBeInTheDocument();
    expect(
      screen.getByTestId('profile-drawer-subtitle-placeholder')
    ).toBeInTheDocument();
  });

  it('renders the back button only for secondary navigation levels', () => {
    const onBack = vi.fn();

    render(
      <ProfileDrawerShell
        open
        onOpenChange={vi.fn()}
        onBack={onBack}
        navigationLevel='secondary'
        title='Contact'
      >
        <div>Drawer body</div>
      </ProfileDrawerShell>
    );

    expect(screen.getByTestId('profile-drawer-back-button')).toBeVisible();
    expect(screen.queryByTestId('profile-drawer-back-placeholder')).toBeNull();
    expect(screen.getByTestId('profile-drawer-title-slot')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('profile-drawer-back-button'));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('anchors embedded drawers flush to the phone shell instead of floating them', () => {
    render(
      <ProfileDrawerShell
        open
        onOpenChange={vi.fn()}
        title='Contact'
        presentation='embedded'
        dataTestId='embedded-drawer'
      >
        <div>Drawer body</div>
      </ProfileDrawerShell>
    );

    const dialog = screen.getByTestId('embedded-drawer');
    expect(dialog.className).toContain('inset-x-0');
    expect(dialog.className).toContain('bottom-0');
  });
});
