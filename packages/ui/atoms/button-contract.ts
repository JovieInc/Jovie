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

export const BUTTON_SIZE_NAMES = ['sm', 'md', 'lg', 'icon'] as const;

export type ButtonVariant = (typeof BUTTON_VARIANT_NAMES)[number];
export type ButtonSize = (typeof BUTTON_SIZE_NAMES)[number];
