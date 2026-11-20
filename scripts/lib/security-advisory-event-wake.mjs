// Pure helpers for the Dependabot → security-advisory-loop event wake.
// GitHub Actions cannot `on: dependabot_alert` (webhook-only). Producers POST
// repository_dispatch event_type=dependabot_alert; the 4h Gem clock is backstop.

export const DEPENDABOT_ALERT_DISPATCH_TYPE = 'dependabot_alert';

/** Actions that should wake Summer intake (same path as the clock). */
export const DEPENDABOT_ALERT_WAKE_ACTIONS = new Set([
  'created',
  'reopened',
  'reintroduced',
]);

/**
 * @param {{ action?: string, alert?: Record<string, unknown> }} event
 * @returns {{ wake: boolean, reason: string, clientPayload?: Record<string, unknown> }}
 */
export function planDependabotAlertWake(event) {
  const action = typeof event?.action === 'string' ? event.action : '';
  if (!DEPENDABOT_ALERT_WAKE_ACTIONS.has(action)) {
    return { wake: false, reason: `ignored_action:${action || 'missing'}` };
  }
  /** @type {Record<string, unknown>} */
  const alert =
    event.alert && typeof event.alert === 'object'
      ? /** @type {Record<string, unknown>} */ (event.alert)
      : {};
  /** @type {Record<string, unknown>} */
  const advisory =
    alert.security_advisory && typeof alert.security_advisory === 'object'
      ? /** @type {Record<string, unknown>} */ (alert.security_advisory)
      : {};
  /** @type {Record<string, unknown>} */
  const dependency =
    alert.dependency && typeof alert.dependency === 'object'
      ? /** @type {Record<string, unknown>} */ (alert.dependency)
      : {};
  /** @type {Record<string, unknown>} */
  const pkg =
    dependency.package && typeof dependency.package === 'object'
      ? /** @type {Record<string, unknown>} */ (dependency.package)
      : {};
  const number = Number(alert.number);
  const ghsa =
    typeof advisory.ghsa_id === 'string' ? advisory.ghsa_id : undefined;
  if (!Number.isFinite(number) || number <= 0) {
    return { wake: false, reason: 'missing_alert_number' };
  }
  return {
    wake: true,
    reason: 'wake',
    clientPayload: {
      schema: 'jovie.dependabot-alert-wake/v1',
      action,
      alert_number: number,
      ghsa_id: ghsa ?? null,
      severity:
        typeof advisory.severity === 'string' ? advisory.severity : null,
      package:
        typeof pkg.name === 'string'
          ? {
              name: pkg.name,
              ecosystem:
                typeof pkg.ecosystem === 'string' ? pkg.ecosystem : null,
            }
          : null,
      html_url: typeof alert.html_url === 'string' ? alert.html_url : null,
    },
  };
}

/**
 * Build the GitHub repository_dispatch body for a Dependabot alert wake.
 * @param {Record<string, unknown>} clientPayload
 */
export function dependabotAlertDispatchBody(clientPayload) {
  return {
    event_type: DEPENDABOT_ALERT_DISPATCH_TYPE,
    client_payload: clientPayload,
  };
}
