import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  CANONICAL_ARTIST_SITE_CHECK_IDS,
  checkKey,
  EVIDENCE_INTEGRITY_KEY,
  intakeKeys,
  loadCertificate,
  MISSING_CERTIFICATE_KEY,
  openKeys,
  reportCanonicalArtistSiteCertification,
} from '../../canonical-artist-site-intake.mjs';

const enabled = {
  LINEAR_API_KEY: 'key',
  REMEDIATION_TRIGGERS_DISABLED: 'false',
};

function certificate(overrides = {}) {
  return {
    contract: 'jovie.canonical-artist-site-certification/v1',
    status: 'GREEN',
    safeToSend: true,
    candidateId: 'acquisition:premade-artist-profile:tim-white:1',
    sourceRevision: 'abc',
    failingChecks: [],
    evidenceIntegrityFailures: [],
    checks: CANONICAL_ARTIST_SITE_CHECK_IDS.map(id => ({ id })),
    ...overrides,
  };
}

async function filed(certificate, upsert) {
  const opened = [];
  const closed = [];
  await reportCanonicalArtistSiteCertification(
    { certificate, runId: '9' },
    {
      env: enabled,
      upsert: async args => {
        opened.push(args);
        return upsert ? upsert(args) : { ok: true };
      },
      close: async args => {
        closed.push(args.fingerprint);
        return { ok: true };
      },
    }
  );
  return { opened, closed };
}

describe('canonical artist-site intake', () => {
  it('closes every known defect when the certificate is GREEN', async () => {
    const { opened, closed } = await filed(certificate(), () => {
      throw new Error('upsert on green');
    });
    assert.equal(opened.length, 0);
    assert.deepEqual(closed.sort(), intakeKeys().sort());
    assert.equal(openKeys(certificate()).length, 0);
  });

  it('files only the missing-certificate defect when evidence is absent', async () => {
    const { opened, closed } = await filed(null);
    assert.equal(opened.length, 1);
    assert.equal(opened[0].fingerprint, MISSING_CERTIFICATE_KEY);
    assert.equal(opened[0].labelKey, MISSING_CERTIFICATE_KEY);
    assert.equal(opened[0].priority, 2);
    assert.equal(opened[0].title.includes('Golden Path nightly'), false);
    assert.equal(opened[0].title.includes('launch friction'), false);
    assert.equal(closed.length, 0);
    assert.equal(loadCertificate(''), null);
  });

  it('groups a valid defect key and keeps an invalid id on the check', async () => {
    const { opened } = await filed(
      certificate({
        status: 'RED',
        safeToSend: false,
        failingChecks: [
          {
            id: 'deferred_surfaces',
            defectRef: 'canonical-artist-site-deferred-surfaces',
            detail: 'broad_ai is visible',
            evidence: ['https://jov.ie/tim'],
          },
          {
            id: 'identity_catalog',
            defectRef: 'JOV-7192',
            detail: 'catalog mismatch',
            evidence: ['https://jov.ie/tim'],
          },
        ],
      })
    );
    assert.deepEqual(opened.map(args => args.fingerprint).sort(), [
      'canonical-artist-site-deferred-surfaces',
      checkKey('identity_catalog'),
    ]);
    const identity = opened.find(
      args => args.fingerprint === checkKey('identity_catalog')
    );
    assert.match(identity.description, /JOV-7192/);
    assert.equal(identity.title.includes('launch friction'), false);
  });

  it('files evidence integrity even when no check failed', async () => {
    assert.deepEqual(
      openKeys(
        certificate({
          status: 'RED',
          safeToSend: false,
          evidenceIntegrityFailures: ['evaluatedAt invalid'],
        })
      ),
      [EVIDENCE_INTEGRITY_KEY]
    );
  });

  it('rejects an unreadable certificate and a failed Linear write', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'jov-6572-intake-'));
    const path = join(directory, 'certificate.json');
    writeFileSync(path, '{');
    assert.equal(loadCertificate(path), null);
    rmSync(directory, { recursive: true, force: true });
    await assert.rejects(
      reportCanonicalArtistSiteCertification(
        {
          certificate: certificate({
            status: 'RED',
            safeToSend: false,
            failingChecks: [
              { id: 'profile_modes', detail: 'modes', evidence: ['run'] },
            ],
          }),
        },
        {
          env: enabled,
          upsert: async () => ({ ok: false, reason: 'linear_down' }),
          close: async () => ({ ok: true }),
        }
      ),
      /linear_down/
    );
  });
});
