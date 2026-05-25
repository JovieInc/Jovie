'use client';

/**
 * CommandPalette — global Cmd+K shell.
 *
 * The visual surface, search, keyboard model, registry-driven entries
 * (skills + nav + entity rows), and entity routing all live in
 * `SharedCommandPalette` (`CmdKPalette`). This file owns:
 *   - the `Cmd+K` global keydown trigger,
 *   - feeding the palette its `profileId` from `DashboardDataContext`,
 *   - injecting the "Recent threads" section as an additional source.
 */

import { useRouter } from 'next/navigation';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DashboardDataContext } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { CmdKPalette } from '@/components/organisms/CmdKPalette';
import { type PaletteSection } from '@/components/organisms/SharedCommandPalette';
import { APP_ROUTES } from '@/constants/routes';
import type { EntityRef } from '@/lib/commands/entities';
import { useChatConversationsQuery } from '@/lib/queries';
import { isFormElement } from '@/lib/utils/keyboard';
import { OPEN_COMMAND_PALETTE_EVENT } from './command-palette-events';

const RECENT_THREAD_LIMIT = 10;

export function CommandPalette() {
  // Read the context directly so we don't hit the throwing useDashboardData
  // hook. The palette is only useful inside authenticated shells where the
  // DashboardDataProvider and QueryClient are mounted. On pre-auth routes
  // (e.g., when AuthShellWrapper renders without its inner providers) it
  // should be a no-op instead of crashing.
  const dashboardData = useContext(DashboardDataContext);
  if (!dashboardData) {
    return null;
  }
  return <CommandPaletteInner profileId={dashboardData.selectedProfile?.id} />;
}

interface CommandPaletteInnerProps {
  readonly profileId: string | undefined;
}

function CommandPaletteInner({ profileId }: CommandPaletteInnerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Global ⌘K / Ctrl+K trigger.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isK = event.key === 'k' || event.key === 'K';
      if (!isK) return;
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.shiftKey || event.altKey) return;
      const target = event.target as Element | null;
      if (isFormElement(target)) return;
      event.preventDefault();
      setOpen(prev => !prev);
    }
    function onOpenCommandPalette() {
      setOpen(true);
    }
    globalThis.addEventListener('keydown', onKeyDown);
    globalThis.addEventListener(
      OPEN_COMMAND_PALETTE_EVENT,
      onOpenCommandPalette
    );
    return () => {
      globalThis.removeEventListener('keydown', onKeyDown);
      globalThis.removeEventListener(
        OPEN_COMMAND_PALETTE_EVENT,
        onOpenCommandPalette
      );
    };
  }, []);

  const { data: conversations } = useChatConversationsQuery({
    limit: RECENT_THREAD_LIMIT,
    enabled: open,
  });

  // Recent threads + standalone "New thread" action are not part of the
  // command registry — they're palette-local. We fold them into a synthetic
  // entity section so the shared list+keyboard machinery picks them up.
  const additionalSections = useMemo<PaletteSection[]>(() => {
    const sections: PaletteSection[] = [];
    if (conversations && conversations.length > 0) {
      sections.push({
        id: 'recent-threads',
        label: 'Recent threads',
        items: conversations.map(convo => {
          const entity: EntityRef = {
            kind: 'track', // Reuses the generic Music2 fallback art.
            id: `thread:${convo.id}`,
            label: convo.title || 'Untitled thread',
            meta: {
              kind: 'track',
              subtitle: 'Thread',
            },
          };
          return { kind: 'entity', entity };
        }),
      });
    }
    return sections;
  }, [conversations]);

  const handleAdditionalSelect = useCallback(
    (id: string) => {
      // Recent-thread entity ids are namespaced; strip the prefix.
      if (id.startsWith('thread:')) {
        const threadId = id.slice('thread:'.length);
        router.push(`${APP_ROUTES.CHAT}/${threadId}`);
      }
    },
    [router]
  );

  return (
    <CmdKPalette
      profileId={profileId ?? ''}
      open={open}
      onOpenChange={setOpen}
      additionalSectionsAfter={additionalSections}
      onAdditionalSelect={handleAdditionalSelect}
    />
  );
}
