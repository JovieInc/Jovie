import type { FunnelStage, FunnelView } from '@/lib/analytics/funnel-view';
import {
  PROD_GOLDEN_PATH_SURFACES,
  type ProdGoldenPathLedger,
  type ProdGoldenPathSurfaceId,
} from './prod-golden-path-ledger';

const MAX_RECEIPT_AGE_MS = 24 * 60 * 60 * 1000;

// The artist starts at their own public profile. Landing and smartlinks are
// additional certified entry points and follow the core journey in the view.
const JOURNEY_ORDER = [
  'public-profile',
  'claim',
  'signup-signin',
  'checkout',
  'onboarding',
  'chat',
  'landing',
  'smartlink',
] as const satisfies readonly ProdGoldenPathSurfaceId[];

export function goldenPathFunnelView(
  ledger: ProdGoldenPathLedger | null,
  liveSha: string | null,
  now: number,
  liveDeploymentId?: string | null
): FunnelView {
  const stages = JOURNEY_ORDER.map((id): FunnelStage => {
    const receipt = ledger?.surfaces[id]?.latest;
    const observed = receipt ? Date.parse(receipt.endedAt) : NaN;
    const age = now - observed;
    const label = PROD_GOLDEN_PATH_SURFACES[id].title;

    if (!receipt || !liveSha || !Number.isFinite(age) || age < 0) {
      return { id, label, status: 'unknown' };
    }
    const evidenceUrl = [receipt.runUrl, receipt.issueUrl].find(
      (url): url is string => Boolean(url && /^https?:\/\//i.test(url))
    );
    if (
      receipt.sha !== liveSha ||
      (liveDeploymentId &&
        receipt.deploymentId &&
        receipt.deploymentId !== liveDeploymentId) ||
      age > MAX_RECEIPT_AGE_MS
    ) {
      return { id, label, status: 'stale', evidenceUrl };
    }
    const failedCheck = receipt.checks.find(check => check.status === 'failed');
    if (receipt.status === 'failed') {
      return {
        id,
        label,
        status: 'failed',
        evidenceUrl,
        detail: failedCheck?.summary || 'Production check failed.',
      };
    }
    if (receipt.status === 'blocked') {
      return {
        id,
        label,
        status: 'blocked',
        evidenceUrl,
        detail: receipt.blocker || 'Some production checks could not run.',
      };
    }
    if (receipt.checks.some(check => check.status === 'skipped')) {
      return { id, label, status: 'skipped', evidenceUrl };
    }
    return { id, label, status: 'verified', evidenceUrl };
  });

  const bottleneck =
    stages.find(stage => stage.status === 'failed') ??
    stages.find(stage => stage.status === 'blocked');
  return {
    title: 'Golden Path',
    caption: liveSha
      ? `Production ${liveSha.slice(0, 8)} · Verified stages have matching evidence from the last 24 hours`
      : 'Live production build unavailable',
    stages,
    bottleneckId: bottleneck?.id ?? null,
  };
}
