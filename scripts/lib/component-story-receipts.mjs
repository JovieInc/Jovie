import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { acceptStoryReceipts } from './component-evidence.mjs';
import {
  renderReceiptCurrent,
  snapshotRenderInputs,
} from './component-render-inputs.mjs';

/** @returns {{criterion: any, missing?: {criterion: string, reason: string, how: string}}} */
export function storyCriterion(kind, evidence, sourceHash, testSource) {
  const receipt = evidence[kind];
  const current = renderReceiptCurrent(
    receipt,
    sourceHash,
    evidence.renderInputs
  );
  if (current && receipt.status === 'pass')
    return {
      criterion: {
        id: kind,
        status: 'pass',
        ...(kind === 'a11y'
          ? { source: 'storybook-a11y' }
          : { captured: receipt.captured }),
      },
    };
  if (current && receipt.status === 'fail')
    return {
      criterion: { id: kind, status: 'fail', detail: receipt.detail },
      missing: {
        criterion: kind,
        reason:
          kind === 'a11y'
            ? `axe violations: ${receipt.detail ?? 'see report'}`
            : (receipt.detail ?? 'visual diff'),
        how:
          kind === 'a11y'
            ? 'Fix violations; keep stories axe-clean'
            : 'Review the CI capture diff',
      },
    };
  if (
    !receipt &&
    kind === 'a11y' &&
    /expectNoA11yViolations|\baxe\(|vitest-axe|toHaveNoViolations/.test(
      testSource ?? ''
    )
  )
    return { criterion: { id: kind, status: 'pass', source: 'unit-axe' } };
  return {
    criterion: {
      id: kind,
      status: 'unknown',
      detail: receipt
        ? `CI ${kind} evidence has stale or missing source/render input binding`
        : `no CI ${kind} capture${kind === 'a11y' ? ' or unit axe assertion' : ''}`,
    },
    missing: {
      criterion: kind,
      reason: receipt
        ? 'no current source/render-bound evidence'
        : `no ${kind} evidence`,
      how:
        kind === 'a11y'
          ? 'Call expectNoA11yViolations(container) from apps/web/tests/utils/a11y.ts in the unit test for each rendered state'
          : 'Land state stories; the component-certificate workflow captures them in CI (never a Storybook build on gem)',
    },
  };
}

/** Load once, preserving rejected observations so unit axe cannot mask them. */
export function loadStoryReceipts(root, paths) {
  const result = { renderInputs: null, a11y: {}, visual: {} };
  for (const kind of ['a11y', 'visual']) {
    const path = paths[kind] && resolve(root, paths[kind]);
    const records =
      path && existsSync(path)
        ? JSON.parse(readFileSync(path, 'utf8')).components
        : {};
    const { components, rejected } = acceptStoryReceipts(records);
    for (const { path, problem } of rejected) {
      console.error(
        `[component-certificate] ignored ${kind} receipt for ${path}: ${problem}`
      );
      components[path] = { status: 'unknown', detail: problem };
    }
    result[kind] = components;
  }
  if (Object.keys(result.a11y).length || Object.keys(result.visual).length) {
    const snapshot = snapshotRenderInputs(root);
    result.renderInputs = snapshot.binding;
    if (snapshot.problem)
      console.error(
        `[component-certificate] render inputs unavailable: ${snapshot.problem}`
      );
  }
  return result;
}
