/**
 * @deprecated Import from atomic directories instead:
 * - Badge, FooterLink, FrostedButton, LoadingSpinner, NavLink, CTAButton → @/components/atoms
 * - EmptyState → @/components/organisms
 */

// Re-exports for backwards compatibility
export { type AppBadgeProps, Badge } from '@/components/atoms/Badge';
export {
  FooterLink,
  type FooterLinkProps,
} from '@/components/atoms/FooterLink';
export {
  FrostedButton,
  type FrostedButtonProps,
} from '@/components/atoms/FrostedButton';
export {
  LoadingSpinner,
  type LoadingSpinnerProps,
  type LoadingSpinnerTone,
  Spinner,
} from '@/components/atoms/LoadingSpinner';
export { NavLink, type NavLinkProps } from '@/components/atoms/NavLink';
export {
  EmptyState,
  type EmptyStateProps,
} from '@/components/organisms/EmptyState';
export {
  CTAButton,
  type CTAButtonProps,
} from './CTAButton';
