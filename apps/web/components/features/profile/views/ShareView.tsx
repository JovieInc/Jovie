'use client';

import { PublicShareActionList } from '@/features/share/PublicShareMenu';
import type { ShareContext } from '@/lib/share/types';

export interface ShareViewProps {
  readonly context: ShareContext;
  /**
   * Called after a share destination commits (copy, open mail, open social).
   * In drawer mode this closes the drawer; in page mode it can route back.
   */
  readonly onActionComplete?: () => void;
}

/**
 * Body of the `share` mode: destinations for sharing this profile.
 *
 * Pure view component — no title or shell. The enclosing wrapper owns chrome.
 */
export function ShareView({ context, onActionComplete }: ShareViewProps) {
  return (
    <PublicShareActionList
      context={context}
      onActionComplete={onActionComplete}
    />
  );
}
