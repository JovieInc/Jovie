import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type CanonicalArtistSiteCliOptions,
  certifyCanonicalArtistSite,
  classifyDeployedRevision,
  parseSourceHistory,
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
    waitlistStatus: 'success',
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

  it('keeps waitlist admission green when the gate passes and the golden path does not', () => {
    const certificate = certifyCanonicalArtistSite({
      ...fixture(),
      goldenPathStatus: 'failure',
    });
    const waitlist = certificate.checks.find(
      check => check.id === 'waitlist_admission'
    );

    expect(certificate.status).toBe('RED');
    expect(waitlist?.status).toBe('passed');
    expect(waitlist?.detail).toBe(
      'Only explicitly admitted artists crossed the waitlist gate.'
    );
    expect(certificate.failingChecks.map(check => check.id)).not.toContain(
      'waitlist_admission'
    );
  });

  it('fails waitlist admission when the gate does not pass', () => {
    const certificate = certifyCanonicalArtistSite({
      ...fixture(),
      waitlistStatus: 'failure',
    });
    const waitlist = certificate.failingChecks.find(
      check => check.id === 'waitlist_admission'
    );

    expect(waitlist?.status).toBe('failed');
    expect(waitlist?.defectRef).toBe(
      'canonical-artist-site-waitlist-admission'
    );
    expect(waitlist?.detail).toContain('Unadmitted artists');
    expect(waitlist?.detail).not.toContain('Golden Path');
    expect(
      certificate.checks.find(check => check.id === 'claim_auth_intent')?.status
    ).toBe('passed');
  });

  it('binds a healthy live profile when its release is an ancestor of the source', () => {
    const certified = 'a'.repeat(40);
    const certificate = certifyCanonicalArtistSite({
      ...fixture(),
      sourceRevision: certified,
      sourceHistory: [certified, sourceRevision],
    });
    const identity = certificate.checks.find(
      check => check.id === 'identity_catalog'
    );

    expect(certificate.status).toBe('GREEN');
    expect(certificate.safeToSend).toBe(true);
    expect(identity?.status).toBe('passed');
    expect(identity?.detail).toContain('ancestor');
    expect(identity?.detail).toContain(sourceRevision);
    expect(identity?.detail).toContain(certified);
    expect(identity?.detail).not.toContain('bound to this source revision');
  });

  it('stays RED when history does not list the live release', () => {
    const certified = 'b'.repeat(40);
    const certificate = certifyCanonicalArtistSite({
      ...fixture(),
      sourceRevision: certified,
      sourceHistory: [certified],
    });
    const identity = certificate.failingChecks.find(
      check => check.id === 'identity_catalog'
    );

    expect(certificate.status).toBe('RED');
    expect(identity?.defectRef).toBe('canonical-artist-site-source-revision');
    expect(identity?.detail).toContain('is not');
    expect(identity?.detail).not.toContain('ancestor of');
  });

  it('does not bind a history that does not start with the certified source', () => {
    const certified = 'c'.repeat(40);
    const certificate = certifyCanonicalArtistSite({
      ...fixture(),
      sourceRevision: certified,
      sourceHistory: [sourceRevision, certified],
    });
    const identity = certificate.failingChecks.find(
      check => check.id === 'identity_catalog'
    );

    expect(certificate.safeToSend).toBe(false);
    expect(identity?.defectRef).toBe('canonical-artist-site-source-revision');
    expect(identity?.detail).not.toContain('ancestor of');
  });

  it('does not treat a non-SHA source as an ancestor', () => {
    const certificate = certifyCanonicalArtistSite({
      ...fixture(),
      sourceRevision: 'different-source',
      sourceHistory: ['different-source', sourceRevision],
    });
    const identity = certificate.failingChecks.find(
      check => check.id === 'identity_catalog'
    );

    expect(identity?.defectRef).toBe('canonical-artist-site-source-revision');
    expect(identity?.detail).not.toContain('ancestor of');
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

describe('deployed revision lineage', () => {
  const live = 'd'.repeat(40);
  const certified = 'e'.repeat(40);

  it('treats an equal SHA as the same revision without history', () => {
    expect(classifyDeployedRevision(live, live.toUpperCase(), [])).toBe('same');
  });

  it('accepts an ancestor only when history starts at the certified SHA', () => {
    expect(classifyDeployedRevision(certified, live, [certified, live])).toBe(
      'ancestor'
    );
    expect(classifyDeployedRevision(certified, live, [live, certified])).toBe(
      'unrelated'
    );
    expect(classifyDeployedRevision(certified, live, [])).toBe('unrelated');
    expect(
      classifyDeployedRevision('not-a-sha', live, ['not-a-sha', live])
    ).toBe('unknown');
  });

  it('keeps blank lines from shifting the certified SHA off the first entry', () => {
    expect(
      parseSourceHistory(`\n${certified.toUpperCase()}\n\n${live}\n`)
    ).toEqual([certified, live]);
  });
});
