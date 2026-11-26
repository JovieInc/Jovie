/**
 * Whether the typecheck lane group may start its tsc children concurrently.
 * Override with CI_FAST_TYPECHECK_OVERLAP=true|false.
 *
 * merge_group / workflow_dispatch keep overlap on runners that can hold three
 * ~5.6GB tsc processes. pull_request Source Validation twins share a ~7GB
 * ubuntu job with unit tests — three concurrent tsc processes thrash until the
 * 30m timeout (#26276).
 *
 * @param {string | undefined} [eventName]
 * @param {NodeJS.ProcessEnv} [env]
 */
export function shouldOverlapTypecheckLanes(
  eventName = process.env.GITHUB_EVENT_NAME,
  env = process.env
) {
  const override = env.CI_FAST_TYPECHECK_OVERLAP;
  if (override === 'true') return true;
  if (override === 'false') return false;
  return eventName === 'merge_group' || eventName === 'workflow_dispatch';
}
