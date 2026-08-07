/**
 * Server-safe canonical IconButton contract (JOV-4871).
 *
 * One size/variant registry for every icon-only button in the product.
 * The client `IconButton` (./icon-button) is the only implementation; the
 * legacy web atoms (CircleIconButton, AppIconButton, HeaderIconButton,
 * InlineIconButton, DrawerInlineIconButton) are thin compat wrappers over it.
 *
 * Sizes map 1:1 onto the base Button `icon-*` sizes (24/28/32/40/44px
 * containers). Every size below 44px keeps the Button 44px pseudo-element
 * hit target; `xl` is 44px by construction. All variants share the base
 * Button focus ring and `motion-reduce:transition-none`.
 */
export const ICON_BUTTON_VARIANT_NAMES = [
  'surface',
  'frosted',
  'ghost',
  'secondary',
  'outline',
  'pearl',
  'pearlQuiet',
  'control',
  'inline',
] as const;

export const ICON_BUTTON_SIZE_NAMES = ['xs', 'sm', 'md', 'lg', 'xl'] as const;

export type IconButtonVariant = (typeof ICON_BUTTON_VARIANT_NAMES)[number];
export type IconButtonSize = (typeof ICON_BUTTON_SIZE_NAMES)[number];

/** Modifier for inline affordances that stay visible without parent hover. */
export const ICON_BUTTON_VISIBLE_CLASSNAME =
  'p-0.5 opacity-60 hover:opacity-100 focus-visible:opacity-100';

/** Modifier for inline affordances revealed on parent hover/focus. */
export const ICON_BUTTON_FADE_CLASSNAME =
  'p-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100';
