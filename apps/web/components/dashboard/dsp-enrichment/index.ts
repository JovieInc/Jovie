/**
 * DSP Enrichment UI Components
 *
 * Components for displaying and interacting with DSP artist matches.
 */

export type { ConfidenceBadgeProps } from '../atoms/ConfidenceBadge';
// Atoms
export { ConfidenceBadge } from '../atoms/ConfidenceBadge';
export type { DspProviderIconProps } from '../atoms/DspProviderIcon';
export {
  DspProviderIcon,
  PROVIDER_COLORS,
  PROVIDER_LABELS,
} from '../atoms/DspProviderIcon';
export type { MatchStatusBadgeProps } from '../atoms/MatchStatusBadge';
export { MatchStatusBadge } from '../atoms/MatchStatusBadge';
export type { DspMatchCardProps } from '../molecules/DspMatchCard';
// Molecules
export { DspMatchCard } from '../molecules/DspMatchCard';
export type {
  ConfidenceBreakdownData,
  MatchConfidenceBreakdownProps,
} from '../molecules/MatchConfidenceBreakdown';
export { MatchConfidenceBreakdown } from '../molecules/MatchConfidenceBreakdown';
