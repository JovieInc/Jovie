// Side-effect fixture: points certification at a Golden Path Pen manifest
// whose every surface is designed, exported and matched, so tests about
// other checks are not failed by the design-first gate.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SURFACE_IDS } from '../../prod-cert.mjs';

const dir = mkdtempSync(join(tmpdir(), 'pen-green-'));
const still = join(dir, 'still.png');
writeFileSync(still, 'png');
const frames = SURFACE_IDS.map(surface => ({
  sectionId: `${surface}/screen`,
  penNodeId: `node-${surface}`,
  fileHash: null,
  stillPath: still,
  viewport: 1440,
  mode: 'dark',
  status: 'active',
}));
const manifest = join(dir, 'manifest.json');
writeFileSync(manifest, JSON.stringify({ frames }));
const receipt = join(dir, 'receipt.json');
writeFileSync(
  receipt,
  JSON.stringify({ frames: frames.map(f => ({ ...f, verdict: 'pass' })) })
);
process.env.PROD_CERT_PEN_MANIFEST = manifest;
process.env.PROD_CERT_PEN_DIFF_RECEIPT = receipt;

/** Check ids every green-designed surface adds after its own checks. */
export const PEN_IDS = ['pen.design-exists', 'pen.matches-production'];
