import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CanonicalArtistSiteCliOptions } from './certify-canonical-artist-site';

export const sourceRevision = '8d2f49a8bdb2618db89368931d2313158b0a01bc';
const temporaryDirectories: string[] = [];

export function fixture(): CanonicalArtistSiteCliOptions {
  const directory = mkdtempSync(join(tmpdir(), 'jovie-jov-6572-'));
  temporaryDirectories.push(directory);
  const m2ReceiptPath = join(directory, 'm2.json');
  const profileReportPath = join(directory, 'profile-report.json');
  const profileResultPath = join(directory, 'profile-result.json');
  writeFileSync(
    m2ReceiptPath,
    JSON.stringify({
      steps: [
        { name: 'claim', ok: true },
        { name: 'pro_checkout_199', ok: true },
        { name: 'activation', ok: true },
      ],
    })
  );
  writeFileSync(
    profileReportPath,
    JSON.stringify({
      snapshot: { releaseSha: sourceRevision },
      linkChecks: [
        {
          url: 'https://jov.ie/tim/never-say-a-word',
          status: 200,
          canonicalArtistReturn: true,
        },
      ],
    })
  );
  writeFileSync(
    profileResultPath,
    JSON.stringify({
      failed: false,
      reportPath: profileReportPath,
      exposedDeferredSurfaces: [],
      checks: [],
      brokenInternalLinks: [],
    })
  );
  return {
    candidateId: 'acquisition:premade-artist-profile:tim-white:run-42',
    runId: 'run-42',
    sourceRevision,
    runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/42',
    goldenPathStatus: 'success',
    claimContractStatus: 'success',
    waitlistStatus: 'success',
    m2Status: 'success',
    m2ReceiptPath,
    profileStatus: 'success',
    navigationStatus: 'success',
    profileResultPath,
    outputPath: join(directory, 'certificate.json'),
    gitRoot: directory,
  };
}

export function cleanupFixtures() {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
}
