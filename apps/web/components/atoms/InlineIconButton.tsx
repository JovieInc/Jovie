'use client';

import {
  ICON_BUTTON_FADE_CLASSNAME,
  ICON_BUTTON_VISIBLE_CLASSNAME,
  IconButton,
} from '@jovie/ui';
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from 'react';
import React from 'react';

import { cn } from '@/lib/utils';

// Compat wrapper (JOV-4871): drawer/edit affordance icon buttons now use the
// canonical `inline` variant on @jovie/ui IconButton. The class constants are
// re-exported from the shared contract so existing imports keep working.
//
// @coverage-via apps/web/tests/unit/atoms/InlineIconButton.test.tsx
export const INLINE_ICON_BUTTON_BASE_CLASSNAME =
  'shrink-0 p-0.5 text-secondary-token leading-none shadow-none transition-[opacity,background-color,color,box-shadow,transform] duration-subtle ease-subtle hover:bg-surface-1 focus-visible:bg-surface-1 [&_svg]:block';

export const INLINE_ICON_BUTTON_VISIBLE_CLASSNAME =
  ICON_BUTTON_VISIBLE_CLASSNAME;

export const INLINE_ICON_BUTTON_FADE_CLASSNAME = ICON_BUTTON_FADE_CLASSNAME;

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

export const InlineIconButton = React.memo(function InlineIconButton(
  props: InlineIconButtonProps
) {
  const sharedClassName = (className?: string, fadeOnParentHover = false) =>
    cn(
      fadeOnParentHover
        ? INLINE_ICON_BUTTON_FADE_CLASSNAME
        : INLINE_ICON_BUTTON_VISIBLE_CLASSNAME,
      className
    );

  if ('href' in props && typeof props.href === 'string') {
    const {
      children,
      className,
      fadeOnParentHover = false,
      href,
      ...anchorProps
    } = props;

    return (
      <IconButton
        variant='inline'
        size='lg'
        asChild
        className={sharedClassName(className, fadeOnParentHover)}
      >
        <a href={href} {...anchorProps}>
          {children}
        </a>
      </IconButton>
    );
  }

  const {
    children,
    className,
    fadeOnParentHover = false,
    type = 'button',
    ...buttonProps
  } = props;

  return (
    <IconButton
      variant='inline'
      size='lg'
      type={type}
      className={sharedClassName(className, fadeOnParentHover)}
      {...buttonProps}
    >
      {children}
    </IconButton>
  );
});
