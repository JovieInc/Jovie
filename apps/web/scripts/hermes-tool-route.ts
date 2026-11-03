import { createHash } from 'node:crypto';
import {
  createToolRouteReceipt,
  OBSERVE_TOOL_ROUTE_POLICY,
  type ToolRouteEvent,
  toolRoutePolicySchema,
} from '@jovie/action-contracts';
import type { HermesCliRuntime } from '../types/ai-ops';
import type { RuntimeCommand, WorkerRunOptions } from './hermes-cli-worker';

export const RUNTIME_EXECUTABLE = {
  'claude-code': 'claude',
  'codex-cli': 'codex',
  ruflo: 'ruflo',
} as const satisfies Record<HermesCliRuntime, string>;

/** The job log is the run receipt store. CLI children remain opaque. */
export async function runHermesWorkerWithRouteReceipt(
  options: WorkerRunOptions,
  run: (
    options: WorkerRunOptions,
    onSpawn: (command: RuntimeCommand) => void
  ) => Promise<number>
): Promise<number> {
  const { payload } = options;
  const policy = toolRoutePolicySchema.parse(
    payload.routePolicy ?? OBSERVE_TOOL_ROUTE_POLICY
  );
  const startedAt = new Date().toISOString();
  const reference = (value: string) =>
    `sha256:${createHash('sha256').update(value).digest('hex')}`;
  const events: ToolRouteEvent[] = [];
  let actualRuntime: string | null = null;
  let status = 78;
  const dryRun = options.dryRun === true || payload.dryRun;
  try {
    // No supported CLI boundary currently attests child tools, credentials,
    // configuration and egress. Never launch one for a controlled policy.
    if (policy.mode !== 'observe') return status;
    status = await run(options, command => {
      const recognized =
        !options.runtimeCommand &&
        command.executable === RUNTIME_EXECUTABLE[payload.runtime];
      actualRuntime = recognized ? payload.runtime : 'unknown';
      events.push({
        boundary: 'subprocess',
        transport: 'cli',
        toolId: 'hermes.worker',
        executable: recognized
          ? RUNTIME_EXECUTABLE[payload.runtime]
          : 'unrecognized',
        destinationHost: null,
        credentialClass: 'inherited',
      });
    });
    return status;
  } finally {
    console.log(
      JSON.stringify({
        routeReceipt: createToolRouteReceipt({
          schema: 'jovie.tool-route-receipt/v1',
          runRef: reference(payload.dispatchId),
          workflowId: 'hermes.worker',
          requestedRuntime: payload.runtime,
          actualRuntime,
          requestedTransport:
            policy.allowedTransports.length === 1
              ? policy.allowedTransports[0]
              : null,
          policy,
          catalogVersion: 'hermes-cli-worker.v1',
          schemaPayloadBytes: Buffer.byteLength(
            JSON.stringify(toolRoutePolicySchema.toJSONSchema())
          ),
          startedAt,
          completedAt: new Date().toISOString(),
          status:
            policy.mode !== 'observe'
              ? 'blocked'
              : dryRun
                ? 'dry_run'
                : status === 0
                  ? 'succeeded'
                  : 'failed',
          idempotencyKeyRef: null,
          // The verifier runs after this worker; no verifier receipt exists yet.
          verifierReceiptRef: null,
          observationComplete: false,
          isolation: 'none',
          events,
        }),
      })
    );
  }
}
