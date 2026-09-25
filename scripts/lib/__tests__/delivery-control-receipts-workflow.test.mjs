import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const WORKFLOW = readFileSync(
  resolve(
    import.meta.dirname,
    '..',
    '..',
    '..',
    '.github/workflows/delivery-control-receipts.yml'
  ),
  'utf8'
);

describe('delivery-control-receipts workflow', () => {
  it('never lets a newer run cancel a pending repair receipt', () => {
    // A concurrency group keeps one pending run and cancels older pending
    // ones, which dropped receipts during bursts of failed CI runs.
    expect(WORKFLOW).not.toMatch(/^\s*concurrency:/mu);
  });

  it('still records every non-success terminal run', () => {
    expect(WORKFLOW).toContain(
      "github.event.workflow_run.conclusion != 'success'"
    );
  });
});
