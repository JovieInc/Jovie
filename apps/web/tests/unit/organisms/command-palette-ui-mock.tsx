/** The @jovie/ui stand-ins CommandPalette.test.tsx mocks the package with. */
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  Ref,
} from 'react';

const ui = {
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div role='dialog'>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type='button' onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  PlainButton: ({
    children,
    ...props
  }: { children?: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
  // CmdKMainPlaneSearchInput draws through HostDrawnInput; keep a real
  // <input> so focus and aria-label queries match production.
  HostDrawnInput: ({
    ref,
    ...props
  }: InputHTMLAttributes<HTMLInputElement> & {
    ref?: Ref<HTMLInputElement>;
  }) => <input ref={ref} data-host-drawn='' {...props} />,
};

export const { Dialog, DialogContent, Button, PlainButton, HostDrawnInput } =
  ui;
