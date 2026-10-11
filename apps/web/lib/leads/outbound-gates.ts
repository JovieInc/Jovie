/**
 * Default-off gate for Instantly enrollment.
 *
 * Unset or any value other than the exact string `true` keeps outbound
 * pushes closed. This does not record consent or rewrite message copy.
 */
export function isInstantlyOutboundEnabled(): boolean {
  return process.env.FEATURE_INSTANTLY_OUTBOUND === 'true';
}
