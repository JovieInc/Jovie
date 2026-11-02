import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AGENT_DRAFT_TOOLS } from '@/lib/agent-acquisition/api';
import {
  buildDistribution,
  type DistributionTool,
  LIMITS,
  REGENERATE_COMMAND,
} from './generate';
import { hashTools } from './hash';
import { loadIconSource } from './icons';
import { LISTING } from './listing';
import { readReadinessInputs } from './readiness-io';

const GENERATED = join(__dirname, 'generated');
const ASSETS = join(__dirname, '../../plugins/jovie-artists/assets');
const assets = Object.fromEntries(
  ['icon.svg', 'icon-dark.svg', 'logo.svg', 'logo-dark.svg'].map(name => [
    name,
    readFileSync(join(ASSETS, name), 'utf8'),
  ])
);
const tools = AGENT_DRAFT_TOOLS as unknown as readonly DistributionTool[];

describe('agent distribution packages', () => {
  it('matches the committed generated files byte for byte', async () => {
    const { files } = buildDistribution(
      tools,
      LISTING,
      assets,
      await readReadinessInputs(join(__dirname, '../..')),
      (await loadIconSource(join(__dirname, '../../../..')))?.info ?? null
    );
    const drift = Object.entries(files)
      .filter(([path, content]) => {
        const file = join(GENERATED, path);
        return !existsSync(file) || readFileSync(file, 'utf8') !== content;
      })
      .map(([path]) => path);
    expect(
      drift,
      `Generated files drifted. Run: ${REGENERATE_COMMAND}`
    ).toEqual([]);
  });

  it('has no hard validation errors', () => {
    expect(buildDistribution(tools, LISTING, assets).issues.errors).toEqual([]);
  });

  it('pins the tools/list hash of the live registry', () => {
    const snapshot = JSON.parse(
      readFileSync(join(GENERATED, 'tools-list.snapshot.json'), 'utf8')
    );
    expect(snapshot.toolsListHash).toBe(hashTools(tools));
  });

  it('keeps ChatGPT and Claude listing limits', () => {
    expect(LISTING.name.length).toBeLessThanOrEqual(LIMITS.chatgpt.displayName);
    expect(LISTING.chatgptShort.length).toBeLessThanOrEqual(
      LIMITS.chatgpt.shortDescription
    );
    expect(LISTING.oneLiner.length).toBeLessThanOrEqual(LIMITS.claude.oneLiner);
  });

  it('reports missing titles and hints without crashing', () => {
    const bare = [{ name: 'x.y', description: 'd', inputSchema: {} }];
    const { issues } = buildDistribution(bare, {
      ...LISTING,
      positiveTests: [],
      negativeTests: [],
    });
    expect(issues.blockers.some(b => b.includes('no title'))).toBe(true);
    expect(issues.errors.some(e => e.includes('readOnlyHint'))).toBe(true);
  });

  it('rejects banned words and over-limit copy', () => {
    const { issues } = buildDistribution(tools, {
      ...LISTING,
      oneLiner: `Help every fan. ${'x'.repeat(200)}`,
    });
    expect(issues.errors.some(e => e.includes('banned word'))).toBe(true);
    expect(issues.errors.some(e => e.includes('limit 200'))).toBe(true);
  });
});
