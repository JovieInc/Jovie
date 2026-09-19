/**
 * CLI entry for E1 observation gate. Invoked by
 * scripts/summer-commissioning/verify-e1-attestation-observations.mjs
 *
 * Receipt path must be writable on Gem self-hosted runners (timwhite cannot
 * mkdir /opt/cursor). See resolveE1ReceiptPath.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  e1PublisherShapedReceipt,
  evaluateE1AttestationObservations,
} from '../agent/lib/e1-attestation-observation-gate.ts';
import { resolveE1ReceiptPath } from '../agent/lib/e1-receipt-path.ts';

async function main() {
  const mode = process.env.E1_GATE_MODE ?? 'live';
  const nowMs = Date.now();
  let observationA: unknown;
  let observationB: unknown;

  if (mode === 'self-test') {
    observationA = e1PublisherShapedReceipt({
      nowMs,
      ageMs: 30_000,
      sourceRevision: 'a'.repeat(40),
    });
    observationB = e1PublisherShapedReceipt({
      nowMs,
      ageMs: 120_000,
      sourceRevision: 'b'.repeat(40),
    });
  } else {
    const pathA = process.env.E1_OBS_A_PATH;
    const pathB = process.env.E1_OBS_B_PATH;
    if (!pathA || !pathB) {
      console.error(
        'E1_OBS_A_PATH and E1_OBS_B_PATH are required in live mode'
      );
      process.exit(78);
    }
    observationA = JSON.parse(await readFile(pathA, 'utf8')) as unknown;
    observationB = JSON.parse(await readFile(pathB, 'utf8')) as unknown;
  }

  const result = evaluateE1AttestationObservations({
    observationA,
    observationB,
    nowMs,
  });

  const receiptPath = await resolveE1ReceiptPath();
  await mkdir(dirname(receiptPath), { recursive: true });
  await writeFile(
    receiptPath,
    `${JSON.stringify({ ...result, mode, generatedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8'
  );
  console.log(JSON.stringify(result, null, 2));
  console.log(`E1_RECEIPT_PATH=${receiptPath}`);
  if (result.status !== 'pass') process.exit(2);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
