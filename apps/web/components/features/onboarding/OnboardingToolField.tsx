import { CompositeField } from '@jovie/ui/atoms/composite-field';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const ONBOARDING_TOOL_FIELD_SURFACE =
  'flex items-center rounded-lg border border-subtle bg-surface-0';

// CompositeField owns the ring; this only preserves the field's focus border.
export const ONBOARDING_TOOL_FIELD_FOCUS = 'focus-within:border-focus';

export const ONBOARDING_TOOL_FIELD_MOTION =
  'transition-[border-color,box-shadow] duration-subtle ease-subtle motion-reduce:transition-none';

export const ONBOARDING_TOOL_FIELD_DENSITY = {
  picker: 'mt-3 h-auto min-h-0 gap-2 px-3 py-2',
  compact: 'mt-2 h-9 min-h-0 gap-0 px-2.5 py-0',
} as const;

export type OnboardingToolFieldDensity =
  keyof typeof ONBOARDING_TOOL_FIELD_DENSITY;

export function onboardingToolFieldClassName(
  density: OnboardingToolFieldDensity
): string {
  return cn(
    ONBOARDING_TOOL_FIELD_SURFACE,
    ONBOARDING_TOOL_FIELD_FOCUS,
    ONBOARDING_TOOL_FIELD_MOTION,
    ONBOARDING_TOOL_FIELD_DENSITY[density]
  );
}

interface OnboardingToolFieldProps {
  readonly density: OnboardingToolFieldDensity;
  readonly htmlFor: string;
  readonly children: ReactNode;
  readonly className?: string;
}

export function OnboardingToolField({
  density,
  htmlFor,
  children,
  className,
}: OnboardingToolFieldProps) {
  return (
    <CompositeField
      asChild
      shape='md'
      size='md'
      className={cn(onboardingToolFieldClassName(density), className)}
    >
      <label
        htmlFor={htmlFor}
        data-slot='onboarding-tool-field'
        data-density={density}
      >
        {children}
      </label>
    </CompositeField>
  );
}
