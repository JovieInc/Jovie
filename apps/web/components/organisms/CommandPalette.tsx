'use client';

/**
 * CommandPalette — global Cmd+K shell.
 *
 * The visual surface, search, keyboard model, registry-driven entries
 * (skills + nav + entity rows), and entity routing all live in
 * `SharedCommandPalette` (`CmdKPalette`). This file owns:
 *   - the `Cmd+K` global keydown trigger,
 *   - feeding the palette its `profileId` from `DashboardDataContext`,
 *   - injecting the "Recent chats" section as an additional source.
 */

import { usePathname, useRouter } from 'next/navigation';
import {
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { DashboardDataContext } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { CmdKPalette } from '@/components/organisms/CmdKPalette';
import { type PaletteSection } from '@/components/organisms/SharedCommandPalette';
import { APP_ROUTES } from '@/constants/routes';
import {
  useHeaderActions,
  useOptionalHeaderActions,
} from '@/contexts/HeaderActionsContext';
import {
  APP_SHELL_WORKSPACES,
  getCurrentAppShellWorkspace,
  getNextAppShellWorkspace,
} from '@/lib/app-shell/workspaces';
import type { EntityRef } from '@/lib/commands/entities';
import type { NavCommand } from '@/lib/commands/registry';
import { WORKSPACE_SWITCH_SHORTCUT } from '@/lib/keyboard-shortcuts';
import { useChatConversationsQuery } from '@/lib/queries';
import { isFormElement } from '@/lib/utils/keyboard';
import { OPEN_COMMAND_PALETTE_EVENT } from './command-palette-events';

const RECENT_CHAT_LIMIT = 10;

export function CommandPalette() {
  // Read the context directly so we don't hit the throwing useDashboardData
  // hook. The palette is only useful inside authenticated shells where the
  // DashboardDataProvider and QueryClient are mounted. On pre-auth routes
  // (e.g., when AuthShellWrapper renders without its inner providers) it
  // should be a no-op instead of crashing.
  const dashboardData = useContext(DashboardDataContext);
  const headerActions = useOptionalHeaderActions();
  if (!dashboardData || !headerActions) {
    return null;
  }
  return <CommandPaletteController />;
}

/**
 * Main content-plane slot. AuthShellWrapper swaps this in for the active route
 * so Cmd+K never floats over a second, independently interactive page.
 */
export function CommandPaletteMainSurface() {
  const dashboardData = useContext(DashboardDataContext);
  const { closeCommandPalette, isCommandPaletteOpen, setCommandPaletteHeader } =
    useHeaderActions();
  if (!dashboardData || !isCommandPaletteOpen) return null;
  return (
    <CommandPaletteInner
      profileId={dashboardData.selectedProfile?.id}
      isAdmin={dashboardData.isAdmin}
      open={isCommandPaletteOpen}
      onOpenChange={next => {
        if (!next) closeCommandPalette();
      }}
      presentation='main'
      onHeaderChange={setCommandPaletteHeader}
    />
  );
}

interface CommandPaletteInnerProps {
  readonly profileId: string | undefined;
  readonly isAdmin: boolean;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly presentation: 'main' | 'dialog';
  readonly onHeaderChange?: (header: ReactNode | null) => void;
}

function CommandPaletteController() {
  const { closeCommandPalette, isCommandPaletteOpen, openCommandPalette } =
    useHeaderActions();
  const isOpenRef = useRef(false);
  isOpenRef.current = isCommandPaletteOpen;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isK = event.key === 'k' || event.key === 'K';
      if (!isK || !(event.metaKey || event.ctrlKey)) return;
      if (event.shiftKey || event.altKey || isFormElement(event.target)) return;
      event.preventDefault();
      if (isOpenRef.current) closeCommandPalette();
      else openCommandPalette();
    }
    globalThis.addEventListener('keydown', onKeyDown);
    globalThis.addEventListener(OPEN_COMMAND_PALETTE_EVENT, openCommandPalette);
    return () => {
      globalThis.removeEventListener('keydown', onKeyDown);
      globalThis.removeEventListener(
        OPEN_COMMAND_PALETTE_EVENT,
        openCommandPalette
      );
    };
  }, [closeCommandPalette, openCommandPalette]);

  return null;
}

function CommandPaletteInner({
  profileId,
  isAdmin,
  open,
  onOpenChange,
  presentation,
  onHeaderChange,
}: CommandPaletteInnerProps) {
  const router = useRouter();
  const pathname = usePathname();

  const { data: conversations } = useChatConversationsQuery({
    limit: RECENT_CHAT_LIMIT,
    enabled: open,
  });

  // Recent chats are not part of the
  // command registry — they're palette-local. We fold them into a synthetic
  // entity section so the shared list+keyboard machinery picks them up.
  const additionalSections = useMemo<PaletteSection[]>(() => {
    const sections: PaletteSection[] = [];
    if (isAdmin) {
      const currentWorkspace = getCurrentAppShellWorkspace(pathname);
      const nextWorkspace = getNextAppShellWorkspace(
        APP_SHELL_WORKSPACES,
        currentWorkspace.id
      );
      if (nextWorkspace) {
        const nav: NavCommand = {
          kind: 'nav',
          id: 'switch-workspace',
          label: `Switch to ${nextWorkspace.label}`,
          description: 'Change the active workspace.',
          iconName: 'Columns2',
          surfaces: ['cmdk'],
          href: nextWorkspace.href,
          shortcutLabel: WORKSPACE_SWITCH_SHORTCUT.keys,
        };
        sections.push({
          id: 'workspace-actions',
          label: 'Workspace',
          items: [{ kind: 'nav', nav }],
        });
      }
    }
    if (conversations && conversations.length > 0) {
      sections.push({
        id: 'recent-chats',
        label: 'Recent Chats',
        items: conversations.map(convo => {
          const entity: EntityRef = {
            kind: 'track', // Reuses the generic Music2 fallback art.
            id: `thread:${convo.id}`,
            label: convo.title || 'Untitled chat',
            meta: {
              kind: 'track',
              subtitle: 'Chat',
            },
          };
          return { kind: 'entity', entity };
        }),
      });
    }
    return sections;
  }, [conversations, isAdmin, pathname]);

  const handleAdditionalSelect = useCallback(
    (id: string) => {
      // Recent-thread entity ids are namespaced; strip the prefix.
      if (id.startsWith('thread:')) {
        const threadId = id.slice('thread:'.length);
        router.push(`${APP_ROUTES.CHAT}/${threadId}`);
        return;
      }
      if (id === 'switch-workspace') {
        const currentWorkspace = getCurrentAppShellWorkspace(pathname);
        const nextWorkspace = getNextAppShellWorkspace(
          APP_SHELL_WORKSPACES,
          currentWorkspace.id
        );
        if (nextWorkspace) router.push(nextWorkspace.href);
      }
    },
    [pathname, router]
  );

  return (
    <CmdKPalette
      profileId={profileId ?? ''}
      open={open}
      onOpenChange={onOpenChange}
      additionalSectionsAfter={additionalSections}
      onAdditionalSelect={handleAdditionalSelect}
      presentation={presentation}
      onHeaderChange={onHeaderChange}
    />
  );
}
