import { MARKETING_COMPONENT_REGISTRY } from '@/data/marketing/componentRegistry';
import { MarketingCertificationStore } from '@/lib/agent-os/certification-adapter';
import {
  FIXTURE_NOW,
  fixturePacket,
  memoryCertificationBackend,
} from './fixtures';
import type { OvieCertificationInventoryDeps } from './inventory.server';
import type { CertificationPacketFile } from './packet-files.server';

export function packetFile(
  subjectId: string,
  overrides: Partial<CertificationPacketFile> = {}
): CertificationPacketFile {
  return {
    domain: 'flows',
    surface: 'Golden Path',
    packetUpdatedAt: '2026-09-27T07:00:00.000Z',
    links: [{ label: 'Run', href: 'https://ci.test/1', kind: 'test_run' }],
    packet: fixturePacket(subjectId),
    file: `docs/certification/${subjectId}.packet.json`,
    ...overrides,
  };
}

export function deps(
  files: readonly CertificationPacketFile[],
  backend = memoryCertificationBackend()
): OvieCertificationInventoryDeps & {
  readonly backendInstance: ReturnType<typeof memoryCertificationBackend>;
} {
  const marketingBackend = memoryCertificationBackend();
  return {
    backendInstance: backend,
    backend: () => backend,
    marketingStore: () =>
      new MarketingCertificationStore(
        marketingBackend,
        MARKETING_COMPONENT_REGISTRY
      ),
    readPacketFiles: async () => ({
      root: '/repo/docs/certification',
      files,
      issues: [
        {
          domain: null,
          source: 'docs/certification/bad.packet.json',
          message: 'Invalid JSON.',
        },
      ],
    }),
    featureRegistry: {
      list: async () => ({
        items: [],
        sourceUpdatedAt: FIXTURE_NOW,
      }),
    },
  };
}
