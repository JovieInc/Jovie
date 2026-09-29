import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DESKTOP_DOGFOOD_INSPECTION_DIMENSIONS,
  DESKTOP_DOGFOOD_INVENTORY,
  expandDesktopDogfoodInventory,
} from './desktop-dogfood-inventory.mjs';
import {
  buildDesktopDogfoodReport,
  createCoverageLedger,
  DESKTOP_DOGFOOD_OBSERVATIONS_SCHEMA,
  parsePackagedDesktopIdentity,
  summarizeCoverage,
  validateObservations,
} from './desktop-dogfood-lib.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../..');
const tempDirs = [];
const identity = {
  channel: 'staging',
  version: '26.9.15-staging.1.1',
  sourceRevision: 'a'.repeat(40),
  builtAt: '2026-09-29T12:00:00.000Z',
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeOutputDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jovie-desktop-dogfood-'));
  tempDirs.push(dir);
  fs.mkdirSync(path.join(dir, 'screenshots'));
  fs.writeFileSync(path.join(dir, 'screenshots/surface.png'), 'png fixture');
  return dir;
}

function inspection(result = 'pass') {
  return Object.fromEntries(
    DESKTOP_DOGFOOD_INSPECTION_DIMENSIONS.map(dimension => [
      dimension,
      { result },
    ])
  );
}

function testedObservation(overrides = {}) {
  return {
    surface: 'consumer.inbox',
    state: 'breadth',
    disposition: 'tested-pass',
    evidence: ['screenshots/surface.png'],
    inspection: inspection(),
    ...overrides,
  };
}

test('inventory is source-backed, unique, and keeps operator surfaces separate', () => {
  const ids = new Set();
  for (const surface of DESKTOP_DOGFOOD_INVENTORY) {
    assert.equal(ids.has(surface.id), false, `duplicate surface ${surface.id}`);
    ids.add(surface.id);
    assert.ok(surface.states.length > 0, `${surface.id} has no states`);
    for (const source of surface.sources) {
      assert.equal(
        fs.existsSync(path.join(repoRoot, source)),
        true,
        `${surface.id} source missing: ${source}`
      );
    }
  }
  assert.ok(ids.has('native.auth-handoff'));
  assert.ok(ids.has('consumer.workspace-lock'));
  assert.ok(ids.has('operator.hud'));
  assert.equal(
    DESKTOP_DOGFOOD_INVENTORY.find(item => item.id === 'operator.hud').scope,
    'operator'
  );
  const keys = expandDesktopDogfoodInventory().map(
    row => `${row.surface}::${row.state}`
  );
  assert.equal(new Set(keys).size, keys.length);
});

test('packaged identity requires exact source and build provenance', () => {
  assert.deepEqual(parsePackagedDesktopIdentity(identity), {
    ...identity,
    provenance: 'verified',
  });
  assert.equal(
    parsePackagedDesktopIdentity({ ...identity, sourceRevision: 'abc1234' }),
    null
  );
  assert.equal(
    parsePackagedDesktopIdentity({ ...identity, channel: 'local' }),
    null
  );
  assert.equal(
    parsePackagedDesktopIdentity({
      ...identity,
      channel: 'production',
      version: '26.9.15-staging.1.1',
    }),
    null
  );
});

test('tested observations require evidence and the composed-app checklist', () => {
  const outputDir = makeOutputDir();
  const parsed = validateObservations(
    {
      schema: DESKTOP_DOGFOOD_OBSERVATIONS_SCHEMA,
      observations: [testedObservation()],
    },
    outputDir
  );
  assert.equal(parsed.length, 1);

  assert.throws(
    () =>
      validateObservations(
        {
          schema: DESKTOP_DOGFOOD_OBSERVATIONS_SCHEMA,
          observations: [
            testedObservation({
              evidence: ['screenshots/missing.png'],
              inspection: {},
            }),
          ],
        },
        outputDir
      ),
    /evidence does not exist.*inspection missing native-titlebar/s
  );
});

test('failed findings require a dedupe decision and canonical issue', () => {
  const outputDir = makeOutputDir();
  assert.throws(
    () =>
      validateObservations(
        {
          schema: DESKTOP_DOGFOOD_OBSERVATIONS_SCHEMA,
          observations: [testedObservation({ disposition: 'tested-fail' })],
        },
        outputDir
      ),
    /requires canonicalIssue, dedupeDecision, and issueDisposition/
  );
  assert.equal(
    validateObservations(
      {
        schema: DESKTOP_DOGFOOD_OBSERVATIONS_SCHEMA,
        observations: [
          testedObservation({
            disposition: 'tested-fail',
            canonicalIssue: 'JOV-7207',
            dedupeDecision: 'same shared-shell root cause',
            issueDisposition: 'existing',
          }),
        ],
      },
      outputDir
    )[0].canonicalIssue,
    'JOV-7207'
  );
});

test('coverage never treats unvisited or unauthorized operator states as pass', () => {
  const ledger = createCoverageLedger({
    observations: [testedObservation()],
    accountRole: 'creator',
  });
  const summary = summarizeCoverage(ledger);
  assert.equal(summary.testedPass, 1);
  assert.ok(summary.notVisited > 0);
  assert.ok(summary.notApplicable > 0);
  assert.equal(
    ledger
      .filter(row => row.scope === 'operator')
      .every(row => row.disposition === 'not-applicable'),
    true
  );
});

test('report stays queued until the native runner receipt is verified', () => {
  const coverage = createCoverageLedger({
    observations: [],
    accountRole: 'creator',
  });
  const report = buildDesktopDogfoodReport({
    generatedAt: '2026-09-29T12:00:00.000Z',
    session: {
      id: 'session-1',
      runnerStatus: 'unverified',
      blockers: ['first app-owned window capture is unavailable'],
    },
    nativeBuild: null,
    hostedWeb: null,
    coverage,
    crashes: [],
    artifacts: {},
  });
  assert.equal(report.verdict, 'queued');
  assert.equal(report.runnerStatus, 'runner-unverified');
  assert.equal(report.runnerBlockerCount, 1);
  assert.equal(report.coverageSummary.testedStates, 0);
});

test('verified runs fail on a deduped finding or attributed crash', () => {
  const failed = testedObservation({
    disposition: 'tested-fail',
    canonicalIssue: 'JOV-7207',
    dedupeDecision: 'same shared-shell root cause',
    issueDisposition: 'existing',
  });
  const coverage = createCoverageLedger({
    observations: [failed],
    accountRole: 'operator',
  });
  const report = buildDesktopDogfoodReport({
    generatedAt: '2026-09-29T12:00:00.000Z',
    session: { id: 'session-2', runnerStatus: 'verified', blockers: [] },
    nativeBuild: identity,
    hostedWeb: { commitSha: 'b'.repeat(40) },
    coverage,
    crashes: [],
    artifacts: {},
  });
  assert.equal(report.verdict, 'fail');
  assert.deepEqual(report.findings[0], {
    surface: 'consumer.inbox',
    state: 'breadth',
    canonicalIssue: 'JOV-7207',
    issueDisposition: 'existing',
    dedupeDecision: 'same shared-shell root cause',
    evidence: ['screenshots/surface.png'],
    repairStage: 'issue-updated',
    pullRequest: null,
    nativeRetest: 'not-run',
    humanDecisionNeeded: false,
  });
  assert.deepEqual(report.defectSummary, {
    uniqueRootCauses: 1,
    existingIssuesUpdated: 1,
    genuinelyNewIssues: 0,
    pullRequests: 0,
    fixesNativeReverified: 0,
    humanDecisionsNeeded: 0,
  });
});
