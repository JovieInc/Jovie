'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { ChatOpsDataCard } from '@/components/jovie/components/ChatOpsDataCard';
import type { HomeCanvasState } from '@/components/jovie/types';
import {
  HomeLoopAnswerPanel,
  type HomeLoopSectionStatus,
  StoryFirstCanvas,
} from '@/components/organisms/home-loop';
import { APP_ROUTES } from '@/constants/routes';
import {
  buildCanvasTurns,
  partitionCanvasCards,
} from '@/lib/ovie/home/canvas-turns';
import {
  type CompanyBlocker,
  homeConstraint,
} from '@/lib/ovie/home/company-blocker';
import {
  buildCompanyTiles,
  type OvieFunnelInput,
  type OvieGoldenPathRow,
} from '@/lib/ovie/home/company-tiles';
import { reportOvieHomePanelError } from '@/lib/ovie/home/panel-alerts';
import {
  buildOvieHomeShipping,
  type OviePulseMemory,
} from '@/lib/ovie/home/shipping-home';
import {
  buildStoryFirstBottleneck,
  buildStoryFirstGlance,
  buildStoryFirstStages,
} from '@/lib/ovie/home/story-first';
import { FREQUENT_CACHE } from '@/lib/queries/cache-strategies';
import type { HudMetrics } from '@/types/hud';
import { useCanvasHistory } from './useCanvasHistory';
import { useHudShippingStateQuery } from './useHudShippingStateQuery';
import { useOvieHomeReadyTiming } from './useOvieHomeReadyTiming';

const LAST_VISIT_KEY = 'ovie.home.last-visit.v1';

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

interface OvieHomeBlockerResponse {
  readonly blocker: CompanyBlocker | null;
  readonly generatedAt: string;
}

/**
 * Ovie Home — Story First flat (Tim 2026-11-21): bottleneck owns the fold,
 * three glance pulses as a right rail, stage buckets + one highlight, docked
 * composer with melt-to-chat on typing. Shipping from `ovie.shipping-state.v1`;
 * revenue blocker from company-state. Needs You and the metric wall stay off
 * the first fold (Inbox / Shipping own them).
 */
export interface OvieHomeCanvasProps {
  /** Shell chat state; absent when Home renders outside the composer slot. */
  readonly chat?: HomeCanvasState;
}

export function OvieHomeCanvas({ chat }: Readonly<OvieHomeCanvasProps>) {
  const shipping = useHudShippingStateQuery(null);

  // The one revenue blocker, from the cached company snapshot (no
  // third-party calls). Summer's brief reads the same field.
  const revenueBlocker = useQuery<OvieHomeBlockerResponse>({
    queryKey: ['ovie', 'home', 'blocker'],
    queryFn: ({ signal }) =>
      fetchJson<OvieHomeBlockerResponse>('/api/ovie/home/blocker', signal),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
    retry: false,
  });

  const [lastVisit] = useState<OvieLastVisit>(readLastVisit);
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
    ...FREQUENT_CACHE,
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

  const connection = snapshot?.view.connection ?? null;
  // The task feed reports `syncing` with no observation until its first
  // reconciled read; that is loading, not an empty pipeline.
  const awaitingFirstTasks =
    snapshot?.operationalTasks.syncState === 'syncing' &&
    snapshot.operationalTasks.observedAt === null &&
    snapshot.operationalTasks.tasks.length === 0;

  const loopStatus: HomeLoopSectionStatus =
    connection === 'unauthorized' ||
    (awaitingFirstTasks && snapshot?.operationalRequestState === 'error')
      ? 'error'
      : !snapshot || awaitingFirstTasks
        ? 'loading'
        : 'ready';
  // A disconnected feed keeps the last values but must say so in text.
  const shippingConstraint =
    home?.constraint ??
    (connection === 'disconnected'
      ? { tone: 'warn' as const, text: 'Shipping data is disconnected' }
      : null);
  // Home leads with the revenue blocker; shipping health is the floor shown
  // only when revenue is clear. Pending stays loading; a failed read falls
  // through to the shipping floor (never a permanent skeleton, never "clear").
  const revenueData = revenueBlocker.data;
  const revenueFailed = revenueBlocker.isError && revenueData === undefined;
  const revenueRead = revenueData !== undefined || revenueFailed;
  const constraint =
    revenueData !== undefined
      ? homeConstraint(revenueData.blocker, shippingConstraint)
      : shippingConstraint;

  const loopErrorReason =
    loopStatus === 'error'
      ? connection === 'unauthorized'
        ? 'unauthorized'
        : 'operational-tasks-unavailable'
      : null;
  useEffect(() => {
    if (revenueBlocker.isError)
      reportOvieHomePanelError('revenue-blocker', 'company-state-unavailable');
  }, [revenueBlocker.isError]);
  useEffect(() => {
    if (loopErrorReason)
      reportOvieHomePanelError('shipping-loop', loopErrorReason);
  }, [loopErrorReason]);

  useOvieHomeReadyTiming(
    loopStatus !== 'loading' && !company.isPending && revenueRead
  );

  const { buckets, highlight } = useMemo(
    () => buildStoryFirstStages(home?.rows ?? []),
    [home]
  );
  const bottleneck = useMemo(
    () =>
      buildStoryFirstBottleneck({
        revenue: revenueData?.blocker ?? null,
        revenueRead,
        revenueFailed,
        constraint,
        highlight,
      }),
    [revenueData, revenueRead, revenueFailed, constraint, highlight]
  );
  const glance = useMemo(
    () =>
      buildStoryFirstGlance({
        delivery: snapshot?.view.delivery ?? null,
        company: company.data ?? COMPANY_PLACEHOLDER,
        shippingPulse: home?.pulse ?? [],
      }),
    [snapshot, company.data, home]
  );

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
      {generated?.inFlight.length
        ? generated.inFlight.map((card, index) => (
            <ChatOpsDataCard
              key={`${turn.id}:flight:${card.kind}:${card.title}:${index}`}
              card={card}
            />
          ))
        : null}
    </HomeLoopAnswerPanel>
  ) : null;

  const melting = Boolean(chat?.composerHasIntent || chat?.isStreaming);

  return (
    <StoryFirstCanvas
      bottleneck={bottleneck}
      glance={glance}
      stages={buckets}
      inFlightHref={APP_ROUTES.ADMIN_SHIPPING}
      melting={melting}
      answer={answerPanel}
      glanceLoading={company.isPending || loopStatus === 'loading'}
      stagesLoading={loopStatus === 'loading'}
    />
  );
}
