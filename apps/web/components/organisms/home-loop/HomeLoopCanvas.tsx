'use client';

import type {
  HomeLoopAsk,
  HomeLoopConstraint,
  HomeLoopDoneItem,
  HomeLoopRow,
  HomeLoopTile,
} from '@/lib/home-loop/contract';
import {
  type HomeLoopAnswer,
  HomeLoopAsks,
  HomeLoopAsksSkeleton,
} from './HomeLoopAsks';
import { HomeLoopConstraintBanner, HomeLoopPulse } from './HomeLoopPulse';
import { HomeLoopSection, type HomeLoopSectionStatus } from './HomeLoopSection';
import {
  HomeLoopDoneChips,
  HomeLoopStageRows,
  HomeLoopStageRowsSkeleton,
} from './HomeLoopStageRows';

/** Persona copy; Jovie and Ovie fill the same skeleton with their own words. */
export interface HomeLoopCopy {
  readonly constraintClear: string;
  readonly asksTitle: string;
  readonly asksEmpty: string;
  readonly asksError: string;
  readonly inFlightTitle: string;
  readonly inFlightEmpty: string;
  readonly inFlightError: string;
  readonly doneTitle: string;
  readonly doneEmpty: string;
  readonly approveLabel?: string;
}

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
  readonly answers: Readonly<Record<string, HomeLoopAnswer>>;
  readonly onApprove: (ask: HomeLoopAsk) => void;
  readonly onReply: (ask: HomeLoopAsk, text: string) => void;
  readonly onRetryLoop?: () => void;
  readonly onRetryAsks?: () => void;
  /** Where the full list of asks lives once Home shows the top few. */
  readonly asksMoreHref?: string;
}

/**
 * The shared Home loop canvas: constraint and pulse on top, then blocked on
 * you, in flight, and done today. Dense enough to fit a MacBook Pro without
 * scrolling; two columns from `xl`, three from `2xl`. Every section reserves
 * its frame, so arriving data never moves a sibling.
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
  answers,
  onApprove,
  onReply,
  onRetryLoop,
  onRetryAsks,
  asksMoreHref,
}: HomeLoopCanvasProps) {
  const openAsks = asks.filter(
    ask => !answers[ask.id] || answers[ask.id]?.state === 'failed'
  ).length;
  return (
    <div className='flex w-full flex-col gap-3' data-testid='home-loop-canvas'>
      <HomeLoopConstraintBanner
        constraint={loopStatus === 'ready' ? constraint : null}
        emptyLabel={copy.constraintClear}
        loading={loopStatus === 'loading'}
      />
      <HomeLoopPulse tiles={pulse} loading={loopStatus === 'loading'} />
      <div className='grid items-start gap-4 xl:grid-cols-2 2xl:grid-cols-3'>
        <HomeLoopSection
          title={copy.asksTitle}
          count={openAsks}
          status={asksStatus}
          isEmpty={asks.length === 0}
          emptyLabel={copy.asksEmpty}
          errorLabel={copy.asksError}
          onRetry={onRetryAsks}
          skeleton={<HomeLoopAsksSkeleton />}
          minBodyClassName='min-h-24'
          testId='home-loop-asks-section'
        >
          <HomeLoopAsks
            asks={asks}
            answers={answers}
            approveLabel={copy.approveLabel}
            moreHref={asksMoreHref}
            onApprove={onApprove}
            onReply={onReply}
          />
        </HomeLoopSection>
        <HomeLoopSection
          title={copy.inFlightTitle}
          count={rows.length}
          status={loopStatus}
          isEmpty={rows.length === 0}
          emptyLabel={copy.inFlightEmpty}
          errorLabel={copy.inFlightError}
          onRetry={onRetryLoop}
          skeleton={<HomeLoopStageRowsSkeleton />}
          minBodyClassName='min-h-24'
          className='xl:row-span-2 2xl:row-span-1'
          testId='home-loop-in-flight-section'
        >
          <HomeLoopStageRows stages={stages} rows={rows} />
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
          minBodyClassName='min-h-10'
          testId='home-loop-done-section'
        >
          <HomeLoopDoneChips items={done} summary={doneSummary} />
        </HomeLoopSection>
      </div>
    </div>
  );
}
