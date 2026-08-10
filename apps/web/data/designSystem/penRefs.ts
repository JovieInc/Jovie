import type { ButtonSizeInput, ButtonVariantInput } from '@jovie/ui';
import {
  BUTTON_PEN_CONTRACT,
  normalizeButtonSizeContract,
  normalizeButtonVariantContract,
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
}

/**
 * Normalize a source Button instance into the stable Pen ref representation.
 * Descendant overrides are sorted so equivalent source inputs serialize
 * identically regardless of caller object construction order.
 */
export function normalizeButtonPenRef(
  input: Readonly<ButtonPenRefInput>
): NormalizedButtonPenRef {
  const normalizedVariant = normalizeButtonVariantContract(input);
  const normalizedSize = normalizeButtonSizeContract(input.size);
  const overrides: PenRefOverride[] = [
    {
      nodeId: BUTTON_PEN_CONTRACT.descendants.label,
      property: 'content',
      value: input.label,
    },
  ];

  if (input.leadingIcon) {
    overrides.push({
      nodeId: BUTTON_PEN_CONTRACT.descendants.leadingIcon,
      property: 'icon',
      value: input.leadingIcon,
    });
  }

  return {
    componentId: input.componentId,
    ref: BUTTON_PEN_CONTRACT.rootId,
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
    route: '/alternatives/[slug]',
    source: 'apps/web/app/(marketing)/alternatives/[slug]/page.tsx',
    label: 'Request Access',
    variant: 'primary',
    size: 'lg',
  },
] as const satisfies readonly ButtonPenPropagationFixture[];
