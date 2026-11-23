import { mkdtempSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dogfoodReceiptProvesOutcome } from '@/lib/agent-os/dogfood-receipt';
import { getCanonicalSurface } from '@/lib/canonical-surfaces';
import { projectDogfoodFeed } from '@/lib/ovie/certifications/dogfood-feed';
import {
  type DogfoodSubjectDeployBinding,
  dogfoodReceiptKey,
} from '@/lib/ovie/certifications/dogfood-receipt-ledger';
import { requiredMissionsForSubject } from '@/lib/ovie/certifications/metrics.server';
import {
  parseCertificationPacketFile,
  readCertificationPacketFiles,
} from '@/lib/ovie/certifications/packet-files.server';
import { PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID } from '@/lib/ovie/certifications/public-profile-dogfood-fixture';
import {
  assertExactPersistence,
  assertSameOriginProfilePath,
  buildReceipt,
  canonicalizeOrigin,
  fetchNoRedirect,
  observePublicProfile,
  parseObservation,
  requireProductionEnvironment,
} from './bind-public-profile-dogfood-feed-lib';

const SHA = 'a'.repeat(40);
const DEPLOY = 'dpl_test_bind_public_profile';
const HERE = dirname(fileURLToPath(import.meta.url));

const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  const paths = directories.splice(0);
  await Promise.all(
    paths.map(path => rm(path, { recursive: true, force: true }))
  );
});

async function tempDir(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'dogfood-bind-'));
  directories.push(path);
  return path;
}

/** Unique per-test artifact paths — never fixed /tmp literals (hermetic-ci). */
function fixtureArtifactRefs(): {
  readonly profileHtml: string;
  readonly buildInfo: string;
} {
  const path = mkdtempSync(join(tmpdir(), 'dogfood-bind-'));
  directories.push(path);
  return {
    profileHtml: join(path, 'profile.html'),
    buildInfo: join(path, 'build.json'),
  };
}

describe('bind-public-profile-dogfood-feed guards', () => {
  it('canonicalizes only https://jov.ie and rejects other origins', () => {
    expect(canonicalizeOrigin('https://jov.ie/')).toBe('https://jov.ie');
    expect(() => canonicalizeOrigin('https://staging.jov.ie')).toThrow(
      /canonicalize/
    );
  });

  it('rejects absolute and protocol-relative profile paths', () => {
    expect(assertSameOriginProfilePath('/tim')).toBe('/tim');
    expect(() => assertSameOriginProfilePath('https://jov.ie/tim')).toThrow(
      /same-origin/
    );
    expect(() => assertSameOriginProfilePath('//evil.example/tim')).toThrow(
      /same-origin/
    );
  });

  it('requires an explicit production environment label', () => {
    expect(() => requireProductionEnvironment(undefined)).toThrow(
      /non-production or absent/
    );
    expect(() => requireProductionEnvironment('preview')).toThrow(
      /non-production or absent/
    );
    expect(() => requireProductionEnvironment('production')).not.toThrow();
  });

  it('refuses fixture placeholder evidence refs on parse', () => {
    expect(() =>
      parseObservation({
        observedAtStarted: '2026-11-22T04:00:00.000Z',
        observedAtCompleted: '2026-11-22T04:00:01.000Z',
        origin: 'https://jov.ie',
        path: '/tim',
        httpStatus: 200,
        htmlSha256: 'abc1234567890def',
        htmlBytes: 12,
        artifactRefs: fixtureArtifactRefs(),
        buildInfo: {
          commitSha: SHA,
          deploymentId: DEPLOY,
          environment: 'production',
        },
        criterionAssessment: [
          {
            criterion: 'Identity and latest work match the canonical artist',
            status: 'passed',
            evidenceRefs: ['artifact:public-profile/identity-readback'],
          },
        ],
        goalCompletion: 'completed',
        correctness: 'correct',
        method: 'goal_driven',
        purpose: 'capability',
        probe: {
          kind: 'agent_on_behalf',
          driver: 'cli',
          executed: ['http_get_profile_html'],
          unexecuted: ['nearby_consent_persist'],
        },
      })
    ).toThrow(/refusing_synthetic_fixture_receipt/);
  });

  it('rejects schema enums blocked/skipped and failed/abandoned', () => {
    const base = {
      observedAtStarted: '2026-11-22T04:00:00.000Z',
      observedAtCompleted: '2026-11-22T04:00:01.000Z',
      origin: 'https://jov.ie',
      path: '/tim',
      httpStatus: 200,
      htmlSha256: 'abc1234567890def',
      htmlBytes: 12,
      artifactRefs: fixtureArtifactRefs(),
      buildInfo: {
        commitSha: SHA,
        deploymentId: DEPLOY,
        environment: 'production',
      },
      criterionAssessment: [
        {
          criterion: 'Identity and latest work match the canonical artist',
          status: 'blocked',
          evidenceRefs: ['artifact:public-profile/http-probe/x/profile.html'],
        },
      ],
      goalCompletion: 'failed',
      correctness: 'unverified',
      method: 'scripted',
      purpose: 'regression',
      probe: {
        kind: 'agent_on_behalf',
        driver: 'cli',
        executed: ['http_get_profile_html'],
        unexecuted: ['nearby_consent_persist'],
      },
    };
    expect(() => parseObservation(base)).toThrow(/passed\|failed\|unverified/);
    expect(() =>
      parseObservation({
        ...base,
        criterionAssessment: [
          {
            criterion: 'Identity and latest work match the canonical artist',
            status: 'unverified',
            evidenceRefs: ['artifact:public-profile/http-probe/x/profile.html'],
          },
        ],
        goalCompletion: 'abandoned',
      })
    ).toThrow(/completed\|partial\|not_completed/);
  });

  it('rejects redirects on build-info and profile fetches', async () => {
    const fetcher = vi.fn<typeof fetch>(async url => {
      const href = String(url);
      if (href.endsWith('/api/health/build-info')) {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://evil.example/build-info' },
        });
      }
      return new Response(null, {
        status: 301,
        headers: { location: 'https://evil.example/tim' },
      });
    });
    vi.stubGlobal('fetch', fetcher);

    await expect(
      fetchNoRedirect(new URL('https://jov.ie/api/health/build-info'))
    ).rejects.toThrow(/refusing_redirect/);
    await expect(
      fetchNoRedirect(new URL('https://jov.ie/tim'))
    ).rejects.toThrow(/refusing_redirect/);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
  });
});

describe('honest HTTP probe receipt', () => {
  it('labels the probe as agent_on_behalf/cli/regression/scripted with unverified checks', async () => {
    const dir = await tempDir();
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      expect(init).toMatchObject({ redirect: 'manual' });
      const href = String(url);
      if (href.endsWith('/api/health/build-info')) {
        return Response.json({
          commitSha: SHA,
          deploymentId: DEPLOY,
          environment: 'production',
        });
      }
      if (href === 'https://jov.ie/tim') {
        return new Response(
          '<html><body>artist profile spotify nearby</body></html>',
          { status: 200 }
        );
      }
      throw new Error(`unexpected fetch ${href}`);
    });
    vi.stubGlobal('fetch', fetcher);

    const observation = await observePublicProfile({
      origin: 'https://jov.ie',
      path: '/tim',
      artifactDir: dir,
    });

    expect(observation.purpose).toBe('regression');
    expect(observation.method).toBe('scripted');
    expect(observation.goalCompletion).toBe('not_completed');
    expect(observation.correctness).toBe('unverified');
    expect(observation.probe.kind).toBe('agent_on_behalf');
    expect(observation.probe.driver).toBe('cli');
    expect(
      observation.criterionAssessment.every(
        item => item.status === 'unverified'
      )
    ).toBe(true);
    const html = await readFile(observation.artifactRefs.profileHtml, 'utf8');
    expect(html).toContain('spotify');

    const receipt = buildReceipt(observation);
    expect(receipt.kind).toBe('agent_on_behalf');
    expect(receipt.driver).toBe('cli');
    expect(receipt.outcome).toBe('failed');
    expect(receipt.missionObservation?.purpose).toBe('regression');
    expect(receipt.missionObservation?.method).toBe('scripted');
    expect(receipt.missionObservation?.goalCompletion).toBe('not_completed');
  });

  it('fails exact persistence when binding or receipt is missing', () => {
    const binding: DogfoodSubjectDeployBinding = {
      commitSha: SHA,
      deploymentId: DEPLOY,
      source: 'production',
    };
    const observation = parseObservation({
      observedAtStarted: '2026-11-22T04:00:00.000Z',
      observedAtCompleted: '2026-11-22T04:00:01.000Z',
      origin: 'https://jov.ie',
      path: '/tim',
      httpStatus: 200,
      htmlSha256: 'abc1234567890def',
      htmlBytes: 12,
      artifactRefs: fixtureArtifactRefs(),
      buildInfo: {
        commitSha: SHA,
        deploymentId: DEPLOY,
        environment: 'production',
      },
      criterionAssessment: [
        {
          criterion: 'Identity and latest work match the canonical artist',
          status: 'unverified',
          evidenceRefs: [
            'artifact:public-profile/http-probe/deadbeefdeadbeef/profile.html#sha256:abc',
            'artifact:public-profile/http-probe/deadbeefdeadbeef/build-info.json',
          ],
        },
        {
          criterion: 'A listening destination reaches the intended work',
          status: 'unverified',
          evidenceRefs: [
            'artifact:public-profile/http-probe/deadbeefdeadbeef/profile.html#sha256:abc',
            'artifact:public-profile/http-probe/deadbeefdeadbeef/build-info.json',
          ],
        },
        {
          criterion:
            'Nearby notification interest and consent persist for the intended artist',
          status: 'unverified',
          evidenceRefs: [
            'artifact:public-profile/http-probe/deadbeefdeadbeef/profile.html#sha256:abc',
            'artifact:public-profile/http-probe/deadbeefdeadbeef/build-info.json',
          ],
        },
      ],
      goalCompletion: 'not_completed',
      correctness: 'unverified',
      method: 'scripted',
      purpose: 'regression',
      probe: {
        kind: 'agent_on_behalf',
        driver: 'cli',
        executed: ['http_get_build_info', 'http_get_profile_html'],
        unexecuted: [
          'identity_latest_work_readback',
          'listening_destination_click',
          'nearby_consent_persist',
        ],
      },
    });
    const receipt = buildReceipt(observation);
    const receiptId = dogfoodReceiptKey(receipt);
    expect(() =>
      assertExactPersistence({
        ledger: {
          schemaVersion: 1,
          contract: 'jovie.dogfood-receipt-ledger/v1',
          receipts: {},
          subjectDeploys: {
            [PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID]: binding,
          },
          knownGoodDeploymentIds: [DEPLOY],
          updatedAt: '2026-11-22T04:00:02.000Z',
        },
        subjectId: PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID,
        binding,
        receipt,
        receiptId,
      })
    ).toThrow(/exact_persistence_readback_failed/);
  });
});

describe('workflow contract', () => {
  it('keeps `Production – jovie`, no pnpm -- separator, and CJS-safe import smoke', () => {
    const workflow = readFileSync(
      join(HERE, '../../../.github/workflows/dogfood-feed-bind.yml'),
      'utf8'
    );
    expect(workflow).toContain("github.repository == 'JovieInc/Jovie'");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain('name: Production – jovie');
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).toContain('runs-on: ubuntu-24.04');
    expect(workflow).toContain('--only-secrets=DATABASE_URL');
    expect(workflow).toContain('env -u DOPPLER_TOKEN');
    expect(workflow).toContain('NODE_OPTIONS=--conditions=react-server');
    expect(workflow).toContain(
      "void import('@/lib/ovie/mcp/postgres-backend.ts')"
    );
    expect(workflow).not.toMatch(/tsx -e "await import/);
    expect(workflow).not.toMatch(/dogfood:bind-public-profile -- \\/);
    expect(workflow).not.toMatch(/\$\{\{\s*secrets\.DATABASE_URL\s*\}\}/);
    expect(workflow).not.toMatch(/\$\{\{\s*secrets\.CRON_SECRET\s*\}\}/);
  });
});

describe('honest public-profile subject registration', () => {
  it('admits the committed source:null packet and projects required missions', async () => {
    const packetPath = join(
      HERE,
      '../../../docs/certification/public-profile.packet.json'
    );
    const raw = JSON.parse(readFileSync(packetPath, 'utf8')) as unknown;
    const parsed = parseCertificationPacketFile(
      raw,
      'docs/certification/public-profile.packet.json'
    );
    expect(typeof parsed).not.toBe('string');
    if (typeof parsed === 'string') return;
    expect(parsed.domain).toBe('public_profiles');
    expect(parsed.packet.subject.id).toBe(PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID);
    expect(parsed.packet.source).toBeNull();
    expect(parsed.packet.canonicalReferences).toEqual([]);
    expect(parsed.packet.invariantEvaluation).toEqual([]);
    expect(parsed.packet.testsCoverage).toEqual([]);
    expect(parsed.packet.visualProof).toEqual([]);

    const root = join(HERE, '../../../docs/certification');
    const discovered = await readCertificationPacketFiles([root]);
    const subject = discovered.files.find(
      file => file.packet.subject.id === PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID
    );
    expect(subject).toBeDefined();
    expect(subject!.packet.source).toBeNull();

    const missions = requiredMissionsForSubject(
      PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID
    );
    expect(missions).toHaveLength(1);
    expect(missions[0]?.id).toBe(
      getCanonicalSurface('public-profile').outcomeMission.id
    );

    const emptyFeed = projectDogfoodFeed({
      subjects: [],
      receipts: [],
      knownGoodDeploymentIds: [],
    });
    expect(emptyFeed.subjectsWithRequiredMissions).toBe(0);

    const registeredFeed = projectDogfoodFeed({
      subjects: [
        {
          requiredMissions: missions,
          deploy: null,
        },
      ],
      receipts: [],
      knownGoodDeploymentIds: [],
    });
    expect(registeredFeed.subjectsWithRequiredMissions).toBe(1);
    expect(registeredFeed.status).toBe('disconnected');
  });

  it('keeps the honest CLI receipt from proving capability outcome', () => {
    const observation = parseObservation({
      observedAtStarted: '2026-11-22T04:00:00.000Z',
      observedAtCompleted: '2026-11-22T04:00:01.000Z',
      origin: 'https://jov.ie',
      path: '/tim',
      httpStatus: 200,
      htmlSha256: 'abc1234567890def',
      htmlBytes: 12,
      artifactRefs: fixtureArtifactRefs(),
      buildInfo: {
        commitSha: SHA,
        deploymentId: DEPLOY,
        environment: 'production',
      },
      criterionAssessment: getCanonicalSurface(
        'public-profile'
      ).outcomeMission.outcome.successCriteria.map(criterion => ({
        criterion,
        status: 'unverified' as const,
        evidenceRefs: [
          'artifact:public-profile/http-probe/deadbeefdeadbeef/profile.html#sha256:abc',
          'artifact:public-profile/http-probe/deadbeefdeadbeef/build-info.json',
        ],
      })),
      goalCompletion: 'not_completed',
      correctness: 'unverified',
      method: 'scripted',
      purpose: 'regression',
      probe: {
        kind: 'agent_on_behalf',
        driver: 'cli',
        executed: ['http_get_build_info', 'http_get_profile_html'],
        unexecuted: [
          'identity_latest_work_readback',
          'listening_destination_click',
          'nearby_consent_persist',
        ],
      },
    });
    const receipt = buildReceipt(observation);
    expect(receipt.outcome).toBe('failed');
    expect(receipt.missionObservation?.purpose).toBe('regression');
    expect(receipt.missionObservation?.goalCompletion).toBe('not_completed');
    expect(
      dogfoodReceiptProvesOutcome(
        receipt,
        getCanonicalSurface('public-profile').outcomeMission
      )
    ).toBe(false);

    const feed = projectDogfoodFeed({
      dogfoodFeed: {
        status: 'production',
        receiptCount: 1,
        subjectsWithRequiredMissions: 1,
        subjectsWithDeploy: 1,
        knownGoodDeploymentCount: 1,
      },
      subjects: [
        {
          requiredMissions: requiredMissionsForSubject(
            PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID
          ),
          deploy: { commitSha: SHA, deploymentId: DEPLOY },
        },
      ],
      receipts: [receipt],
      knownGoodDeploymentIds: [DEPLOY],
    });
    expect(feed.status).toBe('production');
    expect(feed.receiptCount).toBe(1);
    expect(feed.subjectsWithRequiredMissions).toBe(1);
  });
});
