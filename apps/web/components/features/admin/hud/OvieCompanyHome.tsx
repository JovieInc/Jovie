'use client';

import type { ReactNode } from 'react';
import { OvieCompanyHud } from '@/components/features/admin/hud/OvieCompanyHud';
import {
  type HomeLoopAnswer,
  HomeLoopAsks,
  type HomeLoopCopy,
  HomeLoopSection,
  type HomeLoopSectionStatus,
} from '@/components/organisms/home-loop';
import { HomeLoopAsksSkeleton } from '@/components/organisms/home-loop/HomeLoopAsks';
import { HomeLoopDoneChips } from '@/components/organisms/home-loop/HomeLoopStageRows';
import type { HomeLoopAsk, HomeLoopDoneItem } from '@/lib/home-loop/contract';
import type { CompanyTile } from '@/lib/ovie/home/company-hud';
import type { LastLookedSummary } from '@/lib/ovie/home/since-last-looked';

/**
 * Ovie Home, YC lens: the company tiles, then what is blocked on the
 * operator and what shipped. Everything else (stage timings, in-flight lanes,
 * pulse counters) lives on its own page; this surface is the answer, not the
 * ledger. Generated UI still replaces the shipped list in place.
 */
export function OvieCompanyHome({
  tiles,
  since,
  copy,
  asks,
  asksStatus,
  asksNotice,
  asksNoticeHref,
  asksMoreHref,
  answers,
  done,
  doneSummary,
  mergesToday,
  loopStatus,
  answer,
  generatedInFlight,
  onApprove,
  onReply,
  onFeedback,
  onRetryAsks,
  onRetryLoop,
}: Readonly<{
  readonly tiles: readonly CompanyTile[] | null;
  readonly since: LastLookedSummary | null;
  readonly copy: HomeLoopCopy;
  readonly asks: readonly HomeLoopAsk[];
  readonly asksStatus: HomeLoopSectionStatus;
  readonly asksNotice?: string | null;
  readonly asksNoticeHref?: string;
  readonly asksMoreHref?: string;
  readonly answers: Readonly<Record<string, HomeLoopAnswer>>;
  readonly done: readonly HomeLoopDoneItem[];
  readonly doneSummary: string | null;
  /** Merges since Pacific midnight, the one "today" every tile and chip uses. */
  readonly mergesToday?: number | null;
  readonly loopStatus: HomeLoopSectionStatus;
  readonly answer?: ReactNode;
  readonly generatedInFlight?: ReactNode;
  readonly onApprove: (ask: HomeLoopAsk, option?: string) => void;
  readonly onReply: (ask: HomeLoopAsk, text: string) => void;
  readonly onFeedback?: (ask: HomeLoopAsk, text: string) => void;
  readonly onRetryAsks?: () => void;
  readonly onRetryLoop?: () => void;
}>) {
  const openAsks = asks.filter(
    ask => !answers[ask.id] || answers[ask.id]?.state === 'failed'
  ).length;
  return (
    <div
      className='@container flex w-full flex-col gap-3 lg:h-full lg:min-h-0'
      data-testid='ovie-company-home'
    >
      <OvieCompanyHud tiles={tiles} since={since} />
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
          noticeHref={asksNoticeHref}
          onRetry={onRetryAsks}
          skeleton={<HomeLoopAsksSkeleton />}
          minBodyClassName='flex min-h-24 flex-1 flex-col lg:min-h-0'
          className='min-h-0 @4xl:col-span-7'
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
        <HomeLoopSection
          title={copy.doneTitle}
          count={mergesToday ?? done.length}
          status={generatedInFlight ? 'ready' : loopStatus}
          isEmpty={!generatedInFlight && done.length === 0 && !doneSummary}
          emptyLabel={copy.doneEmpty}
          errorLabel={copy.inFlightError}
          onRetry={onRetryLoop}
          skeleton={<HomeLoopDoneChips items={[]} summary={null} />}
          minBodyClassName='flex min-h-24 flex-1 flex-col lg:min-h-0'
          className='min-h-0 @4xl:col-span-5'
          testId='home-loop-done-section'
        >
          {generatedInFlight ?? (
            <HomeLoopDoneChips items={done} summary={doneSummary} fit />
          )}
        </HomeLoopSection>
      </div>
    </div>
  );
}
