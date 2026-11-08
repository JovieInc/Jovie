import { InsightsPanelLoading } from '@/features/dashboard/insights/InsightsPanel';

/**
 * Insights loading state (JOV-1087). Renders the panel's own loading view so
 * the route skeleton, the query skeleton and the loaded list share one layout.
 */
export default function InsightsLoading() {
  return <InsightsPanelLoading />;
}
