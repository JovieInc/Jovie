import { z } from 'zod';
import { findIntegration } from './catalog';

export const integrationSignalSchema = z
  .object({
    provider: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9 _.-]*$/),
    capability: z
      .string()
      .trim()
      .min(3)
      .max(64)
      .regex(/^[a-z][a-z0-9_]*$/),
    useCase: z.string().trim().min(10).max(1000),
  })
  .strict();

export type IntegrationSignal = z.infer<typeof integrationSignalSchema>;

export const INTEGRATION_BUILD_GATES = [
  'Verify first-party API documentation, licensing, and provider terms.',
  'Reuse an existing provider adapter or maintained substrate before writing a new transport.',
  'Define least-privilege authorization and use the shared token vault for user credentials.',
  'Implement tenant isolation, bounded retries, rate limits, idempotency, disconnect, and revoked-token recovery.',
  'Exercise changed behavior and failure paths with the repository test runner and coverage.',
  'Register implemented capabilities in the domain registry; verify directory and settings parity.',
  'Run provider-backed connection, sync, and disconnect checks before claiming runtime availability.',
] as const;

/** Demand can generate a build draft. It cannot authorize a provider or mark code available. */
export function buildIntegrationFromSignal(input: unknown) {
  const signal = integrationSignalSchema.parse(input);
  const existing = findIntegration(signal.provider);
  const providerId =
    existing?.id ?? signal.provider.toLowerCase().replaceAll(/[ .-]+/g, '_');
  if (
    existing?.capabilities.some(capability => capability === signal.capability)
  ) {
    return {
      kind: 'existing' as const,
      integrationId: existing.id,
      setup: existing.setup,
    };
  }
  const manifest = {
    schemaVersion: 1,
    id: providerId,
    name: existing?.name ?? signal.provider,
    status: 'draft' as const,
    requestedCapability: signal.capability,
    enabledCapabilities: [] as string[],
    authorization: 'unconfigured' as const,
  };
  // JSON serialization keeps signal text as data, never executable source or instructions.
  const files = {
    'manifest.json': `${JSON.stringify(manifest, null, 2)}\n`,
    'signal.json': `${JSON.stringify(signal, null, 2)}\n`,
    'adapter.ts': [
      '/** Replace this fail-closed adapter after completing the integration build gates. */',
      'export async function execute(_input: unknown): Promise<never> {',
      "  throw new Error('Integration is not configured');",
      '}',
      '',
    ].join('\n'),
  };
  return {
    kind: 'build' as const,
    integrationId: providerId,
    mode: existing ? ('extend' as const) : ('compose' as const),
    manifest,
    files,
    gates: INTEGRATION_BUILD_GATES,
  };
}
