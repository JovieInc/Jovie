'use client';

import {
  InlineIconButton,
  type InlineIconButtonProps,
} from '@/components/atoms/InlineIconButton';

export type DrawerInlineIconButtonProps = InlineIconButtonProps;

export {
  INLINE_ICON_BUTTON_BASE_CLASSNAME as DRAWER_INLINE_ICON_BUTTON_BASE_CLASSNAME,
  INLINE_ICON_BUTTON_FADE_CLASSNAME as DRAWER_INLINE_ICON_BUTTON_FADE_CLASSNAME,
  INLINE_ICON_BUTTON_VISIBLE_CLASSNAME as DRAWER_INLINE_ICON_BUTTON_VISIBLE_CLASSNAME,
} from '@/components/atoms/InlineIconButton';

export function DrawerInlineIconButton(props: DrawerInlineIconButtonProps) {
  return <InlineIconButton {...props} />;
}
