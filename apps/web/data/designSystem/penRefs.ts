import {
  type ButtonPenMaster,
  type ButtonSizeInput,
  type ButtonVariantInput,
  buttonPenVariantKey,
  normalizeButtonSizeContract,
  normalizeButtonVariantContract,
  resolveButtonPenMaster,
} from '@jovie/ui';
import type { DesignSystemComponentId } from './componentRegistry';

export type PenOverrideProperty = 'content' | 'icon';

export interface PenRefOverride {
  readonly nodeId: string;
  readonly property: PenOverrideProperty;
  readonly value: string;
}

export interface NormalizedPenRef {
  readonly componentId: DesignSystemComponentId;
  readonly ref: string;
  readonly variant: Readonly<Record<string, string>>;
  readonly overrides: readonly PenRefOverride[];
}

export interface NormalizedButtonPenRef extends NormalizedPenRef {
  readonly componentId: 'atom.button';
  /** Exact reusable Pen master the normalized selection resolves to. */
  readonly master: ButtonPenMaster;
  /** Deterministic key that selected the master. */
  readonly variantKey: string;
}

export interface ButtonPenRefInput {
  readonly componentId: 'atom.button';
  readonly variant?: ButtonVariantInput;
  readonly size?: ButtonSizeInput;
  readonly destructive?: boolean;
  readonly label: string;
  readonly leadingIcon?: string;
}

export interface ButtonPenPropagationFixture
  extends Omit<ButtonPenRefInput, 'componentId'> {
  readonly route: string;
  readonly source: string;
  /**
   * File containing the literal label when `source` receives the label as a
   * prop (for example the shared footer CTA reads it from homepage copy).
   */
  readonly labelSource?: string;
}

/**
 * Normalize a source Button instance into the stable Pen ref representation.
 * The normalized variant/size/destructive selection resolves to its exact
 * reusable Pen master through the deterministic family key; selections without
 * a source-backed master throw so unsupported combinations fail closed instead
 * of silently falling back to the primary master. Descendant overrides are
 * sorted so equivalent source inputs serialize identically regardless of
 * caller object construction order.
 */
export function normalizeButtonPenRef(
  input: Readonly<ButtonPenRefInput>
): NormalizedButtonPenRef {
  const normalizedVariant = normalizeButtonVariantContract(input);
  const normalizedSize = normalizeButtonSizeContract(input.size);
  const variantKey = buttonPenVariantKey({
    variant: normalizedVariant.variant,
    size: normalizedSize,
    destructive: normalizedVariant.destructive,
  });
  const master = resolveButtonPenMaster({
    variant: normalizedVariant.variant,
    size: normalizedSize,
    destructive: normalizedVariant.destructive,
  });

  if (!master) {
    throw new Error(
      `Unsupported atom.button Pen selection: ${variantKey} has no source-backed master`
    );
  }

  const overrides: PenRefOverride[] = [
    {
      nodeId: master.descendants.label,
      property: 'content',
      value: input.label,
    },
  ];

  if (input.leadingIcon) {
    if (!master.descendants.leadingIcon) {
      throw new Error(
        `Unsupported atom.button Pen override: ${variantKey} master ${master.rootId} has no leading-icon slot`
      );
    }
    overrides.push({
      nodeId: master.descendants.leadingIcon,
      property: 'icon',
      value: input.leadingIcon,
    });
  }

  return {
    componentId: input.componentId,
    ref: master.rootId,
    master,
    variantKey,
    variant: {
      destructive: String(normalizedVariant.destructive),
      size: normalizedSize,
      variant: normalizedVariant.variant,
    },
    overrides: overrides.sort((a, b) =>
      `${a.nodeId}:${a.property}`.localeCompare(`${b.nodeId}:${b.property}`)
    ),
  };
}

export const BUTTON_PEN_PROPAGATION_FIXTURES = [
  {
    route: '/download',
    source: 'apps/web/app/(marketing)/download/page.tsx',
    label: 'Download for Mac',
    leadingIcon: 'ArrowDownToLine',
    variant: 'primary',
    size: 'lg',
  },
  {
    route: '/about',
    source: 'apps/web/components/site/MarketingTerminalCta.tsx',
    labelSource: 'apps/web/data/homepageV2Copy.ts',
    label: 'Get started',
    variant: 'primary',
    size: 'lg',
  },
] as const satisfies readonly ButtonPenPropagationFixture[];
