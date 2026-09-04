import { projectSummerCommercial } from './summer-commercial-projection';
import {
  type ShadowRecord,
  type SummerShadowIngressDependencies,
  summerShadowEventSchema,
  summerShadowKey,
} from './summer-shadow-ingress';

export function createSummerCommercialReadback(dependencies: {
  authenticate: SummerShadowIngressDependencies['authenticate'];
  read: (path: string) => Promise<ShadowRecord | null>;
  now?: () => Date;
}) {
  return async (request: Request, eventId: string): Promise<Response> => {
    const auth = await dependencies.authenticate(request);
    if (auth instanceof Response) return auth;
    const respond = (status: number, body: ShadowRecord) =>
      Response.json(body, {
        status,
        headers: { 'cache-control': 'no-store' },
      });
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/u.test(eventId)) {
      return respond(400, { code: 'invalid_event_id' });
    }
    try {
      const key = summerShadowKey(eventId);
      const receipt = await dependencies.read(
        `summer-shadow/receipts/${key}.json`
      );
      if (!receipt)
        return respond(404, { code: 'commercial_receipt_not_found' });
      const event = summerShadowEventSchema.parse(receipt.event);
      if (event.eventId !== eventId || !event.commercialSnapshot) {
        return respond(404, { code: 'commercial_receipt_not_found' });
      }
      const historical = projectSummerCommercial(
        event.commercialSnapshot,
        new Date(String(receipt.acceptedAt))
      );
      if (
        JSON.stringify(historical) !==
        JSON.stringify(receipt.commercialProjection)
      ) {
        return respond(503, { code: 'commercial_receipt_integrity_failed' });
      }
      const terminal = await dependencies.read(
        `summer-shadow/terminal/${key}.json`
      );
      const accepted =
        terminal?.commercialEvidenceDigest === historical.evidenceDigest &&
        terminal?.eventId === eventId &&
        terminal?.verdict === 'eve_session_accepted' &&
        terminal?.schema === 'jovie.eve.summer-shadow.terminal/v1' &&
        terminal?.receiptPath === `summer-shadow/receipts/${key}.json` &&
        typeof terminal?.sessionId === 'string' &&
        terminal.sessionId.startsWith('ses_') &&
        JSON.stringify(terminal?.authority) ===
          JSON.stringify({
            mode: 'shadow',
            dispatchAuthority: 'none',
            allowedMutations: [],
          });
      return respond(200, {
        eventId,
        receipt,
        terminal,
        consumption: accepted
          ? 'eve_session_accepted; model_decision_unverified'
          : 'UNKNOWN',
        currentProjection: projectSummerCommercial(
          event.commercialSnapshot,
          dependencies.now?.() ?? new Date()
        ),
        authority: { dispatchAuthority: 'none', allowedMutations: [] },
      });
    } catch {
      return respond(503, { code: 'commercial_readback_unavailable' });
    }
  };
}
