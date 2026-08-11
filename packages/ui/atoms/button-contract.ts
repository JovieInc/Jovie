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
  'marketing',
  'md',
  'lg',
  'icon',
  'icon-xs',
  'icon-sm',
  'icon-md',
  'icon-lg',
  'icon-xl',
] as const;

export type ButtonPenState = 'idle' | 'destructive';

/**
 * Deterministic key for one normalized Button visual selection. The same key
 * is produced from source `variant`/`size`/`destructive` values when declaring
 * the family map and when resolving an instance, so a selection can only ever
 * resolve to its exact declared Pen master.
 */
export type ButtonPenVariantKey =
  `button/${ButtonVariant}/${ButtonSize}/${ButtonPenState}`;

export function buttonPenVariantKey({
  variant,
  size,
  destructive = false,
}: {
  readonly variant: ButtonVariant;
  readonly size: ButtonSize;
  readonly destructive?: boolean;
}): ButtonPenVariantKey {
  return `button/${variant}/${size}/${
    destructive ? 'destructive' : 'idle'
  }` as ButtonPenVariantKey;
}

/** One reusable Pen master and its stable descendant override slots. */
export interface ButtonPenMaster {
  readonly rootId: string;
  readonly descendants: {
    readonly label: string;
    readonly leadingIcon?: string;
  };
}

/**
 * Executable Pen family for the canonical Button atom. Every entry is a
 * reusable master in the canonical active Pen file whose root and descendant
 * slot IDs were returned by the coordinated Pen lane. Selections without an
 * entry have no source-backed master and must fail closed; they never fall
 * back to another master.
 *
 * Receipts (canonical active Pen file, native save + CLI readback):
 * - `button/primary/lg/idle` → master `g3IC1`, label `iqbJo`,
 *   leadingIcon `M2rMD2`; production refs `NRxLZ` (/download) and `w0wvCh`
 *   (footer) persist with independent label/icon overrides.
 */
export const BUTTON_PEN_CONTRACT: {
  readonly rootByVariantKey: Readonly<
    Partial<Record<ButtonPenVariantKey, ButtonPenMaster>>
  >;
} = {
  rootByVariantKey: {
    'button/primary/lg/idle': {
      rootId: 'g3IC1',
      descendants: {
        label: 'iqbJo',
        leadingIcon: 'M2rMD2',
      },
    },
  },
};

/**
 * Resolve a normalized Button selection to its exact Pen master. Returns null
 * when the combination has no source-backed master so callers fail closed
 * instead of silently falling back to the primary master.
 */
export function resolveButtonPenMaster({
  variant,
  size,
  destructive = false,
}: {
  readonly variant: ButtonVariant;
  readonly size: ButtonSize;
  readonly destructive?: boolean;
}): ButtonPenMaster | null {
  return (
    BUTTON_PEN_CONTRACT.rootByVariantKey[
      buttonPenVariantKey({ variant, size, destructive })
    ] ?? null
  );
}

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
