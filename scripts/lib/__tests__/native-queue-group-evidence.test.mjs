import { describe, expect, it } from 'vitest';
import { groupEvidenceFailures } from '../native-queue-group-evidence.mjs';

const head = 'a'.repeat(40);
function receipt() {
  const values = {
    ADMISSION_ADMITTED: 'true',
    ADMISSION_OBSOLETE: 'false',
    ADMISSION_PR: '16237',
    ADMISSION_SYNTHETIC_HEAD: head,
    SELECTED_LANES: 'web',
    RUN_WEB: 'true',
  };
  for (const name of [
    'IOS',
    'MACOS',
    'CROSS_PRODUCT',
    'PROMPTFOO',
    'GOLDEN_EVAL',
  ]) {
    values[`RUN_${name}`] = 'false';
    values[`${name}_RESULT`] = 'skipped';
  }
  for (const name of [
    'PATH',
    'ADMISSION',
    'RISK',
    'FAST',
    'SECRET',
    'GOLDEN_PATH_LOCK',
    'VISUAL_COMPARE',
    'MIGRATION',
    'LANE_RECEIPT',
    'UNIT',
    'BUILD_LAYOUT',
  ])
    values[`${name}_RESULT`] = 'success';
  return {
    number: 16237,
    groupHead: head,
    run: { id: 123, run_attempt: 1 },
    gateEvidence: {
      readyJob: {
        run_id: 123,
        run_attempt: 1,
        head_sha: head,
        name: 'PR Ready',
        status: 'completed',
        conclusion: 'success',
      },
      readyLog: Object.entries(values)
        .map(([k, v]) => `${k}="${v}"`)
        .join('\n'),
      artifact: {
        workflow_run: { id: 123, head_sha: head },
        expired: false,
        name: `product-lane-final-${head}-1`,
      },
      laneReceipt: {
        provenance: { sha: head, runId: '123', runAttempt: '1' },
        selectedLanes: ['web'],
        actualResults: {
          lanes: {
            web: ['success', 'success', 'success'],
            ios: ['skipped'],
            mac: ['skipped'],
            operations: ['skipped'],
            'cross-product': ['skipped'],
          },
        },
      },
    },
  };
}

describe('independent native combined-head evidence', () => {
  it.each([null, undefined, {}])('rejects absent input %s', input => {
    expect(groupEvidenceFailures(input)).toEqual(['group-evidence-missing']);
  });
  it.each([
    [
      'absent run',
      m => {
        delete m.run;
      },
    ],
    [
      'invalid PR',
      m => {
        m.number = 0;
      },
    ],
    [
      'invalid head',
      m => {
        m.groupHead = 'unknown';
      },
    ],
    [
      'job from another attempt',
      m => {
        m.gateEvidence.readyJob.run_attempt = 2;
      },
    ],
    [
      'invalid attempt',
      m => {
        m.run.run_attempt = 0;
      },
    ],
    [
      'ambiguous log',
      m => {
        m.gateEvidence.readyLog +=
          '\nUNIT_RESULT="failure"\nUNIT_RESULT="success"';
      },
    ],
    [
      'unknown lane',
      m => {
        m.gateEvidence.laneReceipt.selectedLanes = ['unknown'];
        m.gateEvidence.readyLog = m.gateEvidence.readyLog.replace(
          'SELECTED_LANES="web"',
          'SELECTED_LANES="unknown"'
        );
      },
    ],
    [
      'inconsistent web selection',
      m => {
        m.gateEvidence.laneReceipt.selectedLanes = [];
        m.gateEvidence.laneReceipt.actualResults.lanes.web = ['skipped'];
        m.gateEvidence.readyLog = m.gateEvidence.readyLog.replace(
          'SELECTED_LANES="web"',
          'SELECTED_LANES=""'
        );
      },
    ],
    [
      'missing obsolete status',
      m => {
        m.gateEvidence.readyLog = m.gateEvidence.readyLog.replace(
          'ADMISSION_OBSOLETE="false"',
          ''
        );
      },
    ],
  ])('rejects %s', (_, mutate) => {
    const m = receipt();
    mutate(m);
    expect(groupEvidenceFailures(m).length).toBeGreaterThan(0);
  });
  it('derives evidence from exact native admission, required gates and selected lanes', () => {
    expect(groupEvidenceFailures(receipt())).toEqual([]);
  });
  it('does not accept a hand-set verified flag or missing receipts', () => {
    expect(groupEvidenceFailures({ gateEvidence: { verified: true } })).toEqual(
      ['group-evidence-missing']
    );
  });
  it.each([
    'failure',
    'skipped',
    'pending',
    'neutral',
    'cancelled',
    '',
  ])('rejects a selected unit suite with %s', result => {
    const m = receipt();
    m.gateEvidence.readyLog = m.gateEvidence.readyLog.replace(
      'UNIT_RESULT="success"',
      `UNIT_RESULT="${result}"`
    );
    expect(groupEvidenceFailures(m)).toContain('selected-suite:UNIT_RESULT');
  });
  it.each([
    'ADMISSION',
    'MIGRATION',
    'PATH',
    'RISK',
    'FAST',
    'SECRET',
    'GOLDEN_PATH_LOCK',
    'VISUAL_COMPARE',
    'LANE_RECEIPT',
  ])('rejects missing required %s gate evidence', gate => {
    const m = receipt();
    m.gateEvidence.readyLog = m.gateEvidence.readyLog.replace(
      `${gate}_RESULT="success"`,
      ''
    );
    expect(groupEvidenceFailures(m)).toContain(`group-gate:${gate}`);
  });
  it.each([
    [
      'wrong run',
      m => {
        m.gateEvidence.readyJob.run_id = 456;
      },
    ],
    [
      'wrong head',
      m => {
        m.gateEvidence.readyJob.head_sha = 'b'.repeat(40);
      },
    ],
    [
      'wrong attempt',
      m => {
        m.gateEvidence.artifact.name = `product-lane-final-${head}-2`;
      },
    ],
    [
      'expired artifact',
      m => {
        m.gateEvidence.artifact.expired = true;
      },
    ],
    [
      'unbound artifact',
      m => {
        m.gateEvidence.artifact.workflow_run.id = 456;
      },
    ],
    [
      'wrong artifact revision',
      m => {
        m.gateEvidence.artifact.workflow_run.head_sha = 'b'.repeat(40);
      },
    ],
    [
      'wrong provenance',
      m => {
        m.gateEvidence.laneReceipt.provenance.runId = '456';
      },
    ],
    [
      'wrong job',
      m => {
        m.gateEvidence.readyJob.name = 'enroll';
      },
    ],
    [
      'failed job',
      m => {
        m.gateEvidence.readyJob.conclusion = 'failure';
      },
    ],
    [
      'nonterminal job',
      m => {
        m.gateEvidence.readyJob.status = 'in_progress';
      },
    ],
    [
      'missing lane results',
      m => {
        m.gateEvidence.laneReceipt.actualResults.lanes.web = [];
      },
    ],
    [
      'failed lane results',
      m => {
        m.gateEvidence.laneReceipt.actualResults.lanes.web = ['failure'];
      },
    ],
    [
      'unselected execution',
      m => {
        m.gateEvidence.laneReceipt.actualResults.lanes.ios = ['success'];
      },
    ],
    [
      'omitted selection',
      m => {
        m.gateEvidence.laneReceipt.selectedLanes = [];
      },
    ],
  ])('rejects %s', (_, mutate) => {
    const m = receipt();
    mutate(m);
    expect(groupEvidenceFailures(m).length).toBeGreaterThan(0);
  });
  it.each([
    ['ADMISSION_ADMITTED="true"', 'ADMISSION_ADMITTED="false"'],
    ['ADMISSION_OBSOLETE="false"', 'ADMISSION_OBSOLETE="true"'],
    ['ADMISSION_PR="16237"', 'ADMISSION_PR="17483"'],
    [`ADMISSION_SYNTHETIC_HEAD="${head}"`, 'ADMISSION_SYNTHETIC_HEAD=""'],
  ])('rejects an obsolete, rejected or mismatched admission %s', (before, after) => {
    const m = receipt();
    m.gateEvidence.readyLog = m.gateEvidence.readyLog.replace(before, after);
    expect(groupEvidenceFailures(m)).toContain('live-group-admission');
  });
});
