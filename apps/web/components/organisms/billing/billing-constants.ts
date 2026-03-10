import { AlertTriangle, CheckCircle, RefreshCw, XCircle } from 'lucide-react';
import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry';
import { publicEnv } from '@/lib/env-public';

export const LINEAR_EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Plan features for the billing comparison UI, derived from ENTITLEMENT_REGISTRY.
 * The `{ label, detail? }` shape is consumed by PlanComparisonSection.
 */
export const PLAN_FEATURES = {
  free: {
    name: ENTITLEMENT_REGISTRY.free.marketing.displayName,
    tagline: ENTITLEMENT_REGISTRY.free.marketing.tagline,
    features: ENTITLEMENT_REGISTRY.free.marketing.features.map(f => {
      const match = f.match(/^(.+?)\s*\(([^)]+)\)$/);
      return match ? { label: match[1], detail: match[2] } : { label: f };
    }),
  },
  pro: {
    name: ENTITLEMENT_REGISTRY.pro.marketing.displayName,
    tagline: ENTITLEMENT_REGISTRY.pro.marketing.tagline,
    features: ENTITLEMENT_REGISTRY.pro.marketing.features.map(f => {
      const match = f.match(/^(.+?)\s*\(([^)]+)\)$/);
      return match ? { label: match[1], detail: match[2] } : { label: f };
    }),
  },
  growth: {
    name: ENTITLEMENT_REGISTRY.growth.marketing.displayName,
    tagline: `${ENTITLEMENT_REGISTRY.growth.marketing.tagline} — Early Access`,
    features: ENTITLEMENT_REGISTRY.growth.marketing.features.map(f => {
      const match = f.match(/^(.+?)\s*\(([^)]+)\)$/);
      return match ? { label: match[1], detail: match[2] } : { label: f };
    }),
  },
};

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
