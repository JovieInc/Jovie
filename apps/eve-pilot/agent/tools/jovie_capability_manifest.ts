import { defineTool } from 'eve/tools';
import { z } from 'zod';

const requestedCapabilitySchema = z.enum([
  'artist_profile',
  'release',
  'connector',
  'revenue_attribution',
  'core_chat',
]);

const capabilityCatalog = {
  artist_profile: {
    mode: 'read_only',
    summary: 'Describe profile updates and their approval boundary.',
    approvalRequired: 'A confirmed profile owner action through Jovie.',
  },
  release: {
    mode: 'read_only',
    summary: 'Describe release context and its approval boundary.',
    approvalRequired:
      'A confirmed artist or authorized-team action through Jovie.',
  },
  connector: {
    mode: 'read_only',
    summary: 'Describe a provider connection without authorizing it.',
    approvalRequired: 'Explicit per-provider OAuth and scope consent in Jovie.',
  },
  revenue_attribution: {
    mode: 'read_only',
    summary: 'Describe how attribution must be reconciled.',
    approvalRequired:
      'Verified provider and distributor data with a Jovie event chain.',
  },
  core_chat: {
    mode: 'read_only',
    summary: 'Acknowledge a canonical Jovie chat turn in shadow mode.',
    approvalRequired: 'No action is available from the Eve shadow observer.',
  },
} as const;

export function capabilityManifest(
  capability: z.infer<typeof requestedCapabilitySchema>
) {
  return {
    capability,
    ...capabilityCatalog[capability],
    pilot: true,
    externalAccess: false,
    writePerformed: false,
  };
}

export default defineTool({
  description:
    'Return the pilot-safe, read-only contract for one Jovie capability. This tool never accesses user data or performs a write.',
  inputSchema: z.object({
    capability: requestedCapabilitySchema,
  }),
  async execute({ capability }) {
    return capabilityManifest(capability);
  },
});
