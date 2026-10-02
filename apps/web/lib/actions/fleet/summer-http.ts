import { z } from 'zod';
import type { FleetDispatcher } from './dispatcher';
import { readFleetHttpBody } from './http';
import { FleetSummerError } from './summer';

const inputSchema = z.discriminatedUnion('operation', [
  z
    .object({
      operation: z.literal('process'),
      profileId: z.uuid(),
      eventId: z.uuid(),
    })
    .strict(),
  z.object({ operation: z.literal('reconcile') }).strict(),
]);
export interface SummerFleetHttpDependencies {
  authenticate(request: Request): Promise<boolean>;
  /** Server-derived exact founder-owned profiles; never a request-supplied owner. */
  profiles(): Promise<string[]>;
  dispatcher: Pick<
    FleetDispatcher,
    'pendingSummerEvents' | 'processSummerEvent'
  >;
  validateMission(mission: unknown): Promise<boolean>;
}
function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}
export async function handleSummerFleetEvents(
  request: Request,
  deps: SummerFleetHttpDependencies
): Promise<Response> {
  if (!(await deps.authenticate(request)))
    return json({ ok: false, code: 'unauthorized' }, 401);
  let input: z.infer<typeof inputSchema>;
  try {
    input = inputSchema.parse(await readFleetHttpBody(request));
  } catch {
    return json({ ok: false, code: 'invalid_event' }, 400);
  }
  try {
    const profiles = await deps.profiles();
    if (input.operation === 'process') {
      if (!profiles.includes(input.profileId))
        return json({ ok: false, code: 'forbidden' }, 403);
      const result = await deps.dispatcher.processSummerEvent(
        input.profileId,
        input.eventId,
        deps.validateMission
      );
      return json({ ok: true, result });
    }
    // Missed-event repair shares the exact processing path and has a hard batch
    // bound. No polling timer, arbitrary profiles or new work is introduced.
    const candidates = (
      await Promise.all(
        profiles.slice(0, 100).map(async profileId =>
          (
            await deps.dispatcher.pendingSummerEvents(profileId)
          ).map(event => ({
            profileId,
            event,
          }))
        )
      )
    )
      .flat()
      .sort(
        (a, b) =>
          (a.event.lastAttemptAt ?? '').localeCompare(
            b.event.lastAttemptAt ?? ''
          ) ||
          a.event.createdAt.localeCompare(b.event.createdAt) ||
          a.event.eventId.localeCompare(b.event.eventId)
      )
      .slice(0, 5);
    const results: unknown[] = [];
    for (const { profileId, event } of candidates) {
      try {
        results.push(
          await deps.dispatcher.processSummerEvent(
            profileId,
            event.eventId,
            deps.validateMission
          )
        );
      } catch {
        // The attempt is persisted before provider IO; one failed issue cannot
        // abort the batch or become its permanent first item on the next wake.
        results.push({ eventId: event.eventId, status: 'unavailable' });
      }
    }
    return json({ ok: true, results });
  } catch (error) {
    if (error instanceof FleetSummerError)
      return json(
        { ok: false, code: error.code },
        error.code === 'CONFLICT'
          ? 409
          : error.code === 'REQUIRES_INPUT'
            ? 404
            : 403
      );
    return json({ ok: false, code: 'fleet_unavailable' }, 503);
  }
}
