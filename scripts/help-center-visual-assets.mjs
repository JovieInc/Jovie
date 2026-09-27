#!/usr/bin/env node

/**
 * Help Center visual proof asset tooling (JOV-5900).
 *
 * Commands:
 *   audit [--repo <root>]
 *     Compare article visualProofRefs, the capture plan, files under
 *     apps/docs/public/proof/, and manifest.json. Exits non-zero on any
 *     finding (missing, orphaned, duplicate, dimensionally invalid, stale, or
 *     unsafe assets).
 *
 *   affected --base <sha> --head <sha>
 *     Print the capture-plan entries whose articles are affected by the diff
 *     (reuses findAffectedArticles: route changes, feature state changes, and
 *     productSourceRefs path matches). Feed the result to Playwright:
 *       node scripts/help-center-visual-assets.mjs affected --base $B --head $H \
 *         | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).grep))'
 *       pnpm --filter web docs-guide-shots -- --grep "<pattern>"
 *
 *   issues [--repo <root>]
 *     Run the audit and print remediation issue payloads (one per affected
 *     article). Pass --sync-linear to upsert them via Linear.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadArticleRegistry } from '../apps/docs/lib/article-registry.mjs';
import {
  auditVisualProofAssets,
  buildVisualProofIssue,
  PROOF_REF_PREFIX,
  parsePngDimensions,
  selectAffectedPlanEntries,
} from '../apps/docs/lib/visual-proof-assets.mjs';
import { evaluateRevisionChange } from './help-center-recertification.mjs';
import { upsertLinearIssueByTitleFingerprint } from './lib/linear-issue-intake.mjs';

const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const PROOF_DIR = join(REPO_ROOT, 'apps/docs/public/proof');
const PLAN_PATH = join(REPO_ROOT, 'apps/web/tests/docs-guides/plan.json');
const MANIFEST_PATH = join(PROOF_DIR, 'manifest.json');

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function currentGitSha() {
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
    return /^[0-9a-f]{40}$/i.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

function listProofAssets() {
  const assets = new Map();
  let names = [];
  try {
    names = readdirSync(PROOF_DIR).sort();
  } catch {
    return assets;
  }
  for (const name of names) {
    if (!name.endsWith('.png')) continue;
    const bytes = readFileSync(join(PROOF_DIR, name));
    const dimensions = parsePngDimensions(bytes) ?? {
      width: 0,
      height: 0,
    };
    assets.set(`${PROOF_REF_PREFIX}${name}`, {
      sha256: createHash('sha256').update(bytes).digest('hex'),
      ...dimensions,
    });
  }
  return assets;
}

function runAudit() {
  const { articles } = loadArticleRegistry();
  const plan = readJson(PLAN_PATH, { entries: [] });
  const manifest = readJson(MANIFEST_PATH, []);
  return auditVisualProofAssets({
    articles,
    planEntries: plan.entries,
    assets: listProofAssets(),
    manifestEntries: manifest,
    currentGitSha: currentGitSha(),
  });
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

async function main() {
  const command = process.argv[2];

  if (command === 'affected') {
    const base = argument('--base');
    const head = argument('--head');
    if (!base || !head) {
      throw new Error(
        'usage: help-center-visual-assets affected --base <sha> --head <sha>'
      );
    }
    const evaluation = evaluateRevisionChange({ base, head });
    const plan = readJson(PLAN_PATH, { entries: [] });
    const entries = selectAffectedPlanEntries(
      plan.entries,
      evaluation.affected
    );
    const grep =
      entries.length === 0
        ? null
        : entries.map(entry => entry.articleId).join('|');
    process.stdout.write(
      `${JSON.stringify({ affected: evaluation.affected, entries, grep })}\n`
    );
    return;
  }

  if (command === 'audit' || command === 'issues') {
    const findings = runAudit();
    const articleIds = [
      ...new Set(findings.map(item => item.articleId).filter(Boolean)),
    ].sort();
    const issues = articleIds.map(articleId =>
      buildVisualProofIssue({ articleId, findings })
    );

    if (command === 'issues' && process.argv.includes('--sync-linear')) {
      const results = [];
      for (const issue of issues) {
        const result = await upsertLinearIssueByTitleFingerprint({
          fingerprint: issue.fingerprint,
          title: `[${issue.fingerprint}] ${issue.title}`,
          description: issue.body,
          priority: 2,
          createStateName: 'Todo',
          reopenTerminal: true,
          apiKey: process.env.LINEAR_API_KEY,
        });
        if (!result.ok) {
          throw new Error(
            `visual proof issue failed for ${issue.fingerprint}: ${result.reason}`
          );
        }
        results.push({ fingerprint: issue.fingerprint, ...result });
      }
      process.stdout.write(
        `${JSON.stringify({ findings, issues: results })}\n`
      );
      return;
    }

    process.stdout.write(`${JSON.stringify({ findings, issues })}\n`);
    if (command === 'audit' && findings.length > 0) process.exitCode = 1;
    return;
  }

  throw new Error(
    'usage: help-center-visual-assets <audit|affected|issues> [options]'
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(1);
  });
}
