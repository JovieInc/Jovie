import 'server-only';

import { MARKETING_COMPONENT_REGISTRY } from '@/data/marketing/componentRegistry';
import type { CertificationReviewPacket } from '@/lib/agent-os/certification';
import {
  MarketingCertificationStore,
  type MarketingReviewReadyProjection,
} from '@/lib/agent-os/certification-adapter';
import { postgresRecordBackend } from '@/lib/ovie/mcp/postgres-backend';

let runtimeStore: MarketingCertificationStore | null = null;

export function getMarketingCertificationStore(): MarketingCertificationStore {
  runtimeStore ??= new MarketingCertificationStore(
    postgresRecordBackend(),
    MARKETING_COMPONENT_REGISTRY
  );
  return runtimeStore;
}

export async function ingestMarketingCertificationPacket(
  packet: CertificationReviewPacket,
  evaluatedAt?: string
) {
  return getMarketingCertificationStore().ingestPacket(packet, evaluatedAt);
}

export async function projectMarketingReviewReady(input: {
  readonly existingEntryId: string | null;
  readonly evaluatedAt?: string;
}): Promise<MarketingReviewReadyProjection> {
  return getMarketingCertificationStore().projectReviewReady(input);
}

export async function recordMarketingFounderDecision(
  input: Parameters<MarketingCertificationStore['recordFounderDecision']>[0]
) {
  return getMarketingCertificationStore().recordFounderDecision(input);
}
