import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
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
      ...props
    }: {
      readonly children: ReactNode;
      [key: string]: unknown;
    }) => <h2 {...props}>{children}</h2>,
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

    const dialog = screen.getByRole('dialog', { name: 'Tour Dates' });

    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-describedby');
    expect(
      screen.getByText('Upcoming shows and ticket links.')
    ).toBeInTheDocument();
    expect(screen.getByText('Drawer body')).toBeInTheDocument();
  });

  it('wires the close button to onOpenChange(false)', () => {
    const onOpenChange = vi.fn();

    render(
      <ProfileDrawerShell open onOpenChange={onOpenChange} title='Menu'>
        <div>Drawer body</div>
      </ProfileDrawerShell>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
