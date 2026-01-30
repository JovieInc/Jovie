'use client';

import { cn } from '@/lib/utils';

/** Get color class based on contribution score threshold */
function getContributionColorClass(contribution: number): string {
  if (contribution >= 10) return 'text-green-600 dark:text-green-400';
  if (contribution >= 5) return 'text-amber-600 dark:text-amber-400';
  return 'text-tertiary-token';
}

/** Get color class based on percentage threshold */
function getPercentageColorClass(percentage: number): string {
  if (percentage >= 80) return 'bg-green-500';
  if (percentage >= 50) return 'bg-amber-500';
  return 'bg-red-500/60';
}

/** Get total score color class */
function getTotalScoreColorClass(percentage: number): string {
  if (percentage >= 80) return 'text-green-600 dark:text-green-400';
  if (percentage >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

export interface ConfidenceBreakdownData {
  isrcMatchScore: number;
  upcMatchScore: number;
  nameSimilarityScore: number;
  followerRatioScore: number;
  genreOverlapScore: number;
}

export interface MatchConfidenceBreakdownProps {
  readonly breakdown: ConfidenceBreakdownData;
  readonly totalScore: number;
  readonly className?: string;
}

interface ScoreRowProps {
  readonly label: string;
  readonly score: number;
  readonly weight: number;
  readonly description: string;
}

const SCORE_CONFIG: Array<{
  key: keyof ConfidenceBreakdownData;
  label: string;
  weight: number;
  description: string;
}> = [
  {
    key: 'isrcMatchScore',
    label: 'ISRC Matches',
    weight: 0.5,
    description: 'Tracks with matching ISRCs',
  },
  {
    key: 'upcMatchScore',
    label: 'UPC Matches',
    weight: 0.2,
    description: 'Albums with matching UPCs',
  },
  {
    key: 'nameSimilarityScore',
    label: 'Name Similarity',
    weight: 0.15,
    description: 'Artist name comparison',
  },
  {
    key: 'followerRatioScore',
    label: 'Follower Ratio',
    weight: 0.1,
    description: 'Similar audience size',
  },
  {
    key: 'genreOverlapScore',
    label: 'Genre Overlap',
    weight: 0.05,
    description: 'Matching music genres',
  },
];

function ScoreRow({ label, score, weight, description }: ScoreRowProps) {
  const percentage = Math.round(score * 100);
  const contribution = Math.round(score * weight * 100);

  return (
    <div className='group'>
      <div className='flex items-center justify-between text-xs'>
        <div className='flex items-center gap-2'>
          <span className='font-medium text-secondary-token'>{label}</span>
          <span className='text-tertiary-token/60'>
            ({Math.round(weight * 100)}% weight)
          </span>
        </div>
        <div className='flex items-center gap-2'>
          <span className='text-tertiary-token'>{percentage}%</span>
          <span className='text-tertiary-token/60'>→</span>
          <span
            className={cn(
              'font-medium',
              getContributionColorClass(contribution)
            )}
          >
            +{contribution}%
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className='mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2'>
        <div
          className={cn(
            'h-full rounded-full transition-all',
            getPercentageColorClass(percentage)
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Description on hover */}
      <p className='mt-0.5 text-[10px] text-tertiary-token/60 opacity-0 transition-opacity group-hover:opacity-100'>
        {description}
      </p>
    </div>
  );
}

/**
 * MatchConfidenceBreakdown - Shows detailed confidence scoring breakdown.
 *
 * Displays each scoring factor with:
 * - Score percentage
 * - Weight contribution
 * - Visual progress bar
 * - Hover description
 *
 * @example
 * <MatchConfidenceBreakdown
 *   breakdown={{
 *     isrcMatchScore: 0.9,
 *     upcMatchScore: 0.7,
 *     nameSimilarityScore: 0.95,
 *     followerRatioScore: 0.6,
 *     genreOverlapScore: 0.8,
 *   }}
 *   totalScore={0.85}
 * />
 */
export function MatchConfidenceBreakdown({
  breakdown,
  totalScore,
  className,
}: MatchConfidenceBreakdownProps) {
  const totalPercentage = Math.round(totalScore * 100);

  return (
    <div className={cn('space-y-3', className)}>
      {SCORE_CONFIG.map(config => (
        <ScoreRow
          key={config.key}
          label={config.label}
          score={breakdown[config.key]}
          weight={config.weight}
          description={config.description}
        />
      ))}

      {/* Total */}
      <div className='border-t border-subtle pt-2'>
        <div className='flex items-center justify-between text-xs'>
          <span className='font-medium text-primary-token'>
            Total Confidence
          </span>
          <span
            className={cn(
              'font-semibold',
              getTotalScoreColorClass(totalPercentage)
            )}
          >
            {totalPercentage}%
          </span>
        </div>
      </div>
    </div>
  );
}
