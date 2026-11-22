import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dogfoodReceiptKey,
  type DogfoodSubjectDeployBinding,
} from '@/lib/ovie/certifications/dogfood-receipt-ledger';
import { PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID } from '@/lib/ovie/certifications/public-profile-dogfood-fixture';
import {
  assertExactPersistence,
  assertSameOriginProfilePath,
  buildReceipt,
  canonicalizeOrigin,
  observePublicProfile,
  parseObservation,
  requireProductionEnvironment,
} from './bind-public-profile-dogfood-feed';

const SHA = 'a'.repeat(40);
const DEPLOY = 'dpl_test_bind_public_profile';

const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  const paths = directories.splice(0);
  await Promise.all(paths.map(path => rm(path, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'dogfood-bind-'));
  directories.push(path);
  return path;
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
        artifactRefs: {
          profileHtml: '/tmp/profile.html',
          buildInfo: '/tmp/build.json',
        },
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
      artifactRefs: {
        profileHtml: '/tmp/profile.html',
        buildInfo: '/tmp/build.json',
      },
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
    expect(() => parseObservation(base)).toThrow(
      /passed\|failed\|unverified/
    );
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
});

describe('honest HTTP probe receipt', () => {
  it('labels the probe as agent_on_behalf/cli/regression/scripted with unverified checks', async () => {
    const dir = await tempDir();
    const fetcher = vi.fn<typeof fetch>(async url => {
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
    expect(observation.probe).toEqual({
      kind: 'agent_on_behalf',
      driver: 'cli',
      executed: ['http_get_build_info', 'http_get_profile_html'],
      unexecuted: [
        'identity_latest_work_readback',
        'listening_destination_click',
        'nearby_consent_persist',
      ],
    });
    expect(
      observation.criterionAssessment.every(item => item.status === 'unverified')
    ).toBe(true);
    expect(observation.criterionAssessment[0]?.evidenceRefs[0]).toMatch(
      /^artifact:public-profile\/http-probe\/[a-f0-9]{16}\/profile\.html#sha256:/
    );
    const html = await readFile(observation.artifactRefs.profileHtml, 'utf8');
    expect(html).toContain('spotify');

    const receipt = buildReceipt(observation);
    expect(receipt.kind).toBe('agent_on_behalf');
    expect(receipt.driver).toBe('cli');
    expect(receipt.outcome).toBe('failed');
    expect(receipt.missionObservation?.purpose).toBe('regression');
    expect(receipt.missionObservation?.method).toBe('scripted');
    expect(receipt.missionObservation?.goalCompletion).toBe('not_completed');
    expect(
      receipt.missionObservation?.checks.every(
        check => check.status === 'unverified'
      )
    ).toBe(true);
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
      artifactRefs: {
        profileHtml: '/tmp/profile.html',
        buildInfo: '/tmp/build.json',
      },
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
  it('keeps Production – jovie, canonical repo guard, and react-server apply path', () => {
    const workflow = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        '../../../.github/workflows/dogfood-feed-bind.yml'
      ),
      'utf8'
    );
    expect(workflow).toContain("github.repository == 'JovieInc/Jovie'");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain('name: Production – jovie');
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('--only-secrets=DATABASE_URL');
    expect(workflow).toContain('env -u DOPPLER_TOKEN');
    expect(workflow).toContain('NODE_OPTIONS=--conditions=react-server');
    expect(workflow).toContain('runs-on: ubuntu-24.04');
    expect(workflow).toContain('DOPPLER_TOKEN: ${{ secrets.DOPPLER_TOKEN_PRD }}');
    expect(workflow).not.toMatch(/\$\{\{\s*secrets\.DATABASE_URL\s*\}\}/);
    expect(workflow).not.toMatch(/\$\{\{\s*secrets\.CRON_SECRET\s*\}\}/);
    expect(workflow).not.toContain('postdeploy-probes.yml');
  });
});
