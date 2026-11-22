#!/usr/bin/env node
/**
 * JOV-7200 / VER-5 — bind public-profile dogfood feed to a served deploy.
 *
 * Default is dry-run (no DB writes). Apply requires DATABASE_URL (Doppler
 * jovie-web/prd) under NODE_OPTIONS=--conditions=react-server (see package.json
 * dogfood:bind-public-profile). Never via postdeploy-probes.yml. Never ingest
 * the synthetic public-profile fixture capability receipt.
 *
 * This HTTP probe is agent_on_behalf / cli / regression / scripted. It does
 * not certify capability; checks stay unverified and goalCompletion is
 * not_completed until a real browser mission runs.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { dogfoodReceiptProvesOutcome } from '@/lib/agent-os/dogfood-receipt';
import { getCanonicalSurface } from '@/lib/canonical-surfaces';
import {
  bindDogfoodSubjectDeploy,
  type DogfoodSubjectDeployBinding,
  dogfoodFeedStatus,
  dogfoodReceiptKey,
  readDogfoodReceiptLedger,
  recordDogfoodReceipt,
} from '@/lib/ovie/certifications/dogfood-receipt-ledger';
import { PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID } from '@/lib/ovie/certifications/public-profile-dogfood-fixture';
import {
  ALLOWED_ORIGIN,
  assertExactPersistence,
  assertSameOriginProfilePath,
  buildReceipt,
  canonicalizeOrigin,
  fetchBuildInfo,
  observePublicProfile,
  parseObservation,
} from './bind-public-profile-dogfood-feed-lib';

export {
  assertExactPersistence,
  assertSameOriginProfilePath,
  buildReceipt,
  canonicalizeOrigin,
  fetchBuildInfo,
  fetchNoRedirect,
  observePublicProfile,
  parseObservation,
  requireProductionEnvironment,
} from './bind-public-profile-dogfood-feed-lib';

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      origin: { type: 'string', default: ALLOWED_ORIGIN },
      observation: { type: 'string' },
      observe: { type: 'boolean', default: false },
      path: { type: 'string', default: '/tim' },
      'write-observation': { type: 'string' },
      'write-result': { type: 'string' },
      'artifact-dir': { type: 'string' },
      apply: { type: 'boolean', default: false },
      'expected-sha': { type: 'string' },
    },
  });

  if (!values.observe && !values.observation) {
    process.stderr.write('Provide --observe or --observation <file>\n');
    return 64;
  }

  const origin = canonicalizeOrigin(values.origin!);
  const path = assertSameOriginProfilePath(values.path!);
  const artifactDir =
    values['artifact-dir'] ??
    join(process.cwd(), '.cache', 'public-profile-dogfood-artifacts');

  const observation = values.observe
    ? await observePublicProfile({ origin, path, artifactDir })
    : parseObservation(JSON.parse(readFileSync(values.observation!, 'utf8')));

  if (values['write-observation']) {
    writeFileSync(
      values['write-observation'],
      `${JSON.stringify(observation, null, 2)}\n`
    );
  }

  const live = await fetchBuildInfo(origin);
  if (
    live.commitSha !== observation.buildInfo.commitSha ||
    live.deploymentId !== observation.buildInfo.deploymentId
  ) {
    process.stderr.write(
      `${JSON.stringify(
        {
          error: 'observation_build_mismatch',
          live,
          observation: observation.buildInfo,
        },
        null,
        2
      )}\n`
    );
    return 2;
  }
  if (values['expected-sha'] && live.commitSha !== values['expected-sha']) {
    process.stderr.write(
      `${JSON.stringify(
        {
          error: 'expected_sha_mismatch',
          expected: values['expected-sha'],
          live: live.commitSha,
        },
        null,
        2
      )}\n`
    );
    return 2;
  }

  const binding: DogfoodSubjectDeployBinding = {
    commitSha: live.commitSha,
    deploymentId: live.deploymentId,
    source: 'production',
  };

  const receipt = buildReceipt(observation);
  const mission = getCanonicalSurface('public-profile').outcomeMission;
  const proves = dogfoodReceiptProvesOutcome(receipt, {
    id: mission.id,
    required: true,
    outcome: mission.outcome,
  });
  const receiptId = dogfoodReceiptKey(receipt);

  const plan = {
    mode: values.apply ? 'apply' : 'dry-run',
    origin,
    path: observation.path,
    note: 'source=production is live provenance; knownGoodDeploymentIds are binder IDs, not product certification',
    liveBuild: live,
    binding,
    receiptId,
    receiptOutcome: receipt.outcome,
    provesOutcome: proves,
    observationTimestamps: {
      startedAt: observation.observedAtStarted,
      completedAt: observation.observedAtCompleted,
    },
    expectedMetricEffect: {
      dogfoodFeed: {
        status: 'production',
        receiptCountDelta: '+1 (or replay)',
        subjectsWithDeploy: '≥1 including public-profile',
      },
      dogfoodKindCoverage:
        'capability coverage stays 0 for this honest non-passing HTTP probe',
    },
    commissioning: {
      feedConnected: false,
      receiptPersisted: false,
      productCertification: false,
    },
    readback: {
      ledgerKey: 'jovie:certification:v1:dogfood-receipts',
      metricsUrl: `${origin}/api/ovie/certifications/metrics`,
      bindingOk: false,
      receiptOk: false,
    },
  };

  if (!values.apply) {
    const serialized = `${JSON.stringify(plan, null, 2)}\n`;
    process.stdout.write(serialized);
    if (values['write-result'])
      writeFileSync(values['write-result'], serialized);
    process.stdout.write(
      'dry-run complete; pass --apply with DATABASE_URL to persist\n'
    );
    return 0;
  }

  if (!process.env.DATABASE_URL) {
    process.stderr.write(
      'DATABASE_URL missing; refuse apply. Use doppler jovie-web/prd with NODE_OPTIONS=--conditions=react-server\n'
    );
    return 2;
  }

  const preWrite = await fetchBuildInfo(origin);
  if (
    preWrite.commitSha !== binding.commitSha ||
    preWrite.deploymentId !== binding.deploymentId
  ) {
    process.stderr.write(
      `${JSON.stringify(
        {
          error: 'served_identity_drift_before_write',
          binding,
          preWrite,
        },
        null,
        2
      )}\n`
    );
    return 2;
  }

  const { postgresRecordBackend } = await import(
    '@/lib/ovie/mcp/postgres-backend'
  );
  const backend = postgresRecordBackend();
  const recordedAt = new Date().toISOString();
  const bindResult = await bindDogfoodSubjectDeploy({
    backend,
    subjectId: PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID,
    binding,
    recordedAt,
  });
  const receiptResult = await recordDogfoodReceipt({
    backend,
    receipt,
    recordedAt,
  });
  const ledger = await readDogfoodReceiptLedger(backend);
  const exact = assertExactPersistence({
    ledger,
    subjectId: PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID,
    binding,
    receipt,
    receiptId,
  });
  const feed = dogfoodFeedStatus(ledger);
  const result = {
    ...plan,
    bindResult,
    receiptResult,
    feed,
    subjectDeploy:
      ledger?.subjectDeploys[PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID] ?? null,
    knownGoodDeploymentIds: ledger?.knownGoodDeploymentIds ?? [],
    knownGoodNote:
      'Binder may add deployment IDs to knownGoodDeploymentIds; that is not product certification.',
    readback: {
      ...plan.readback,
      bindingOk: exact.bindingOk,
      receiptOk: exact.receiptOk,
    },
    commissioning: {
      feedConnected: feed.status === 'production',
      receiptPersisted: exact.receiptOk && feed.receiptCount >= 1,
      productCertification: false,
    },
  };
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  process.stdout.write(serialized);
  if (values['write-result']) writeFileSync(values['write-result'], serialized);
  return 0;
}

const isDirectRun =
  process.argv[1]?.includes('bind-public-profile-dogfood-feed') === true &&
  !process.argv[1]?.includes('bind-public-profile-dogfood-feed-lib') &&
  !process.argv[1]?.endsWith('.test.ts');

if (isDirectRun) {
  main()
    .then(code => {
      process.exitCode = code;
    })
    .catch(error => {
      process.stderr.write(
        `${error instanceof Error ? error.message : error}\n`
      );
      process.exitCode = 1;
    });
}
