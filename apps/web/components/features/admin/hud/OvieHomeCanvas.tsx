'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/components/feedback';
import { ChatOpsDataCard } from '@/components/jovie/components/ChatOpsDataCard';
import type { HomeCanvasState } from '@/components/jovie/types';
import {
  HomeLoopAnswerPanel,
  HomeLoopCanvas,
  type HomeLoopCopy,
  type HomeLoopSectionStatus,
} from '@/components/organisms/home-loop';
import { useUndoableAnswers } from '@/components/organisms/home-loop/useUndoableAnswers';
import { APP_ROUTES } from '@/constants/routes';
import type { HomeLoopAsk } from '@/lib/home-loop/contract';
import {
  buildCanvasTurns,
  partitionCanvasCards,
} from '@/lib/ovie/home/canvas-turns';
import {
  buildCompanyTiles,
  type OvieFunnelInput,
  type OvieGoldenPathRow,
} from '@/lib/ovie/home/company-tiles';
import { summarizeSourceIssues } from '@/lib/ovie/home/operator-copy';
import { reportOvieHomePanelError } from '@/lib/ovie/home/panel-alerts';
import {
  buildOvieAsks,
  buildOvieHomeShipping,
  OVIE_SHIP_STAGES,
  type OviePulseMemory,
  ovieAskAction,
} from '@/lib/ovie/home/shipping-home';
import { inboxDecisionRequest, type OvieInbox } from '@/lib/ovie/inbox';
import { FREQUENT_CACHE } from '@/lib/queries/cache-strategies';
import type { HudMetrics } from '@/types/hud';
import { useCanvasHistory } from './useCanvasHistory';
import { useHudShippingStateQuery } from './useHudShippingStateQuery';
import { useOvieHomeReadyTiming } from './useOvieHomeReadyTiming';

const OVIE_HOME_COPY: HomeLoopCopy = {
  constraintClear: 'Shipping is on target',
  asksTitle: 'Needs you',
  asksEmpty: 'Nothing needs your decision.',
  asksError: 'Decisions could not load.',
  inFlightTitle: 'In Flight',
  inFlightEmpty: 'No work in flight.',
  inFlightError: 'Shipping data could not load.',
  doneTitle: 'Done Today',
  doneEmpty: 'Nothing has landed yet today.',
};

const INBOX_QUERY_KEY = ['ovie', 'inbox'] as const;
const LAST_VISIT_KEY = 'ovie.home.last-visit.v1';
/** Home shows at most this many asks; the rest resolve by their defaults. */
export const OVIE_HOME_MAX_ASKS = 3;

interface OvieLastVisit {
  readonly at: number | null;
  readonly memory: OviePulseMemory;
}

/**
 * Tile values as Tim last saw them, so each tile's "was" means "since your
 * last visit" rather than "since the last 6s poll".
 */
function readLastVisit(): OvieLastVisit {
  try {
    const raw = globalThis.localStorage?.getItem(LAST_VISIT_KEY);
    if (!raw) return { at: null, memory: {} };
    const parsed = JSON.parse(raw) as {
      at?: unknown;
      values?: Record<string, unknown>;
    };
    const memory: Record<string, { value: string; was: null }> = {};
    for (const [key, value] of Object.entries(parsed.values ?? {}))
      if (typeof value === 'string') memory[key] = { value, was: null };
    return {
      at: typeof parsed.at === 'number' ? parsed.at : null,
      memory: memory as OviePulseMemory,
    };
  } catch {
    return { at: null, memory: {} };
  }
}

function writeLastVisit(
  pulse: readonly { key: string; value: string; measured: boolean }[]
): void {
  try {
    const values = Object.fromEntries(
      pulse.filter(tile => tile.measured).map(tile => [tile.key, tile.value])
    );
    globalThis.localStorage?.setItem(
      LAST_VISIT_KEY,
      JSON.stringify({ at: Date.now(), values })
    );
  } catch {
    // A per-browser convenience; tiles render without it.
  }
}

function sinceLabel(at: number | null, now: number): string {
  if (at === null) return 'Shipping';
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  const ago =
    minutes < 60
      ? `${minutes}m`
      : minutes < 48 * 60
        ? `${Math.round(minutes / 60)}h`
        : `${Math.round(minutes / 1440)}d`;
  return `Shipping · compared with your visit ${ago} ago`;
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return (await response.json()) as T;
}

const COMPANY_PLACEHOLDER = buildCompanyTiles({
  overview: null,
  funnel: null,
  goldenPath: null,
});

async function fetchInbox(signal: AbortSignal): Promise<OvieInbox> {
  const response = await fetch('/api/ovie/inbox', {
    signal,
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Decisions could not load.');
  return (await response.json()) as OvieInbox;
}

/**
 * Ovie Home: the company loop rendered through the shared Home loop canvas.
 * Shipping comes from `ovie.shipping-state.v1` and asks from the Ovie inbox;
 * this component adds no polling of its own beyond those existing queries.
 */
export interface OvieHomeCanvasProps {
  /** Shell chat state; absent when Home renders outside the composer slot. */
  readonly chat?: HomeCanvasState;
}

export function OvieHomeCanvas({ chat }: Readonly<OvieHomeCanvasProps>) {
  const queryClient = useQueryClient();
  const shipping = useHudShippingStateQuery(null);
  const inbox = useQuery<OvieInbox>({
    queryKey: INBOX_QUERY_KEY,
    queryFn: ({ signal }) => fetchInbox(signal),
    ...FREQUENT_CACHE,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });

  const [lastVisit] = useState<OvieLastVisit>(readLastVisit);
  const [mountedAt] = useState(() => Date.now());
  const company = useQuery({
    queryKey: ['ovie', 'home', 'company'],
    queryFn: async ({ signal }) => {
      const [metrics, funnel, certifications] = await Promise.allSettled([
        fetchJson<HudMetrics>('/api/hud/metrics', signal),
        fetchJson<OvieFunnelInput>(
          '/api/admin/hud/founder-funnel?range=7d',
          signal
        ),
        fetchJson<{ rows: readonly OvieGoldenPathRow[] }>(
          '/api/ovie/certifications',
          signal
        ),
      ]);
      const failed = [metrics, funnel, certifications].filter(
        result => result.status === 'rejected'
      ).length;
      if (failed > 0)
        reportOvieHomePanelError('company', `${failed} of 3 sources failed`);
      return buildCompanyTiles({
        overview:
          metrics.status === 'fulfilled' ? metrics.value.overview : null,
        funnel: funnel.status === 'fulfilled' ? funnel.value : null,
        goldenPath:
          certifications.status === 'fulfilled'
            ? certifications.value.rows
            : null,
      });
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
    retry: false,
  });

  const snapshot = shipping.isPending ? null : shipping;
  const home = useMemo(
    () =>
      snapshot
        ? buildOvieHomeShipping({
            delivery: snapshot.view.delivery,
            operationalTasks: snapshot.operationalTasks,
            pulseMemory: lastVisit.memory,
          })
        : null,
    [snapshot, lastVisit]
  );

  useEffect(() => {
    if (home) writeLastVisit(home.pulse);
  }, [home]);

  const allAsks = useMemo(
    () => (inbox.data ? buildOvieAsks(inbox.data) : []),
    [inbox.data]
  );
  // Only the top few reach Home (Tim 2026-10-30); every other ask carries a
  // declared default and resolves on its own unless he opens the inbox.
  const asks = allAsks.slice(0, OVIE_HOME_MAX_ASKS);
  const deferredAsks = allAsks.length - asks.length;

  const onCommitted = useCallback(
    (id: string) => {
      queryClient.setQueryData<OvieInbox>(INBOX_QUERY_KEY, current =>
        current
          ? {
              ...current,
              cases: current.cases.filter(entry => entry.id !== id),
            }
          : current
      );
      void queryClient.invalidateQueries({ queryKey: INBOX_QUERY_KEY });
    },
    [queryClient]
  );
  const { answers, answer } = useUndoableAnswers({ onCommitted });

  const decide = useCallback(
    (ask: HomeLoopAsk, decision: 'approve' | 'reject', notes: string) => {
      const target = inbox.data?.cases.find(
        item => item.id === ask.id
      )?.decisionTarget;
      answer({
        id: ask.id,
        label:
          decision === 'approve'
            ? notes
              ? `Answered: ${notes}`
              : ovieAskAction(target?.kind).committedLabel
            : `Replied: ${notes}`,
        commit: async () => {
          if (!target) throw new Error('This decision is no longer open.');
          const request = inboxDecisionRequest(
            target,
            decision,
            notes,
            crypto.randomUUID()
          );
          const response = await fetch(request.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request.body),
          });
          if (!response.ok)
            throw new Error(
              response.status === 409
                ? 'This decision changed. Review it and retry.'
                : 'Not recorded. Try again.'
            );
        },
      });
    },
    [answer, inbox.data]
  );

  // Empty stage columns are dead space on a dense Home; the verdict already
  // names a stalled queue. The full six-stage path lives on Shipping.
  const activeStages = useMemo(() => {
    const used = new Set(home?.rows.map(row => row.stage));
    const active = OVIE_SHIP_STAGES.filter(stage => used.has(stage));
    return active.length > 0 ? active : OVIE_SHIP_STAGES;
  }, [home]);
  const connection = snapshot?.view.connection ?? null;
  // The task feed reports `syncing` with no observation until its first
  // reconciled read; that is loading, not an empty pipeline.
  const awaitingFirstTasks =
    snapshot?.operationalTasks.syncState === 'syncing' &&
    snapshot.operationalTasks.observedAt === null &&
    snapshot.operationalTasks.tasks.length === 0;
  const sendFeedback = useCallback(
    (ask: HomeLoopAsk, comment: string) => {
      const target = inbox.data?.cases.find(
        item => item.id === ask.id
      )?.decisionTarget;
      if (target?.kind !== 'summer') return;
      void fetch(
        `/api/ovie/summer-cards/${encodeURIComponent(target.id)}/feedback`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ comment }),
        }
      )
        .then(response => {
          if (!response.ok) throw new Error('Feedback was not recorded.');
          toast.success('Feedback sent');
        })
        .catch(() => toast.error('Feedback was not recorded. Try again.'));
    },
    [inbox.data]
  );

  const loopStatus: HomeLoopSectionStatus =
    connection === 'unauthorized' ||
    (awaitingFirstTasks && snapshot?.operationalRequestState === 'error')
      ? 'error'
      : !snapshot || awaitingFirstTasks
        ? 'loading'
        : 'ready';
  // A disconnected feed keeps the last values but must say so in text.
  const constraint =
    home?.constraint ??
    (connection === 'disconnected'
      ? { tone: 'warn' as const, text: 'Shipping data is disconnected' }
      : null);
  const asksStatus: HomeLoopSectionStatus = inbox.data
    ? 'ready'
    : inbox.isError
      ? 'error'
      : 'loading';
  // Every panel error state is an incident (panel-alerts.ts), not just copy.
  const loopErrorReason =
    loopStatus === 'error'
      ? connection === 'unauthorized'
        ? 'unauthorized'
        : 'operational-tasks-unavailable'
      : null;
  useEffect(() => {
    if (loopErrorReason)
      reportOvieHomePanelError('shipping-loop', loopErrorReason);
  }, [loopErrorReason]);
  useEffect(() => {
    if (asksStatus === 'error')
      reportOvieHomePanelError('asks', 'inbox-unavailable');
  }, [asksStatus]);
  // Mirror the inbox: a successful read can still omit a source. Showing the
  // loaded asks alone would claim the section is complete.
  // First meaningful paint: both sections past their skeletons.
  useOvieHomeReadyTiming(loopStatus !== 'loading' && asksStatus !== 'loading');
  // The rest resolve by their declared defaults; a missing source is still
  // named so a short list never reads as complete.
  const sourceIssues = inbox.data?.issues.length ?? 0;
  const asksNotice =
    [
      deferredAsks > 0
        ? `${deferredAsks} more resolve by their defaults`
        : null,
      inbox.data ? summarizeSourceIssues(inbox.data.issues) : null,
    ]
      .filter(Boolean)
      .join(' · ') || null;
  useEffect(() => {
    if (sourceIssues > 0)
      reportOvieHomePanelError('asks', `${sourceIssues} inbox source issues`);
  }, [sourceIssues]);

  const turns = useMemo(
    () => buildCanvasTurns(chat?.messages ?? [], chat?.isStreaming ?? false),
    [chat?.messages, chat?.isStreaming]
  );
  const history = useCanvasHistory(turns.length);
  const turn = history.index >= 0 ? turns[history.index] : undefined;
  const generated = turn ? partitionCanvasCards(turn.cards) : null;
  const answerPanel = turn ? (
    <HomeLoopAnswerPanel
      prompt={turn.prompt}
      reply={turn.reply}
      pending={turn.pending}
      position={history.index + 1}
      total={turns.length}
      onBack={history.back}
      onForward={history.forward}
      onHome={history.home}
      onOpenTranscript={() => chat?.onOpenTranscript()}
    >
      {generated?.answer.length
        ? generated.answer.map((card, index) => (
            <ChatOpsDataCard
              // Cards are positional within one immutable turn.
              key={`${turn.id}:${card.kind}:${card.title}:${index}`}
              card={card}
            />
          ))
        : null}
    </HomeLoopAnswerPanel>
  ) : null;
  const inFlightOverride = generated?.inFlight.length ? (
    <div
      className='flex flex-col gap-2'
      data-testid='home-loop-in-flight-generated'
    >
      {generated.inFlight.map((card, index) => (
        <ChatOpsDataCard
          key={`${turn?.id}:${card.kind}:${card.title}:${index}`}
          card={card}
        />
      ))}
    </div>
  ) : undefined;

  return (
    <HomeLoopCanvas
      answer={answerPanel}
      inFlightOverride={inFlightOverride}
      copy={OVIE_HOME_COPY}
      stages={activeStages}
      constraint={constraint}
      pulse={home?.pulse ?? []}
      asks={asks}
      rows={home?.rows ?? []}
      done={home?.done ?? []}
      doneSummary={
        home?.mergesToday != null
          ? `${home.mergesToday} ${home.mergesToday === 1 ? 'merge' : 'merges'}`
          : null
      }
      loopStatus={loopStatus}
      asksStatus={asksStatus}
      asksNotice={asksNotice}
      asksNoticeHref={APP_ROUTES.ADMIN_INBOX}
      answers={answers}
      onApprove={(ask, option) => decide(ask, 'approve', option ?? '')}
      onReply={(ask, text) => decide(ask, 'reject', text)}
      onFeedback={sendFeedback}
      onRetryLoop={() => void shipping.refetch()}
      onRetryAsks={() => void inbox.refetch()}
      asksMoreHref={APP_ROUTES.ADMIN_INBOX}
      company={company.data ?? COMPANY_PLACEHOLDER}
      companyLoading={company.isPending}
      pulseCaption={sinceLabel(lastVisit.at, mountedAt)}
      inFlightMoreHref={APP_ROUTES.ADMIN_SHIPPING}
    />
  );
}
