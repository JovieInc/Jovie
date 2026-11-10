#!/usr/bin/env node
// AI review boundary — merge gates stay deterministic.
//
// Policy (Tim, 2026-11-09): model-backed reviewers (Sentry Seer, Warden, or any
// other AI code reviewer) may post advisory PR comments, but must never gate a
// merge: no requestChanges review submissions, no --fail-on CI gating, no
// failCheck / fail-level verdicts, and no AI check added as a required status
// check. This guard fails when a file under .github/workflows or
// .github/scripts pairs an AI-reviewer marker with a blocking signal.
// Wired as a step in the required Company Guards job.
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

export const MARKER =
  /(seer|warden|ai[ _-]?review|llm[ _-]?review|openrouter|claude[ _-]?review|codex[ _-]?review|copilot[ _-]?review|review[ _-]?(agent|bot))/i;

export const BLOCKING =
  /(request[ _-]?changes|--fail-on\b|failcheck|fail[ _-]?check|fail[ _-]?level)/i;

const TEXT = /\.(ya?ml|mjs|cjs|js|py|sh)$/;
// The guard must not flag its own source or tests (they name the banned signals).
const SELF = /^(ai-review-boundary|verify-ai-review-boundary)(\.test)?\./;
const ROOTS = ['.github/workflows', '.github/scripts'];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

// A file is an AI reviewer when its path or content names a model-backed
// reviewer, and it is blocking when it also carries a merge-gating signal.
// Advisory reviewers (comment-only) never match BLOCKING and pass.
export function scanFile(path, text) {
  const rel = path.split(/[\\/]/);
  if (SELF.test(rel[rel.length - 1])) return null;
  if (!TEXT.test(path)) return null;
  const isAiReviewer = MARKER.test(path) || MARKER.test(text);
  if (!isAiReviewer) return null;
  const signal = text.match(BLOCKING);
  if (!signal) return null;
  return signal[0];
}

export function scan(root) {
  const violations = [];
  for (const dir of ROOTS) {
    for (const file of walk(join(root, dir))) {
      if (!TEXT.test(file)) continue;
      let text;
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      const signal = scanFile(relative(root, file), text);
      if (signal) violations.push({ file: relative(root, file), signal });
    }
  }
  return violations;
}

export function main(argv = process.argv.slice(2)) {
  const rootFlag = argv.indexOf('--root');
  const root = rootFlag >= 0 ? argv[rootFlag + 1] : '.';
  const violations = scan(root);
  for (const v of violations) {
    console.error(
      `::error file=${v.file}::ai-review-boundary: AI reviewer may gate merges (matched "${v.signal}"). AI review is advisory only: never requestChanges, never --fail-on, never failCheck, never a required check.`
    );
  }
  console.log(
    `ai-review-boundary: ${violations.length ? 'FAIL' : 'ok'} (scanned ${ROOTS.join(', ')})`
  );
  return violations.length ? 1 : 0;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  process.exit(main());
}
