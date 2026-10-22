'use client';

import { useEffect } from 'react';
import {
  buildLegacyAliasHoldCookie,
  isSafeRenamedAliasLocation,
  readLegacyAliasHash,
} from '@/lib/routing/legacy-profile-alias-recovery';

interface AliasCollisionRecoveryProps {
  readonly username: string;
}

/**
 * Legacy aliases arrive as `/handle?mode=…#alias=slug` from the edge redirect.
 * The hash is not part of the budget URL. When that slug is real music, hold
 * the alias open and return to it; otherwise leave the mode page in place.
 */
export function AliasCollisionRecovery({
  username,
}: AliasCollisionRecoveryProps) {
  useEffect(() => {
    const alias = readLegacyAliasHash(window.location.hash);
    if (!alias) return;

    const controller = new AbortController();
    const recover = async () => {
      try {
        const response = await fetch(
          `/api/profile-alias-decision/${encodeURIComponent(username)}/${encodeURIComponent(alias)}`,
          {
            headers: { accept: 'application/json' },
            signal: controller.signal,
          }
        );
        if (!response.ok) return;
        const decision: unknown = await response.json();
        if (!decision || typeof decision !== 'object') return;

        const action = 'action' in decision ? decision.action : null;
        if (action === 'renamed' && 'location' in decision) {
          const location = decision.location;
          if (
            typeof location === 'string' &&
            isSafeRenamedAliasLocation(location)
          ) {
            window.location.replace(location);
          }
          return;
        }

        if (action === 'content') {
          const cookie = buildLegacyAliasHoldCookie(
            username,
            alias,
            window.location.protocol === 'https:'
          );
          if (!cookie) return;
          document.cookie = cookie;
          window.location.replace(`/${username}/${alias}`);
          return;
        }

        if (action === 'stay' && window.location.hash) {
          const url = new URL(window.location.href);
          url.hash = '';
          window.history.replaceState(window.history.state, '', url);
        }
      } catch {
        // Stay on the mode page. A later visit can retry the correction.
      }
    };

    void recover();
    return () => controller.abort();
  }, [username]);

  return null;
}
