/**
 * Capture adapter for the marketing-media export seam (JOV-7250).
 *
 * First rung of the sourcing order: the screenshot registry
 * (`apps/web/screenshot-catalog/current/<scenarioId>.png`). Given a scenario
 * id it produces a `produceOutput` callback for
 * `executeMarketingMediaExportRequest` — every requested profile is served
 * from the same registered capture, hashed so receipts stay honest.
 *
 *   tsx scripts/marketing-media/capture-adapter.ts \
 *     --fixture homepage-header-bar --scenario artist-profile-hero-section-desktop
 *
 * No provider calls, no spend — captures are already-approved pixels.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import type {
  MarketingMediaExportOutputProfile,
  MarketingMediaExportOutputResult,
} from '../../data/marketing/mediaExport';
import { executeMarketingMediaExportRequest } from '../../data/marketing/mediaExport';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(SCRIPTS_DIR, '..', '..');
const CATALOG_DIR = join(WEB_ROOT, 'screenshot-catalog', 'current');

function pngDimensions(bytes: Buffer): { width: number; height: number } {
  const PNG_SIGNATURE = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { width: 0, height: 0 };
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** `produceOutput` backed by a registered capture; pure, no I/O beyond the read. */
export function createCaptureProduceOutput(
  scenarioId: string,
  catalogDir: string = CATALOG_DIR
): (
  profile: MarketingMediaExportOutputProfile
) => MarketingMediaExportOutputResult {
  const assetPath = join(catalogDir, `${scenarioId}.png`);
  if (!existsSync(assetPath)) {
    return () => ({ ok: false, code: 'output-provider-unavailable' });
  }
  const bytes = readFileSync(assetPath);
  const assetHash = createHash('sha256').update(bytes).digest('hex');
  const { width, height } = pngDimensions(bytes);

  return () => ({
    ok: true,
    assetHash,
    width,
    height,
    format: 'image/png',
    rightsProvenance: `jovie-owned-capture:${scenarioId}`,
  });
}

const isMain =
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isMain) {
  const { values } = parseArgs({
    options: {
      fixture: { type: 'string' },
      scenario: { type: 'string' },
      'source-revision': { type: 'string', default: '' },
      profiles: { type: 'string', default: 'still' },
    },
    strict: true,
  });

  if (!values.fixture || !values.scenario) {
    console.error(
      'usage: capture-adapter.ts --fixture <fixtureId> --scenario <scenarioId> [--profiles still,poster,sequence]'
    );
    process.exit(2);
  }

  const result = executeMarketingMediaExportRequest({
    request: {
      fixtureId: values.fixture,
      sourceRevision: values['source-revision'] || `capture:${values.scenario}`,
      recipeId: 'dark-glass',
      accentToken: '--noir-ion-shell',
      outputProfiles: values.profiles.split(','),
      rendererVersion: 'capture-adapter/1',
      tokenPolicyVersion: 'scene-palette-v1',
      fallbackPolicy: 'retain-last-approved',
    },
    produceOutput: createCaptureProduceOutput(values.scenario),
  });

  if (result.status === 'rejected') {
    console.error(JSON.stringify(result.findings, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify(result.receipt, null, 2));
}
