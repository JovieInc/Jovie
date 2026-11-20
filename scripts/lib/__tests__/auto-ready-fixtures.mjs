import {
  classifyAutoReadyPromotion,
  FX_WRITER_EMAIL,
  FX_WRITER_NAME,
  TRUSTED_FX_WORKFLOW_NAME,
  TRUSTED_FX_WORKFLOW_PATH,
} from '../auto-ready-provenance.mjs';
import {
  buildWriterProofReceipt,
  renderWriterProofReceipt,
} from '../writer-owned-pr-promotion.mjs';

// Shared Auto-Ready provenance fixtures, kept out of the test file so it stays
// under the size-500 budget.
export const parent = 'a'.repeat(40);
export const child = 'b'.repeat(40);
export const other = 'c'.repeat(40);
export const prNumber = 14359;
export const writerLogin = 'itstimwhite';
export const proofBase = {
  issueId: 'JOV-5751',
  prNumber,
  headSha: child,
  writerLogin,
  requiredTests: 'passed: focused tests and hosted CI',
  reviewSweep: 'complete: top-level, inline, and review summaries checked',
  ticketEvidence: 'attached: Linear workpad is current',
  prEvidence: 'attached: PR body has validation evidence',
  issuedAt: '2026-08-31T00:00:00.000Z',
};

export function trustedFxRun(overrides = {}) {
  return {
    workflowPath: TRUSTED_FX_WORKFLOW_PATH,
    workflowName: TRUSTED_FX_WORKFLOW_NAME,
    conclusion: 'success',
    event: 'workflow_run',
    headSha: parent,
    ...overrides,
  };
}

export function fxCommit(overrides = {}) {
  return {
    sha: child,
    message: `fix(ci): remediate exact-head failure\n\nFX-Source-Head: ${parent}\n`,
    parentShas: [parent],
    authorName: FX_WRITER_NAME,
    authorEmail: FX_WRITER_EMAIL,
    authorLogin: '',
    committerName: FX_WRITER_NAME,
    committerEmail: FX_WRITER_EMAIL,
    committerLogin: 'jovie-bot[bot]',
    verified: true,
    ...overrides,
  };
}

export function proofReceipt(overrides = {}) {
  return buildWriterProofReceipt({ ...proofBase, ...overrides });
}

export function proofBody(overrides = {}) {
  return renderWriterProofReceipt(proofReceipt(overrides));
}

export function promotion(overrides = {}) {
  return classifyAutoReadyPromotion({
    prNumber,
    authorLogin: writerLogin,
    title: 'fix(ci): remediate exact-head failure',
    branch: 'tim/jov-5477-human-draft',
    labels: [],
    headSha: child,
    body: proofBody(),
    commit: fxCommit(),
    fxRun: trustedFxRun(),
    ...overrides,
  });
}
