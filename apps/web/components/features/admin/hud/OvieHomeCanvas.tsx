'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  buildOvieAsks,
  buildOvieHomeShipping,
  OVIE_SHIP_STAGES,
  type OviePulseMemory,
  ovieAskAction,
  rememberPulse,
} from '@/lib/ovie/home/shipping-home';
import { inboxDecisionRequest, type OvieInbox } from '@/lib/ovie/inbox';
import { FREQUENT_CACHE } from '@/lib/queries/cache-strategies';
import { useCanvasHistory } from './useCanvasHistory';
import { useHudShippingStateQuery } from './useHudShippingStateQuery';

const OVIE_HOME_COPY: HomeLoopCopy = {
  constraintClear: 'Nothing is blocking shipping',
  asksTitle: 'Blocked On You',
  asksEmpty: 'Nothing needs your decision.',
  asksError: 'Decisions could not load.',
  inFlightTitle: 'In Flight',
  inFlightEmpty: 'No work in flight.',
  inFlightError: 'Shipping data could not load.',
  doneTitle: 'Done Today',
  doneEmpty: 'Nothing has landed yet today.',
};

const INBOX_QUERY_KEY = ['ovie', 'inbox'] as const;
const PULSE_MEMORY_KEY = 'ovie.home.pulse-memory.v1';

function readPulseMemory(): OviePulseMemory {
  try {
    const raw = globalThis.sessionStorage?.getItem(PULSE_MEMORY_KEY);
    return raw ? (JSON.parse(raw) as OviePulseMemory) : {};
  } catch {
    return {};
  }
}

function writePulseMemory(memory: OviePulseMemory): void {
  try {
    globalThis.sessionStorage?.setItem(
      PULSE_MEMORY_KEY,
      JSON.stringify(memory)
    );
  } catch {
    // Pulse history is a per-tab convenience; the tiles render without it.
  }
}

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
export function OvieHomeCanvas({
  chat,
}: Readonly<{ readonly chat?: HomeCanvasState }> = {}) {
  const queryClient = useQueryClient();
  const shipping = useHudShippingStateQuery(null);
  const inbox = useQuery<OvieInbox>({
    queryKey: INBOX_QUERY_KEY,
    queryFn: ({ signal }) => fetchInbox(signal),
    ...FREQUENT_CACHE,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });

  const [pulseMemory, setPulseMemory] =
    useState<OviePulseMemory>(readPulseMemory);

  const snapshot = shipping.isPending ? null : shipping;
  const home = useMemo(
    () =>
      snapshot
        ? buildOvieHomeShipping({
            delivery: snapshot.view.delivery,
            operationalTasks: snapshot.operationalTasks,
            pulseMemory,
          })
        : null,
    [snapshot, pulseMemory]
  );

  useEffect(() => {
    if (!home) return;
    const next = rememberPulse(pulseMemory, home.pulse);
    // Only store real changes; an unchanged read must not re-render.
    if (JSON.stringify(next) === JSON.stringify(pulseMemory)) return;
    setPulseMemory(next);
    writePulseMemory(next);
  }, [home, pulseMemory]);

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
            ? ovieAskAction(target?.kind).committedLabel
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
  const loopStatus: HomeLoopSectionStatus =
    !snapshot || awaitingFirstTasks
      ? 'loading'
      : connection === 'unauthorized'
        ? 'error'
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
  // Mirror the inbox: a successful read can still omit a source. Showing the
  // loaded asks alone would claim the section is complete.
  const asksNotice =
    inbox.data && inbox.data.issues.length > 0
      ? `Some sources are unavailable. ${inbox.data.issues.join(' ')}`
      : null;

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
      stages={OVIE_SHIP_STAGES}
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
      answers={answers}
      onApprove={ask => decide(ask, 'approve', '')}
      onReply={(ask, text) => decide(ask, 'reject', text)}
      onRetryLoop={() => void shipping.refetch()}
      onRetryAsks={() => void inbox.refetch()}
      asksMoreHref={APP_ROUTES.ADMIN_INBOX}
    />
  );
}
