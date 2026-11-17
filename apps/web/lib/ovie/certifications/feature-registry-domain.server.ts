import 'server-only';

import type { FounderReviewItem } from '@/lib/admin/founder-review-registry';
import type { CertificationRecordBackend } from '@/lib/agent-os/certification-cas';
import type {
  CertificationDomainProjection,
  FeatureRegistryCertificationSource,
  OvieCertificationInventoryDeps,
} from './inventory.server';
import {
  type PacketDecisionLedgerRead,
  type PacketDecisionLedgerReads,
  readPacketDecisionLedger,
} from './packet-decisions';
import type { CertificationPacketFile } from './packet-files.server';
import {
  OVIE_CERTIFICATION_DOMAIN_LABELS,
  type OvieCertificationDomainId,
} from './types';

const FEATURE_REGISTRY_SURFACE_LABELS = {
  behavior: 'Atomic Behavior',
  capability: 'Feature Capability',
  component: 'Registry Component',
} as const;

export function featureRegistryPacketFile(
  item: FounderReviewItem,
  sourceUpdatedAt: string
): CertificationPacketFile {
  return {
    domain: 'feature_registry',
    surface: FEATURE_REGISTRY_SURFACE_LABELS[item.scope],
    packetUpdatedAt: sourceUpdatedAt,
    links: [],
    packet: item.certificationPacket,
    file: item.source,
  };
}

/** One domain, one key. A read or parse failure fails only this domain closed. */
async function featureRegistryLedgerReads(
  backend: CertificationRecordBackend,
  domain: OvieCertificationDomainId
): Promise<PacketDecisionLedgerReads> {
  const rows: Array<[OvieCertificationDomainId, PacketDecisionLedgerRead]> = [];
  try {
    rows.push([
      domain,
      { ok: true, ledger: await readPacketDecisionLedger(backend, domain) },
    ]);
  } catch {
    rows.push([domain, { ok: false }]);
  }
  return new Map(rows);
}

type PacketDomainProjection = (
  domain: OvieCertificationDomainId,
  files: readonly CertificationPacketFile[],
  deps: OvieCertificationInventoryDeps,
  evaluatedAt: string,
  ledgerReads: Promise<PacketDecisionLedgerReads>
) => Promise<CertificationDomainProjection>;

/**
 * The Feature Registry projects the same kernel admission and decision ledger
 * as packet-file domains; only the packet source differs (the committed
 * FEATURE_REGISTRY.md instead of worker packet files). Its ledger is one key,
 * read on its own so the nine packet-domain batch stays one round trip.
 */
export async function featureRegistryDomain(
  deps: OvieCertificationInventoryDeps,
  evaluatedAt: string,
  projectPacketDomain: PacketDomainProjection
): Promise<CertificationDomainProjection> {
  const domain = 'feature_registry' as const;
  let source: Awaited<ReturnType<FeatureRegistryCertificationSource['list']>>;
  try {
    source = await deps.featureRegistry.list();
  } catch {
    return {
      rows: [],
      deliveries: [],
      summary: {
        domain,
        label: OVIE_CERTIFICATION_DOMAIN_LABELS[domain],
        status: 'error',
        rowCount: 0,
        note: 'The feature registry source could not be read.',
      },
      issues: [
        {
          domain,
          source: 'feature_registry',
          message: 'Feature registry read failed.',
        },
      ],
    };
  }
  return projectPacketDomain(
    domain,
    source.items.map(item =>
      featureRegistryPacketFile(item, source.sourceUpdatedAt)
    ),
    deps,
    evaluatedAt,
    featureRegistryLedgerReads(deps.backend(), domain)
  );
}
