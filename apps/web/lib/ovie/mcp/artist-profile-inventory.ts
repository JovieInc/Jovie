import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CertificationPass, CertLevel } from './types';

export type ProfileCapability = {
  readonly id: string;
  readonly feature: string;
  readonly registryStatus: string;
  readonly access: string;
  readonly flag: string;
  readonly notes: string;
  readonly certLevel: CertLevel;
  readonly launchRelevance: 'must-sell' | 'supporting' | 'later';
  readonly gap: string;
  readonly proposedMission: string;
};

function certFromStatus(status: string): CertLevel {
  if (status.startsWith('Planned')) return 'discovered';
  if (status.includes('In rollout')) return 'production-dogfooded';
  if (status.includes('internal')) return 'verified';
  if (status.startsWith('Shipped')) return 'implemented';
  return 'discovered';
}

function launchRelevance(
  feature: string
): ProfileCapability['launchRelevance'] {
  const must = [
    'Public profile pages',
    'Artist bio',
    'Latest release card',
    'Subscribe',
    'Auto-sync from Spotify',
  ];
  if (must.some(item => feature.includes(item))) return 'must-sell';
  if (feature.includes('Verified') || feature.includes('Wallet'))
    return 'later';
  return 'supporting';
}

function proposedMission(feature: string): string {
  if (feature.includes('Auto-sync') || feature.includes('Latest release')) {
    return "Given Tim's canonical artist identity, sync all DSPs and verify every release belonging to Tim appears and anything else does not.";
  }
  if (feature.includes('merch') || feature.includes('Merch')) {
    return "A real artist with real catalog can stand up merch they'd actually sell; invoke, success signal, and rollback if the store is not live.";
  }
  if (feature.includes('bio') || feature.includes('social')) {
    return "A visitor opening /{username} sees only that artist's real bio and socials; impostor or same-name links are absent.";
  }
  if (feature.includes('Public profile')) {
    return 'A real visitor opening /tim sees identity, latest release, and links match the canonical artist graph.';
  }
  if (feature.includes('Subscribe')) {
    return 'A real visitor can subscribe from /{username} and the artist can later reach that list.';
  }
  return `A real visitor opening /{username} sees ${feature} behave as a fan would expect; false positives are absent.`;
}

export function certificationPasses(
  mission: string
): readonly CertificationPass[] {
  return [
    {
      n: 1,
      name: 'author',
      job: `Author an outcome-level certification from intent: ${mission}`,
    },
    {
      n: 2,
      name: 'adversary',
      job: 'A different agent must break the spec, not pass it. Ask which assumptions would make this fail, including tests of implementation instead of outcome.',
    },
    {
      n: 3,
      name: 'execute',
      job: 'Run the mission against real user data and record every failure. This MCP call does not execute live money paths.',
    },
    {
      n: 4,
      name: 'backfill',
      job: 'When a real user finds a bug, backfill it into the certification instead of only fixing code. Recertify this path, not the whole product.',
    },
  ];
}

function slug(feature: string): string {
  return feature
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const PROFILE_CERT_AREAS = new Set(['Profile']);
const PROFILE_CERT_FEATURES = [
  'Auto-sync from Spotify',
  'Chat-generated merch cards',
  'Auto DSP detection',
];

function isProfileCertRow(area: string, feature: string): boolean {
  if (PROFILE_CERT_AREAS.has(area)) return true;
  return PROFILE_CERT_FEATURES.some(item => feature.includes(item));
}

export function parseProfileCapabilitiesFromRegistry(
  markdown: string
): ProfileCapability[] {
  const rows: ProfileCapability[] = [];
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('| ')) continue;
    const cells = line.split('|').map(cell => cell.trim());
    if (cells.length < 7) continue;
    const area = cells[1];
    const feature = cells[2];
    if (area === 'Product area' || area === '---' || !feature) continue;
    if (!isProfileCertRow(area, feature)) continue;
    const status = cells[3];
    const access = cells[4];
    const flag = cells[5];
    const notes = cells[6];
    const level = certFromStatus(status);
    rows.push({
      id: slug(feature),
      feature,
      registryStatus: status,
      access,
      flag,
      notes,
      certLevel: level,
      launchRelevance: launchRelevance(feature),
      gap:
        level === 'certified'
          ? 'none'
          : 'Shipped is not certified. No outcome-level production dogfood mission is recorded.',
      proposedMission: proposedMission(feature),
    });
  }
  return rows;
}

export function loadProfileCapabilitiesFromDisk(): ProfileCapability[] {
  const candidates = [
    resolve(process.cwd(), 'docs/FEATURE_REGISTRY.md'),
    resolve(process.cwd(), '../../docs/FEATURE_REGISTRY.md'),
  ];
  for (const path of candidates) {
    try {
      return parseProfileCapabilitiesFromRegistry(readFileSync(path, 'utf8'));
    } catch {
      // try next
    }
  }
  return [];
}

export function renderArtistProfileInventory(
  capabilities: readonly ProfileCapability[]
): string {
  const order = [...capabilities].sort((a, b) => {
    const rank = { 'must-sell': 0, supporting: 1, later: 2 };
    return rank[a.launchRelevance] - rank[b.launchRelevance];
  });
  const lines = [
    '# Public Artist Profile inventory (read-only)',
    '',
    'Derived from `docs/FEATURE_REGISTRY.md` Profile rows plus discography/merch/DSP-link surfaces. Shipped ≠ certified.',
    '',
    '## Inventory',
    '',
    '| ID | Feature | Registry | Cert level | Launch | Gap |',
    '|---|---|---|---|---|---|',
  ];
  for (const cap of order) {
    lines.push(
      `| ${cap.id} | ${cap.feature} | ${cap.registryStatus} | ${cap.certLevel} | ${cap.launchRelevance} | ${cap.gap} |`
    );
  }
  lines.push(
    '',
    '## Dependencies',
    '',
    '- Public profile pages depend on identity, discography/latest-release, and routing.',
    '- Bio/social links depend on DSP discovery.',
    '- Subscribe/contact/about/tour are adjacent surfaces on the same public shell.',
    '',
    '## Recommended certification order',
    ''
  );
  for (const cap of order.filter(
    item => item.launchRelevance === 'must-sell'
  )) {
    lines.push(`1. **${cap.feature}** — ${cap.proposedMission}`);
  }
  return `${lines.join('\n')}\n`;
}

export function findProfileCapability(
  capabilities: readonly ProfileCapability[],
  query: string
): ProfileCapability | undefined {
  const needle = query.toLowerCase();
  return capabilities.find(
    cap => cap.id === needle || cap.feature.toLowerCase().includes(needle)
  );
}
