#!/usr/bin/env node
/**
 * Auto-ready authorization is provenance, not a branch prefix.
 *
 * A draft may be promoted only when the PR author is an allowlisted bot or
 * the exact current head is an FX child of the signed `FX-Source-Head`
 * trailer with trusted App/run provenance. Branch names never authorize.
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { HUMAN_POLICY_HOLD_LABELS } from './queue-deferral-receipt.mjs';

export const TRUSTED_BOT_AUTHORS = Object.freeze(['jovie-bot[bot]']);
export const FX_WRITER_NAME = 'jovie-fx[bot]';
export const FX_WRITER_EMAIL = 'jovie-fx[bot]@users.noreply.github.com';
export const FX_APP_LOGINS = Object.freeze(['jovie-bot[bot]']);
export const FX_SOURCE_HEAD_TRAILER = 'FX-Source-Head';
export const TRUSTED_FX_WORKFLOW_PATH =
  '.github/workflows/rolling-ci-dispatch.yml';
export const TRUSTED_FX_WORKFLOW_NAME = 'Rolling CI Dispatch';

const SHA_RE = /^[0-9a-f]{40}$/;
const TRAILER_RE = /^FX-Source-Head:\s*([0-9a-f]{40})\s*$/im;
const NO_AUTO_HOLD_LABELS = Object.freeze([
  'no-auto',
  'no-auto-merge',
  'no-automerge',
]);
const EXTRA_HOLD_LABELS = Object.freeze([
  'queue-deferred',
  'security',
  'needs:security',
  'human-review-required',
]);
export const CONTROLLED_PROOF_LABELS = Object.freeze([
  'canary',
  'controlled-proof',
  'deliberate-red',
  'proof',
]);
export const AUTO_READY_HOLD_LABELS = Object.freeze([
  ...HUMAN_POLICY_HOLD_LABELS,
  ...NO_AUTO_HOLD_LABELS,
  ...EXTRA_HOLD_LABELS,
  ...CONTROLLED_PROOF_LABELS,
]);
const CONTROLLED_PROOF_TITLE_RE =
  /[\[(](?:canary|controlled-proof|deliberate-red)[\])]/i;
const CONTROLLED_PROOF_BRANCH_RE =
  /(^|\/)(?:canary|controlled-proof|deliberate-red)(\/|$)/i;

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

function normalizeLogin(login) {
  return typeof login === 'string' ? login.trim().toLowerCase() : '';
}

function labelsOf(labels) {
  return (labels ?? []).map(labelName).filter(Boolean);
}

export function isTrustedBotAuthor(login) {
  const normalized = normalizeLogin(login);
  return TRUSTED_BOT_AUTHORS.some(
    author => author.toLowerCase() === normalized
  );
}

export function hasAutoReadyHold(labels = []) {
  const holds = new Set(
    AUTO_READY_HOLD_LABELS.map(label => label.toLowerCase())
  );
  return labelsOf(labels).some(label => holds.has(label.toLowerCase()));
}

export function autoReadyHoldRegex() {
  const escaped = AUTO_READY_HOLD_LABELS.map(name =>
    name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  return `^(${escaped.join('|')})$`;
}

export function hasControlledProofMarker(input = {}) {
  const labels = labelsOf(input.labels).map(label => label.toLowerCase());
  if (labels.some(label => CONTROLLED_PROOF_LABELS.includes(label))) {
    return true;
  }
  const branch = typeof input.branch === 'string' ? input.branch : '';
  const title = typeof input.title === 'string' ? input.title : '';
  return (
    CONTROLLED_PROOF_BRANCH_RE.test(branch) ||
    CONTROLLED_PROOF_TITLE_RE.test(title)
  );
}

export function parseFxSourceHeadTrailer(message) {
  if (typeof message !== 'string' || message.length === 0) return '';
  const matches = [...message.matchAll(new RegExp(TRAILER_RE, 'gim'))];
  if (matches.length !== 1) return '';
  return exactSha(matches[0][1]);
}

function loginIsTrustedApp(login) {
  const normalized = normalizeLogin(login);
  return FX_APP_LOGINS.some(app => app.toLowerCase() === normalized);
}

export function classifyFxRunProvenance(run, parentSha) {
  const parent = exactSha(parentSha);
  if (!run || typeof run !== 'object' || !parent) {
    return { ok: false, reason: 'fx-run-missing' };
  }
  const path = String(run.workflowPath ?? run.path ?? '');
  const name = String(run.workflowName ?? run.name ?? '');
  const conclusion = String(run.conclusion ?? '');
  const event = String(run.event ?? '');
  const headSha = exactSha(run.headSha ?? run.head_sha ?? '');
  const pathOk =
    path === TRUSTED_FX_WORKFLOW_PATH ||
    path.endsWith('rolling-ci-dispatch.yml');
  const nameOk = name === TRUSTED_FX_WORKFLOW_NAME || name.length === 0;
  if (!pathOk || !nameOk) {
    return { ok: false, reason: 'fx-run-untrusted-workflow' };
  }
  if (conclusion !== 'success') {
    return { ok: false, reason: 'fx-run-not-successful' };
  }
  if (event && event !== 'workflow_run') {
    return { ok: false, reason: 'fx-run-untrusted-event' };
  }
  if (headSha !== parent) {
    return { ok: false, reason: 'fx-run-head-mismatch' };
  }
  return { ok: true, reason: 'trusted-fx-run' };
}

export function classifyFxChildCommit(input = {}) {
  const commit = input.commit;
  const headSha = exactSha(input.headSha ?? commit?.sha ?? '');
  if (!commit || typeof commit !== 'object' || !headSha) {
    return { eligible: false, reason: 'commit-provenance-required' };
  }
  const commitSha = exactSha(commit.sha ?? '');
  if (!commitSha || commitSha !== headSha) {
    return { eligible: false, reason: 'moved-head' };
  }
  const parents = Array.isArray(commit.parentShas)
    ? commit.parentShas.map(exactSha).filter(Boolean)
    : exactSha(commit.parentSha)
      ? [exactSha(commit.parentSha)]
      : [];
  if (parents.length !== 1) {
    return { eligible: false, reason: 'ambiguous-provenance' };
  }
  const trailer = parseFxSourceHeadTrailer(commit.message ?? '');
  if (!trailer) {
    return { eligible: false, reason: 'human-authored-unrepaired' };
  }
  if (trailer !== parents[0]) {
    return { eligible: false, reason: 'fx-parent-mismatch' };
  }
  const authorName = String(commit.authorName ?? '').trim();
  const authorEmail = String(commit.authorEmail ?? '')
    .trim()
    .toLowerCase();
  if (authorName !== FX_WRITER_NAME || authorEmail !== FX_WRITER_EMAIL) {
    return { eligible: false, reason: 'fx-writer-identity-mismatch' };
  }
  const verified = commit.verified === true;
  const appLogin =
    loginIsTrustedApp(commit.authorLogin) ||
    loginIsTrustedApp(commit.committerLogin);
  if (!verified && !appLogin) {
    return { eligible: false, reason: 'fx-app-provenance-missing' };
  }
  const run = classifyFxRunProvenance(input.fxRun, trailer);
  if (!run.ok) {
    return { eligible: false, reason: run.reason };
  }
  return { eligible: true, reason: 'trusted-fx-child' };
}

export function classifyAutoReadyPromotion(input = {}) {
  if (hasControlledProofMarker(input)) {
    return { eligible: false, reason: 'controlled-proof' };
  }
  if (hasAutoReadyHold(input.labels)) {
    return { eligible: false, reason: 'held' };
  }
  if (isTrustedBotAuthor(input.authorLogin)) {
    return { eligible: true, reason: 'trusted-bot-author' };
  }
  return classifyFxChildCommit(input);
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
    process.stdout.write(`${autoReadyHoldRegex()}\n`);
    return 0;
  }
  if (cmd === 'trailer') {
    process.stdout.write(`${parseFxSourceHeadTrailer(readStdin())}\n`);
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
      `${JSON.stringify(classifyAutoReadyPromotion(parsed))}\n`
    );
    return 0;
  }
  console.error('Usage: auto-ready-provenance.mjs <classify|hold-re|trailer>');
  return 2;
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  process.exitCode = main(process.argv);
}
