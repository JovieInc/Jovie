'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { toast } from '@/components/feedback';
import { ChatOpsDataCard } from '@/components/jovie/components/ChatOpsDataCard';
import type { HomeCanvasState } from '@/components/jovie/types';
import {
  HomeLoopAnswerPanel,
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
import { buildCompanyTiles } from '@/lib/ovie/home/company-hud';
import { fleetVerdict } from '@/lib/ovie/home/fleet-verdict';
import {
  buildOvieAsks,
  buildOvieHomeShipping,
  ovieAskAction,
  summarizeSourceIssues,
} from '@/lib/ovie/home/shipping-home';
import { inboxDecisionRequest, type OvieInbox } from '@/lib/ovie/inbox';
import { FREQUENT_CACHE } from '@/lib/queries/cache-strategies';
import { OvieCompanyHome } from './OvieCompanyHome';
import { OvieFeedBanner } from './OvieFeedBanner';
import { OvieFullscreenFrame } from './OvieFullscreenFrame';
import { OvieFullscreenToggle } from './OvieFullscreenToggle';
import { useCanvasHistory } from './useCanvasHistory';
import { useHudShippingStateQuery } from './useHudShippingStateQuery';
import { useOvieCompanyQueries } from './useOvieCompanyQueries';
import { useOvieFeedStatus } from './useOvieFeedStatus';
import { useOvieFullscreen } from './useOvieFullscreen';
import { useOvieHomeReadyTiming } from './useOvieHomeReadyTiming';
import { useOvieLastLooked } from './useOvieLastLooked';

const OVIE_HOME_COPY: HomeLoopCopy = {
  constraintClear: 'Nothing is blocking shipping',
  asksTitle: 'Blocked On You',
  asksEmpty: 'Nothing needs your decision.',
  asksError: 'Decisions could not load.',
  inFlightTitle: 'In Flight',
  inFlightEmpty: 'No work in flight.',
  inFlightError: 'Shipping data could not load.',
  doneTitle: 'Shipped Today',
  doneEmpty: 'Nothing has landed yet today.',
  latencyTitle: 'Stage Time 7d (P50 / P95)',
  latencyEmpty: 'Not measured',
};

const INBOX_QUERY_KEY = ['ovie', 'inbox'] as const;

async function fetchInbox(signal: AbortSignal): Promise<OvieInbox> {
  const response = await fetch('/api/ovie/inbox', {
    signal,
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Decisions could not load.');
  return (await response.json()) as OvieInbox;
}

/**
 * Ovie Home: the company HUD (fleet/ovie-home.md). Tiles come from Stripe and
 * Mercury (HUD metrics), the founder funnel, `ovie.shipping-state.v1` and the
 * Ovie inbox. Each source keeps its own existing cadence; this component adds
 * no polling of its own beyond those queries.
 */
export interface OvieHomeCanvasProps {
  /** Shell chat state; absent when Home renders outside the composer slot. */
  readonly chat?: HomeCanvasState;
}

export function OvieHomeCanvas({ chat }: Readonly<OvieHomeCanvasProps>) {
  const queryClient = useQueryClient();
  const fullscreen = useOvieFullscreen();
  const shipping = useHudShippingStateQuery(null);
  const { metrics, funnel } = useOvieCompanyQueries();
  const inbox = useQuery<OvieInbox>({
    queryKey: INBOX_QUERY_KEY,
    queryFn: ({ signal }) => fetchInbox(signal),
    ...FREQUENT_CACHE,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });

  const snapshot = shipping.isPending ? null : shipping;
  const home = useMemo(
    () =>
      snapshot
        ? buildOvieHomeShipping({
            delivery: snapshot.view.delivery,
            operationalTasks: snapshot.operationalTasks,
          })
        : null,
    [snapshot]
  );

  const asks = useMemo(
    () => (inbox.data ? buildOvieAsks(inbox.data) : []),
    [inbox.data]
  );

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
  const asksStatus: HomeLoopSectionStatus = inbox.data
    ? 'ready'
    : inbox.isError
      ? 'error'
      : 'loading';
  // First meaningful paint: both sections past their skeletons.
  useOvieHomeReadyTiming(loopStatus !== 'loading' && asksStatus !== 'loading');
  // Many issues collapse to a count; the inbox lists every one.
  const asksNotice = inbox.data
    ? summarizeSourceIssues(inbox.data.issues)
    : null;

  // Tiles render once every source has answered at least once; a source that
  // failed reads "Not measured" instead of holding the whole HUD in skeleton.
  const settled =
    !metrics.isPending &&
    !funnel.isPending &&
    loopStatus !== 'loading' &&
    asksStatus !== 'loading';
  // Same rule as the asks section: answered asks leave the count unless the answer failed.
  const openAsks = asks.filter(
    ask => !answers[ask.id] || answers[ask.id]?.state === 'failed'
  );
  const nextDeadlineIso = useMemo(() => {
    const deadlines = (inbox.data?.cases ?? [])
      .map(item => item.decisionDefault?.deadline)
      .filter((value): value is string => Boolean(value))
      .sort();
    return deadlines[0] ?? null;
  }, [inbox.data]);
  const fleet = snapshot ? fleetVerdict(snapshot.view.delivery.lanes) : null;
  // `Date.now()` is read at render; tiles re-render on every poll anyway.
  const tiles = useMemo(
    () =>
      settled
        ? buildCompanyTiles({
            overview: metrics.data?.overview ?? null,
            reliability: metrics.data?.reliability ?? null,
            funnel: funnel.data ?? null,
            delivery: snapshot?.view.delivery ?? null,
            // The listed work is a capped sample of today's merges; a verified
            // count over the sample would understate it. Only count when the
            // list is complete.
            verifiedToday:
              home &&
              home.mergesToday !== null &&
              home.done.length >= home.mergesToday
                ? home.done.filter(item => item.verified).length
                : null,
            fleet,
            openAsks: inbox.data ? openAsks.length : null,
            nextDeadlineIso,
            nowMs: Date.now(),
          })
        : null,
    [
      settled,
      metrics.data,
      funnel.data,
      snapshot,
      home,
      fleet,
      inbox.data,
      openAsks.length,
      nextDeadlineIso,
    ]
  );
  const lookedNow = useMemo(
    () =>
      settled
        ? {
            at: Date.now(),
            mrrUsd: metrics.data?.overview?.mrrUsd ?? null,
            subscribers: metrics.data?.overview?.activeSubscribers ?? null,
            signups7d:
              funnel.data?.stages.find(stage => stage.key === 'accounts')
                ?.count ?? null,
            merges7d: snapshot?.view.delivery.merges.last7Days.value ?? null,
            fleet: fleet?.level ?? null,
            askIds: inbox.data ? asks.map(ask => ask.id) : null,
          }
        : null,
    // Re-snapshot only when the underlying data changes, not on every render.
    [
      settled,
      metrics.data,
      funnel.data,
      snapshot,
      fleet?.level,
      asks,
      inbox.data,
    ]
  );
  const since = useOvieLastLooked(lookedNow);

  const turns = useMemo(
    () => buildCanvasTurns(chat?.messages ?? [], chat?.isStreaming ?? false),
    [chat?.messages, chat?.isStreaming]
  );
  const history = useCanvasHistory(turns.length, chat?.isStreaming ?? false);
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
  const generatedInFlight = generated?.inFlight.length ? (
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

  // Poll intervals match each query above; staleness is judged against them.
  const { status: feedStatus, now } = useOvieFeedStatus([
    { id: 'shipping', updatedAtMs: shipping.dataUpdatedAt, pollMs: 6_000 },
    { id: 'decisions', updatedAtMs: inbox.dataUpdatedAt, pollMs: 30_000 },
    { id: 'revenue', updatedAtMs: metrics.dataUpdatedAt, pollMs: 30_000 },
    { id: 'funnel', updatedAtMs: funnel.dataUpdatedAt, pollMs: 60_000 },
  ]);
  const homeView = (
    <OvieCompanyHome
      tiles={tiles}
      since={since}
      copy={OVIE_HOME_COPY}
      asks={asks}
      asksStatus={asksStatus}
      asksNotice={asksNotice}
      asksNoticeHref={APP_ROUTES.ADMIN_INBOX}
      asksMoreHref={APP_ROUTES.ADMIN_INBOX}
      answers={answers}
      done={home?.done ?? []}
      mergesToday={home?.mergesToday ?? null}
      doneSummary={
        home?.mergesToday != null
          ? `${home.mergesToday} ${home.mergesToday === 1 ? 'merge' : 'merges'}`
          : null
      }
      loopStatus={loopStatus}
      answer={answerPanel}
      generatedInFlight={generatedInFlight}
      onApprove={(ask, option) => decide(ask, 'approve', option ?? '')}
      onReply={(ask, text) => decide(ask, 'reject', text)}
      onFeedback={sendFeedback}
      onRetryAsks={() => void inbox.refetch()}
      onRetryLoop={() => void shipping.refetch()}
    />
  );
  const content = (
    <div className='relative flex w-full flex-col gap-2 lg:h-full lg:min-h-0'>
      <OvieFeedBanner status={feedStatus} />
      {fullscreen.on ? null : (
        <div className='flex justify-end'>
          <OvieFullscreenToggle
            onToggle={fullscreen.toggle}
            inDesktopApp={fullscreen.inDesktopApp}
          />
        </div>
      )}
      {homeView}
    </div>
  );
  if (!fullscreen.on) return content;
  return (
    <OvieFullscreenFrame status={feedStatus} now={now}>
      {content}
    </OvieFullscreenFrame>
  );
}
