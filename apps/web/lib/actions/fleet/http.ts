import {
  FLEET_ACTION_IDS,
  type FleetActionId,
  workerIdSchema,
} from '@jovie/action-contracts';
import { z } from 'zod';
import type { FleetDispatcher } from './dispatcher';

const NO_STORE = { 'Cache-Control': 'no-store' };
const controlSchema = z
  .object({
    profileId: z.uuid(),
    operation: z.enum([
      'provision',
      'rotate',
      'delegate',
      'undelegate',
      'revoke',
      'assign',
      'accept',
      'reject',
    ]),
    input: z.unknown(),
    approvalId: z.uuid().optional(),
  })
  .strict();
export interface FleetHttpDependencies {
  dispatcher: FleetDispatcher;
  /** Existing founder session + owned profile check; worker bearers forbidden. */
  founder: (request: Request, profileId: string) => Promise<string | null>;
  /** Verify canonical issue, owner and existing work before admission. */
  validateMission?: (input: unknown) => Promise<boolean>;
  /** Exact configured founder, independent of general admin privileges. */
  summerFounder?: (actor: string) => boolean;
  /** Post-commit, durable outbox wake only; its failure cannot undo a receipt. */
  scheduleSummerWake?: (profileId: string) => void;
}
function scheduleWake(deps: FleetHttpDependencies, profileId: string) {
  try {
    deps.scheduleSummerWake?.(profileId);
  } catch {
    /* Durable outbox remains pending for the independent recovery path. */
  }
}
function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: NO_STORE });
}
export async function readFleetHttpBody(request: Request): Promise<unknown> {
  // Bounded payload, independent of an untrusted Content-Length header.
  const reader = request.body?.getReader();
  if (!reader) throw new Error('missing_body');
  const chunks: Uint8Array[] = [];
  let size = 0;
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(5000)]);
  let rejectAbort: (error: Error) => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const cancel = () => {
    rejectAbort(new Error('body_canceled'));
    void reader.cancel().catch(() => {});
  };
  if (signal.aborted) {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
    throw new Error('body_canceled');
  }
  signal.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      const part = await Promise.race([reader.read(), aborted]);
      if (signal.aborted) throw new Error('body_canceled');
      if (part.done) break;
      size += part.value.length;
      if (size > 32_768) {
        void reader.cancel().catch(() => {});
        throw new Error('body_too_large');
      }
      chunks.push(part.value);
    }
    return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}
export async function handleFleetInvocation(
  request: Request,
  id: string,
  deps: FleetHttpDependencies
): Promise<Response> {
  if (!(FLEET_ACTION_IDS as readonly string[]).includes(id))
    return response({ error: { code: 'FEATURE_DISABLED' } }, 404);
  try {
    const bearer = request.headers.get('authorization');
    const token = bearer?.match(/^Bearer (\S+)$/)?.[1];
    const result = await deps.dispatcher.invoke(
      id as FleetActionId,
      await readFleetHttpBody(request),
      token
    );
    if (
      result.status === 'completed' &&
      ['work.request', 'work.report', 'fleet.register'].includes(id)
    ) {
      const profileId = token?.split('.')[1];
      if (profileId) scheduleWake(deps, profileId);
    }
    // Canonical action status/code is preserved, including on denial.
    const code = 'error' in result ? result.error.code : undefined;
    const status =
      code === 'AUTH_REQUIRED'
        ? 401
        : code === 'FORBIDDEN'
          ? 403
          : code === 'VALIDATION_FAILED'
            ? 400
            : code === 'FEATURE_DISABLED'
              ? 503
              : 200;
    return response(result, status);
  } catch {
    return response(
      { error: { code: 'VALIDATION_FAILED', retryable: false } },
      400
    );
  }
}
export async function handleFleetControl(
  request: Request,
  kind: 'approve' | 'execute' | 'status',
  deps: FleetHttpDependencies
): Promise<Response> {
  try {
    if (request.headers.has('authorization'))
      return response({ error: { code: 'FORBIDDEN' } }, 403);
    if (request.headers.get('origin') !== new URL(request.url).origin)
      return response({ error: { code: 'FORBIDDEN' } }, 403);
    const raw = await readFleetHttpBody(request);
    const parsed =
      kind === 'status'
        ? z
            .object({
              profileId: z.uuid(),
              history: z
                .object({
                  workerId: workerIdSchema,
                  after: z
                    .number()
                    .int()
                    .min(0)
                    .max(Number.MAX_SAFE_INTEGER)
                    .optional(),
                  limit: z.number().int().min(1).max(100).optional(),
                })
                .strict()
                .optional(),
            })
            .strict()
            .parse(raw)
        : controlSchema.parse(raw);
    const actor = await deps.founder(request, parsed.profileId);
    if (!actor) return response({ error: { code: 'FORBIDDEN' } }, 403);
    if (kind === 'status')
      return response(
        await deps.dispatcher.inspect(
          parsed.profileId,
          'history' in parsed ? parsed.history : undefined
        )
      );
    const command = controlSchema.parse(parsed);
    if (
      ['delegate', 'undelegate'].includes(command.operation) &&
      deps.summerFounder?.(actor) !== true
    )
      return response({ error: { code: 'FORBIDDEN' } }, 403);
    if (
      (command.operation === 'assign' || command.operation === 'accept') &&
      (!deps.validateMission ||
        !(await deps.validateMission(
          command.operation === 'accept'
            ? await deps.dispatcher.requestMission(
                command.profileId,
                command.input
              )
            : command.input
        )))
    )
      return response({ error: { code: 'CONFLICT' } }, 409);
    if (kind === 'approve')
      return response({
        approvalId: await deps.dispatcher.approve(
          command.profileId,
          actor,
          command.operation,
          command.input
        ),
      });
    if (!command.approvalId)
      return response({ error: { code: 'CONFIRMATION_REQUIRED' } }, 403);
    const result = await deps.dispatcher.control(
      command.profileId,
      actor,
      command.approvalId,
      command.operation,
      command.input
    );
    if (command.operation === 'delegate') scheduleWake(deps, command.profileId);
    return response(result);
  } catch {
    return response(
      { error: { code: 'CONTROL_DENIED', retryable: false } },
      403
    );
  }
}
