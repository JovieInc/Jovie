#!/usr/bin/env node
/**
 * Green-source draft undraft authorization.
 *
 * Writer-owned proof (jovie-writer-pr-proof/v1) remains a separate, manual
 * recovery path in auto-ready-agent-drafts.sh. This classifier restores the
 * July event-driven wake: an open main draft may enter the ready pool only
 * when required source checks are SUCCESS and mergeability is CLEAN.
 *
 * This path never enables native auto-merge and never enrolls the merge
 * queue. Auto-Enroll / jovie-bot own admission after ready_for_review.
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { hasControlledProofMarker } from './auto-ready-provenance.mjs';
import { WRITER_PROMOTION_HOLD_LABELS } from './writer-owned-pr-promotion.mjs';
import { classifyQueueCheckBlockers } from './pr-check-failures.mjs';

export const GREEN_SOURCE_PROTECTED_PRS = Object.freeze([
  17156, // HOLD — waitlist-first revert; never undraft/enroll
  17453, // protect — Symphony capacity; never mutate
  17929, // leave if still special (currently hold)
]);

export const TIM_HOLD_LABELS = Object.freeze([
  'tim-hold',
  'tim:hold',
  'hold:tim',
]);

export const GREEN_SOURCE_HOLD_LABELS = Object.freeze([
  ...new Set([...WRITER_PROMOTION_HOLD_LABELS, ...TIM_HOLD_LABELS]),
]);

const SHA_RE = /^[0-9a-f]{40}$/;

function exactSha(value) {
  return typeof value === 'string' && SHA_RE.test(value.toLowerCase())
    ? value.toLowerCase()
    : '';
}

function labelName(label) {
  if (typeof label === 'string') return label;
  if (label && typeof label === 'object' && typeof label.name === 'string') {
    return label.name;
  }
  return '';
}

function labelsOf(labels) {
  return (labels ?? []).map(labelName).filter(Boolean);
}

export function isProtectedGreenSourcePr(number) {
  const pr = Number.parseInt(String(number ?? ''), 10);
  return Number.isSafeInteger(pr) && GREEN_SOURCE_PROTECTED_PRS.includes(pr);
}

export function hasGreenSourceHold(labels = []) {
  const holds = new Set(
    GREEN_SOURCE_HOLD_LABELS.map(label => label.toLowerCase())
  );
  return labelsOf(labels).some(label => holds.has(label.toLowerCase()));
}

export function greenSourceHoldRegex() {
  const escaped = GREEN_SOURCE_HOLD_LABELS.map(name =>
    name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  return `^(${escaped.join('|')})$`;
}

export function classifyGreenSourceDraft(input = {}) {
  const number = Number.parseInt(
    String(input.prNumber ?? input.number ?? ''),
    10
  );
  if (!Number.isSafeInteger(number) || number <= 0) {
    return { eligible: false, reason: 'pr-unavailable' };
  }
  if (isProtectedGreenSourcePr(number)) {
    return { eligible: false, reason: `protected-pr:${number}` };
  }
  if (hasControlledProofMarker(input)) {
    return { eligible: false, reason: 'controlled-proof' };
  }
  if (hasGreenSourceHold(input.labels)) {
    return { eligible: false, reason: 'held' };
  }

  const state = String(input.state ?? 'OPEN').toUpperCase();
  if (state !== 'OPEN') {
    return { eligible: false, reason: `state:${state}` };
  }

  const draft = input.draft === true || input.isDraft === true;
  if (!draft) {
    return { eligible: false, reason: 'not-draft' };
  }

  const base = String(input.baseRefName ?? input.base ?? '');
  if (base !== 'main') {
    return { eligible: false, reason: `base:${base || 'unknown'}` };
  }

  const head = exactSha(input.headSha ?? input.headRefOid ?? input.head ?? '');
  if (!head) {
    return { eligible: false, reason: 'head-unavailable' };
  }
  const expectedHead = exactSha(input.expectedHeadSha ?? '');
  if (expectedHead && expectedHead !== head) {
    return { eligible: false, reason: 'moved-head' };
  }

  const mergeable = String(input.mergeable ?? '').toUpperCase();
  if (mergeable !== 'MERGEABLE') {
    return { eligible: false, reason: `mergeable:${mergeable || 'unknown'}` };
  }

  const mergeStateStatus = String(
    input.mergeStateStatus ?? input.merge_state_status ?? ''
  ).toUpperCase();
  if (mergeStateStatus !== 'CLEAN') {
    return {
      eligible: false,
      reason: `mergeStateStatus:${mergeStateStatus || 'unknown'}`,
    };
  }

  if (!Array.isArray(input.checks)) {
    return { eligible: false, reason: 'checks-unavailable' };
  }
  const blockers = classifyQueueCheckBlockers(input.checks);
  if (blockers.length > 0) {
    return { eligible: false, reason: `checks:${blockers.join(',')}` };
  }

  return { eligible: true, reason: 'green-source-clean' };
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function main(argv) {
  const cmd = argv[2] ?? 'classify';
  if (cmd === 'hold-re') {
    process.stdout.write(`${greenSourceHoldRegex()}\n`);
    return 0;
  }
  if (cmd === 'protected') {
    process.stdout.write(`${GREEN_SOURCE_PROTECTED_PRS.join(',')}\n`);
    return 0;
  }
  if (cmd === 'classify') {
    const raw = readStdin().trim();
    if (!raw) {
      process.stdout.write(
        `${JSON.stringify({ eligible: false, reason: 'malformed-input' })}\n`
      );
      return 0;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      process.stdout.write(
        `${JSON.stringify({ eligible: false, reason: 'malformed-input' })}\n`
      );
      return 0;
    }
    process.stdout.write(
      `${JSON.stringify(classifyGreenSourceDraft(parsed))}\n`
    );
    return 0;
  }
  console.error(
    'Usage: auto-ready-green-drafts.mjs <classify|hold-re|protected>'
  );
  return 2;
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  process.exitCode = main(process.argv);
}
