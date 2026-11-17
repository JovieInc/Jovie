'use client';

import {
  type DominantDelightProposal,
  evaluateDominantDelights,
} from '@jovie/ui/theme/motion-policy';
import {
  type ButtonHTMLAttributes,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import {
  getCacheGeneration,
  getCacheScope,
  subscribeCacheFence,
} from '@/lib/queries/cache-isolation';

export interface ArrivalScope {
  readonly userId: string;
  readonly tenantId: string;
  readonly identityId: string;
}

/** Actual originating query context; identityId is not assumed to be profileId. */
export interface ArrivalQueryContext {
  readonly userId: string;
  readonly profileId: string;
  readonly sessionId: string | null;
  readonly impersonationSubject: string | null;
  readonly generation: number;
}

/** Narrow output port of the reviewed arrival contract, not a new reducer. */
export interface ArrivalProjection {
  readonly context: ArrivalQueryContext;
  readonly state: {
    readonly scope: ArrivalScope;
    readonly activeRun: string | null;
    readonly revision: number;
    readonly importedIds: readonly string[];
  };
  readonly view: {
    readonly showIntroduction: boolean;
    readonly availableCount: number;
    readonly source: string | null;
    readonly scopeComplete: boolean;
    readonly fullCatalogComplete: false;
    readonly status: 'pending' | 'running' | 'partial' | 'complete' | 'failed';
    readonly metric: {
      readonly value: number;
      readonly name: string;
      readonly source: string;
      readonly asOf: string;
    } | null;
    readonly motionIds: readonly string[];
    readonly interactionBlocked: false;
  };
}

export interface ArrivalUiEvent {
  readonly type:
    | 'content-visible'
    | 'skip'
    | 'user-interaction'
    | 'navigate-away';
  readonly scope: ArrivalScope;
}

export interface ArrivalRowsPresentation {
  readonly showIntroduction: boolean;
  readonly availableCount: number | null;
  readonly status: ArrivalProjection['view']['status'] | null;
  readonly source: string | null;
  readonly sourceComplete: boolean;
  readonly fullCatalogComplete: false;
  readonly metric: ArrivalProjection['view']['metric'];
  readonly motionIds: readonly string[];
  readonly interactionBlocked: false;
  readonly eventDelivery: 'unavailable' | 'failed' | null;
}

/** Imperative callbacks are consumed by child components, never invoked by a render prop. */
export interface ArrivalRowActions {
  /** Attach to a rendered canonical row/cell, never a preview or count label. */
  readonly onCommittedRow: (
    id: string,
    node: HTMLElement | null
  ) => void | (() => void);
  readonly skipButtonProps: ButtonHTMLAttributes<HTMLButtonElement> & {
    'data-arrival-skip': true;
  };
  readonly onNavigateAway: () => void;
}

const ArrivalActionsContext = createContext<ArrivalRowActions | null>(null);
export function useLibraryFirstArrivalActions(): ArrivalRowActions {
  const actions = useContext(ArrivalActionsContext);
  if (!actions)
    throw new Error('Library arrival actions require their adapter');
  return actions;
}

export interface ArrivalEventFailure {
  readonly event: ArrivalUiEvent;
  readonly context: ArrivalQueryContext;
  readonly error: unknown;
}

export interface LibraryFirstArrivalAdapterProps {
  readonly scope: ArrivalScope;
  readonly context: ArrivalQueryContext;
  readonly projection?: ArrivalProjection | null;
  readonly onEvent?: (
    event: ArrivalUiEvent,
    context: ArrivalQueryContext
  ) => void | Promise<void>;
  readonly onEventError?: (failure: ArrivalEventFailure) => void;
  readonly motionApproved?: boolean;
  readonly motionProposal?: DominantDelightProposal;
  readonly materialBenefitReceipt?: {
    readonly verified: true;
    readonly source: string;
  };
  readonly otherActiveDelights?: number;
  readonly children: (presentation: ArrivalRowsPresentation) => ReactNode;
}

const subscribe = (notify: () => void) => subscribeCacheFence(() => notify());
const serverGeneration = () => -1;
const sameScope = (a: ArrivalScope, b: ArrivalScope) =>
  a.userId === b.userId &&
  a.tenantId === b.tenantId &&
  a.identityId === b.identityId;
const sameContext = (a: ArrivalQueryContext, b: ArrivalQueryContext) =>
  a.userId === b.userId &&
  a.profileId === b.profileId &&
  a.sessionId === b.sessionId &&
  a.impersonationSubject === b.impersonationSubject &&
  a.generation === b.generation;
function liveContext(context: ArrivalQueryContext): boolean {
  const live = getCacheScope();
  return (
    live.ready &&
    live.userId === context.userId &&
    live.profileId === context.profileId &&
    live.sessionId === context.sessionId &&
    live.impersonationSubject === context.impersonationSubject &&
    getCacheGeneration() === context.generation
  );
}

/** Bounded DOM visibility proof, not general pixel/occlusion certification. */
function foregroundVisible(node: Element): boolean {
  if (
    node.ownerDocument.visibilityState !== 'visible' ||
    node.closest('[hidden], [inert], [aria-hidden="true"]')
  )
    return false;
  for (
    let ancestor: Element | null = node;
    ancestor;
    ancestor = ancestor.parentElement
  ) {
    const style = node.ownerDocument.defaultView?.getComputedStyle(ancestor);
    if (
      style?.display === 'none' ||
      style?.visibility === 'hidden' ||
      style?.visibility === 'collapse' ||
      style?.opacity === '0'
    )
      return false;
  }
  return true;
}

/** Static-first bridge. Authoritative run selection, claims and all effects stay upstream. */
export function LibraryFirstArrivalAdapter({
  scope,
  context,
  projection,
  onEvent,
  onEventError,
  motionApproved = false,
  motionProposal,
  materialBenefitReceipt,
  otherActiveDelights = 0,
  children,
}: LibraryFirstArrivalAdapterProps) {
  const generation = useSyncExternalStore(
    subscribe,
    getCacheGeneration,
    serverGeneration
  );
  const reducedMotion = useReducedMotion();
  const [canObserve, setCanObserve] = useState(false);
  const [failedBoundary, setFailedBoundary] = useState<string | null>(null);
  const bound =
    generation === context.generation &&
    scope.userId === context.userId &&
    liveContext(context) &&
    Boolean(
      projection &&
        sameScope(scope, projection.state.scope) &&
        sameContext(context, projection.context)
    );
  const origin = JSON.stringify([
    scope,
    context,
    projection?.state.activeRun,
    projection?.state.revision,
  ]);
  const boundary = JSON.stringify([
    scope,
    context,
    projection?.state.activeRun,
  ]);
  const failed = failedBoundary === boundary;
  const canonicalSnapshot =
    bound &&
    Boolean(projection?.state.activeRun) &&
    (projection?.state.revision ?? -1) >= 0 &&
    Boolean(projection?.view.source);
  const current = useRef({
    bound,
    origin,
    boundary,
    failed,
    eligible: false,
  });
  const nodes = useRef(new Map<string, HTMLElement>());
  const registered = useRef(
    new WeakMap<Element, { id: string; origin: string }>()
  );
  const observer = useRef<IntersectionObserver | null>(null);
  const emitted = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const ids = useMemo(
    () => new Set(projection?.state.importedIds ?? []),
    [projection?.state.importedIds]
  );
  const send = useCallback(
    (type: ArrivalUiEvent['type']): void => {
      if (
        !mounted.current ||
        !current.current.bound ||
        current.current.failed ||
        current.current.origin !== origin ||
        !liveContext(context)
      )
        return;
      const event: ArrivalUiEvent = { type, scope };
      const report = (error: unknown) => {
        if (current.current.boundary === boundary) {
          current.current.failed = true;
          if (mounted.current) setFailedBoundary(boundary);
        }
        // Failure is visible through presentation and the originating caller port.
        try {
          onEventError?.({ event, context, error });
        } catch {
          /* presentation remains failed; no second transport */
        }
      };
      try {
        const result = onEvent?.(event, context);
        if (result) void Promise.resolve(result).catch(report);
      } catch (error) {
        report(error);
      }
    },
    [boundary, context, onEvent, onEventError, origin, scope]
  );
  const onSkip = useCallback(() => {
    send('skip');
  }, [send]);
  const onNavigateAway = useCallback(() => {
    send('navigate-away');
  }, [send]);
  const onCommittedRow = useCallback(
    (id: string, node: HTMLElement | null) => {
      if (!node || !ids.has(id) || !liveContext(context)) return;
      const previous = nodes.current.get(id);
      if (previous && previous !== node) {
        observer.current?.unobserve(previous);
        registered.current.delete(previous);
      }
      // Ref attachment precedes this component's layout effect. Registration is
      // tagged with its originating commit; event delivery checks it again.
      nodes.current.set(id, node);
      registered.current.set(node, { id, origin });
      observer.current?.observe(node);
      return () => {
        if (
          registered.current.get(node)?.origin !== origin ||
          nodes.current.get(id) !== node
        )
          return;
        observer.current?.unobserve(node);
        registered.current.delete(node);
        nodes.current.delete(id);
      };
    },
    [context, ids, origin]
  );
  const eligible =
    canonicalSnapshot &&
    !failed &&
    Boolean(onEvent) &&
    Boolean(projection?.view.showIntroduction) &&
    ids.size > 0;
  useLayoutEffect(() => {
    current.current = { bound, origin, boundary, failed, eligible };
  }, [bound, origin, boundary, failed, eligible]);

  useEffect(() => {
    const available = typeof IntersectionObserver === 'function';
    setCanObserve(available);
    if (!available || !eligible) return;
    const io = new IntersectionObserver(entries => {
      if (
        current.current.origin !== origin ||
        !current.current.bound ||
        !current.current.eligible ||
        emitted.current === origin
      )
        return;
      const visible = entries.some(entry => {
        const record = registered.current.get(entry.target);
        return (
          entry.isIntersecting &&
          entry.intersectionRect.width > 0 &&
          entry.intersectionRect.height > 0 &&
          entry.target.isConnected &&
          foregroundVisible(entry.target) &&
          record?.origin === origin &&
          ids.has(record.id) &&
          nodes.current.get(record.id) === entry.target
        );
      });
      if (!visible || !liveContext(context)) return;
      emitted.current = origin;
      send('content-visible');
    });
    observer.current = io;
    const observeConnected = () => {
      if (document.visibilityState !== 'visible') return;
      for (const [id, node] of nodes.current)
        if (ids.has(id) && node.isConnected) {
          io.unobserve(node);
          io.observe(node);
        }
    };
    observeConnected();
    document.addEventListener('visibilitychange', observeConnected);
    return () => {
      document.removeEventListener('visibilitychange', observeConnected);
      io.disconnect();
      if (observer.current === io) observer.current = null;
    };
  }, [context, eligible, ids, origin, send]);

  const gate = evaluateDominantDelights({
    content_section_count: 1,
    proposals: motionProposal ? [motionProposal] : [],
    simultaneous_active_count: otherActiveDelights + 1,
  });
  const allowMotion =
    eligible &&
    canObserve &&
    !reducedMotion &&
    motionApproved &&
    Boolean(
      motionProposal &&
        materialBenefitReceipt?.verified &&
        materialBenefitReceipt.source.trim()
    ) &&
    gate.passes;
  const view = canonicalSnapshot ? projection?.view : null;
  const presentation: ArrivalRowsPresentation = {
    showIntroduction: eligible && canObserve,
    availableCount: view?.availableCount ?? null,
    status: view?.status ?? null,
    source: view?.source ?? null,
    sourceComplete: view?.scopeComplete ?? false,
    fullCatalogComplete: false,
    metric: view?.metric ?? null,
    motionIds: allowMotion
      ? (view?.motionIds ?? []).filter(id => ids.has(id)).slice(0, 24)
      : [],
    interactionBlocked: false,
    eventDelivery: failed ? 'failed' : onEvent ? null : 'unavailable',
  };
  const actions: ArrivalRowActions = {
    onCommittedRow,
    skipButtonProps: {
      'data-arrival-skip': true,
      type: 'button',
      onClick: onSkip,
    },
    onNavigateAway,
  };
  return (
    <ArrivalActionsContext.Provider value={actions}>
      <div
        className='contents'
        data-library-first-arrival={
          presentation.showIntroduction ? 'eligible' : 'quiet'
        }
        onPointerDownCapture={event => {
          if (
            !(
              event.target instanceof Element &&
              event.target.closest('[data-arrival-skip]')
            )
          )
            send('user-interaction');
        }}
        onKeyDownCapture={event => {
          if (
            !(
              event.target instanceof Element &&
              event.target.closest('[data-arrival-skip]')
            )
          )
            send('user-interaction');
        }}
      >
        {children(presentation)}
      </div>
    </ArrivalActionsContext.Provider>
  );
}
