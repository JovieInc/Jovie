import type { ComponentProps, ReactNode } from 'react';

// The @jovie/ui mock for ChatMessage.test.tsx.
const ui = {
  Button: ({
    children,
    size,
    variant,
    ...props
  }: ComponentProps<'button'> & { size?: string; variant?: string }) => (
    <button data-size={size} data-variant={variant} {...props}>
      {children}
    </button>
  ),
  IconButton: ({
    children,
    asChild: _,
    ...props
  }: ComponentProps<'button'> & { asChild?: boolean }) => (
    <button {...props}>{children}</button>
  ),
  PlainButton: ({
    children,
    asChild: _,
    ...props
  }: ComponentProps<'button'> & { asChild?: boolean }) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
  ICON_BUTTON_VISIBLE_CLASSNAME:
    'p-0.5 opacity-60 hover:opacity-100 focus-visible:opacity-100',
  ICON_BUTTON_FADE_CLASSNAME:
    'p-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100',
  Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({
    children,
    testId = 'popover-content',
  }: {
    children: ReactNode;
    testId?: string;
  }) => <div data-testid={testId}>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  SimpleTooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  Skeleton: ({
    rounded: _rounded,
    ...props
  }: ComponentProps<'div'> & { rounded?: string }) => <div {...props} />,
};

export const {
  Button,
  IconButton,
  PlainButton,
  ICON_BUTTON_VISIBLE_CLASSNAME,
  ICON_BUTTON_FADE_CLASSNAME,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SimpleTooltip,
  Skeleton,
} = ui;
