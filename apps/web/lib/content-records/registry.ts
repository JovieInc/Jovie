import type { AnyContentKind } from './kind';
import { MARKETING_PAGE_KIND } from './marketing-page';

/**
 * Every content kind the store accepts. Adding a kind here is the whole
 * integration: store, preview, publish, audit log, and rollback come free.
 */
export const CONTENT_KINDS: readonly AnyContentKind[] = [
  MARKETING_PAGE_KIND as AnyContentKind,
];

export function getContentKind(kind: string): AnyContentKind | null {
  return CONTENT_KINDS.find(definition => definition.kind === kind) ?? null;
}
