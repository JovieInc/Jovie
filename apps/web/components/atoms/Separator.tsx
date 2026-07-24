'use client';

/**
 * App-level Separator — re-exports the canonical `@jovie/ui` atom.
 * Prefer importing Separator from `@jovie/ui` directly in new code.
 * Kept so existing `@/components/atoms/Separator` imports keep working
 * during one-system consolidation (see docs/design/ONE_SYSTEM_DRIFT.md).
 */
export { Separator } from '@jovie/ui';
