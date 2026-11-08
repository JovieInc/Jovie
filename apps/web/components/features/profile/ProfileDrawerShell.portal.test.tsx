import { act, fireEvent, render, screen } from '@testing-library/react';
import { type ReactNode, useState } from 'react';
import { expect, it, vi } from 'vitest';
import { ProfileDrawerShell } from './ProfileDrawerShell';

const portal = vi.hoisted(() => ({
  attach: undefined as (() => void) | undefined,
  finishExit: undefined as (() => void) | undefined,
}));

vi.mock('vaul', async () => {
  const { useEffect, useLayoutEffect, useRef, useState } = await import(
    'react'
  );
  const Pass = ({ children }: { readonly children: ReactNode }) => children;
  function DeferredRoot({
    children,
    open,
  }: {
    readonly children: ReactNode;
    readonly open: boolean;
  }) {
    const [present, setPresent] = useState(open);
    useEffect(() => {
      if (open) setPresent(true);
      else portal.finishExit = () => setPresent(false);
    }, [open]);
    return present ? children : null;
  }
  function DelayedPortal({ children }: { readonly children: ReactNode }) {
    const [attached, setAttached] = useState(false);
    useEffect(() => {
      portal.attach = () => setAttached(true);
      return () => {
        portal.attach = undefined;
      };
    }, []);
    return attached ? children : null;
  }
  function DeferredContent({
    onCloseAutoFocus,
    ...props
  }: Record<string, unknown> & {
    readonly onCloseAutoFocus?: (event: Event) => void;
  }) {
    const onCloseRef = useRef(onCloseAutoFocus);
    useLayoutEffect(() => {
      onCloseRef.current = onCloseAutoFocus;
    }, [onCloseAutoFocus]);
    useEffect(
      () => () => onCloseRef.current?.(new Event('closeAutoFocus')),
      []
    );
    return <div role='dialog' tabIndex={-1} {...props} />;
  }
  return {
    Drawer: {
      Root: DeferredRoot,
      Portal: DelayedPortal,
      Overlay: (props: Record<string, unknown>) => <div {...props} />,
      Content: DeferredContent,
      Title: Pass,
      Description: Pass,
    },
  };
});

function DelayedMenu() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type='button' onClick={() => setOpen(true)}>
        Menu
      </button>
      <ProfileDrawerShell open={open} onOpenChange={setOpen} title='Menu'>
        <button type='button'>Share Profile</button>
        <button type='button'>Contact</button>
      </ProfileDrawerShell>
    </>
  );
}

it('activates the focus boundary when the standalone portal attaches after opening', () => {
  render(<DelayedMenu />);
  const opener = screen.getByRole('button', { name: 'Menu' });
  opener.focus();
  fireEvent.click(opener);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(portal.attach).toBeDefined();
  act(() => portal.attach?.());
  const first = screen.getByRole('button', { name: 'Share Profile' });
  const last = screen.getByRole('button', { name: 'Contact' });
  expect(first).toHaveFocus();
  first.focus();
  fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
  expect(last).toHaveFocus();
  fireEvent.keyDown(document, { key: 'Tab' });
  expect(first).toHaveFocus();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  act(() => portal.finishExit?.());
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(opener).toHaveFocus();
});
