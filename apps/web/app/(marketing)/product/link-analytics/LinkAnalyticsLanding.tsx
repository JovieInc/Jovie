import { LinkAnalyticsPanel } from '@/components/features/link-analytics/LinkAnalyticsPanel';
import { LINK_ANALYTICS_COPY } from '@/data/linkAnalyticsCopy';
import { ProductFeatureLanding } from '../ProductFeatureLanding';

export function LinkAnalyticsLanding() {
  return (
    <ProductFeatureLanding
      slug='link-analytics'
      owner='apps/web/app/(marketing)/product/link-analytics/LinkAnalyticsLanding.tsx'
      copy={LINK_ANALYTICS_COPY}
    >
      <LinkAnalyticsPanel />
    </ProductFeatureLanding>
  );
}
