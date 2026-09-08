import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  inventoryScheduledWorkflows,
  loadWorkflowFiles,
  SCHEDULE_CLASSES,
} from '../ci-schedule-inventory.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const workflowsDir = resolve(repoRoot, '.github/workflows');

describe('ci schedule inventory', () => {
  it('requires every cron workflow to declare an allowed clock-class', () => {
    const result = inventoryScheduledWorkflows(loadWorkflowFiles(workflowsDir));
    expect(result.errors).toEqual([]);
    expect(result.rows.length).toBeGreaterThan(0);
    for (const row of result.rows) {
      expect(SCHEDULE_CLASSES).toContain(row.scheduleClass);
    }
  });

  it('rejects a clock with no class', () => {
    const result = inventoryScheduledWorkflows([
      {
        path: '.github/workflows/example.yml',
        source: 'on:\n  schedule:\n    - cron: "0 0 * * *"\n',
      },
    ]);
    expect(result.errors[0]).toContain('clock-class');
  });
});
