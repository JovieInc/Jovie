import { z } from 'zod';

export const TOOL_ROUTE_RECEIPT_SCHEMA = 'jovie.tool-route-receipt/v1';
export const toolTransportSchema = z.enum([
  'builtin',
  'cli',
  'direct_http',
  'internal',
  'mcp',
  'rest',
  'shell',
]);

// Metadata only. Never accept URLs, command arguments, payloads or headers.
const identifier = z.string().regex(/^[a-z][a-z0-9_.-]{0,95}$/);
const reference = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const toolRoutePolicySchema = z
  .object({
    mode: z.enum(['controlled_benchmark', 'observe', 'policy_bound']),
    allowedTransports: z.array(toolTransportSchema).max(7),
    allowedTools: z.array(identifier).max(128),
    requireRouteAttestation: z.boolean(),
  })
  .strict();
export type ToolRoutePolicy = z.infer<typeof toolRoutePolicySchema>;

export const OBSERVE_TOOL_ROUTE_POLICY: ToolRoutePolicy = {
  mode: 'observe',
  allowedTransports: [],
  allowedTools: [],
  requireRouteAttestation: false,
};

export const toolRouteEventSchema = z
  .object({
    boundary: z.enum(['adapter', 'sandbox', 'subprocess']),
    transport: toolTransportSchema,
    toolId: identifier,
    executable: z.enum(['claude', 'codex', 'ruflo', 'unrecognized']).nullable(),
    destinationHost: z
      .string()
      .regex(/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/)
      .nullable(),
    credentialClass: z.enum(['inherited', 'none', 'scoped', 'unknown']),
  })
  .strict();
export type ToolRouteEvent = z.infer<typeof toolRouteEventSchema>;

const routeEvidenceSchema = z
  .object({
    schema: z.literal(TOOL_ROUTE_RECEIPT_SCHEMA),
    runRef: reference,
    workflowId: identifier,
    requestedRuntime: identifier,
    actualRuntime: identifier.nullable(),
    requestedTransport: toolTransportSchema.nullable(),
    policy: toolRoutePolicySchema,
    catalogVersion: identifier,
    schemaPayloadBytes: z.number().int().nonnegative(),
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime(),
    status: z.enum([
      'blocked',
      'dry_run',
      'failed',
      'in_progress',
      'succeeded',
    ]),
    idempotencyKeyRef: reference.nullable(),
    verifierReceiptRef: reference.nullable(),
    // Complete means all routes were observed by the host, not by the model.
    observationComplete: z.boolean(),
    isolation: z.enum(['capability', 'none']),
    events: z.array(toolRouteEventSchema).max(128),
  })
  .strict();

function decision(evidence: z.infer<typeof routeEvidenceSchema>) {
  const transports = new Set(evidence.events.map(event => event.transport));
  const mixedRoute = transports.size > 1;
  const unknownRoute =
    !evidence.observationComplete ||
    evidence.events.length === 0 ||
    evidence.actualRuntime === null ||
    evidence.actualRuntime === 'unknown';
  const controlled = evidence.policy.mode !== 'observe';
  const runtimeMismatch =
    evidence.requestedRuntime !== 'unknown' &&
    evidence.actualRuntime !== null &&
    evidence.actualRuntime !== 'unknown' &&
    evidence.actualRuntime !== evidence.requestedRuntime;
  const bypassDetected =
    runtimeMismatch ||
    evidence.events.some(
      event =>
        (evidence.requestedTransport !== null &&
          event.transport !== evidence.requestedTransport) ||
        ((controlled || evidence.policy.allowedTransports.length > 0) &&
          !evidence.policy.allowedTransports.includes(event.transport)) ||
        ((controlled || evidence.policy.allowedTools.length > 0) &&
          !evidence.policy.allowedTools.includes(event.toolId))
    );
  const denied =
    controlled &&
    (unknownRoute ||
      bypassDetected ||
      mixedRoute ||
      evidence.isolation !== 'capability');
  return {
    mixedRoute,
    unknownRoute,
    bypassDetected,
    policyDecision: controlled
      ? denied
        ? ('deny' as const)
        : ('allow' as const)
      : ('report_only' as const),
    benchmarkEligible:
      evidence.policy.mode === 'controlled_benchmark' &&
      !denied &&
      evidence.status === 'succeeded' &&
      evidence.verifierReceiptRef !== null,
  };
}

export const toolRouteReceiptSchema = routeEvidenceSchema
  .extend({
    mixedRoute: z.boolean(),
    unknownRoute: z.boolean(),
    bypassDetected: z.boolean(),
    policyDecision: z.enum(['allow', 'deny', 'report_only']),
    benchmarkEligible: z.boolean(),
  })
  .superRefine((receipt, context) => {
    const derived = decision(receipt);
    for (const key of Object.keys(derived) as (keyof typeof derived)[]) {
      if (receipt[key] !== derived[key]) {
        context.addIssue({
          code: 'custom',
          path: [key],
          message: 'Invalid route decision',
        });
      }
    }
    if (receipt.completedAt < receipt.startedAt) {
      context.addIssue({
        code: 'custom',
        path: ['completedAt'],
        message: 'Completion predates start',
      });
    }
  });
export type ToolRouteReceipt = z.infer<typeof toolRouteReceiptSchema>;

/** Call only with host-observed metadata; persist inside the existing receipt/log. */
export function createToolRouteReceipt(
  input: z.input<typeof routeEvidenceSchema>
): ToolRouteReceipt {
  const evidence = routeEvidenceSchema.parse(input);
  return toolRouteReceiptSchema.parse({ ...evidence, ...decision(evidence) });
}

/** Revalidate derived decisions rather than trusting a producer's score flag. */
export function isBenchmarkRouteEligible(input: unknown): boolean {
  const parsed = toolRouteReceiptSchema.safeParse(input);
  return parsed.success && parsed.data.benchmarkEligible;
}

export function finishToolRouteReceipt(
  receipt: ToolRouteReceipt,
  status: ToolRouteReceipt['status'],
  completedAt: string
): ToolRouteReceipt {
  const {
    mixedRoute: _mixed,
    unknownRoute: _unknown,
    bypassDetected: _bypass,
    policyDecision: _decision,
    benchmarkEligible: _eligible,
    ...evidence
  } = receipt;
  return createToolRouteReceipt({ ...evidence, status, completedAt });
}
