'use client';

import {
  INLINE_ICON_BUTTON_BASE_CLASSNAME,
  INLINE_ICON_BUTTON_FADE_CLASSNAME,
  INLINE_ICON_BUTTON_VISIBLE_CLASSNAME,
  InlineIconButton,
  type InlineIconButtonProps,
} from '@/components/atoms/InlineIconButton';

export type DrawerInlineIconButtonProps = InlineIconButtonProps;

export const DRAWER_INLINE_ICON_BUTTON_BASE_CLASSNAME =
  INLINE_ICON_BUTTON_BASE_CLASSNAME;

export const DRAWER_INLINE_ICON_BUTTON_VISIBLE_CLASSNAME =
  INLINE_ICON_BUTTON_VISIBLE_CLASSNAME;

export const DRAWER_INLINE_ICON_BUTTON_FADE_CLASSNAME =
  INLINE_ICON_BUTTON_FADE_CLASSNAME;

export function DrawerInlineIconButton(props: DrawerInlineIconButtonProps) {
  return <InlineIconButton {...props} />;
}
