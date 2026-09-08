/**
 * CLI entry for E1 observation gate. Invoked by
 * scripts/summer-commissioning/verify-e1-attestation-observations.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  e1PublisherShapedReceipt,
  evaluateE1AttestationObservations,
} from '../agent/lib/e1-attestation-observation-gate.ts';

const receiptPath =
  '/opt/cursor/artifacts/e1-attestation-observations-receipt.json';

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

  await mkdir('/opt/cursor/artifacts', { recursive: true });
  await writeFile(
    receiptPath,
    `${JSON.stringify({ ...result, mode, generatedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8'
  );
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'pass') process.exit(2);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
