import { AlertTriangle, CheckCircle, RefreshCw, XCircle } from 'lucide-react';
import { publicEnv } from '@/lib/env-public';

export const LINEAR_EASE = [0.16, 1, 0.3, 1] as const;

export const PLAN_FEATURES = {
  free: {
    name: 'Free',
    tagline: 'Get started',
    features: [
      { label: 'Unlimited smart links' },
      { label: 'Auto-sync from Spotify' },
      { label: 'Smart deep links' },
      { label: 'Edit & customize smart links' },
      { label: 'Release notifications' },
      { label: 'Manual release creation' },
      { label: 'Subscriber collection' },
      { label: 'Basic analytics', detail: '30-day retention' },
      { label: 'Up to 100 contacts' },
      { label: 'AI assistant', detail: '25 messages/day' },
    ],
  },
  pro: {
    name: 'Pro',
    tagline: 'For growing artists',
    features: [
      { label: 'Pre-release pages', detail: 'Countdown & notify me' },
      { label: 'Remove Jovie branding' },
      { label: 'Extended analytics', detail: '90-day retention' },
      { label: 'Advanced analytics & geographic insights' },
      { label: 'Filter your own visits' },
      { label: 'Unlimited contacts' },
      { label: 'Contact export' },
      { label: 'Verified badge' },
      { label: 'AI assistant', detail: '100 messages/day' },
      { label: 'Priority support' },
    ],
  },
  growth: {
    name: 'Growth',
    tagline: 'For serious artists — Early Access',
    features: [
      { label: 'Full analytics', detail: '1-year retention' },
      { label: 'Everything in Pro' },
      { label: 'AI assistant', detail: '500 messages/day' },
      { label: 'A/B testing', detail: 'Coming soon' },
      { label: 'Meta pixel integration', detail: 'Coming soon' },
      { label: 'Custom domain', detail: 'Coming soon' },
    ],
  },
} as const;

export type PlanKey = keyof typeof PLAN_FEATURES;

const growthPlanEnabled = publicEnv.NEXT_PUBLIC_FEATURE_GROWTH_PLAN === 'true';

export const PLAN_KEYS: PlanKey[] = growthPlanEnabled
  ? ['free', 'pro', 'growth']
  : ['free', 'pro'];

export const EVENT_TYPE_LABELS: Record<string, string> = {
  'subscription.created': 'Subscription started',
  'subscription.updated': 'Subscription updated',
  'subscription.deleted': 'Subscription cancelled',
  'checkout.session.completed': 'Payment completed',
  'payment_intent.succeeded': 'Payment succeeded',
  'payment_intent.payment_failed': 'Payment failed',
  subscription_created: 'Subscription started',
  subscription_updated: 'Subscription updated',
  subscription_deleted: 'Subscription cancelled',
  subscription_upgraded: 'Subscription upgraded',
  subscription_downgraded: 'Subscription downgraded',
  payment_succeeded: 'Payment succeeded',
  payment_failed: 'Payment failed',
  reconciliation_fix: 'Billing reconciled',
  customer_created: 'Customer created',
  customer_linked: 'Customer linked',
  reconciliation: 'Billing reconciled',
};

export const EVENT_BADGE_CONFIG: Record<
  string,
  { variant: 'success' | 'error' | 'secondary'; icon: typeof CheckCircle }
> = {
  'subscription.created': { variant: 'success', icon: CheckCircle },
  'subscription.updated': { variant: 'secondary', icon: RefreshCw },
  'subscription.deleted': { variant: 'error', icon: XCircle },
  'checkout.session.completed': { variant: 'success', icon: CheckCircle },
  'payment_intent.succeeded': { variant: 'success', icon: CheckCircle },
  'payment_intent.payment_failed': { variant: 'error', icon: AlertTriangle },
  subscription_created: { variant: 'success', icon: CheckCircle },
  subscription_updated: { variant: 'secondary', icon: RefreshCw },
  subscription_deleted: { variant: 'error', icon: XCircle },
  subscription_upgraded: { variant: 'success', icon: CheckCircle },
  subscription_downgraded: { variant: 'secondary', icon: RefreshCw },
  payment_succeeded: { variant: 'success', icon: CheckCircle },
  payment_failed: { variant: 'error', icon: AlertTriangle },
  reconciliation_fix: { variant: 'secondary', icon: RefreshCw },
  customer_created: { variant: 'secondary', icon: RefreshCw },
  customer_linked: { variant: 'secondary', icon: RefreshCw },
  reconciliation: { variant: 'secondary', icon: RefreshCw },
};

export function formatEventType(eventType: string): string {
  return EVENT_TYPE_LABELS[eventType] ?? eventType.replaceAll(/[._]/g, ' ');
}

export function formatStatus(status: string): string {
  const normalized = status.replaceAll(/[_-]/g, ' ');
  return normalized.replaceAll(/\b\w/g, char => char.toUpperCase());
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function getPlanDisplayName(plan: string | null): string {
  if (plan === 'growth') return 'Growth';
  if (plan === 'pro') return 'Pro';
  return 'Free';
}
