import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type CanonicalArtistSiteCliOptions,
  certifyCanonicalArtistSite,
} from './certify-canonical-artist-site';

const sourceRevision = '8d2f49a8bdb2618db89368931d2313158b0a01bc';
const temporaryDirectories: string[] = [];

function fixture(): CanonicalArtistSiteCliOptions {
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
    m2Status: 'success',
    m2ReceiptPath,
    profileStatus: 'success',
    profileResultPath,
    outputPath: join(directory, 'certificate.json'),
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('canonical artist-site certification CLI adapter', () => {
  it('writes GREEN only when production-faithful and live evidence agree', () => {
    const options = fixture();
    const certificate = certifyCanonicalArtistSite(options);

    expect(certificate.statusLine).toBe(
      'GREEN — safe to send an artist through'
    );
    expect(
      certificate.checks.find(check => check.id === 'deferred_surfaces')?.detail
    ).toContain('pay-trigger');
    expect(JSON.parse(readFileSync(options.outputPath, 'utf8'))).toEqual(
      certificate
    );
  });

  it.each([
    ['Golden Path regression', { goldenPathStatus: 'failure' }],
    ['premade ownership regression', { claimContractStatus: 'failure' }],
    ['live $199 regression', { m2Status: 'failure' }],
    ['deployed source mismatch', { sourceRevision: 'different-source' }],
  ])('writes RED for %s', (_name, override) => {
    const options = { ...fixture(), ...override };
    const certificate = certifyCanonicalArtistSite(options);

    expect(certificate.status).toBe('RED');
    expect(certificate.safeToSend).toBe(false);
    expect(certificate.failingChecks.length).toBeGreaterThan(0);
    expect(readFileSync(options.outputPath, 'utf8')).toContain(
      'RED — not safe to send an artist through'
    );
  });

  it('attributes a healthy unbound profile to the source revision', () => {
    const certificate = certifyCanonicalArtistSite({
      ...fixture(),
      sourceRevision: 'different-source',
    });
    const identity = certificate.failingChecks.find(
      check => check.id === 'identity_catalog'
    );

    expect(identity?.defectRef).toBe('canonical-artist-site-source-revision');
    expect(identity?.detail).toContain('different-source');
    expect(identity?.detail).toContain(sourceRevision);
  });

  it('forces RED when the live profile exposes a deferred surface', () => {
    const options = fixture();
    const profile = JSON.parse(readFileSync(options.profileResultPath, 'utf8'));
    writeFileSync(
      options.profileResultPath,
      JSON.stringify({ ...profile, exposedDeferredSurfaces: ['broad_ai'] })
    );
    const certificate = certifyCanonicalArtistSite(options);
    const deferred = certificate.failingChecks.find(
      check => check.id === 'deferred_surfaces'
    );

    expect(certificate.safeToSend).toBe(false);
    expect(deferred?.status).toBe('failed');
    expect(deferred?.defectRef).toBe('canonical-artist-site-deferred-surfaces');
    expect(deferred?.detail).toContain('broad_ai');
  });

  it('does not hide deferred surfaces that were never observed', () => {
    const options = fixture();
    const profile = JSON.parse(readFileSync(options.profileResultPath, 'utf8'));
    delete profile.exposedDeferredSurfaces;
    writeFileSync(options.profileResultPath, JSON.stringify(profile));
    const certificate = certifyCanonicalArtistSite(options);

    expect(certificate.status).toBe('RED');
    expect(
      certificate.failingChecks.find(check => check.id === 'deferred_surfaces')
        ?.status
    ).toBe('failed');
  });
});
