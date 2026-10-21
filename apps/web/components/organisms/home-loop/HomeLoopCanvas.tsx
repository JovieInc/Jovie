'use client';

import type { ReactNode } from 'react';
import type {
  HomeLoopAsk,
  HomeLoopConstraint,
  HomeLoopCopy,
  HomeLoopDoneItem,
  HomeLoopRow,
  HomeLoopStripItem,
  HomeLoopTile,
} from '@/lib/home-loop/contract';
import {
  type HomeLoopAnswer,
  HomeLoopAsks,
  HomeLoopAsksSkeleton,
} from './HomeLoopAsks';
import { HomeLoopKanban, HomeLoopKanbanSkeleton } from './HomeLoopKanban';
import { HomeLoopConstraintBanner, HomeLoopPulse } from './HomeLoopPulse';
import { HomeLoopSection, type HomeLoopSectionStatus } from './HomeLoopSection';
import { HomeLoopDoneChips } from './HomeLoopStageRows';
import { HomeLoopStageStrip } from './HomeLoopStageStrip';

export type { HomeLoopCopy } from '@/lib/home-loop/contract';

export interface HomeLoopCanvasProps {
  readonly copy: HomeLoopCopy;
  readonly stages: readonly string[];
  readonly constraint: HomeLoopConstraint | null;
  readonly pulse: readonly HomeLoopTile[];
  readonly asks: readonly HomeLoopAsk[];
  readonly rows: readonly HomeLoopRow[];
  readonly done: readonly HomeLoopDoneItem[];
  readonly doneSummary?: string | null;
  /** Status of the shipping read (constraint, pulse, in flight, done). */
  readonly loopStatus: HomeLoopSectionStatus;
  readonly asksStatus: HomeLoopSectionStatus;
  /** Partial source failure while some or no asks are still shown. */
  readonly asksNotice?: string | null;
  readonly answers: Readonly<Record<string, HomeLoopAnswer>>;
  readonly onApprove: (ask: HomeLoopAsk, option?: string) => void;
  readonly onReply: (ask: HomeLoopAsk, text: string) => void;
  /** Post-ship feedback on a decided ask; the decision stands. */
  readonly onFeedback?: (ask: HomeLoopAsk, text: string) => void;
  readonly onRetryLoop?: () => void;
  readonly onRetryAsks?: () => void;
  /** Where the full list of asks lives once Home shows the top few. */
  readonly asksMoreHref?: string;
  /** Where the full in-flight list lives when a stage lane overflows. */
  readonly inFlightMoreHref?: string;
  /** Stage timing (7d p50 / p95) and flow p95s under the pulse. */
  readonly strip?: readonly HomeLoopStripItem[];
  readonly stripCoverage?: string | null;
  /** Generated answer for the current canvas state, under the pulse. */
  readonly answer?: ReactNode;
  /** Generated UI that updates the in-flight section in place. */
  readonly inFlightOverride?: ReactNode;
}

/**
 * The shared Home loop canvas. One screen, no scrolling (Tim 2026-10-21):
 * constraint, pulse and stage timing on top; then blocked on you, in flight
 * as one lane per stage, and done today. From `lg` the canvas fills the
 * height its shell gives it and every list shows "+N more" instead of
 * scrolling. The container decides density: asks beside the board from
 * `@4xl`, and done today as its own column from `@7xl` (ultrawide). Every
 * section reserves its frame, so arriving data never moves a sibling.
 */
export function HomeLoopCanvas({
  copy,
  stages,
  constraint,
  pulse,
  asks,
  rows,
  done,
  doneSummary,
  loopStatus,
  asksStatus,
  asksNotice,
  answers,
  onApprove,
  onReply,
  onFeedback,
  onRetryLoop,
  onRetryAsks,
  asksMoreHref,
  inFlightMoreHref,
  strip,
  stripCoverage,
  answer,
  inFlightOverride,
}: HomeLoopCanvasProps) {
  const openAsks = asks.filter(
    ask => !answers[ask.id] || answers[ask.id]?.state === 'failed'
  ).length;
  return (
    <div
      className='@container flex w-full flex-col gap-3 lg:h-full lg:min-h-0'
      data-testid='home-loop-canvas'
    >
      <HomeLoopConstraintBanner
        constraint={loopStatus === 'ready' ? constraint : null}
        emptyLabel={copy.constraintClear}
        loading={loopStatus === 'loading'}
      />
      <HomeLoopPulse tiles={pulse} loading={loopStatus === 'loading'} />
      {strip ? (
        <HomeLoopStageStrip
          title={copy.latencyTitle ?? 'Stage Time'}
          items={loopStatus === 'ready' ? strip : []}
          coverage={loopStatus === 'ready' ? stripCoverage : null}
          emptyLabel={copy.latencyEmpty ?? 'Not measured'}
        />
      ) : null}
      {answer ? (
        <div className='max-h-1/2 shrink-0 overflow-y-auto'>{answer}</div>
      ) : null}
      <div
        className='grid grid-cols-1 gap-4 @4xl:grid-cols-12 lg:min-h-0 lg:flex-1 lg:grid-rows-1'
        data-testid='home-loop-main'
      >
        <HomeLoopSection
          title={copy.asksTitle}
          count={openAsks}
          status={asksStatus}
          isEmpty={asks.length === 0}
          emptyLabel={copy.asksEmpty}
          errorLabel={copy.asksError}
          notice={asksNotice}
          onRetry={onRetryAsks}
          skeleton={<HomeLoopAsksSkeleton />}
          minBodyClassName='flex min-h-24 flex-1 flex-col lg:min-h-0'
          className='min-h-0 @4xl:col-span-4 @7xl:col-span-3'
          testId='home-loop-asks-section'
        >
          <HomeLoopAsks
            asks={asks}
            answers={answers}
            approveLabel={copy.approveLabel}
            fit
            moreHref={asksMoreHref}
            onApprove={onApprove}
            onReply={onReply}
            onFeedback={onFeedback}
          />
        </HomeLoopSection>
        <div className='flex min-h-0 flex-col gap-4 @4xl:col-span-8 @7xl:col-span-9 @7xl:flex-row'>
          <HomeLoopSection
            title={copy.inFlightTitle}
            count={rows.length}
            status={inFlightOverride ? 'ready' : loopStatus}
            isEmpty={!inFlightOverride && rows.length === 0}
            emptyLabel={copy.inFlightEmpty}
            errorLabel={copy.inFlightError}
            onRetry={onRetryLoop}
            skeleton={<HomeLoopKanbanSkeleton />}
            minBodyClassName='flex min-h-32 flex-1 flex-col lg:min-h-0'
            className='min-h-0 flex-1'
            testId='home-loop-in-flight-section'
          >
            {inFlightOverride ?? (
              <HomeLoopKanban
                stages={stages}
                rows={rows}
                moreHref={inFlightMoreHref}
              />
            )}
          </HomeLoopSection>
          <HomeLoopSection
            title={copy.doneTitle}
            count={done.length}
            status={loopStatus}
            isEmpty={done.length === 0 && !doneSummary}
            emptyLabel={copy.doneEmpty}
            errorLabel={copy.inFlightError}
            onRetry={onRetryLoop}
            skeleton={<HomeLoopDoneChips items={[]} summary={null} />}
            minBodyClassName='flex min-h-0 flex-1 flex-col'
            className='h-28 shrink-0 @7xl:h-auto @7xl:w-1/4'
            testId='home-loop-done-section'
          >
            <HomeLoopDoneChips items={done} summary={doneSummary} fit />
          </HomeLoopSection>
        </div>
      </div>
    </div>
  );
}
