#!/usr/bin/env tsx
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  buildRepairArtifact,
  type RepairWorkKind,
  routeRepairWork,
} from '../lib/model-escalation-policy';

const failedJobs = process.env.FAILED_JOB_NAMES ?? '';
const changedFiles = (process.env.SUSPECT_FILES ?? '')
  .split(/\s+/)
  .filter(Boolean);
const cheapFailures =
  Number.parseInt(process.env.CHEAP_FAILURES ?? '0', 10) || 0;
const workKind = (process.env.REPAIR_WORK_KIND ??
  (/lint|format|trigger|guard|freshness|enroll|conflict/i.test(failedJobs)
    ? 'mechanical'
    : 'normal')) as RepairWorkKind;
const route = routeRepairWork({
  workKind,
  mainRed: true,
  cheapFailures,
  changedFiles,
});
const attempt = Number.parseInt(process.env.ATTEMPT ?? '1', 10) || 1;
const shortSha = process.env.FAILING_SHORT_SHA ?? 'unknown';
const artifactPath =
  process.env.REPAIR_ARTIFACT_PATH ??
  '/tmp/autofix-context/repair-artifact.json';
const cooldownUntil = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
const artifact = buildRepairArtifact({
  workId: `main-${shortSha}`,
  priority: 'main-red',
  route,
  attempt,
  cooldownUntil,
});
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${artifact}\n`);

const output = process.env.GITHUB_OUTPUT;
if (output) {
  writeFileSync(
    output,
    [
      `route=${route.route}`,
      `model=${route.model}`,
      `provider=${route.provider}`,
      `codex_allowed=${route.codexAllowed}`,
      `deterministic_gate=${route.deterministicGate}`,
      `artifact_path=${artifactPath}`,
      `cooldown_until=${cooldownUntil}`,
    ].join('\n') + '\n',
    { flag: 'a' }
  );
}
console.log(
  JSON.stringify({
    priority: 'main-red',
    workKind,
    failedJobs,
    route,
    artifactPath,
  })
);
