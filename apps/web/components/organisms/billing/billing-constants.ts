import { AlertTriangle, CheckCircle, RefreshCw, XCircle } from 'lucide-react';

export const LINEAR_EASE = [0.16, 1, 0.3, 1] as const;

export const PLAN_FEATURES = {
  free: {
    name: 'Free',
    tagline: 'Get started',
    features: [
      { label: 'Basic analytics', detail: '7-day retention' },
      { label: 'Up to 100 contacts' },
      { label: 'AI assistant', detail: '5 messages/day' },
      { label: 'Smart deep links' },
      { label: 'Auto-sync from Spotify' },
    ],
  },
  pro: {
    name: 'Pro',
    tagline: 'For growing artists',
    features: [
      { label: 'Extended analytics', detail: '90-day retention' },
      { label: 'Unlimited contacts' },
      { label: 'Remove Jovie branding' },
      { label: 'Contact export' },
      { label: 'Filter your own visits' },
      { label: 'Geographic insights' },
      { label: 'AI assistant', detail: '100 messages/day' },
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

export const PLAN_KEYS: PlanKey[] = ['free', 'pro', 'growth'];

export const EVENT_TYPE_LABELS: Record<string, string> = {
  'subscription.created': 'Subscription started',
  'subscription.updated': 'Subscription updated',
  'subscription.deleted': 'Subscription cancelled',
  'checkout.session.completed': 'Payment completed',
  'payment_intent.succeeded': 'Payment succeeded',
  'payment_intent.payment_failed': 'Payment failed',
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
  reconciliation: { variant: 'secondary', icon: RefreshCw },
};

export function formatEventType(eventType: string): string {
  return EVENT_TYPE_LABELS[eventType] ?? eventType.replaceAll(/[._]/g, ' ');
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
