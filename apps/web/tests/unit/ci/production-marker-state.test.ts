import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  admitReleaseBase,
  attachEntryHandoff,
  classifyProducerCoalescence,
  classifyProductionMarkerEvidence,
  entryRatchetDigest as entryDigest,
  normalizeProductionJobs,
  selectNewerControllerRun,
  validEntryRatchet,
} from '../../../../../.github/scripts/production-marker-state.mjs';

const processRunner = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({
  spawnSync: processRunner,
  default: { spawnSync: processRunner },
}));

const sha = 'a'.repeat(40);
const repo = 'jovylabs/jovie';
const workflowId = 123;
const controllerRun = 456;
const testDir = dirname(fileURLToPath(import.meta.url));
const liveFixturePath = resolve(
  testDir,
  'fixtures/production-controller-run-live-shape.json'
);

// Frozen synthetic proof produced by the reviewed collector before the layer split.
// Digests are recorded bytes, not regenerated expectations or a second decision implementation.
const ENTRY_FIXTURE_TIME = 1793059200000;
function entryHandoffFixture() {
  const now = ENTRY_FIXTURE_TIME;
  const profile = {
    harnessSha256: 'f'.repeat(64),
    lighthouseVersion: '13.4.1',
    browser: 'Chrome/140',
    device: 'mobile',
    cpu: '4x',
    network: 'slow4g',
    cache: 'reset-browser-observed-server',
    bypass: 'vercel-header',
  };
  const measurement = (letter: string, deploymentId: string, lcp: number) => ({
    identity: {
      sha: letter.repeat(40),
      deploymentId,
      origin: `https://jovie-${letter}-jovie.vercel.app`,
    },
    profileDigest:
      '50db59db8bfb98614eb9c84b20b3351ec42b2baf535cd9f45611304f3b6f4808',
    cohorts: [0, 1].map(ordinal => ({
      ordinal,
      startedAt: now - 900 + ordinal * 100,
      completedAt: now - 850 + ordinal * 100,
      routes: (['start', 'claim', 'claim-link'] as const).map(id => ({
        id,
        lcpSamples: [lcp, lcp, lcp],
        clsSamples: [0, 0, 0],
        serverCache: ['HIT', 'HIT', 'HIT'],
      })),
    })),
  });
  const served = measurement('b', 'dpl_served', 6000);
  const candidate = measurement('a', 'dpl_primary123', 5000);
  const producer = { sha, runId: controllerRun, attempt: 1 };
  const entryRatchet = {
    schema: 'jovie-entry-lcp-ratchet/v1',
    budgets: [
      { id: 'start', path: '/start', lcpMs: 4000, cls: 0.05 },
      { id: 'claim', path: '/claim', lcpMs: 4000, cls: 0.05 },
      { id: 'claim-link', path: '/[handle]?claim=1', lcpMs: 4000, cls: 0.05 },
    ],
    declaredAt: now - 1000,
    completedAt: now,
    policyDigest:
      '068b88c15cbdbec8dacb803bec18c5dfd9a86ee1dc2f21efbab5ec7acae40504',
    profile,
    profileDigest:
      '50db59db8bfb98614eb9c84b20b3351ec42b2baf535cd9f45611304f3b6f4808',
    producer,
    baseline: {
      state: 'verified',
      sha: served.identity.sha,
      deploymentId: served.identity.deploymentId,
      markerArtifactId: 10,
      controllerRun: 5,
      controllerAttempt: 1,
    },
    served,
    candidate,
    reference: served,
    anchor: { measurement: candidate, producer, role: 'candidate' },
    previousAnchor: { measurement: served, producer, role: 'served' },
    previousAnchorDigest: null,
    initializedFrom: 'verified-served',
    releaseEligible: true,
    certified: false,
    failures: [],
    digest: '1201edb6c4aa3042c4bd48a37cee7c7de88d7b203e1223a7ce95fb128153dde5',
  };
  return {
    schema: 'jovie-entry-lcp-handoff/v1',
    producer,
    candidate: candidate.identity,
    mode: 'measured',
    entryRatchet,
  };
}

function entryPolicyFixture(lineageSha = sha, selectedLane = 'high') {
  return {
    schema: 'jovie.release-risk-receipt/v1',
    policyVersion: 'jovie.release-risk-policy/2026-10-21.1',
    lineageSha,
    selectedLane,
    requiredProof:
      selectedLane === 'high' ? ['high-confidence-runtime-proof'] : [],
  };
}

describe('entry ratchet artifact handoff', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(ENTRY_FIXTURE_TIME + 5000);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('accepts the immutable pre-split proof with its recorded digest', () => {
    const receipt = entryHandoffFixture().entryRatchet;
    const { digest, ...body } = receipt;
    expect(entryDigest(body)).toBe(digest);
    expect(validEntryRatchet(receipt)).toBe(true);
  });
  it.each(['certification', 'regression', 'weaker-policy', 'wrong-anchor'])(
    'independently rejects a rehashed contradictory %s decision',
    fault => {
      const receipt = structuredClone(entryHandoffFixture().entryRatchet);
      if (fault === 'certification') receipt.certified = true;
      if (fault === 'regression')
        receipt.candidate.cohorts[0].routes[0].lcpSamples = [7000, 7000, 7000];
      if (fault === 'weaker-policy') {
        Object.assign(receipt.budgets[0], { lcpMs: 9000 });
        receipt.policyDigest = entryDigest({
          schema: receipt.schema,
          budgets: receipt.budgets,
          cohorts: 2,
          samples: 3,
          positiveRegressionAllowance: 0,
        });
      }
      if (fault === 'wrong-anchor') receipt.anchor = receipt.previousAnchor;
      const { digest: _old, ...body } = receipt;
      receipt.digest = entryDigest(body);
      expect(validEntryRatchet(receipt)).toBe(false);
    }
  );

  it.each(['qualified', 'missing-status', 'foreign-source'])(
    'binds a measured ratchet to the actual marker producer (%s)',
    mode => {
      const marker = primaryMarker('completed', 'success');
      const receipt = structuredClone(entryHandoffFixture().entryRatchet);
      if (mode === 'foreign-source') {
        receipt.producer.runId = 999;
        const { digest: _old, ...body } = receipt;
        receipt.digest = entryDigest(body);
        expect(validEntryRatchet(receipt)).toBe(true);
      }
      const payload = {
        ...marker.payload,
        releasePolicy: entryPolicyFixture(),
        entryRatchet: receipt,
        ...(mode === 'missing-status'
          ? {}
          : { entryMeasurementStatus: 'measured' }),
      };
      expect(
        classifyProductionMarkerEvidence(
          evidence({ markers: [{ ...marker, payload }] })
        ).state
      ).toBe(mode === 'qualified' ? 'verified' : 'manual');
    }
  );
  it('serializes the actual controller and recovery marker commands before applying the original-attempt handoff', async () => {
    const { spawnSync: nativeSpawn } =
      await vi.importActual<typeof import('node:child_process')>(
        'node:child_process'
      );
    const directory = mkdtempSync(resolve(tmpdir(), 'entry-workflow-test-'));
    mkdirSync(resolve(directory, 'release-lineage'));
    writeFileSync(
      resolve(directory, 'release-lineage/fleet-admission.json'),
      '{"scopedAdmission":{}}'
    );
    writeFileSync(
      resolve(directory, 'release-risk-receipt.json'),
      JSON.stringify(entryPolicyFixture())
    );
    const handoff = entryHandoffFixture();
    try {
      for (const workflow of [
        'production-controller.yml',
        'production-marker-recovery.yml',
      ]) {
        const source = readFileSync(
          resolve(testDir, '../../../../../.github/workflows', workflow),
          'utf8'
        );
        const lines = source.split('\n');
        const endings = lines.flatMap((line, index) =>
          line.includes('> "$RUNNER_TEMP/production-generation-verified.json"')
            ? [index]
            : []
        );
        expect(endings).toHaveLength(
          workflow === 'production-controller.yml' ? 2 : 1
        );
        for (const end of endings) {
          let start = end;
          while (start >= 0 && lines[start].trim() !== 'jq -n \\') start--;
          expect(start).toBeGreaterThanOrEqual(0);
          const recovery = workflow === 'production-marker-recovery.yml';
          const script = lines
            .slice(start, end + 1)
            .map(line => line.trimStart())
            .join('\n')
            .replaceAll(
              '${{ github.run_id }}',
              recovery ? '900' : String(controllerRun)
            )
            .replaceAll('${{ github.run_attempt }}', recovery ? '2' : '1');
          writeFileSync(
            resolve(directory, 'release-risk-receipt.json'),
            JSON.stringify(
              entryPolicyFixture(
                sha,
                script.includes('deploymentId: "not-applicable"')
                  ? 'not_applicable'
                  : 'high'
              )
            )
          );
          const executed = nativeSpawn(
            'bash',
            ['-euo', 'pipefail', '-c', script],
            {
              encoding: 'utf8',
              timeout: 5000,
              env: {
                NODE_ENV: 'test',
                PATH: process.env.PATH,
                RUNNER_TEMP: directory,
                EXPECTED_SHA: sha,
                DEPLOYMENT_ID: handoff.candidate.deploymentId,
                EXPECTED_DEPLOYMENT_ID: handoff.candidate.deploymentId,
                DEPLOYED_SHA: 'b'.repeat(40),
                WEB_EVIDENCE_SHA: sha,
                SELECTED_LANES: 'web',
                AUTH_SMOKE_STATUS: 'passed',
                terminal_reason: 'promoted',
                SOURCE_CONTROLLER_RUN: String(controllerRun),
                SOURCE_CONTROLLER_ATTEMPT: '1',
              },
            }
          );
          expect(executed.status, executed.stderr).toBe(0);
          const marker = JSON.parse(
            readFileSync(
              resolve(directory, 'production-generation-verified.json'),
              'utf8'
            )
          );
          if (marker.deploymentId === 'not-applicable') {
            expect(marker.deploymentBaseSha).toBe('b'.repeat(40));
          } else {
            const attached = attachEntryHandoff(
              marker,
              handoff,
              entryPolicyFixture()
            );
            expect(attached.entryRatchet).toEqual(handoff.entryRatchet);
          }
        }
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each(['qualified', 'legacy', 'expired', 'missing'])(
    'executes no-web carry from a %s served marker without renewing its evidence',
    async state => {
      const primary = primaryMarker('completed', 'success');
      const receipt = entryHandoffFixture().entryRatchet;
      if (state !== 'legacy')
        Object.assign(primary.payload, {
          entryMeasurementStatus: 'measured',
          entryRatchet: receipt,
          releasePolicy: entryPolicyFixture(),
        });
      const directory = mkdtempSync(resolve(tmpdir(), 'entry-no-web-test-'));
      const filename = resolve(
        directory,
        'production-generation-verified.json'
      );
      const original = JSON.stringify({
        sha: 'c'.repeat(40),
        deploymentId: 'not-applicable',
        deploymentBaseSha: sha,
        controllerRun: '900',
        controllerAttempt: '1',
        webEvidenceSha: 'none',
        selectedLanes: [],
        authSmoke: 'not-applicable',
        releasePolicy: entryPolicyFixture('c'.repeat(40), 'not_applicable'),
      });
      writeFileSync(filename, original);
      processRunner.mockImplementation((command: string, args: string[]) => {
        const endpoint = args[1];
        let output: string | Buffer;
        if (command === 'unzip')
          output =
            args[0] === '-Z1'
              ? 'production-generation-verified.json\n'
              : JSON.stringify(primary.payload);
        else if (command === 'gh' && args[0] === 'api') {
          if (endpoint.endsWith('/zip')) output = Buffer.from('archive');
          else if (endpoint.endsWith('/production-controller.yml'))
            output = JSON.stringify({ id: workflowId });
          else if (endpoint.includes('/artifacts?')) {
            const artifacts =
              state !== 'missing' &&
              endpoint.includes(`name=production-generation-verified-${sha}&`)
                ? [
                    {
                      ...primary.artifact,
                      expired: state === 'expired',
                      workflow_run: { id: controllerRun },
                    },
                  ]
                : [];
            output = JSON.stringify({
              total_count: artifacts.length,
              artifacts,
            });
          } else if (endpoint.includes('/jobs?'))
            output = JSON.stringify({
              total_count: primary.attemptJobs.length,
              jobs: primary.attemptJobs,
            });
          else if (endpoint.endsWith('/attempts/1'))
            output = JSON.stringify(primary.attemptRun);
          else throw new Error(`Unexpected offline endpoint ${endpoint}`);
        } else throw new Error(`Unexpected offline command ${command}`);
        return { status: 0, stdout: output, stderr: '' };
      });
      const argv = process.argv;
      try {
        process.argv = [
          process.execPath,
          resolve(
            testDir,
            '../../../../../.github/scripts/production-marker-state.mjs'
          ),
          '--entry-carry',
          filename,
          '--repo',
          repo,
        ];
        vi.resetModules();
        const execute = () =>
          import('../../../../../.github/scripts/production-marker-state.mjs');
        if (state === 'qualified' || state === 'legacy') {
          await execute();
          const carried = JSON.parse(readFileSync(filename, 'utf8'));
          expect(carried.entryMeasurementStatus).toBe(
            state === 'legacy' ? 'uninitialized' : 'carried'
          );
          expect(carried.entryRatchet).toEqual(
            state === 'legacy' ? null : receipt
          );
        } else {
          await expect(execute()).rejects.toThrow();
          expect(readFileSync(filename, 'utf8')).toBe(original);
        }
      } finally {
        process.argv = argv;
        processRunner.mockReset();
        rmSync(directory, { recursive: true, force: true });
      }
    }
  );
  it('preserves the original measurement and anchor bytes through recovery and supersession', () => {
    const handoff = entryHandoffFixture();
    const primary = primaryMarker('completed', 'success').payload;
    const recovered = {
      ...primary,
      controllerRun: '900',
      controllerAttempt: '2',
      recoveredFromControllerRun: String(controllerRun),
      recoveredFromControllerAttempt: '1',
    };
    for (const marker of [
      primary,
      recovered,
      { ...primary, terminalReason: 'skipped_superseded' },
    ]) {
      const attached = attachEntryHandoff(
        marker,
        handoff,
        entryPolicyFixture()
      );
      expect(attached.entryRatchet).toEqual(handoff.entryRatchet);
      expect(attached.entryRatchet.completedAt).toBe(
        handoff.entryRatchet.completedAt
      );
      expect(attached.entryMeasurementStatus).toBe('measured');
    }
  });

  it('carries an old anchor without claiming that the current SHA was measured', () => {
    const handoff = entryHandoffFixture();
    const carried = {
      ...handoff,
      mode: 'carried',
      producer: { ...handoff.producer, sha: 'c'.repeat(40), runId: 700 },
      candidate: {
        ...handoff.candidate,
        sha: 'c'.repeat(40),
        deploymentId: 'dpl_c',
        origin: 'https://jovie-c-jovie.vercel.app',
      },
    };
    const marker = {
      sha: carried.producer.sha,
      deploymentId: 'dpl_c',
      controllerRun: '700',
      controllerAttempt: '1',
    };
    expect(
      attachEntryHandoff(marker, carried, entryPolicyFixture(marker.sha, 'low'))
    ).toMatchObject({
      entryMeasurementStatus: 'carried',
      entryRatchet: handoff.entryRatchet,
    });
    expect(() =>
      attachEntryHandoff(
        marker,
        { ...carried, mode: 'measured' },
        entryPolicyFixture(marker.sha, 'low')
      )
    ).toThrow(/source mismatch/);
  });

  it.each([
    'expired',
    'future',
    'extra-field',
    'digest',
    'incomplete',
    'invalid-sample',
  ])('rejects %s persisted evidence', fault => {
    const receipt = structuredClone(entryHandoffFixture().entryRatchet);
    if (fault === 'expired') receipt.completedAt -= 31 * 86400000;
    if (fault === 'future') receipt.completedAt += 100000;
    if (fault === 'extra-field')
      Object.assign(receipt, { secret: 'must-not-survive' });
    if (fault === 'digest') receipt.digest = '0'.repeat(64);
    if (fault === 'incomplete') receipt.anchor.measurement.cohorts.pop();
    if (fault === 'invalid-sample')
      receipt.candidate.cohorts[0].routes[0].lcpSamples[0] = Number.NaN;
    expect(validEntryRatchet(receipt)).toBe(false);
  });

  it.each([
    'exact',
    'missing',
    'expired',
    'foreign-run',
    'wrong-attempt',
    'changed-list',
    'unexpected-file',
    'private-field',
    'wrong-name',
    'invalid-id',
    'unknown-expiry',
    'high-carried',
    'high-uninitialized',
    'low-carried',
    'foreign-policy',
    'missing-policy',
  ])(
    'executes the real artifact-to-marker CLI with %s evidence',
    async fault => {
      const handoff = entryHandoffFixture();
      const policy = entryPolicyFixture(
        fault === 'foreign-policy' ? 'f'.repeat(40) : sha,
        fault === 'low-carried' ? 'low' : 'high'
      );
      if (fault === 'high-carried' || fault === 'low-carried')
        handoff.mode = 'carried';
      if (fault === 'high-uninitialized')
        Object.assign(handoff, { mode: 'uninitialized', entryRatchet: null });
      if (fault === 'wrong-attempt') handoff.producer.attempt = 2;
      if (fault === 'private-field')
        Object.assign(handoff.candidate, { header: 'private' });
      const marker = {
        ...primaryMarker('completed', 'success').payload,
        controllerRun: '900',
        controllerAttempt: '2',
        recoveredFromControllerRun: String(controllerRun),
        recoveredFromControllerAttempt: '1',
      };
      const directory = mkdtempSync(resolve(tmpdir(), 'entry-artifact-test-'));
      const filename = resolve(
        directory,
        'production-generation-verified.json'
      );
      const original = `${JSON.stringify(marker)}\n`;
      writeFileSync(filename, original);
      let listings = 0;
      let archive = 'entry';
      const name = `entry-lcp-handoff-${sha}-${controllerRun}-1`;
      processRunner.mockImplementation((command: string, args: string[]) => {
        let output: string | Buffer;
        if (command === 'unzip')
          output =
            args[0] === '-Z1'
              ? archive === 'policy'
                ? 'release-risk-receipt.json\nproduction-lane-range.json\nfleet-admission.json\n'
                : fault === 'unexpected-file'
                  ? 'entry-lcp-handoff.json\nheaders.json\n'
                  : 'entry-lcp-handoff.json\n'
              : JSON.stringify(archive === 'policy' ? policy : handoff);
        else if (
          command === 'gh' &&
          args[0] === 'api' &&
          args[1].endsWith('/zip')
        ) {
          archive = args[1].includes('/51/zip') ? 'policy' : 'entry';
          output = Buffer.from('archive');
        } else if (
          command === 'gh' &&
          args[0] === 'api' &&
          args[1].includes('name=production-lane-range-')
        ) {
          const artifacts =
            fault === 'missing-policy'
              ? []
              : [
                  {
                    id: 51,
                    name: `production-lane-range-${sha}-1`,
                    expired: false,
                    workflow_run: { id: controllerRun },
                  },
                ];
          output = JSON.stringify({ total_count: artifacts.length, artifacts });
        } else if (
          command === 'gh' &&
          args[0] === 'api' &&
          args[1].includes(`name=${name}`)
        ) {
          listings++;
          const artifacts =
            fault === 'missing'
              ? []
              : [
                  {
                    id:
                      fault === 'invalid-id'
                        ? 0
                        : fault === 'changed-list' && listings > 1
                          ? 42
                          : 41,
                    name: fault === 'wrong-name' ? 'unbound-artifact' : name,
                    expired:
                      fault === 'unknown-expiry'
                        ? undefined
                        : fault === 'expired',
                    workflow_run: {
                      id: fault === 'foreign-run' ? 900 : controllerRun,
                    },
                  },
                ];
          output = JSON.stringify({ total_count: artifacts.length, artifacts });
        } else throw new Error(`Unexpected offline command ${command}`);
        return { status: 0, stdout: output, stderr: '' };
      });
      const argv = process.argv;
      try {
        process.argv = [
          process.execPath,
          resolve(
            testDir,
            '../../../../../.github/scripts/production-marker-state.mjs'
          ),
          '--entry-attach',
          filename,
          '--repo',
          repo,
        ];
        vi.resetModules();
        const execute = () =>
          import('../../../../../.github/scripts/production-marker-state.mjs');
        if (fault === 'exact' || fault === 'low-carried') {
          await execute();
          expect(JSON.parse(readFileSync(filename, 'utf8'))).toMatchObject({
            entryRatchet: handoff.entryRatchet,
            entryMeasurementStatus:
              fault === 'low-carried' ? 'carried' : 'measured',
          });
          expect(listings).toBe(2);
        } else {
          await expect(execute()).rejects.toThrow();
          expect(readFileSync(filename, 'utf8')).toBe(original);
        }
        expect(
          processRunner.mock.calls.some(call =>
            /--method| -X /.test(String(call[1]))
          )
        ).toBe(false);
      } finally {
        process.argv = argv;
        processRunner.mockReset();
        rmSync(directory, { recursive: true, force: true });
      }
    }
  );
});

function run(attempt: number, status: string, conclusion: string | null) {
  return {
    id: controllerRun,
    run_attempt: attempt,
    workflow_id: workflowId,
    path: '.github/workflows/production-controller.yml',
    head_sha: sha,
    head_branch: 'main',
    head_repository: { full_name: repo },
    event: 'workflow_run',
    status,
    conclusion,
  };
}

function job(
  name: string,
  attempt: number,
  status: string,
  conclusion: string | null
) {
  return {
    id: attempt * 1000 + name.length,
    name,
    run_id: controllerRun,
    run_attempt: attempt,
    head_sha: sha,
    head_branch: 'main',
    status,
    conclusion,
  };
}

interface MarkerJobStep {
  number: number;
  name: string;
  status: string;
  conclusion: string | null;
}
type MarkerJob = ReturnType<typeof job> & { steps?: MarkerJobStep[] };

// The verified-generation artifact stores this. The classifier does not read
// terminalReason; admissibility comes from the attempt jobs and descendant proof.
type VerifiedGenerationPayload = {
  sha: string;
  deploymentId: string;
  controllerRun: string;
  controllerAttempt: string;
  terminalReason?: 'promoted' | 'skipped_superseded' | 'not_applicable';
};

function earlyCoalescedJobs() {
  return [
    job('Coalesce release wave', 1, 'completed', 'success'),
    ...[
      'Authorize fleet deployment state',
      'Authorize exact main CI evidence',
      'Production Release',
      'Post-Deploy Smoke (Production)',
      'Lighthouse CI (Production)',
      'Post-Deploy Auth Smoke (Production)',
      'Production Verified',
    ].map(name => job(name, 1, 'completed', 'skipped')),
  ];
}

function primaryMarker(
  status: string,
  conclusion: string | null,
  rollback = job(
    'Production Release / Centralized production rollback',
    1,
    'completed',
    'skipped'
  )
) {
  const payload: VerifiedGenerationPayload = {
    sha,
    deploymentId: 'dpl_primary123',
    controllerRun: String(controllerRun),
    controllerAttempt: '1',
  };
  return {
    artifact: {
      id: 11,
      name: `production-generation-verified-${sha}`,
      expired: false,
      workflowRunId: controllerRun,
    },
    payload,
    attemptRun: run(1, status, conclusion),
    attemptJobs: [
      job(
        'Production Verified',
        1,
        status === 'completed' ? 'completed' : status,
        conclusion === 'success' ? 'success' : conclusion
      ),
      rollback,
    ],
  };
}

function recoveryMarker(status: string, conclusion: string | null) {
  return {
    artifact: {
      id: 12,
      name: `production-generation-verified-recovery-${sha}`,
      expired: false,
      workflowRunId: controllerRun,
    },
    payload: {
      sha,
      deploymentId: 'dpl_recovery123',
      controllerRun: String(controllerRun),
      controllerAttempt: '2',
    },
    attemptRun: run(2, status, conclusion),
    attemptJobs: [job('Production Verified', 2, status, conclusion)],
  };
}

function recoveryLease() {
  return {
    artifact: {
      id: 13,
      name: `production-generation-recovery-${sha}`,
      expired: false,
      workflowRunId: controllerRun,
    },
    payload: {
      sha,
      controllerRun: String(controllerRun),
      controllerAttempt: '2',
    },
  };
}

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    sha,
    repo,
    controllerWorkflowId: workflowId,
    markers: [primaryMarker('completed', 'cancelled')],
    recoveryArtifacts: [],
    latestRun: run(1, 'completed', 'cancelled'),
    ...overrides,
  };
}

describe('production marker attempt state', () => {
  it('refuses an unknown entry ratchet version instead of silently dropping its authority', () => {
    const marker = primaryMarker('completed', 'success');
    Object.assign(marker.payload, { entryRatchet: { schema: 'unknown/v99' } });
    expect(
      classifyProductionMarkerEvidence(evidence({ markers: [marker] })).state
    ).toBe('manual');
  });

  const normalRerunMarker = () => ({
    ...recoveryMarker('completed', 'success'),
    artifact: { ...primaryMarker('completed', 'success').artifact },
  });

  it.each([
    'success',
    'pending',
    'risk-receipt',
    'api-unavailable',
    'wrong-archive',
    'duplicate-entry',
    'unexpected-extra',
    'incomplete-jobs',
  ])(
    'executes the production reader CLI with %s retry evidence',
    async failureMode => {
      const previousForceTty = process.env.GH_FORCE_TTY;
      process.env.GH_FORCE_TTY = '1';
      const marker = normalRerunMarker();
      if (failureMode === 'pending') {
        marker.attemptRun.status = 'in_progress';
        marker.attemptRun.conclusion = null;
        marker.attemptJobs[0].status = 'in_progress';
        marker.attemptJobs[0].conclusion = null;
      }
      const calls: string[] = [];
      processRunner.mockImplementation((command: string, args: string[]) => {
        const endpoint = args[1];
        calls.push(`${command} ${args.join(' ')}`);
        let output: string | Buffer;
        if (failureMode === 'api-unavailable')
          return { status: 1, stderr: 'producer unavailable' };
        if (command === 'unzip') {
          output =
            args[0] === '-Z1'
              ? failureMode === 'wrong-archive'
                ? 'unexpected.json\n'
                : failureMode === 'risk-receipt'
                  ? 'production-generation-verified.json\nrelease-risk-receipt.json\n'
                  : failureMode === 'duplicate-entry'
                    ? 'production-generation-verified.json\nproduction-generation-verified.json\n'
                    : failureMode === 'unexpected-extra'
                      ? 'production-generation-verified.json\nunexpected.json\n'
                      : 'production-generation-verified.json\n'
              : JSON.stringify(marker.payload);
        } else if (command === 'gh' && args[0] === 'api') {
          if (endpoint.endsWith('/zip')) output = Buffer.from('archive');
          else if (endpoint.includes('/artifacts?'))
            output = JSON.stringify({
              total_count: endpoint.includes(
                `name=production-generation-verified-${sha}&`
              )
                ? 1
                : 0,
              artifacts: endpoint.includes(
                `name=production-generation-verified-${sha}&`
              )
                ? [{ ...marker.artifact, workflow_run: { id: controllerRun } }]
                : [],
            });
          else if (endpoint.endsWith('/attempts/2'))
            output = JSON.stringify(marker.attemptRun);
          else if (endpoint.endsWith('/attempts/2/jobs?per_page=100'))
            output = JSON.stringify({
              total_count: failureMode === 'incomplete-jobs' ? 2 : 1,
              jobs: marker.attemptJobs,
            });
          else throw new Error(`unexpected endpoint ${endpoint}`);
        } else throw new Error(`unexpected command ${command}`);
        return { status: 0, stdout: output, stderr: '' };
      });
      const argv = process.argv;
      const output = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation(() => true);
      try {
        process.argv = [
          process.execPath,
          resolve(
            testDir,
            '../../../../../.github/scripts/production-marker-state.mjs'
          ),
          '--sha',
          sha,
          '--repo',
          repo,
          '--controller-workflow-id',
          String(workflowId),
        ];
        vi.resetModules();
        await import(
          '../../../../../.github/scripts/production-marker-state.mjs'
        );
        const result = JSON.parse(String(output.mock.calls.at(-1)?.[0]));
        const succeeds = ['success', 'pending', 'risk-receipt'].includes(
          failureMode
        );
        expect(result).toMatchObject(
          succeeds
            ? {
                state: failureMode === 'pending' ? 'pending' : 'verified',
                controllerAttempt: 2,
                controllerRun,
              }
            : { state: 'manual', reason: 'evidence_api_error' }
        );
        if (succeeds) {
          expect(
            calls.filter(call => call.includes('/artifacts?'))
          ).toHaveLength(6);
          const zipCalls = processRunner.mock.calls.filter(
            call =>
              call[0] === 'gh' && String(call[1]?.[1] ?? '').endsWith('/zip')
          );
          expect(zipCalls.length).toBeGreaterThan(0);
          for (const call of zipCalls) {
            expect(call[2]?.env?.GH_FORCE_TTY).toBeUndefined();
            expect(typeof call[2]?.stdio?.[1]).toBe('number');
          }
        }
        expect(
          calls.every(
            call =>
              call.startsWith('gh api repos/') || call.startsWith('unzip ')
          )
        ).toBe(true);
        expect(
          calls.some(call => /--method| -X |enqueue|\/statuses/.test(call))
        ).toBe(false);
      } finally {
        if (previousForceTty === undefined) delete process.env.GH_FORCE_TTY;
        else process.env.GH_FORCE_TTY = previousForceTty;
        process.argv = argv;
        output.mockRestore();
        processRunner.mockReset();
      }
    }
  );

  it('accepts the normal marker from a successful full retry at exact attempt 2', () => {
    expect(
      classifyProductionMarkerEvidence(
        evidence({
          markers: [normalRerunMarker()],
        })
      )
    ).toMatchObject({
      state: 'verified',
      controllerRun,
      controllerAttempt: 2,
      reason: 'exact_attempt_verified',
      deploymentId: 'dpl_recovery123',
    });
  });

  it.each(['failure', 'cancelled', 'timed_out', 'skipped'])(
    'does not grant another recovery or verification to a %s full retry',
    conclusion => {
      const marker = normalRerunMarker();
      marker.attemptRun.conclusion = conclusion;
      expect(
        classifyProductionMarkerEvidence(evidence({ markers: [marker] }))
      ).toMatchObject({
        state: 'manual',
        reason: 'normal_rerun_not_verified',
      });
    }
  );

  it('reports an active full retry as pending at its actual attempt', () => {
    const marker = normalRerunMarker();
    marker.attemptRun.status = 'in_progress';
    marker.attemptRun.conclusion = null;
    expect(
      classifyProductionMarkerEvidence(evidence({ markers: [marker] }))
    ).toMatchObject({
      state: 'pending',
      controllerAttempt: 2,
    });
  });

  it.each([
    'head',
    'run',
    'attempt',
    'job',
    'expired',
    'name',
    'repository',
    'workflow',
  ])(
    'rejects contradictory %s evidence for a normally named retry marker',
    field => {
      const marker = normalRerunMarker();
      if (field === 'head') marker.payload.sha = 'b'.repeat(40);
      if (field === 'run') marker.payload.controllerRun = '789';
      if (field === 'attempt') marker.payload.controllerAttempt = '3';
      if (field === 'job') marker.attemptJobs[0].run_attempt = 1;
      if (field === 'expired') marker.artifact.expired = true;
      if (field === 'name') marker.artifact.name = 'forged-marker';
      if (field === 'repository')
        marker.attemptRun.head_repository.full_name = 'other/repo';
      if (field === 'workflow')
        marker.attemptRun.path = '.github/workflows/untrusted.yml';
      expect(
        classifyProductionMarkerEvidence(evidence({ markers: [marker] })).state
      ).toBe('manual');
    }
  );

  it('rejects a second primary marker and a recovery lease beside the normal retry', () => {
    expect(
      classifyProductionMarkerEvidence(
        evidence({
          markers: [primaryMarker('completed', 'success'), normalRerunMarker()],
        })
      )
    ).toMatchObject({ state: 'manual', reason: 'duplicate_primary_marker' });
    expect(
      classifyProductionMarkerEvidence(
        evidence({
          markers: [normalRerunMarker()],
          recoveryArtifacts: [recoveryLease().artifact],
        })
      )
    ).toMatchObject({
      state: 'manual',
      reason: 'recovery_evidence_after_verified_primary',
    });
  });

  it('classifies the recorded live REST attempt and exact job display names', () => {
    const fixture = JSON.parse(readFileSync(liveFixturePath, 'utf8'));
    const liveRun = fixture.run;
    const allJobs = normalizeProductionJobs(fixture.exact_attempt_jobs);
    const relevantJobs = allJobs.filter((entry: { name: string }) =>
      [
        'Production Release / Centralized production rollback',
        'Production Verified',
      ].includes(entry.name)
    );
    const result = classifyProductionMarkerEvidence({
      sha: liveRun.head_sha,
      repo: liveRun.head_repository.full_name,
      controllerWorkflowId: fixture.workflow.id,
      markers: [
        {
          artifact: {
            id: 999,
            name: `production-generation-verified-${liveRun.head_sha}`,
            expired: false,
            workflowRunId: liveRun.id,
          },
          payload: {
            sha: liveRun.head_sha,
            deploymentId: 'dpl_recorded123',
            controllerRun: String(liveRun.id),
            controllerAttempt: String(liveRun.run_attempt),
          },
          attemptRun: liveRun,
          attemptJobs: allJobs,
        },
      ],
      recoveryArtifacts: [],
      latestRun: liveRun,
    });

    expect(allJobs).toHaveLength(17);
    expect(relevantJobs.map((entry: { name: string }) => entry.name)).toEqual([
      'Production Release / Centralized production rollback',
      'Production Verified',
    ]);
    expect(result).toMatchObject({
      state: 'recovery_available',
      reason: 'one_interrupted_marker_safe_to_rerun',
    });
  });

  it('fails closed on incomplete or malformed exact-attempt job listings', () => {
    const fixture = JSON.parse(readFileSync(liveFixturePath, 'utf8'));
    expect(() =>
      normalizeProductionJobs({
        ...fixture.exact_attempt_jobs,
        total_count: fixture.exact_attempt_jobs.total_count + 1,
      })
    ).toThrow('Incomplete exact-attempt jobs listing');

    const malformed = structuredClone(fixture.exact_attempt_jobs);
    delete malformed.jobs[0].id;
    expect(() => normalizeProductionJobs(malformed)).toThrow(
      'Incomplete exact-attempt jobs listing'
    );
  });

  it('keeps a successful attempt-1 marker authoritative while latest attempt 2 is active', () => {
    const result = classifyProductionMarkerEvidence(
      evidence({
        markers: [primaryMarker('completed', 'success')],
        latestRun: run(2, 'in_progress', null),
      })
    );

    expect(result).toMatchObject({
      state: 'verified',
      controllerAttempt: 1,
    });
  });

  it('authorizes one full rerun only for one safe interrupted primary marker', () => {
    expect(classifyProductionMarkerEvidence(evidence())).toMatchObject({
      state: 'recovery_available',
      reason: 'one_interrupted_marker_safe_to_rerun',
      controllerRun,
      controllerAttempt: 1,
      deploymentId: 'dpl_primary123',
    });

    expect(
      classifyProductionMarkerEvidence(
        evidence({
          latestRun: run(2, 'in_progress', null),
          actor: { runId: controllerRun, attempt: 2 },
        })
      )
    ).toMatchObject({
      state: 'recovery_available',
      reason: 'current_recovery_attempt_requires_lease',
      deploymentId: 'dpl_primary123',
    });
  });

  it('treats an exhausted lease as manual and an active leased attempt as pending', () => {
    const lease = recoveryLease();
    expect(
      classifyProductionMarkerEvidence(
        evidence({
          recoveryArtifacts: [lease.artifact],
          recoveryPayload: lease.payload,
          recoveryAttemptRun: run(2, 'completed', 'failure'),
        })
      )
    ).toMatchObject({ state: 'manual', reason: 'recovery_lease_consumed' });

    expect(
      classifyProductionMarkerEvidence(
        evidence({
          recoveryArtifacts: [lease.artifact],
          recoveryPayload: lease.payload,
          recoveryAttemptRun: run(2, 'in_progress', null),
        })
      )
    ).toMatchObject({ state: 'pending', controllerAttempt: 2 });
  });

  it.each([
    ['missing', []],
    [
      'duplicate',
      [
        job(
          'Production Release / Centralized production rollback',
          1,
          'completed',
          'skipped'
        ),
        job(
          'Other / Centralized production rollback',
          1,
          'completed',
          'skipped'
        ),
      ],
    ],
    [
      'wrong attempt',
      [
        {
          ...job(
            'Production Release / Centralized production rollback',
            1,
            'completed',
            'skipped'
          ),
          run_attempt: 2,
        },
      ],
    ],
    [
      'wrong run',
      [
        {
          ...job(
            'Production Release / Centralized production rollback',
            1,
            'completed',
            'skipped'
          ),
          run_id: controllerRun + 1,
        },
      ],
    ],
    [
      'wrong head',
      [
        {
          ...job(
            'Production Release / Centralized production rollback',
            1,
            'completed',
            'skipped'
          ),
          head_sha: 'b'.repeat(40),
        },
      ],
    ],
    [
      'queued',
      [
        job(
          'Production Release / Centralized production rollback',
          1,
          'queued',
          null
        ),
      ],
    ],
    [
      'not skipped',
      [
        job(
          'Production Release / Centralized production rollback',
          1,
          'completed',
          'success'
        ),
      ],
    ],
  ])('fails closed for %s rollback evidence', (_name, rollbacks) => {
    const marker = primaryMarker('completed', 'cancelled');
    marker.attemptJobs = [
      job('Production Verified', 1, 'completed', 'cancelled'),
      ...rollbacks,
    ];
    expect(
      classifyProductionMarkerEvidence(evidence({ markers: [marker] }))
    ).toMatchObject({
      state: 'manual',
      reason: 'unsafe_or_contradictory_rollback',
    });
  });

  it('binds a starvation-lease marker only to a proven descendant controller head', () => {
    const head = 'b'.repeat(40);
    const marker = primaryMarker('completed', 'success');
    marker.attemptRun.head_sha = head;
    for (const attemptJob of marker.attemptJobs) attemptJob.head_sha = head;

    expect(
      classifyProductionMarkerEvidence(evidence({ markers: [marker] }))
    ).toMatchObject({
      state: 'manual',
      reason: 'contradictory_marker_attempt',
    });
    expect(
      classifyProductionMarkerEvidence(
        evidence({ markers: [marker], descendantHeads: [head] })
      )
    ).toMatchObject({ state: 'verified', controllerAttempt: 1 });
    expect(
      classifyProductionMarkerEvidence(
        evidence({ markers: [marker], descendantHeads: ['c'.repeat(40)] })
      )
    ).toMatchObject({
      state: 'manual',
      reason: 'contradictory_marker_attempt',
    });
    for (const descendantHeads of [[sha], ['not-a-sha'], 'b'.repeat(40)]) {
      expect(
        classifyProductionMarkerEvidence(
          evidence({ markers: [marker], descendantHeads })
        )
      ).toMatchObject({ state: 'manual', reason: 'invalid_context' });
    }
  });

  it('keeps a promoted-then-superseded generation verified on its descendant controller head', () => {
    const head = 'b'.repeat(40);
    const marker = primaryMarker('completed', 'success');
    marker.attemptRun.head_sha = head;
    for (const attemptJob of marker.attemptJobs) attemptJob.head_sha = head;
    marker.payload.terminalReason = 'skipped_superseded';

    expect(
      classifyProductionMarkerEvidence(
        evidence({
          markers: [marker],
          descendantHeads: [head],
          recoveryArtifacts: [],
        })
      )
    ).toMatchObject({
      state: 'verified',
      reason: 'exact_attempt_verified',
      controllerAttempt: 1,
      deploymentId: 'dpl_primary123',
    });
  });

  it('prints the classifier reason when a deployed marker cannot be a release base', () => {
    const deployed = sha;
    const release = 'b'.repeat(40);
    expect(
      admitReleaseBase(
        {
          state: 'manual',
          reason: 'evidence_api_error',
          detail: 'refusing to output binary content\n(application/zip)',
        },
        deployed,
        release
      )
    ).toEqual({
      ok: false,
      errors: [
        'Canonical production marker state is not admissible as a release base (manual: evidence_api_error).',
        'refusing to output binary content (application/zip)',
      ],
    });
    expect(
      admitReleaseBase(
        {
          state: 'manual',
          reason: 'duplicate_primary_marker',
          detail: 'duplicate_primary_marker',
        },
        deployed,
        release
      ).errors
    ).toEqual([
      'Canonical production marker state is not admissible as a release base (manual: duplicate_primary_marker).',
    ]);
    expect(
      admitReleaseBase(
        {
          state: 'verified',
          reason: 'exact_attempt_verified',
          deploymentId: 'dpl_primary123',
        },
        deployed,
        release
      )
    ).toEqual({ ok: true, errors: [] });
    expect(
      admitReleaseBase(
        {
          state: 'verified',
          reason: 'exact_attempt_verified',
          deploymentId: 'not-applicable',
        },
        deployed,
        release
      ).ok
    ).toBe(false);
    expect(
      admitReleaseBase(
        { state: 'none', reason: 'no_marker' },
        deployed,
        deployed
      ).ok
    ).toBe(false);
    expect(
      admitReleaseBase(
        { state: 'none', reason: 'no_marker' },
        deployed,
        release
      )
    ).toMatchObject({
      ok: true,
      warning: expect.stringContaining(deployed),
    });
  });

  describe('post-verification publication failure (JOV-7724)', () => {
    // Exact attempt-1 job shape of Production Controller run 37144574062:
    // head c75c559 descends from the deployed generation, Production
    // Verified passed, and only the customer changelog publication failed.
    const run37144574062: Array<[string, string]> = [
      ['Bind completed staging to source CI', 'success'],
      ['Coalesce release wave', 'success'],
      ['Authorize fleet deployment state', 'success'],
      ['Authorize exact main CI evidence', 'success'],
      ['Production Release / Check current main before release', 'success'],
      [
        'Production Release / Recheck main before production mutation',
        'success',
      ],
      ['Production Release / deploy-staging', 'skipped'],
      ['Production Release / Canary Health Gate (staging)', 'skipped'],
      ['Production Release / Recheck main before staging alias', 'skipped'],
      ['Production Release / Attest staging build provenance', 'skipped'],
      [
        'Production Release / Alias verified preview to staging.jov.ie',
        'skipped',
      ],
      [
        'Production Release / Preserve exact staging deployment receipt',
        'skipped',
      ],
      ['Production Release / Migrate production database', 'success'],
      ['Production Release / Promote to Production', 'success'],
      ['Production Release / Production OAuth Gate (observational)', 'success'],
      [
        'Production Release / Production public-profile alias usable-result gate',
        'success',
      ],
      ['Production Release / Sentry Error Gate (production)', 'success'],
      [
        'Production Release / File Vercel production deploy remediation',
        'success',
      ],
      ['Production Release / Centralized production rollback', 'skipped'],
      ['Production Release / Production release result', 'success'],
      ['Lighthouse CI (Production)', 'success'],
      ['Post-Deploy Smoke (Production)', 'success'],
      ['Post-Deploy Auth Smoke (Production)', 'success'],
      ['File post-deploy smoke remediation', 'success'],
      ['File post-deploy auth remediation', 'success'],
      ['Production Verified', 'success'],
      ['Publish verified customer changelog', 'failure'],
    ];
    const head = 'c'.repeat(40);

    function replayMarker(
      jobs: Array<[string, string]> = run37144574062,
      runHead = head
    ) {
      const marker = primaryMarker('completed', 'failure');
      marker.attemptRun.head_sha = runHead;
      marker.attemptJobs = jobs.map(([name, conclusion], index) => ({
        ...job(name, 1, 'completed', conclusion),
        id: 5000 + index,
        head_sha: runHead,
      }));
      return marker;
    }

    it('keeps run 37144574062 verified when only publication failed', () => {
      expect(
        classifyProductionMarkerEvidence(
          evidence({
            markers: [replayMarker()],
            latestRun: run(1, 'completed', 'failure'),
            descendantHeads: [head],
          })
        )
      ).toMatchObject({
        state: 'verified',
        reason: 'exact_attempt_verified',
        controllerAttempt: 1,
        deploymentId: 'dpl_primary123',
      });
    });

    it('stays verified when the run was cancelled during publication only', () => {
      const jobs: Array<[string, string]> = [
        ...run37144574062.slice(0, -1),
        ['Publish verified customer changelog', 'cancelled'],
      ];
      const marker = replayMarker(jobs, sha);
      marker.attemptRun.conclusion = 'cancelled';
      expect(
        classifyProductionMarkerEvidence(
          evidence({
            markers: [marker],
            latestRun: run(1, 'completed', 'cancelled'),
          })
        )
      ).toMatchObject({ state: 'verified' });
    });

    it('keeps a cancelled run interrupted when a deploy job was cancelled', () => {
      const jobs = run37144574062.map(([n, c]): [string, string] =>
        n === 'Production Release / Promote to Production'
          ? [n, 'cancelled']
          : [n, c]
      );
      const marker = replayMarker(jobs, sha);
      marker.attemptRun.conclusion = 'cancelled';
      expect(
        classifyProductionMarkerEvidence(
          evidence({
            markers: [marker],
            latestRun: run(1, 'completed', 'cancelled'),
          })
        ).state
      ).toBe('recovery_available');
    });

    it('stays verified when the publication remediation filer also failed', () => {
      const jobs: Array<[string, string]> = [
        ...run37144574062,
        ['File customer changelog remediation', 'failure'],
      ];
      expect(
        classifyProductionMarkerEvidence(
          evidence({ markers: [replayMarker(jobs, sha)] })
        )
      ).toMatchObject({ state: 'verified' });
    });

    it('still treats any other failure as an interrupted generation', () => {
      const withFailure = (name: string, conclusion = 'failure') =>
        run37144574062.map(([jobName, result]): [string, string] => [
          jobName,
          jobName === name ? conclusion : result,
        ]);
      for (const jobs of [
        withFailure('Post-Deploy Smoke (Production)'),
        withFailure('Production Verified'),
        withFailure(
          'Production Release / Production release result',
          'cancelled'
        ),
      ]) {
        expect(
          classifyProductionMarkerEvidence(
            evidence({ markers: [replayMarker(jobs, sha)] })
          )
        ).toMatchObject({
          state: 'recovery_available',
          reason: 'one_interrupted_marker_safe_to_rerun',
        });
      }
    });

    it('hands an interrupted run 37144574062 to the in-band heal inputs (JOV-7773)', () => {
      const jobs = run37144574062.map(([name, result]): [string, string] => [
        name,
        name === 'File post-deploy smoke remediation' ? 'failure' : result,
      ]);
      // The heal job dispatches marker recovery with exactly these fields;
      // recovery admission requires this classification and identity.
      expect(
        classifyProductionMarkerEvidence(
          evidence({
            markers: [replayMarker(jobs)],
            latestRun: run(1, 'completed', 'failure'),
            descendantHeads: [head],
          })
        )
      ).toMatchObject({
        state: 'recovery_available',
        reason: 'one_interrupted_marker_safe_to_rerun',
        controllerRun,
        controllerAttempt: 1,
        deploymentId: 'dpl_primary123',
      });
    });

    it('never tolerates publication failure after an executed rollback', () => {
      const jobs = run37144574062.map(([name, result]): [string, string] => [
        name,
        name.endsWith('Centralized production rollback') ? 'success' : result,
      ]);
      expect(
        classifyProductionMarkerEvidence(
          evidence({ markers: [replayMarker(jobs, sha)] })
        )
      ).not.toMatchObject({ state: 'verified' });
    });

    it('does not bind the descendant head without ancestry proof', () => {
      expect(
        classifyProductionMarkerEvidence(
          evidence({ markers: [replayMarker()] })
        )
      ).toMatchObject({
        state: 'manual',
        reason: 'contradictory_marker_attempt',
      });
    });
  });

  it('rejects marker payload, artifact, run, and attempt mismatches', () => {
    const marker = primaryMarker('completed', 'cancelled');
    marker.payload.controllerRun = String(controllerRun + 1);
    expect(
      classifyProductionMarkerEvidence(evidence({ markers: [marker] }))
    ).toMatchObject({ state: 'manual' });

    const wrongAttempt = primaryMarker('completed', 'cancelled');
    wrongAttempt.payload.controllerAttempt = '2';
    expect(
      classifyProductionMarkerEvidence(evidence({ markers: [wrongAttempt] }))
    ).toMatchObject({ state: 'manual' });

    const wrongArtifact = primaryMarker('completed', 'cancelled');
    wrongArtifact.artifact.workflowRunId = controllerRun + 1;
    expect(
      classifyProductionMarkerEvidence(evidence({ markers: [wrongArtifact] }))
    ).toMatchObject({ state: 'manual' });

    const missingJobId = primaryMarker('completed', 'cancelled');
    delete (missingJobId.attemptJobs[0] as { id?: number }).id;
    expect(
      classifyProductionMarkerEvidence(evidence({ markers: [missingJobId] }))
    ).toMatchObject({
      state: 'manual',
      reason: 'contradictory_verified_job',
    });
  });

  it('preserves immutable primary evidence and verifies a distinct leased recovery marker', () => {
    const lease = recoveryLease();
    const result = classifyProductionMarkerEvidence(
      evidence({
        markers: [
          primaryMarker('completed', 'cancelled'),
          recoveryMarker('completed', 'success'),
        ],
        recoveryArtifacts: [lease.artifact],
        recoveryPayload: lease.payload,
        recoveryAttemptRun: run(2, 'completed', 'success'),
      })
    );
    expect(result).toMatchObject({
      state: 'verified',
      reason: 'exact_recovery_attempt_verified',
      controllerAttempt: 2,
    });
  });

  it('rejects any recovery evidence after a successful primary marker', () => {
    const lease = recoveryLease();
    expect(
      classifyProductionMarkerEvidence(
        evidence({
          markers: [primaryMarker('completed', 'success')],
          recoveryArtifacts: [lease.artifact],
          recoveryPayload: lease.payload,
          recoveryAttemptRun: run(2, 'in_progress', null),
        })
      )
    ).toMatchObject({
      state: 'manual',
      reason: 'recovery_evidence_after_verified_primary',
    });

    expect(
      classifyProductionMarkerEvidence(
        evidence({
          markers: [
            primaryMarker('completed', 'success'),
            recoveryMarker('in_progress', null),
          ],
        })
      )
    ).toMatchObject({ state: 'manual' });
  });
});

describe('recovered production marker state', () => {
  it('binds the post-write exception to exactly one live recovery workflow step', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../../../../../.github/scripts/production-marker-state.mjs'
      ),
      'utf8'
    );
    const dispatchName = source.match(/const dispatchName = '([^']+)'/)?.[1];
    const workflow = readFileSync(
      resolve(
        testDir,
        '../../../../../.github/workflows/production-marker-recovery.yml'
      ),
      'utf8'
    );
    expect(dispatchName).toBeTruthy();
    expect(
      [...workflow.matchAll(/^\s+- name: (.+)$/gm)].filter(
        match => match[1] === dispatchName
      )
    ).toHaveLength(1);
  });

  const recoveryRunId = 789;

  function markerRecoveryRun(
    status: string,
    conclusion: string | null,
    event = 'workflow_dispatch'
  ) {
    return {
      id: recoveryRunId,
      run_attempt: 1,
      workflow_id: workflowId + 1,
      path: '.github/workflows/production-marker-recovery.yml',
      // workflow_run jobs execute from the then-current default branch. The
      // recovered generation is authenticated by the payload-bound source
      // controller, not this downstream checkout SHA.
      head_sha: 'c'.repeat(40),
      head_branch: 'main',
      head_repository: { full_name: repo },
      event,
      status,
      conclusion,
    };
  }

  function recoveredMarker() {
    return {
      artifact: {
        id: 21,
        name: `production-generation-verified-${sha}`,
        expired: false,
        workflowRunId: recoveryRunId,
      },
      payload: {
        sha,
        deploymentId: 'dpl_recovered123',
        controllerRun: String(recoveryRunId),
        controllerAttempt: '1',
        recoveredFromControllerRun: String(controllerRun),
        recoveredFromControllerAttempt: '1',
      },
      attemptRun: markerRecoveryRun('completed', 'success'),
      attemptJobs: [] as MarkerJob[],
      originalRun: run(1, 'completed', 'failure'),
      originalJobs: [
        job(
          'Production Release / Centralized production rollback',
          1,
          'completed',
          'skipped'
        ),
      ],
    };
  }

  function convergedMarkers() {
    const recovered = recoveredMarker();
    recovered.attemptRun.event = 'workflow_run';
    const retry = recoveryMarker('completed', 'success');
    retry.artifact.name = recovered.artifact.name;
    retry.payload.deploymentId = recovered.payload.deploymentId;
    return { recovered, retry };
  }

  it.each([
    [1, false],
    [1, true],
    [2, false],
    [2, true],
  ] as const)(
    'accepts independently verified recovery attempt %s and retry (reverse=%s)',
    (recoveryAttempt, reverse) => {
      const { recovered, retry } = convergedMarkers();
      recovered.payload.controllerAttempt = String(recoveryAttempt);
      recovered.attemptRun.run_attempt = recoveryAttempt;
      const markers = reverse ? [retry, recovered] : [recovered, retry];
      expect(
        classifyProductionMarkerEvidence(evidence({ markers }))
      ).toMatchObject({
        state: 'verified',
        reason: 'exact_recovery_and_retry_verified',
        controllerRun,
        controllerAttempt: 2,
        deploymentId: recovered.payload.deploymentId,
      });
    }
  );

  it.each([
    'deployment',
    'source-run',
    'source-attempt',
    'successful-source',
    'expired',
    'rollback',
    'active-retry',
    'failed-retry',
    'missing-verified-job',
    'wrong-sha',
    'foreign-recovery',
    'duplicate-retry',
    'duplicate-recovery',
    'lease',
    'third-marker',
    'artifact-id',
  ])('refuses contradictory converged marker evidence: %s', fault => {
    const { recovered, retry } = convergedMarkers();
    let markers = [recovered, retry];
    if (fault === 'deployment') retry.payload.deploymentId = 'dpl_other';
    if (fault === 'source-run') {
      recovered.payload.recoveredFromControllerRun = '999';
      recovered.originalRun.id = 999;
      recovered.originalJobs[0].run_id = 999;
    }
    if (fault === 'source-attempt') {
      recovered.payload.recoveredFromControllerAttempt = '2';
      recovered.originalRun.run_attempt = 2;
      recovered.originalJobs[0].run_attempt = 2;
    }
    if (fault === 'successful-source')
      recovered.originalRun.conclusion = 'success';
    if (fault === 'expired') recovered.artifact.expired = true;
    if (fault === 'rollback') recovered.originalJobs[0].conclusion = 'success';
    if (fault === 'active-retry') {
      retry.attemptRun.status = 'in_progress';
      retry.attemptRun.conclusion = null;
    }
    if (fault === 'failed-retry') retry.attemptRun.conclusion = 'failure';
    if (fault === 'missing-verified-job') retry.attemptJobs = [];
    if (fault === 'wrong-sha') retry.payload.sha = 'f'.repeat(40);
    if (fault === 'foreign-recovery')
      recovered.attemptRun.head_repository.full_name = 'foreign/repo';
    if (fault === 'duplicate-retry') markers = [retry, retry];
    if (fault === 'duplicate-recovery') markers = [recovered, recovered];
    if (fault === 'third-marker') markers.push(retry);
    if (fault === 'artifact-id') retry.artifact.id = recovered.artifact.id;
    expect(
      classifyProductionMarkerEvidence(
        evidence({
          markers,
          recoveryArtifacts:
            fault === 'lease' ? [recoveryLease().artifact] : [],
        })
      ).state
    ).toBe('manual');
  });

  it.each([
    'stable',
    'reordered',
    'new-marker',
    'new-recovery-marker',
    'new-lease',
    'expired',
    'removed',
    'changed-run',
  ])(
    'validates final artifact snapshot through the real CLI reader: %s',
    async change => {
      const { recovered, retry } = convergedMarkers();
      const markers = [recovered, retry];
      const listingReads = new Map<string, number>();
      let downloaded: { payload: unknown } = retry;
      const calls: string[] = [];
      processRunner.mockImplementation((command: string, args: string[]) => {
        const endpoint = args[1];
        calls.push(`${command} ${args.join(' ')}`);
        let output: string | Buffer;
        if (command === 'unzip')
          output =
            args[0] === '-Z1'
              ? 'production-generation-verified.json\n'
              : JSON.stringify(downloaded.payload);
        else if (endpoint.endsWith('/zip')) {
          downloaded = markers.find(m =>
            endpoint.includes(`/artifacts/${m.artifact.id}/`)
          )!;
          output = Buffer.from('archive');
        } else if (endpoint.includes('/artifacts?')) {
          const read = (listingReads.get(endpoint) ?? 0) + 1;
          listingReads.set(endpoint, read);
          const normalName = endpoint.includes(
            `name=production-generation-verified-${sha}&`
          );
          const listing = normalName
            ? markers.map(m => ({
                ...m.artifact,
                workflow_run: { id: m.artifact.workflowRunId },
              }))
            : [];
          if (read > 1 && normalName) {
            if (change === 'reordered') listing.reverse();
            if (change === 'new-marker')
              listing.push({ ...listing[0], id: 900 });
            if (change === 'expired') listing[0].expired = true;
            if (change === 'removed') listing.pop();
            if (change === 'changed-run') listing[0].workflow_run.id = 999;
          }
          if (
            read > 1 &&
            change === 'new-recovery-marker' &&
            endpoint.includes(
              `name=production-generation-verified-recovery-${sha}&`
            )
          ) {
            const artifact = recoveryMarker('completed', 'success').artifact;
            listing.push({
              ...artifact,
              workflow_run: { id: artifact.workflowRunId },
            });
          }
          if (
            read > 1 &&
            change === 'new-lease' &&
            endpoint.includes(`name=production-generation-recovery-${sha}&`)
          ) {
            const lease = recoveryLease().artifact;
            listing.push({
              ...lease,
              workflow_run: { id: lease.workflowRunId },
            });
          }
          output = JSON.stringify({
            total_count: listing.length,
            artifacts: listing,
          });
        } else {
          const original = endpoint.includes(`/${controllerRun}/attempts/1`);
          const marker = endpoint.includes(`/${recoveryRunId}/`)
            ? recovered
            : retry;
          output = JSON.stringify(
            endpoint.includes('/jobs?')
              ? {
                  total_count: original
                    ? recovered.originalJobs.length
                    : marker.attemptJobs.length,
                  jobs: original ? recovered.originalJobs : marker.attemptJobs,
                }
              : original
                ? recovered.originalRun
                : marker.attemptRun
          );
        }
        return { status: 0, stdout: output, stderr: '' };
      });
      const argv = process.argv;
      const output = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation(() => true);
      try {
        process.argv = [
          process.execPath,
          resolve(
            testDir,
            '../../../../../.github/scripts/production-marker-state.mjs'
          ),
          '--sha',
          sha,
          '--repo',
          repo,
          '--controller-workflow-id',
          String(workflowId),
        ];
        vi.resetModules();
        await import(
          '../../../../../.github/scripts/production-marker-state.mjs'
        );
        expect(JSON.parse(String(output.mock.calls.at(-1)?.[0]))).toMatchObject(
          change === 'stable' || change === 'reordered'
            ? {
                state: 'verified',
                reason: 'exact_recovery_and_retry_verified',
                controllerRun,
                controllerAttempt: 2,
              }
            : { state: 'manual', reason: 'artifact_snapshot_changed' }
        );
        expect(calls.filter(c => c.endsWith('/zip'))).toHaveLength(2);
        expect(
          calls.some(c => /--method| -X |enqueue|\/statuses/.test(c))
        ).toBe(false);
      } finally {
        process.argv = argv;
        output.mockRestore();
        processRunner.mockReset();
      }
    }
  );

  it('verifies a bounded recovered marker with exact source evidence', () => {
    const result = classifyProductionMarkerEvidence(
      evidence({ markers: [recoveredMarker()], latestRun: undefined })
    );

    expect(result).toMatchObject({
      state: 'verified',
      reason: 'exact_recovered_generation_verified',
      controllerRun: recoveryRunId,
      controllerAttempt: 1,
      deploymentId: 'dpl_recovered123',
    });
  });

  it('verifies a recovered marker that replaces its bound interrupted primary', () => {
    const interrupted = primaryMarker('completed', 'failure');
    const recovered = recoveredMarker();
    recovered.payload.deploymentId = interrupted.payload.deploymentId;

    expect(
      classifyProductionMarkerEvidence(
        evidence({ markers: [interrupted, recovered], latestRun: undefined })
      )
    ).toMatchObject({
      state: 'verified',
      reason: 'exact_recovered_generation_verified',
      controllerRun: recoveryRunId,
      controllerAttempt: 1,
      deploymentId: 'dpl_primary123',
    });
  });

  it.each([
    'source-run',
    'source-attempt',
    'deployment',
    'successful-source',
  ] as const)(
    'refuses an unbound recovered marker beside an interrupted primary: %s',
    fault => {
      const interrupted = primaryMarker('completed', 'failure');
      const recovered = recoveredMarker();
      recovered.payload.deploymentId = interrupted.payload.deploymentId;
      if (fault === 'source-run') {
        recovered.payload.recoveredFromControllerRun = '999';
        recovered.originalRun = { ...run(1, 'completed', 'failure'), id: 999 };
        recovered.originalJobs = [
          {
            ...job(
              'Production Release / Centralized production rollback',
              1,
              'completed',
              'skipped'
            ),
            run_id: 999,
          },
        ];
      }
      if (fault === 'source-attempt') {
        recovered.payload.recoveredFromControllerAttempt = '2';
        recovered.originalRun = run(2, 'completed', 'failure');
        recovered.originalJobs = [
          job(
            'Production Release / Centralized production rollback',
            2,
            'completed',
            'skipped'
          ),
        ];
      }
      if (fault === 'deployment') {
        recovered.payload.deploymentId = 'dpl_other999';
      }
      if (fault === 'successful-source') {
        recovered.originalRun = run(1, 'completed', 'success');
      }

      expect(
        classifyProductionMarkerEvidence(
          evidence({ markers: [interrupted, recovered], latestRun: undefined })
        )
      ).toMatchObject({ state: 'manual' });
    }
  );

  it('verifies event recovery when the default branch advanced after promotion', () => {
    const marker = recoveredMarker();
    marker.attemptRun = markerRecoveryRun(
      'completed',
      'success',
      'workflow_run'
    );

    expect(
      classifyProductionMarkerEvidence(
        evidence({ markers: [marker], latestRun: undefined })
      )
    ).toMatchObject({
      state: 'verified',
      reason: 'exact_recovered_generation_verified',
      controllerRun: recoveryRunId,
      controllerAttempt: 1,
    });
  });

  it('rejects event recovery bound to a different source generation', () => {
    const marker = recoveredMarker();
    marker.attemptRun = markerRecoveryRun(
      'completed',
      'success',
      'workflow_run'
    );
    marker.originalRun = {
      ...run(1, 'completed', 'failure'),
      head_sha: 'd'.repeat(40),
    };

    expect(
      classifyProductionMarkerEvidence(evidence({ markers: [marker] }))
    ).toMatchObject({
      state: 'manual',
      reason: 'contradictory_recovery_source_run',
    });
  });

  it('rejects unsupported recovery events', () => {
    const marker = recoveredMarker();
    marker.attemptRun = markerRecoveryRun('completed', 'success', 'push');

    expect(
      classifyProductionMarkerEvidence(evidence({ markers: [marker] }))
    ).toMatchObject({
      state: 'manual',
      reason: 'contradictory_marker_attempt',
    });
  });

  it('fails closed when the recovered source run was rolled back', () => {
    const marker = recoveredMarker();
    marker.originalJobs = [
      job(
        'Production Release / Centralized production rollback',
        1,
        'completed',
        'success'
      ),
    ];
    expect(
      classifyProductionMarkerEvidence(evidence({ markers: [marker] }))
    ).toMatchObject({
      state: 'manual',
      reason: 'unsafe_or_contradictory_rollback',
    });
  });

  it('fails closed when the recovery run did not complete successfully', () => {
    const marker = recoveredMarker();
    marker.attemptRun = markerRecoveryRun('completed', 'failure');
    expect(
      classifyProductionMarkerEvidence(evidence({ markers: [marker] }))
    ).toMatchObject({
      state: 'manual',
      reason: 'contradictory_marker_attempt',
    });
  });

  it('preserves exact runtime proof when only the post-write fleet dispatch failed', () => {
    const marker = recoveredMarker();
    marker.attemptRun = markerRecoveryRun('completed', 'failure');
    const successfulSteps = [
      'Validate bounded recovery request',
      'Verify canonical ownership and exact runtime probes',
      'Re-probe production Better Auth OAuth runtime',
      'Preserve recovered verified-generation marker',
      'Upload recovered verified-generation marker',
      'Confirm uploaded recovered marker bytes',
    ];
    marker.attemptJobs = [
      {
        id: 71,
        run_id: recoveryRunId,
        run_attempt: 1,
        name: 'Recover exact verified-generation marker',
        head_sha: 'c'.repeat(40),
        head_branch: 'main',
        status: 'completed',
        conclusion: 'failure',
        steps: [
          ...successfulSteps.map((name, index) => ({
            number: index + 1,
            name,
            status: 'completed',
            conclusion: 'success',
          })),
          {
            number: successfulSteps.length + 1,
            name: 'Dispatch fresh fleet and desktop reconciliation',
            status: 'completed',
            conclusion: 'failure',
          },
        ],
      },
    ];

    expect(
      classifyProductionMarkerEvidence(
        evidence({ markers: [marker], latestRun: undefined })
      )
    ).toMatchObject({
      state: 'verified',
      reason: 'exact_recovered_generation_verified',
      controllerRun: recoveryRunId,
    });
  });

  it('fails closed when the source run is not the exact controller attempt', () => {
    const marker = recoveredMarker();
    marker.originalRun = {
      ...run(1, 'completed', 'failure'),
      head_sha: 'd'.repeat(40),
    };
    expect(
      classifyProductionMarkerEvidence(evidence({ markers: [marker] }))
    ).toMatchObject({
      state: 'manual',
      reason: 'contradictory_recovery_source_run',
    });
  });

  it('fails closed when recovery provenance fields are missing', () => {
    const marker = recoveredMarker();
    delete (marker.payload as Record<string, unknown>)
      .recoveredFromControllerAttempt;
    expect(
      classifyProductionMarkerEvidence(evidence({ markers: [marker] }))
    ).toMatchObject({
      state: 'manual',
      reason: 'malformed_or_contradictory_marker',
    });
  });

  it('rejects rerun-lease evidence alongside a recovered verified marker', () => {
    const lease = recoveryLease();
    expect(
      classifyProductionMarkerEvidence(
        evidence({
          markers: [recoveredMarker()],
          recoveryArtifacts: [lease.artifact],
          recoveryPayload: lease.payload,
          recoveryAttemptRun: run(2, 'completed', 'success'),
        })
      )
    ).toMatchObject({
      state: 'manual',
      reason: 'recovery_evidence_after_verified_primary',
    });
  });

  // JOV-9971: the exact store state left by Production Marker Recovery run
  // 40976011313 for 5cbe0cb — an interrupted primary whose producer run was
  // cancelled during post-verification publication, plus the recovery
  // receipt bound to that exact producer attempt. #23801 reclassified the
  // primary as verified, which broke the interrupted-only replacement
  // pairing and froze every later release (run 40994378769,
  // duplicate_primary_marker). The pairing must follow the reclassification.
  const cancelledPublicationJobs = (): Array<[string, string]> => [
    ['Production Release / Migrate production database', 'success'],
    ['Production Release / Promote to Production', 'success'],
    ['Production Release / Sentry Error Gate (production)', 'success'],
    ['Production Release / Centralized production rollback', 'skipped'],
    ['Production Verified', 'success'],
    ['Publish verified customer changelog', 'cancelled'],
  ];

  function cancelledPublicationPrimary() {
    const marker = primaryMarker('completed', 'cancelled');
    marker.attemptJobs = cancelledPublicationJobs().map(([name, conclusion]) =>
      job(name, 1, 'completed', conclusion)
    );
    return marker;
  }

  function healedPair() {
    const primary = cancelledPublicationPrimary();
    const recovered = recoveredMarker();
    recovered.payload.deploymentId = primary.payload.deploymentId;
    recovered.originalRun = run(1, 'completed', 'cancelled');
    return { primary, recovered };
  }

  it('resolves a recovery receipt bound to a cancelled-publication primary as verified', () => {
    const { primary, recovered } = healedPair();
    expect(
      classifyProductionMarkerEvidence(
        evidence({ markers: [primary, recovered], latestRun: undefined })
      )
    ).toMatchObject({
      state: 'verified',
      reason: 'exact_recovered_generation_verified',
      controllerRun: recoveryRunId,
      deploymentId: 'dpl_primary123',
    });
  });

  it('still refuses a recovery receipt bound to a different source attempt', () => {
    const { primary, recovered } = healedPair();
    recovered.payload.recoveredFromControllerAttempt = '2';
    recovered.originalRun = run(2, 'completed', 'cancelled');
    recovered.originalJobs = [
      job(
        'Production Release / Centralized production rollback',
        2,
        'completed',
        'skipped'
      ),
    ];
    expect(
      classifyProductionMarkerEvidence(
        evidence({ markers: [primary, recovered], latestRun: undefined })
      ).state
    ).toBe('manual');
  });

  it('still refuses a recovery receipt beside a genuinely successful primary', () => {
    const primary = primaryMarker('completed', 'success');
    const recovered = recoveredMarker();
    recovered.payload.deploymentId = primary.payload.deploymentId;
    expect(
      classifyProductionMarkerEvidence(
        evidence({ markers: [primary, recovered], latestRun: undefined })
      )
    ).toMatchObject({
      state: 'manual',
      reason: 'duplicate_primary_marker',
    });
  });

  it('still refuses a recovery receipt when the deployment binding diverges', () => {
    const { primary, recovered } = healedPair();
    recovered.payload.deploymentId = 'dpl_other999';
    expect(
      classifyProductionMarkerEvidence(
        evidence({ markers: [primary, recovered], latestRun: undefined })
      ).state
    ).toBe('manual');
  });
});

describe('producer coalescence classification', () => {
  const coalescedJobs = () => [
    job(
      'Production Release / Check current main before release',
      1,
      'completed',
      'success'
    ),
    job(
      'Production Release / Promote to Production',
      1,
      'completed',
      'skipped'
    ),
    job('Production Verified', 1, 'completed', 'success'),
    job(
      'Production Release / Centralized production rollback',
      1,
      'completed',
      'skipped'
    ),
  ];

  it('recognizes the exact intentionally-superseded producer shape', () => {
    expect(
      classifyProducerCoalescence(
        run(1, 'completed', 'success'),
        coalescedJobs()
      )
    ).toBe(true);
  });

  it('recognizes the exact early release-wave no-op shape', () => {
    expect(
      classifyProducerCoalescence(
        run(1, 'completed', 'success'),
        earlyCoalescedJobs()
      )
    ).toBe(true);
  });

  it('rejects missing, duplicate, extra, active, or executed early-coalescence jobs', () => {
    const jobs = earlyCoalescedJobs();
    const malformed = [
      jobs.slice(1),
      [...jobs, jobs[0]],
      [...jobs, job('Unexpected job', 1, 'completed', 'skipped')],
      [jobs[0], jobs[0], ...jobs.slice(2)],
      ...jobs.map((_, index) =>
        jobs.map((entry, current) =>
          current === index
            ? { ...entry, status: 'in_progress', conclusion: null }
            : entry
        )
      ),
      ...jobs.map((_, index) =>
        jobs.map((entry, current) =>
          current === index
            ? { ...entry, conclusion: index === 0 ? 'skipped' : 'success' }
            : entry
        )
      ),
      ...jobs.map((_, index) =>
        jobs.map((entry, current) =>
          current === index ? { ...entry, conclusion: 'failure' } : entry
        )
      ),
    ];
    for (const evidence of malformed) {
      expect(
        classifyProducerCoalescence(run(1, 'completed', 'success'), evidence)
      ).toBe(false);
    }
  });

  it('refuses a producer that actually promoted', () => {
    const jobs = coalescedJobs();
    jobs[1] = job(
      'Production Release / Promote to Production',
      1,
      'completed',
      'success'
    );
    expect(
      classifyProducerCoalescence(run(1, 'completed', 'success'), jobs)
    ).toBe(false);
  });

  it('refuses a producer whose rollback executed', () => {
    const jobs = coalescedJobs();
    jobs[3] = job(
      'Production Release / Centralized production rollback',
      1,
      'completed',
      'success'
    );
    expect(
      classifyProducerCoalescence(run(1, 'completed', 'success'), jobs)
    ).toBe(false);
  });

  it('refuses a failed or non-controller producer run', () => {
    expect(
      classifyProducerCoalescence(
        run(1, 'completed', 'failure'),
        coalescedJobs()
      )
    ).toBe(false);
    const foreign = { ...run(1, 'completed', 'success'), path: 'other.yml' };
    expect(classifyProducerCoalescence(foreign, coalescedJobs())).toBe(false);
  });

  it('refuses missing or duplicated verified evidence', () => {
    expect(
      classifyProducerCoalescence(run(1, 'completed', 'success'), [])
    ).toBe(false);
    const duplicated = [
      ...coalescedJobs(),
      job('Production Verified', 1, 'completed', 'success'),
    ];
    expect(
      classifyProducerCoalescence(run(1, 'completed', 'success'), duplicated)
    ).toBe(false);
    expect(
      classifyProducerCoalescence(run(1, 'completed', 'success'), null)
    ).toBe(false);
  });
});

describe('newer controller supersession', () => {
  const context = {
    sha,
    repo,
    controllerRun,
    controllerWorkflowId: workflowId,
  };
  const producer = {
    ...run(1, 'completed', 'success'),
    created_at: '2026-09-10T02:16:03Z',
  };
  const candidate = (id: number, createdAt: string, overrides = {}) => ({
    ...run(1, 'completed', 'success'),
    id,
    head_sha: 'b'.repeat(40),
    created_at: createdAt,
    ...overrides,
  });

  it('selects the newest main controller run after the producer', () => {
    const newer = candidate(789, '2026-09-10T02:23:47Z');
    const oldest = candidate(790, '2026-09-10T02:20:00Z');
    expect(
      selectNewerControllerRun(producer, [oldest, newer], context)
    ).toEqual({
      run: 789,
      sha: 'b'.repeat(40),
      createdAt: '2026-09-10T02:23:47Z',
    });
  });

  it('supersedes on an in-flight newer run, not only a successful one', () => {
    const inFlight = candidate(789, '2026-09-10T02:23:47Z', {
      status: 'in_progress',
      conclusion: null,
    });
    expect(
      selectNewerControllerRun(producer, [inFlight], context)
    ).toMatchObject({ run: 789 });
    const failed = candidate(790, '2026-09-10T02:24:00Z', {
      conclusion: 'failure',
    });
    const cancelled = candidate(791, '2026-09-10T02:25:00Z', {
      conclusion: 'cancelled',
    });
    expect(
      selectNewerControllerRun(producer, [failed, cancelled], context)
    ).toMatchObject({ run: 791 });
  });

  it('never supersedes on a startup failure or a same-sha retry', () => {
    const startupFailure = candidate(789, '2026-09-10T02:23:47Z', {
      conclusion: 'startup_failure',
    });
    expect(
      selectNewerControllerRun(producer, [startupFailure], context)
    ).toBeNull();
    const sameSha = candidate(790, '2026-09-10T02:23:47Z', {
      head_sha: sha,
    });
    expect(selectNewerControllerRun(producer, [sameSha], context)).toBeNull();
  });

  it('returns null when nothing newer exists', () => {
    expect(
      selectNewerControllerRun(
        producer,
        [candidate(789, '2026-09-10T02:00:00Z')],
        context
      )
    ).toBeNull();
    expect(selectNewerControllerRun(producer, [], context)).toBeNull();
    expect(selectNewerControllerRun(producer, null, context)).toBeNull();
  });

  it('ignores the producer itself and foreign runs', () => {
    expect(
      selectNewerControllerRun(
        producer,
        [candidate(controllerRun, '2026-09-10T03:00:00Z')],
        context
      )
    ).toBeNull();
    const otherBranch = candidate(790, '2026-09-10T03:00:00Z', {
      head_branch: 'fix/x',
    });
    const otherWorkflow = candidate(791, '2026-09-10T03:00:00Z', {
      path: '.github/workflows/ci.yml',
    });
    const malformedSha = candidate(792, '2026-09-10T03:00:00Z', {
      head_sha: 'not-a-sha',
    });
    expect(
      selectNewerControllerRun(
        producer,
        [otherBranch, otherWorkflow, malformedSha],
        context
      )
    ).toBeNull();
  });

  it('fails closed on malformed producer evidence', () => {
    expect(
      selectNewerControllerRun(
        null,
        [candidate(789, '2026-09-10T03:00:00Z')],
        context
      )
    ).toBeNull();
    const noTimestamp = { ...producer, created_at: undefined };
    expect(
      selectNewerControllerRun(
        noTimestamp,
        [candidate(789, '2026-09-10T03:00:00Z')],
        context
      )
    ).toBeNull();
    const foreignProducer = { ...producer, head_branch: 'fix/x' };
    expect(
      selectNewerControllerRun(
        foreignProducer,
        [candidate(789, '2026-09-10T03:00:00Z')],
        context
      )
    ).toBeNull();
  });
});

describe('producer activation evidence CLI', () => {
  const producerCreatedAt = '2026-09-10T02:16:03Z';
  const coalescedJobs = [
    job(
      'Production Release / Check current main before release',
      1,
      'completed',
      'success'
    ),
    job(
      'Production Release / Promote to Production',
      1,
      'completed',
      'skipped'
    ),
    job('Production Verified', 1, 'completed', 'success'),
    job(
      'Production Release / Centralized production rollback',
      1,
      'completed',
      'skipped'
    ),
  ];

  async function runCliWithProducerEvidence(
    supersede: boolean,
    producerJobs = coalescedJobs,
    successorSha = 'b'.repeat(40)
  ) {
    const calls: string[] = [];
    processRunner.mockImplementation((command: string, args: string[]) => {
      const endpoint = args[1];
      calls.push(`${command} ${args.join(' ')}`);
      let output: string;
      if (command === 'gh' && args[0] === 'api') {
        if (endpoint.includes('/artifacts?')) {
          output = JSON.stringify({ total_count: 0, artifacts: [] });
        } else if (
          endpoint === `repos/${repo}/actions/runs/${controllerRun}/attempts/1`
        ) {
          output = JSON.stringify({
            ...run(1, 'completed', 'success'),
            created_at: producerCreatedAt,
          });
        } else if (
          endpoint ===
          `repos/${repo}/actions/runs/${controllerRun}/attempts/1/jobs?per_page=100`
        ) {
          output = JSON.stringify({
            total_count: producerJobs.length,
            jobs: producerJobs,
          });
        } else if (
          endpoint ===
          `repos/${repo}/actions/workflows/${workflowId}/runs?branch=main&per_page=30`
        ) {
          output = JSON.stringify({
            total_count: supersede ? 1 : 0,
            workflow_runs: supersede
              ? [
                  {
                    ...run(1, 'in_progress', null),
                    id: 789,
                    head_sha: successorSha,
                    created_at: '2026-09-10T02:23:47Z',
                  },
                ]
              : [],
          });
        } else {
          throw new Error(`unexpected endpoint ${endpoint}`);
        }
      } else {
        throw new Error(`unexpected command ${command}`);
      }
      return { status: 0, stdout: output, stderr: '' };
    });
    const argv = process.argv;
    const output = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    try {
      process.argv = [
        process.execPath,
        resolve(
          testDir,
          '../../../../../.github/scripts/production-marker-state.mjs'
        ),
        '--sha',
        sha,
        '--repo',
        repo,
        '--controller-workflow-id',
        String(workflowId),
        '--producer-run-id',
        String(controllerRun),
        '--producer-attempt',
        '1',
      ];
      vi.resetModules();
      await import(
        '../../../../../.github/scripts/production-marker-state.mjs'
      );
      return {
        result: JSON.parse(String(output.mock.calls.at(-1)?.[0])),
        calls,
      };
    } finally {
      process.argv = argv;
      output.mockRestore();
      processRunner.mockReset();
    }
  }

  it('keeps an early no-op unverified even with a same-SHA successor', async () => {
    const { result } = await runCliWithProducerEvidence(
      true,
      earlyCoalescedJobs(),
      sha
    );
    expect(result).toMatchObject({
      state: 'none',
      reason: 'no_marker',
      coalesced: true,
    });
    expect(result.supersededBy).toBeUndefined();
    expect(result.deploymentId).toBeUndefined();
  });

  it('does not classify an early producer with jobs from another attempt', async () => {
    const jobs = earlyCoalescedJobs().map(entry => ({
      ...entry,
      run_attempt: 2,
    }));
    const { result } = await runCliWithProducerEvidence(false, jobs);
    expect(result).toMatchObject({ state: 'none', reason: 'no_marker' });
    expect(result.coalesced).toBeUndefined();
  });

  it('marks a coalesced producer superseded by a newer in-flight run', async () => {
    const { result } = await runCliWithProducerEvidence(true);
    expect(result).toMatchObject({
      state: 'none',
      reason: 'no_marker',
      coalesced: true,
      supersededBy: {
        run: 789,
        sha: 'b'.repeat(40),
        createdAt: '2026-09-10T02:23:47Z',
      },
    });
  });

  it('marks coalescence without supersession evidence when nothing newer succeeded', async () => {
    const { result, calls } = await runCliWithProducerEvidence(false);
    expect(result).toMatchObject({
      state: 'none',
      reason: 'no_marker',
      coalesced: true,
    });
    expect(result.supersededBy).toBeUndefined();
    expect(
      calls.every(
        call => call.startsWith('gh api repos/') || call.startsWith('unzip ')
      )
    ).toBe(true);
  });
});

// R1 characterization for the release-lease split (fleet/release-lease-split-design.md).
// These pin TODAY's behavior so the classifier rewrite (verification run as the
// authority, a promoted SHA is never `none`) shows up as an intentional diff, not
// an accident. Each case names the hazard the adversarial review found; the R1
// change flips the cases marked FLIPS in R1 and keeps the rest.
describe('R1 characterization: states the lease split must not leave admissible', () => {
  const live = 'b'.repeat(40);

  it('FLIPS in R1: a generation with no marker is `none`, and a foreign live SHA is admitted as bootstrap', () => {
    // After the split, the controller run for a promoted generation completes
    // while its verification is still running, so its marker is still absent.
    const result = classifyProductionMarkerEvidence(
      evidence({ markers: [], recoveryArtifacts: [] })
    );
    expect(result).toEqual({ state: 'none', reason: 'no_marker' });
    const admission = admitReleaseBase(result, live, sha);
    expect(admission.ok).toBe(true);
    expect(admission.warning).toContain('Bootstrapping the release range');
    // R1: a SHA our controller promoted must classify PENDING (verification
    // active), FAIL (failed or rolled back) or UNREADABLE (past deadline),
    // never `none`, and none of those may be admissible.
  });

  it('keeps refusing to bootstrap the release SHA from its own missing marker', () => {
    const result = classifyProductionMarkerEvidence(evidence({ markers: [] }));
    expect(admitReleaseBase(result, sha, sha)).toMatchObject({
      ok: false,
      errors: [
        'Current production cannot bootstrap its own missing verified marker.',
      ],
    });
  });

  it('FLIPS in R1: a marker whose run is not the production controller is rejected (verification-run markers would stall releases)', () => {
    const marker = primaryMarker('completed', 'success');
    marker.attemptRun = {
      ...marker.attemptRun,
      path: '.github/workflows/production-verification.yml',
    };
    const result = classifyProductionMarkerEvidence(
      evidence({ markers: [marker] })
    );
    expect(result.state).toBe('manual');
    expect(admitReleaseBase(result, live, sha).ok).toBe(false);
  });

  it('keeps a pending generation inadmissible as a release base', () => {
    const result = classifyProductionMarkerEvidence(
      evidence({ markers: [primaryMarker('in_progress', null)] })
    );
    expect(result.state).toBe('pending');
    expect(admitReleaseBase(result, live, sha).ok).toBe(false);
  });

  it('keeps a rolled-back generation inadmissible (verdict FAIL stays refused)', () => {
    const rolledBack = primaryMarker(
      'completed',
      'cancelled',
      job(
        'Production Release / Centralized production rollback',
        1,
        'completed',
        'success'
      )
    );
    const result = classifyProductionMarkerEvidence(
      evidence({ markers: [rolledBack] })
    );
    expect(result).toMatchObject({
      state: 'manual',
      reason: 'unsafe_or_contradictory_rollback',
    });
    expect(admitReleaseBase(result, live, sha).ok).toBe(false);
  });

  it('keeps an interrupted (cancelled) generation inadmissible', () => {
    const result = classifyProductionMarkerEvidence(evidence());
    expect(result.state).not.toBe('verified');
    expect(admitReleaseBase(result, live, sha).ok).toBe(false);
  });
});
