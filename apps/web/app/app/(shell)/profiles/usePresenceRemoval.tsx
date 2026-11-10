'use client';

import { ConfirmDialog } from '@jovie/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import type {
  PresenceRemovalPrincipal,
  PresenceRemovalTarget,
  ProfilesWorkspaceData,
  ProfileWorkspaceRow,
} from '@/components/features/presence/types';
import {
  type PresenceWorkspaceScope,
  presenceWorkspaceScopeKey,
} from '@/components/features/presence/workspace-controller';
import { toast } from '@/components/feedback';
import { isAvailable } from '@/components/shell/useRailFocusReturn';
import {
  getCacheGeneration,
  getCacheScope,
  subscribeCacheFence,
} from '@/lib/queries/cache-isolation';
import { FetchError, fetchWithTimeout } from '@/lib/queries/fetch';
import { queryKeys } from '@/lib/queries/keys';
import { useRemoveSocialLinkMutation } from '@/lib/queries/useRemoveSocialLinkMutation';

interface RemovalIntent {
  readonly rowId: string;
  readonly profileId: string;
  readonly target: PresenceRemovalTarget;
  readonly owner: string;
  readonly selection: string | null;
}

function ownerKey(
  scope: PresenceWorkspaceScope,
  profileId: string | undefined,
  principal: PresenceRemovalPrincipal | null | undefined
) {
  const cache = getCacheScope();
  if (
    !principal ||
    principal.appActorId !== scope.actorId ||
    !cache.ready ||
    !cache.sessionId ||
    cache.userId !== principal.authUserId ||
    cache.sessionId !== principal.sessionId ||
    cache.impersonationSubject !== principal.impersonationSubject ||
    cache.profileId !== profileId ||
    scope.target !== 'creator' ||
    scope.workspaceId !== profileId
  )
    return null;
  return JSON.stringify([
    presenceWorkspaceScopeKey(scope),
    principal,
    getCacheGeneration(),
    cache,
  ]);
}

function matchesTarget(
  a: PresenceRemovalTarget | undefined,
  b: PresenceRemovalTarget
) {
  return a?.linkId === b.linkId && a.url === b.url && a.version === b.version;
}

/** One scoped confirmation, shared by row, context menu and inspector actions. */
export function usePresenceRemoval(
  data: ProfilesWorkspaceData | null,
  scope: PresenceWorkspaceScope,
  selection: string | null,
  clearSelection?: (selection: null) => void,
  principal?: PresenceRemovalPrincipal | null
) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const returnFocus = useRef<string | null>(null);
  const focusOwner = useRef<string | null>(null);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const menuObserver = useRef<MutationObserver | null>(null);
  const registerTrigger = useCallback(
    (id: string, node: HTMLButtonElement | null) => {
      if (node) triggers.current.set(id, node);
      else triggers.current.delete(id);
    },
    []
  );
  const [pending, setPending] = useState<RemovalIntent | null>(null);
  const intent = useRef<RemovalIntent | null>(null);
  const mounted = useRef(true);
  const submitting = useRef(false);
  const current = useRef({ data, scope, selection, principal });
  useLayoutEffect(() => {
    current.current = { data, scope, selection, principal };
  }, [data, scope, selection, principal]);
  // An uncertain write cannot be retried against the same stale server snapshot.
  const awaitingRefresh = useRef<ProfilesWorkspaceData | null>(null);
  const isCurrent = useCallback(() => {
    const snapshot = intent.current;
    const latest = current.current;
    if (
      !mounted.current ||
      !snapshot ||
      snapshot.owner !==
        ownerKey(latest.scope, latest.data?.profileId, latest.principal) ||
      snapshot.selection !== latest.selection
    )
      return false;
    const row = latest.data?.rows.find(
      candidate => candidate.id === snapshot.rowId
    );
    return (
      row?.rowType === 'surface' &&
      row.kind !== 'jovie' &&
      matchesTarget(row.removalTarget, snapshot.target)
    );
  }, []);
  const mutation = useRemoveSocialLinkMutation({
    isCurrent,
    onError: () => {},
  });
  const cancel = useCallback(() => {
    menuObserver.current?.disconnect();
    menuObserver.current = null;
    if (intent.current && !isCurrent()) returnFocus.current = null;
    intent.current = null;
    setPending(null);
  }, [isCurrent]);
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = subscribeCacheFence(cancel);
    return () => {
      menuObserver.current?.disconnect();
      mounted.current = false;
      intent.current = null;
      unsubscribe();
    };
  }, [cancel]);
  useEffect(() => {
    if (pending && !isCurrent()) cancel();
  }, [data, scope, selection, principal, pending, isCurrent, cancel]);

  const request = useCallback(
    (row: ProfileWorkspaceRow) => {
      const latest = current.current;
      if (
        submitting.current ||
        intent.current !== null ||
        row.rowType !== 'surface' ||
        row.kind === 'jovie' ||
        row.id.startsWith('preview:') ||
        !row.removalTarget ||
        !latest.data
      )
        return;
      const owner = ownerKey(
        latest.scope,
        latest.data.profileId,
        latest.principal
      );
      const authoritative = latest.data.rows.find(
        candidate => candidate.id === row.id
      );
      if (
        !owner ||
        authoritative?.rowType !== 'surface' ||
        !matchesTarget(authoritative.removalTarget, row.removalTarget) ||
        awaitingRefresh.current === latest.data
      ) {
        toast.error('Refresh this profile before removing a saved link.');
        router.refresh();
        return;
      }
      focusOwner.current = owner;
      returnFocus.current = row.id;
      const snapshot = {
        rowId: row.id,
        profileId: latest.data.profileId,
        target: { ...row.removalTarget },
        owner,
        selection: current.current.selection,
      };
      intent.current = snapshot;
      const open = () => {
        if (intent.current !== snapshot || !isCurrent()) {
          if (intent.current === snapshot) cancel();
          return;
        }
        // Let the originating menu finish releasing its modal isolation first.
        // Then close the inspector before acquiring confirmation's focus boundary.
        if (clearSelection) flushSync(() => clearSelection(null));
        const prepared = { ...snapshot, selection: current.current.selection };
        intent.current = prepared;
        setPending(prepared);
      };
      const menu = document.activeElement?.closest('[role="menu"]');
      if (clearSelection && menu?.isConnected) {
        const observer = new MutationObserver(() => {
          if (menu.isConnected) return;
          observer.disconnect();
          if (menuObserver.current === observer) menuObserver.current = null;
          open();
        });
        menuObserver.current = observer;
        observer.observe(document.body, { childList: true, subtree: true });
      } else open();
    },
    [router, clearSelection, isCurrent, cancel]
  );

  const confirm = async () => {
    const snapshot = intent.current;
    if (submitting.current || !snapshot || !isCurrent()) {
      cancel();
      return;
    }
    submitting.current = true;
    let attempted = false;
    const reconcile = () => {
      if (
        snapshot.owner !==
        ownerKey(
          current.current.scope,
          current.current.data?.profileId,
          current.current.principal
        )
      )
        return;
      for (const queryKey of [
        queryKeys.dashboard.socialLinks(snapshot.profileId),
        queryKeys.dashboard.socialLinks(),
        queryKeys.user.profile(),
      ])
        void queryClient.invalidateQueries({
          queryKey,
          exact: true,
          refetchType: 'all',
        });
      if (isCurrent()) router.refresh();
    };
    try {
      // Fresh authoritative read before every attempt, including recovery. Never
      // substitute a newer version or URL into an already-confirmed intent.
      const result = await fetchWithTimeout<{
        links: Array<{
          id: string;
          url: string;
          version: number;
          isActive: boolean;
          state: string;
        }>;
      }>(
        `/api/dashboard/social-links?profileId=${encodeURIComponent(snapshot.profileId)}`
      );
      if (!isCurrent()) return;
      const link = result.links?.find(
        candidate => candidate.id === snapshot.target.linkId
      );
      if (
        !link ||
        !link.isActive ||
        link.state !== 'active' ||
        link.url !== snapshot.target.url ||
        link.version !== snapshot.target.version
      ) {
        toast.error(
          'This saved link changed. Refresh and review it before confirming again.'
        );
        awaitingRefresh.current = current.current.data;
        reconcile();
        return;
      }
      attempted = true;
      const response = await mutation.mutateAsync({
        profileId: snapshot.profileId,
        linkId: snapshot.target.linkId,
        expectedVersion: snapshot.target.version,
      });
      if (!isCurrent()) {
        reconcile();
        return;
      }
      if (!response.ok) throw new Error('Removal result was not confirmed');
      awaitingRefresh.current = current.current.data;
      toast.success(
        'Saved link removed from your Jovie profile. Identity evidence may remain.'
      );
      router.refresh();
    } catch (error) {
      if (!isCurrent()) {
        if (attempted) reconcile();
        return;
      }
      awaitingRefresh.current = current.current.data;
      const status = error instanceof FetchError ? error.status : null;
      toast.error(
        status === 403
          ? 'Removal requires permission or approval from the profile owner.'
          : status === 404
            ? 'This saved link is no longer available. Refresh the profile.'
            : status === 409
              ? 'This saved link changed. Refresh and confirm the current link again.'
              : 'Removal could not be confirmed. Refresh to check the saved link before trying again.'
      );
      reconcile();
    } finally {
      submitting.current = false;
      if (intent.current === snapshot) cancel();
    }
  };
  return {
    hasIntent: () => intent.current !== null,
    registerTrigger,
    request,
    dialog: pending ? (
      <ConfirmDialog
        open
        title='Remove From Jovie Profile?'
        onCloseAutoFocus={event => {
          const target = returnFocus.current
            ? triggers.current.get(returnFocus.current)
            : null;
          returnFocus.current = null;
          if (
            mounted.current &&
            target &&
            isAvailable(target) &&
            focusOwner.current ===
              ownerKey(
                current.current.scope,
                current.current.data?.profileId,
                current.current.principal
              )
          ) {
            event.preventDefault();
            target.focus();
          }
        }}
        body={
          <>
            <p className='break-all'>{pending.target.url}</p>
            <p>
              Remove this saved link from your Jovie profile. The Identity
              profile may remain because other or retained evidence still
              exists.
            </p>
          </>
        }
        confirmLabel='Remove Link'
        variant='destructive'
        onOpenChange={open => {
          if (!open) cancel();
        }}
        onConfirm={confirm}
      />
    ) : null,
  };
}
