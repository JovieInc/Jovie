'use client';

import {
  ArrowRight,
  ChevronDown,
  Minus,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useId, useState } from 'react';
import { Sparkline } from '@/components/shell/Sparkline';
import { formatReportDelta } from '@/lib/connectors/opportunity-inbox-report';
import { formatOpportunityInboxRelativeTime } from '@/lib/connectors/opportunity-inbox-time';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { cn } from '@/lib/utils';

export interface OpportunityInboxReportCardProps {
  readonly card: OpportunityInboxCardViewModel;
  readonly onNextStep: (id: string) => void;
  readonly onDismiss: (id: string) => void;
  readonly isSubmittingNextStep?: boolean;
  readonly isDismissing?: boolean;
  readonly className?: string;
}

/**
 * Report-back card variant (GH #13178): renders a measured experiment result
 * — metric delta, sparkline from real series data, per-item breakdown on
 * expand — and a next-step CTA that emits a new pending suggested_action
 * linked to the parent experiment.
 */
export function OpportunityInboxReportCard({
  card,
  onNextStep,
  onDismiss,
  isSubmittingNextStep = false,
  isDismissing = false,
  className,
}: OpportunityInboxReportCardProps) {
  const breakdownId = useId();
  const [expanded, setExpanded] = useState(false);
  const report = card.report;
  const relativeTime = formatOpportunityInboxRelativeTime(card.createdAt);
  const isBusy = isSubmittingNextStep || isDismissing;

  if (!report) {
    return null;
  }

  const DirectionIcon =
    report.direction === 'up'
      ? TrendingUp
      : report.direction === 'down'
        ? TrendingDown
        : Minus;

  return (
    <article
      className={cn(
        'system-b-opportunity-inbox-card system-b-opportunity-inbox-report-card',
        className
      )}
      data-testid={`opportunity-inbox-report-card-${card.id}`}
    >
      <header className='system-b-opportunity-inbox-card-meta'>
        <span className='system-b-opportunity-inbox-card-type'>
          {card.typeLabel}
        </span>
        <span
          aria-hidden='true'
          className='system-b-opportunity-inbox-card-dot'
        >
          ·
        </span>
        <time
          className='system-b-opportunity-inbox-card-time'
          dateTime={card.createdAt}
        >
          {relativeTime}
        </time>
      </header>

      <h2 className='system-b-opportunity-inbox-card-title'>{card.title}</h2>

      <div className='system-b-opportunity-inbox-report-metric'>
        <span
          className='system-b-opportunity-inbox-report-delta'
          data-direction={report.direction}
          data-testid='opportunity-inbox-report-delta'
        >
          <DirectionIcon
            aria-hidden='true'
            className='system-b-opportunity-inbox-report-delta-icon'
          />
          {report.deltaDisplay}
        </span>
        <span className='system-b-opportunity-inbox-report-metric-label'>
          {report.metricLabel}
        </span>
        {report.series.length >= 2 ? (
          <Sparkline
            points={report.series}
            trend={report.direction}
            ariaLabel='Metric trend'
            className='system-b-opportunity-inbox-report-sparkline'
          />
        ) : null}
      </div>

      <p className='system-b-opportunity-inbox-card-why'>{card.why}</p>

      {report.items.length > 0 ? (
        <>
          <button
            type='button'
            className='system-b-opportunity-inbox-report-expand'
            aria-expanded={expanded}
            aria-controls={breakdownId}
            onClick={() => setExpanded(open => !open)}
          >
            {expanded ? 'Hide Breakdown' : 'Show Breakdown'}
            <ChevronDown
              aria-hidden='true'
              className={cn(
                'system-b-opportunity-inbox-report-expand-icon',
                expanded && 'system-b-opportunity-inbox-report-expand-icon-open'
              )}
            />
          </button>
          {expanded ? (
            <ul
              id={breakdownId}
              className='system-b-opportunity-inbox-report-breakdown'
              data-testid='opportunity-inbox-report-breakdown'
            >
              {report.items.map(item => (
                <li
                  key={item.label}
                  className='system-b-opportunity-inbox-report-breakdown-item'
                >
                  <span className='system-b-opportunity-inbox-report-breakdown-label'>
                    {item.label}
                  </span>
                  {item.detail ? (
                    <span className='system-b-opportunity-inbox-report-breakdown-detail'>
                      {item.detail}
                    </span>
                  ) : null}
                  {typeof item.deltaPercent === 'number' ? (
                    <span
                      className='system-b-opportunity-inbox-report-breakdown-delta'
                      data-direction={
                        item.deltaPercent > 0
                          ? 'up'
                          : item.deltaPercent < 0
                            ? 'down'
                            : 'flat'
                      }
                    >
                      {formatReportDelta(item.deltaPercent)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}

      <div className='system-b-opportunity-inbox-card-actions'>
        <button
          type='button'
          className='system-b-opportunity-inbox-dismiss'
          disabled={isBusy}
          onClick={() => onDismiss(card.id)}
        >
          Dismiss
        </button>
        {report.nextStep ? (
          <button
            type='button'
            className='system-b-opportunity-inbox-primary'
            disabled={isBusy}
            onClick={() => onNextStep(card.id)}
            data-testid='opportunity-inbox-report-next-step'
          >
            {isSubmittingNextStep ? 'Queuing…' : report.nextStep.label}
            <ArrowRight className='system-b-opportunity-inbox-primary-icon' />
          </button>
        ) : null}
      </div>
    </article>
  );
}
