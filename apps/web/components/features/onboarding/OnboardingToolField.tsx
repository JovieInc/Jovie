import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const ONBOARDING_TOOL_FIELD_SURFACE =
  'flex items-center rounded-lg border border-subtle bg-surface-0';

export const ONBOARDING_TOOL_FIELD_FOCUS =
  'focus-within:border-focus focus-within:ring-2 focus-within:ring-focus/16';

export const ONBOARDING_TOOL_FIELD_MOTION =
  'transition-[border-color,box-shadow] duration-subtle ease-subtle motion-reduce:transition-none';

export const ONBOARDING_TOOL_FIELD_DENSITY = {
  picker: 'mt-3 gap-2 px-3 py-2',
  compact: 'mt-2 h-9 px-2.5',
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
    <label
      htmlFor={htmlFor}
      data-slot='onboarding-tool-field'
      data-density={density}
      className={cn(onboardingToolFieldClassName(density), className)}
    >
      {children}
    </label>
  );
}
