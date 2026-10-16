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
import {
  ADMISSION_BLOCKING_LABELS,
  MACHINE_BLOCK_LABELS,
} from './admission-hold-labels.mjs';
import { hasControlledProofMarker } from './auto-ready-provenance.mjs';
import { classifyQueueCheckBlockers } from './pr-check-failures.mjs';
import { WRITER_PROMOTION_HOLD_LABELS } from './writer-owned-pr-promotion.mjs';

export const GREEN_SOURCE_PROTECTED_PRS = Object.freeze([
  17156, // HOLD — waitlist-first revert; never undraft/enroll
]);

export const TIM_HOLD_LABELS = Object.freeze([
  'tim-hold',
  'tim:hold',
  'hold:tim',
]);

const MACHINE_BLOCKS = new Set(MACHINE_BLOCK_LABELS);

// Stop labels and queue-poison park a draft: undrafting them only wakes work
// green enroll must skip. lane-fix-red is cleared by the Lane Fix Relay once
// required checks are green, so it must not park an otherwise-ready draft.
export const GREEN_SOURCE_HOLD_LABELS = Object.freeze([
  ...new Set([
    ...WRITER_PROMOTION_HOLD_LABELS,
    ...TIM_HOLD_LABELS,
    ...ADMISSION_BLOCKING_LABELS.filter(label => !MACHINE_BLOCKS.has(label)),
  ]),
]);

// UNSTABLE means only non-required checks are red or pending. The fail-closed
// check-blocker scan below still rejects every terminal non-advisory failure,
// so an UNSTABLE draft is admitted only when its remaining noise is advisory.
export const GREEN_SOURCE_MERGE_STATES = Object.freeze(['CLEAN', 'UNSTABLE']);

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
  // Someone converted this PR to draft after its last push: a deliberate park
  // (e.g. a dequeued PR held out of the queue). Only a new push or a person
  // marking it ready ends the park; this controller never overrides it.
  if (input.parkedDraft === true) {
    return { eligible: false, reason: 'parked-draft' };
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
  if (!GREEN_SOURCE_MERGE_STATES.includes(mergeStateStatus)) {
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

function prNumberOf(pr) {
  const number = Number.parseInt(String(pr?.number ?? pr?.n ?? ''), 10);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
}

function skippedByStaticPolicy(pr) {
  return (
    isProtectedGreenSourcePr(prNumberOf(pr)) ||
    hasGreenSourceHold(pr.labels) ||
    hasControlledProofMarker({
      labels: pr.labels,
      branch: pr.headRefName ?? pr.branch,
      title: pr.title,
    })
  );
}

function rotate(list, offset) {
  if (list.length === 0) return list;
  const start =
    (((Number.parseInt(String(offset ?? 0), 10) || 0) % list.length) +
      list.length) %
    list.length;
  return [...list.slice(start), ...list.slice(0, start)];
}

/**
 * Missed-event recovery cohort: open main drafts that already look green in a
 * single `gh pr list` snapshot. Live state and checks are re-read per PR before
 * any mutation, so this is discovery only. The rotation offset (the workflow
 * run number) keeps a permanently ineligible draft from starving the rest.
 */
export function selectMissedCohort(prs = [], options = {}) {
  const limit = Math.max(
    0,
    Number.parseInt(String(options.limit ?? 0), 10) || 0
  );
  if (limit === 0) return [];
  const skip = Number.parseInt(String(options.skip ?? 0), 10) || 0;
  const candidates = (Array.isArray(prs) ? prs : [])
    .filter(pr => pr && (pr.isDraft === true || pr.draft === true))
    .filter(pr => String(pr.baseRefName ?? '') === 'main')
    .filter(pr => prNumberOf(pr) > 0 && prNumberOf(pr) !== skip)
    .filter(pr => !skippedByStaticPolicy(pr))
    .filter(pr => String(pr.mergeable ?? '').toUpperCase() === 'MERGEABLE')
    .filter(pr =>
      GREEN_SOURCE_MERGE_STATES.includes(
        String(pr.mergeStateStatus ?? '').toUpperCase()
      )
    )
    .map(prNumberOf)
    .sort((a, b) => a - b);
  return rotate(candidates, options.offset).slice(0, limit);
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
  if (cmd === 'cohort') {
    let parsed = [];
    try {
      parsed = JSON.parse(readStdin().trim() || '[]');
    } catch {
      parsed = [];
    }
    const options = {
      limit: argv[3] ?? 0,
      offset: argv[4] ?? 0,
      skip: argv[5] ?? 0,
    };
    const out = selectMissedCohort(parsed, options).map(String);
    if (out.length > 0) process.stdout.write(`${out.join('\n')}\n`);
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
    'Usage: auto-ready-green-drafts.mjs <classify|cohort|hold-re|protected>'
  );
  return 2;
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  process.exitCode = main(process.argv);
}
