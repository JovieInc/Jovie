'use client';

/**
 * App-level Label — re-exports the canonical `@jovie/ui` atom.
 * Prefer importing Label from `@jovie/ui` directly in new code.
 * Kept so existing \@/components/atoms/Label imports keep working
 * during one-system consolidation (see docs/design/ONE_SYSTEM_DRIFT.md).
 */
export type { LabelProps } from '@jovie/ui';
export { Label } from '@jovie/ui';
