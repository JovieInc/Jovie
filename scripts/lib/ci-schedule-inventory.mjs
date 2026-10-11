import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const SCHEDULE_CLASSES = Object.freeze([
  'skip-if-unchanged',
  'production-liveness',
  'temporal-resource',
  'upstream-advisory',
]);

export const EVIDENCE_DRIVEN_WORKFLOWS = Object.freeze([
  '.github/workflows/codeql.yml',
  '.github/workflows/e2e-full-matrix.yml',
  '.github/workflows/eval-real-model.yml',
  '.github/workflows/nightly-testing-agent.yml',
  '.github/workflows/nightly-tests.yml',
  // security.yml intentionally keeps a weekly upstream-advisory baseline
  // (JOV-7565): dependency/OSV advisories publish on their own clock, so a
  // purely causal trigger can miss new findings on unchanged source.
  '.github/workflows/sonarcloud.yml',
  '.github/workflows/test-coverage-audit.yml',
  '.github/workflows/test-flakiness-report.yml',
]);

const WORKFLOW_FILE_RE = /\.ya?ml$/;
const CRON_RE = /^\s*-\s*cron:/m;
const CLASS_RE = /^\s*#\s*clock-class:\s+(\S+)\s*$/m;
const CAUSAL_TRIGGER_RE =
  /^  (?:push|workflow_run|repository_dispatch|deployment_status):/m;

export function parseScheduleClass(source = '') {
  return String(source).match(CLASS_RE)?.[1] ?? null;
}

export function hasCronSchedule(source = '') {
  return CRON_RE.test(String(source));
}

export function inventoryScheduledWorkflows(files = []) {
  const errors = [];
  const rows = [];
  const evidenceDriven = new Set(EVIDENCE_DRIVEN_WORKFLOWS);
  for (const file of files) {
    const path = file.path;
    const source = String(file.source ?? '');
    if (evidenceDriven.has(path)) {
      if (hasCronSchedule(source)) {
        errors.push(
          `${path}: broad evidence workflow must not run from a cron schedule`
        );
      }
      if (!CAUSAL_TRIGGER_RE.test(source)) {
        errors.push(
          `${path}: broad evidence workflow requires a causal event trigger`
        );
      }
    }
    if (!hasCronSchedule(source)) continue;
    const scheduleClass = parseScheduleClass(source);
    rows.push({ path, scheduleClass });
    if (!SCHEDULE_CLASSES.includes(scheduleClass)) {
      errors.push(
        `${path}: scheduled workflow must declare # clock-class: ${SCHEDULE_CLASSES.join('|')} (got ${scheduleClass ?? 'missing'})`
      );
    }
  }
  return { rows, errors };
}

export function loadWorkflowFiles(workflowsDir) {
  return readdirSync(workflowsDir)
    .filter(name => WORKFLOW_FILE_RE.test(name))
    .sort()
    .map(name => ({
      path: `.github/workflows/${name}`,
      source: readFileSync(join(workflowsDir, name), 'utf8'),
    }));
}
