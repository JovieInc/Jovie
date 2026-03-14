'use client';

import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from 'react';

import { cn } from '@/lib/utils';

export const INLINE_ICON_BUTTON_BASE_CLASSNAME =
  'shrink-0 rounded-[6px] border border-transparent text-(--linear-text-quaternary) transition-[opacity,background-color,border-color,color,box-shadow] duration-150 hover:border-(--linear-border-subtle) hover:bg-(--linear-bg-surface-1) hover:text-(--linear-text-secondary) focus-visible:outline-none focus-visible:border-(--linear-border-focus) focus-visible:bg-(--linear-bg-surface-1) focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)';

export const INLINE_ICON_BUTTON_VISIBLE_CLASSNAME =
  'p-0.5 opacity-60 hover:opacity-100 focus-visible:opacity-100';

export const INLINE_ICON_BUTTON_FADE_CLASSNAME =
  'p-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100';

interface InlineIconButtonSharedProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly fadeOnParentHover?: boolean;
}

type InlineIconButtonAnchorProps = InlineIconButtonSharedProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> & {
    readonly href: string;
  };

type InlineIconButtonButtonProps = InlineIconButtonSharedProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
    readonly href?: never;
  };

export type InlineIconButtonProps =
  | InlineIconButtonAnchorProps
  | InlineIconButtonButtonProps;

export function InlineIconButton(props: InlineIconButtonProps) {
  if ('href' in props && typeof props.href === 'string') {
    const {
      children,
      className,
      fadeOnParentHover = false,
      href,
      ...anchorProps
    } = props;

    const sharedClassName = cn(
      INLINE_ICON_BUTTON_BASE_CLASSNAME,
      fadeOnParentHover
        ? INLINE_ICON_BUTTON_FADE_CLASSNAME
        : INLINE_ICON_BUTTON_VISIBLE_CLASSNAME,
      className
    );

    return (
      <a href={href} className={sharedClassName} {...anchorProps}>
        {children}
      </a>
    );
  }

  const {
    children,
    className,
    fadeOnParentHover = false,
    type = 'button',
    ...buttonProps
  } = props;

  const sharedClassName = cn(
    INLINE_ICON_BUTTON_BASE_CLASSNAME,
    fadeOnParentHover
      ? INLINE_ICON_BUTTON_FADE_CLASSNAME
      : INLINE_ICON_BUTTON_VISIBLE_CLASSNAME,
    className
  );

  return (
    <button type={type} className={sharedClassName} {...buttonProps}>
      {children}
    </button>
  );
}
