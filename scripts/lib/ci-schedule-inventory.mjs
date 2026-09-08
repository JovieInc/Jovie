import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const SCHEDULE_CLASSES = Object.freeze([
  'skip-if-unchanged',
  'production-liveness',
  'temporal-resource',
  'upstream-advisory',
]);

const WORKFLOW_FILE_RE = /\.ya?ml$/;
const CRON_RE = /^\s*-\s*cron:/m;
const CLASS_RE = /^\s*#\s*clock-class:\s+(\S+)\s*$/m;

export function parseScheduleClass(source = '') {
  return String(source).match(CLASS_RE)?.[1] ?? null;
}

export function hasCronSchedule(source = '') {
  return CRON_RE.test(String(source));
}

export function inventoryScheduledWorkflows(files = []) {
  const errors = [];
  const rows = [];
  for (const file of files) {
    const path = file.path;
    const source = String(file.source ?? '');
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
