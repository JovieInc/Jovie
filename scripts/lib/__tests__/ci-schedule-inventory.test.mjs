import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EVIDENCE_DRIVEN_WORKFLOWS,
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

  it('keeps broad test, eval, coverage, and security evidence off clocks', () => {
    const files = loadWorkflowFiles(workflowsDir);
    const result = inventoryScheduledWorkflows(files);
    expect(result.errors).toEqual([]);
    for (const path of EVIDENCE_DRIVEN_WORKFLOWS) {
      const workflow = files.find(file => file.path === path);
      expect(workflow, path).toBeDefined();
      expect(workflow.source, path).not.toMatch(/^\s*-\s*cron:/m);
      expect(workflow.source, path).toMatch(
        /^  (?:push|workflow_run|repository_dispatch|deployment_status):/m
      );
    }
  });

  it('reuses exact coverage evidence for Sonar instead of rerunning web coverage', () => {
    const sonar = loadWorkflowFiles(workflowsDir).find(
      file => file.path === '.github/workflows/sonarcloud.yml'
    )?.source;
    expect(sonar).toContain('workflows: [Test Coverage Audit]');
    expect(sonar).toContain(
      'name: coverage-audit-${{ github.event.workflow_run.id }}'
    );
    expect(sonar).toContain('run-id: ${{ github.event.workflow_run.id }}');
    expect(sonar).toMatch(
      /Run apps\/web coverage for manual diagnostics[\s\S]*github\.event_name == 'workflow_dispatch'/
    );
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

  it('rejects cron or manual-only broad evidence workflows', () => {
    const path = EVIDENCE_DRIVEN_WORKFLOWS[0];
    const scheduled = inventoryScheduledWorkflows([
      {
        path,
        source:
          'on:\n  push:\n  schedule:\n    - cron: "0 0 * * *"\n# clock-class: skip-if-unchanged\n',
      },
    ]);
    expect(scheduled.errors.join('\n')).toContain(
      'broad evidence workflow must not run from a cron schedule'
    );

    const manualOnly = inventoryScheduledWorkflows([
      { path, source: 'on:\n  workflow_dispatch:\n' },
    ]);
    expect(manualOnly.errors).toEqual([
      `${path}: broad evidence workflow requires a causal event trigger`,
    ]);
  });
});
