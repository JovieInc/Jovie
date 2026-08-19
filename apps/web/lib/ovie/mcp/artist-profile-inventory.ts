import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CertLevel } from './types';

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
  ];
  if (must.some(item => feature.includes(item))) return 'must-sell';
  if (feature.includes('Verified') || feature.includes('Wallet'))
    return 'later';
  return 'supporting';
}

function slug(feature: string): string {
  return feature
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function parseProfileCapabilitiesFromRegistry(
  markdown: string
): ProfileCapability[] {
  const rows: ProfileCapability[] = [];
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('| Profile |')) continue;
    const cells = line.split('|').map(cell => cell.trim());
    if (cells.length < 7) continue;
    const feature = cells[2];
    const status = cells[3];
    const access = cells[4];
    const flag = cells[5];
    const notes = cells[6];
    rows.push({
      id: slug(feature),
      feature,
      registryStatus: status,
      access,
      flag,
      notes,
      certLevel: certFromStatus(status),
      launchRelevance: launchRelevance(feature),
      gap:
        certFromStatus(status) === 'certified'
          ? 'none'
          : 'Shipped is not certified. No outcome-level production dogfood mission is recorded.',
      proposedMission: `A real visitor opening /{username} sees ${feature} behave as a fan would expect; false positives are absent.`,
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
    'Derived from `docs/FEATURE_REGISTRY.md` Profile rows. Shipped ≠ certified.',
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
