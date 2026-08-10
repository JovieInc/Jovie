/**
 * Server-safe canonical Button contract.
 *
 * Keep names here so documentation, manifests, tests, and the client Button
 * implementation all consume one registry.
 */
export const BUTTON_VARIANT_NAMES = [
  'primary',
  'secondary',
  'tertiary',
  'ghost',
  'link',
] as const;

export const BUTTON_SIZE_NAMES = [
  'sm',
  'md',
  'lg',
  'icon',
  'icon-xs',
  'icon-sm',
  'icon-md',
  'icon-lg',
  'icon-xl',
] as const;

/** Existing Pen origin and descendant slots for the canonical Button atom. */
export const BUTTON_PEN_CONTRACT = {
  rootId: 'L2SRKu',
  descendants: {
    label: 'zUKwW',
    leadingIcon: 'wfRl9',
  },
} as const;

export type ButtonVariant = (typeof BUTTON_VARIANT_NAMES)[number];
export type ButtonSize = (typeof BUTTON_SIZE_NAMES)[number];

export type DeprecatedButtonVariant =
  | 'accent'
  | 'outline'
  | 'destructive'
  | 'frosted'
  | 'frosted-ghost'
  | 'frosted-outline'
  | 'whitePill';
export type DeprecatedButtonSize = 'default' | 'xl' | 'hero';
export type ButtonVariantInput = ButtonVariant | DeprecatedButtonVariant | null;
export type ButtonSizeInput = ButtonSize | DeprecatedButtonSize | null;

const DEPRECATED_VARIANT_ALIASES: Record<
  DeprecatedButtonVariant,
  ButtonVariant
> = {
  accent: 'primary',
  outline: 'secondary',
  destructive: 'primary',
  frosted: 'secondary',
  'frosted-ghost': 'ghost',
  'frosted-outline': 'secondary',
  whitePill: 'primary',
};

const DEPRECATED_SIZE_ALIASES: Record<DeprecatedButtonSize, ButtonSize> = {
  default: 'md',
  xl: 'lg',
  hero: 'lg',
};

export function normalizeButtonVariantContract({
  variant,
  destructive = false,
}: {
  readonly variant?: ButtonVariantInput;
  readonly destructive?: boolean;
}): { readonly variant: ButtonVariant; readonly destructive: boolean } {
  const requested = variant ?? 'primary';
  const replacement =
    requested in DEPRECATED_VARIANT_ALIASES
      ? DEPRECATED_VARIANT_ALIASES[requested as DeprecatedButtonVariant]
      : (requested as ButtonVariant);

  return {
    variant: replacement,
    destructive: destructive || requested === 'destructive',
  };
}

export function normalizeButtonSizeContract(
  size?: ButtonSizeInput
): ButtonSize {
  const requested = size ?? 'md';
  return requested in DEPRECATED_SIZE_ALIASES
    ? DEPRECATED_SIZE_ALIASES[requested as DeprecatedButtonSize]
    : (requested as ButtonSize);
}
