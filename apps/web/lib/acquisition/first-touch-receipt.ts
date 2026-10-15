import type { AcquisitionFirstTouch } from '@/lib/db/schema/acquisition';
import type { FirstTouchEnvelope } from './first-touch-envelope';

export function toReceiptFirstTouch(
  envelope: FirstTouchEnvelope | null
): AcquisitionFirstTouch {
  if (!envelope) return { channel: 'unknown', source: 'unknown' };
  const utm = envelope.utm ?? {};
  return {
    channel: envelope.channel,
    source:
      utm.utm_source ??
      (envelope.agentIntent
        ? 'agent-handoff'
        : envelope.ref
          ? 'referral'
          : 'direct'),
    medium: utm.utm_medium,
    campaign: utm.utm_campaign,
    term: utm.utm_term,
    content: utm.utm_content,
    referrer: envelope.ref,
    routeKind: envelope.route?.kind,
    landingPath: envelope.route?.slug ? `/${envelope.route.slug}` : undefined,
    ...(envelope.agentIntent ? { agentIntent: envelope.agentIntent } : {}),
  };
}
