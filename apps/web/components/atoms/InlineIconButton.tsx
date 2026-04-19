'use client';

import { Button } from '@jovie/ui';
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from 'react';

import { cn } from '@/lib/utils';

export const INLINE_ICON_BUTTON_BASE_CLASSNAME =
  'h-auto w-auto shrink-0 rounded-full border border-transparent bg-transparent p-0.5 text-secondary-token leading-none shadow-none transition-[opacity,background-color,color,box-shadow] duration-150 hover:bg-surface-1 focus-visible:bg-surface-1 focus-visible:ring-1 focus-visible:ring-(--linear-border-focus) [&_svg]:block';

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
      <Button asChild variant='ghost' size='icon' className={sharedClassName}>
        <a href={href} {...anchorProps}>
          {children}
        </a>
      </Button>
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
    <Button
      type={type}
      variant='ghost'
      size='icon'
      className={sharedClassName}
      {...buttonProps}
    >
      {children}
    </Button>
  );
}
