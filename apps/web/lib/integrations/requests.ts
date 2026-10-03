import 'server-only';

import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { feedbackItems } from '@/lib/db/schema/feedback';
import {
  buildIntegrationFromSignal,
  type IntegrationSignal,
  integrationSignalSchema,
} from './builder';

export const INTEGRATION_REQUEST_SOURCE = 'integration-builder';

/** Stable tenant/capability key. The existing primary key enforces cross-instance dedupe. */
export function integrationRequestId(
  userId: string,
  providerId: string,
  capability: string,
  useCase: string
): string {
  const bytes = createHash('sha256')
    .update(
      JSON.stringify([
        userId,
        providerId,
        capability,
        useCase.trim().toLowerCase(),
      ])
    )
    .digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Called by authenticated demand producers; persisted drafts remain visible in admin feedback. */
export async function submitIntegrationSignal(
  userId: string,
  signal: IntegrationSignal
) {
  const normalizedSignal = integrationSignalSchema.parse(signal);
  const build = buildIntegrationFromSignal(normalizedSignal);
  if (build.kind === 'existing') return build;
  const id = integrationRequestId(
    userId,
    build.integrationId,
    build.manifest.requestedCapability,
    normalizedSignal.useCase
  );
  const rows = await db
    .insert(feedbackItems)
    .values({
      id,
      userId,
      source: INTEGRATION_REQUEST_SOURCE,
      message: `${build.manifest.name}: ${build.manifest.requestedCapability}`,
      context: {
        signal: normalizedSignal,
        build,
        timestampIso: new Date().toISOString(),
      },
      status: 'pending',
    })
    .onConflictDoNothing({ target: feedbackItems.id })
    .returning({ id: feedbackItems.id });
  return { kind: 'draft' as const, id, duplicate: rows.length === 0, build };
}
