/**
 * Loop 7: public status page (fleet/closed-loop-gaps.md gap 9).
 *
 * Signal: a live GET of the status origin. status.jov.ie served Vercel
 * DEPLOYMENT_NOT_FOUND (observed 2026-10-25T03:07Z), so the footer omits the
 * link (JOV-7135) and customers have no incident channel. Threshold: any
 * failure. The page must answer 2xx with no x-vercel-error header and a
 * non-empty HTML body; the loop closes only when that holds on re-measure.
 */
const DEFAULT_ORIGIN = 'https://status.jov.ie';

export default {
  key: 'status-page',
  title: 'Public status page is down',
  severity: 'High',
  priority: 2,
  owner: 'jovie-web',
  sourceIssue: 'JOV-7135',
  source: 'loop-health-status-page.yml / scripts/loops/status-page.mjs',
  summary:
    'status.jov.ie does not serve a working status page (non-2xx, a Vercel platform error such as DEPLOYMENT_NOT_FOUND, or an empty body). The public footer hides the Status link until it is restored.',
  whyItMatters:
    'During an outage customers have no public incident channel; the cost is trust and duplicate support load.',
  remeasure: 'node scripts/loop-health.mjs --loop status-page --no-file',
  dwellSloMinutes: 360,
  rules: [
    {
      id: 'status-page-reachable',
      metric: 'statusPageFailures',
      op: 'max',
      threshold: 0,
      description:
        'status origin answers 2xx, with no x-vercel-error header and a non-empty HTML body',
    },
  ],
  async collect({ env, fetchImpl }) {
    const origin = env.STATUS_PAGE_ORIGIN || DEFAULT_ORIGIN;
    const reasons = [];
    let status = 0;
    try {
      const response = await fetchImpl(origin, {
        redirect: 'follow',
        signal: AbortSignal.timeout(20_000),
      });
      status = response.status;
      const platformError = response.headers?.get?.('x-vercel-error');
      const body = response.text ? await response.text() : '';
      if (!(status >= 200 && status < 300)) reasons.push(`HTTP ${status}`);
      if (platformError) reasons.push(`x-vercel-error ${platformError}`);
      if (body.trim().length < 200) reasons.push('empty or tiny body');
    } catch (error) {
      reasons.push(`fetch failed: ${error?.name || 'error'}`);
    }
    return {
      metrics: { statusPageFailures: reasons.length },
      detail: { origin, httpStatus: status, reasons },
    };
  },
};
