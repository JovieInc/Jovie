#!/usr/bin/env node

/**
 * Prevent desktop code from landing without release handling.
 *
 * Desktop changes need an explicit release handoff. Feature branches record
 * that handoff in Linear and the PR body; they must not edit CHANGELOG.md
 * (JOV-5378). The main/release path stamps VERSION and publishes the next DMG.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const DESKTOP_PATH_PREFIX = 'apps/desktop/';
const RELEASE_HANDLING_PATHS = new Set([
  'VERSION',
  '.github/workflows/desktop-release.yml',
]);
const LINEAR_ISSUE_MARKER = /<!--\s*linear-issue-id:\s*JOV-\d+\s*-->/;
const DESKTOP_HANDOFF_MARKER = /<!--\s*desktop-release-handoff\s*-->/;

function isDesktopReleaseImpactingFile(file) {
  if (!file.startsWith(DESKTOP_PATH_PREFIX)) {
    return false;
  }

  return !/^apps\/desktop\/scripts\/(?:.+\.test\.(mjs|ts|js)|smoke-.+\.mjs)$/.test(
    file
  );
}

function isMergeQueueHead(branch) {
  return String(branch || '')
    .replace(/^origin\//, '')
    .trim()
    .startsWith('gh-readonly-queue/');
}

export function hasRecordedDesktopReleaseEvidence(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return false;
  }
  return LINEAR_ISSUE_MARKER.test(text) && DESKTOP_HANDOFF_MARKER.test(text);
}

export function evaluateDesktopReleaseGuard(changedFiles, options = {}) {
  const normalizedFiles = changedFiles
    .map(file => file.trim())
    .filter(Boolean)
    .map(file => file.replace(/\\/g, '/'));

  const desktopFiles = normalizedFiles.filter(isDesktopReleaseImpactingFile);
  const releaseHandlingFiles = normalizedFiles.filter(file =>
    RELEASE_HANDLING_PATHS.has(file)
  );
  const recordedEvidence = hasRecordedDesktopReleaseEvidence(
    options.releaseEvidenceText
  );
  const queueHead = isMergeQueueHead(options.branch);
  const changelogTouched = normalizedFiles.includes('CHANGELOG.md');
  const hasReleaseHandoff =
    releaseHandlingFiles.length > 0 || recordedEvidence || queueHead;
  const stampPathAllowsChangelog = releaseHandlingFiles.includes('VERSION');

  return {
    changedFiles: normalizedFiles,
    desktopFiles,
    releaseHandlingFiles,
    recordedEvidence,
    queueHead,
    changelogTouched,
    passed:
      desktopFiles.length === 0 ||
      (hasReleaseHandoff && (!changelogTouched || stampPathAllowsChangelog)),
  };
}

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] || null;
}

function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function getChangedFiles(baseRef) {
  const mergeBase = git(['merge-base', baseRef, 'HEAD']);
  const committedOutput = git(['diff', '--name-only', mergeBase, 'HEAD']);
  const workingTreeOutput = git(['diff', '--name-only']);
  return [
    ...new Set(`${committedOutput}\n${workingTreeOutput}`.split('\n')),
  ].filter(Boolean);
}

function readGithubEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !existsSync(eventPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(eventPath, 'utf8'));
  } catch {
    return null;
  }
}

function getReleaseEvidenceText() {
  const evidenceFile = getArgValue('--evidence-file');
  if (evidenceFile) {
    return readFileSync(evidenceFile, 'utf8');
  }
  const eventBody = readGithubEvent()?.pull_request?.body;
  if (typeof eventBody === 'string' && eventBody.trim()) {
    return eventBody;
  }
  try {
    return execFileSync(
      'gh',
      ['pr', 'view', '--json', 'body', '--jq', '.body // ""'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
  } catch {
    return '';
  }
}

function getBranch() {
  const fromArg = getArgValue('--branch');
  if (fromArg) {
    return fromArg;
  }
  const envBranch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME;
  if (envBranch) {
    return envBranch;
  }
  try {
    return git(['branch', '--show-current']);
  } catch {
    return '';
  }
}

function main() {
  const baseRef =
    getArgValue('--base') ||
    (process.env.GITHUB_BASE_REF
      ? `origin/${process.env.GITHUB_BASE_REF}`
      : 'origin/main');

  let changedFiles;
  try {
    changedFiles = getChangedFiles(baseRef);
  } catch (error) {
    console.error(
      `[desktop-release-guard] Could not determine changed files against ${baseRef}.`
    );
    if (error instanceof Error && error.message) {
      console.error(error.message);
    }
    process.exit(1);
  }

  const result = evaluateDesktopReleaseGuard(changedFiles, {
    releaseEvidenceText: getReleaseEvidenceText(),
    branch: getBranch(),
  });

  if (result.passed) {
    if (result.desktopFiles.length === 0) {
      console.log('[desktop-release-guard] No apps/desktop changes detected.');
    } else if (result.releaseHandlingFiles.length > 0) {
      console.log(
        `[desktop-release-guard] Desktop release handled by ${result.releaseHandlingFiles.join(', ')}.`
      );
    } else if (result.recordedEvidence) {
      console.log(
        '[desktop-release-guard] Desktop release handled by Linear/PR handoff evidence.'
      );
    } else {
      console.log(
        '[desktop-release-guard] Desktop release handoff already enforced on the source PR.'
      );
    }
    return;
  }

  if (result.changelogTouched) {
    console.error(
      '[desktop-release-guard] apps/desktop changed with a pre-land CHANGELOG.md edit.'
    );
    console.error(
      "Do not add or edit CHANGELOG.md on implementation PRs. Record release evidence in Linear/the PR with <!-- desktop-release-handoff --> plus <!-- linear-issue-id:JOV-XXXX -->; the post-land release path owns What's New and VERSION."
    );
  } else {
    console.error(
      '[desktop-release-guard] apps/desktop changed without a DMG release trigger.'
    );
    console.error(
      "Record release evidence in Linear/the PR with <!-- desktop-release-handoff --> plus <!-- linear-issue-id:JOV-XXXX -->; the post-land release path owns What's New and VERSION. Or update .github/workflows/desktop-release.yml with explicit release workflow handling."
    );
  }
  console.error('Desktop files:');
  for (const file of result.desktopFiles) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
