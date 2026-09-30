#!/usr/bin/env node
/**
 * Art evaluator gate (JOV-7250).
 *
 * The last gate every generated or captured marketing asset passes before it
 * can be referenced by an export receipt. Checks, in order:
 *   1. the asset exists and is non-empty;
 *   2. known format signature (PNG IHDR dimensions readable);
 *   3. the `<asset>.c2pa.json` provenance sidecar exists, parses, and carries
 *      `aiGenerated: true` plus the AI-generated markup for generated assets.
 *
 * Usage: node scripts/marketing-media/art-evaluator.mjs <asset-path> [--captured]
 *   --captured  asset is a real product capture, not generated; the sidecar is
 *               still required but `aiGenerated` may be false.
 *
 * Exit 0 = pass, exit 1 = fail (reasons on stderr).
 */
import { existsSync, readFileSync } from 'node:fs';

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function fail(reasons) {
  for (const reason of reasons) console.error(`art-evaluator: ${reason}`);
  process.exit(1);
}

export function evaluateAsset(assetPath, { captured = false } = {}) {
  const failures = [];

  if (!existsSync(assetPath)) {
    return { ok: false, failures: [`asset not found: ${assetPath}`] };
  }
  const bytes = readFileSync(assetPath);
  if (bytes.length === 0) {
    failures.push('asset is empty');
  }

  if (assetPath.endsWith('.png') && bytes.length >= 24) {
    if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
      failures.push('not a valid PNG (bad signature)');
    } else {
      const width = bytes.readUInt32BE(16);
      const height = bytes.readUInt32BE(20);
      if (width === 0 || height === 0) {
        failures.push('PNG IHDR reports zero dimensions');
      }
    }
  }

  const sidecarPath = `${assetPath}.c2pa.json`;
  if (!existsSync(sidecarPath)) {
    failures.push(`missing provenance sidecar: ${sidecarPath}`);
  } else {
    let sidecar;
    try {
      sidecar = JSON.parse(readFileSync(sidecarPath, 'utf8'));
    } catch {
      failures.push('provenance sidecar is not valid JSON');
    }
    if (sidecar) {
      if (!captured && sidecar.aiGenerated !== true) {
        failures.push('generated asset missing aiGenerated: true');
      }
      if (
        typeof sidecar.markup !== 'string' ||
        !sidecar.markup.includes('ai-generated')
      ) {
        failures.push('provenance missing AI-generated markup');
      }
      if (!sidecar.c2pa || !Array.isArray(sidecar.c2pa.assertions)) {
        failures.push('provenance missing C2PA assertion block');
      }
    }
  }

  return { ok: failures.length === 0, failures };
}

const isMain =
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isMain) {
  const args = process.argv.slice(2);
  const captured = args.includes('--captured');
  const assetPath = args.find(arg => !arg.startsWith('--'));
  if (!assetPath) {
    console.error('usage: art-evaluator.mjs <asset-path> [--captured]');
    process.exit(2);
  }
  const result = evaluateAsset(assetPath, { captured });
  if (!result.ok) fail(result.failures);
  console.log(`art-evaluator: pass ${assetPath}`);
}
