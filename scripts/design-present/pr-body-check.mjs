#!/usr/bin/env node
/**
 * CI half of the presentation gate: a PR body that shows UI screenshots must
 * point at a passing design-present receipt committed on the PR head.
 *
 *   node scripts/design-present/pr-body-check.mjs [--body-file <path>]
 *
 * Reads the body from --body-file or the pull_request event payload
 * (GITHUB_EVENT_PATH). No network calls. For each receipt it re-runs the
 * deterministic invariants from the committed geometry, re-hashes every image
 * and requires vision=pass, so a hand-edited `"pass": true` cannot pass.
 *
 * Images in the body must be files listed in a passing receipt. A body with
 * no images passes. A deliberate non-UI image (a chart, a log capture) may be
 * exempted with `<!-- design-present-exempt: <reason> -->`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateSet,
  gateVersion,
  RECEIPT_SCHEMA,
  REPO_ROOT,
  sha256File,
} from './present-check.mjs';

const IMAGE_MD = /!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g;
const IMAGE_HTML = /<img\b[^>]*\bsrc=["']([^"']+)["']/gi;
const IMAGE_LINK = /\bhttps?:\/\/\S+?\.(?:png|jpe?g|webp|gif)\b/gi;
const RECEIPT_MARKER = /<!--\s*design-present\/v1\s+receipt=(\S+?)\s*-->/g;
const EXEMPT_MARKER = /<!--\s*design-present-exempt:\s*(.+?)\s*-->/;

export function extractImages(body) {
  const found = new Set();
  for (const re of [IMAGE_MD, IMAGE_HTML, IMAGE_LINK])
    for (const m of body.matchAll(re)) found.add(m[1] ?? m[0]);
  return [...found];
}

/** Repo path an image URL points at, if it is a file in this repository. */
export function repoPathOf(url) {
  const blob = url.match(
    /github\.com\/[^/]+\/[^/]+\/(?:blob|raw)\/[^/]+\/([^?#]+)/
  );
  if (blob) return decodeURIComponent(blob[1]);
  const raw = url.match(
    /raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/([^?#]+)/
  );
  if (raw) return decodeURIComponent(raw[1]);
  if (!/^[a-z]+:/i.test(url)) return url.replace(/^\.?\//, '');
  return null;
}

export function verifyReceipt(receiptPath, root = REPO_ROOT) {
  const errors = [];
  const abs = join(root, receiptPath);
  if (!existsSync(abs))
    return {
      errors: [`receipt ${receiptPath} is not on the PR head`],
      files: [],
    };
  const receipt = JSON.parse(readFileSync(abs, 'utf8'));
  if (receipt.schema !== RECEIPT_SCHEMA)
    errors.push(`receipt schema ${receipt.schema} is not ${RECEIPT_SCHEMA}`);
  if (receipt.gateVersion !== gateVersion())
    errors.push(
      `receipt was made by gate ${receipt.gateVersion}; current gate is ${gateVersion()}: rerun pnpm design:present-check`
    );
  if (receipt.pass !== true) errors.push('receipt did not pass');
  const files = [];
  for (const screen of receipt.screens ?? []) {
    if (screen.vision?.status !== 'pass')
      errors.push(
        `${screen.id}: vision critique is ${screen.vision?.status ?? 'missing'}`
      );
    for (const need of ['pen', 'before', 'after', 'triptych', 'geometry'])
      if (!screen.files?.[need])
        errors.push(`${screen.id}: no ${need} image in receipt`);
    for (const [kind, file] of Object.entries(screen.files ?? {})) {
      const p = join(root, file.path);
      if (!existsSync(p))
        errors.push(`${screen.id}: ${kind} ${file.path} is missing`);
      else if (sha256File(p) !== file.sha256)
        errors.push(
          `${screen.id}: ${kind} ${file.path} changed after the gate ran`
        );
      files.push(file.path);
    }
  }
  // Recompute the deterministic verdict from committed geometry.
  for (const result of evaluateSet(join(root, receipt.manifest)))
    if (!result.pass)
      errors.push(
        `${result.id}: invariants fail on committed geometry: ${result.failures.map(f => `${f.rule} ${f.message}`).join('; ')}`
      );
  return { errors, files };
}

export function checkPrBody(body, root = REPO_ROOT) {
  const images = extractImages(body ?? '');
  if (!images.length)
    return { ok: true, message: 'no screenshots in the PR body' };
  const exempt = body.match(EXEMPT_MARKER);
  const receipts = [...body.matchAll(RECEIPT_MARKER)].map(m => m[1]);
  if (!receipts.length) {
    if (exempt)
      return { ok: true, message: `screenshots exempt: ${exempt[1]}` };
    return {
      ok: false,
      message:
        'This PR body shows screenshots without a design-present receipt. Run `pnpm design:present-check --manifest <set>/manifest.json`, commit the set, and add `<!-- design-present/v1 receipt=docs/design-present/<set>/receipt.json -->`. Never show a screenshot that fails our invariants (.claude/rules/design-present.md).',
    };
  }
  const errors = [];
  const allowed = new Set();
  for (const r of receipts) {
    const result = verifyReceipt(r, root);
    errors.push(...result.errors.map(e => `${r}: ${e}`));
    for (const f of result.files) allowed.add(f);
  }
  if (!exempt)
    for (const url of images) {
      const path = repoPathOf(url);
      if (!path || !allowed.has(path))
        errors.push(
          `image ${url} is not an artifact of a passing design-present receipt`
        );
    }
  return errors.length
    ? { ok: false, message: errors.join('\n') }
    : {
        ok: true,
        message: `design-present receipts pass: ${receipts.join(', ')}`,
      };
}

function readBody(args) {
  const i = args.indexOf('--body-file');
  if (i >= 0) return readFileSync(args[i + 1], 'utf8');
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath && existsSync(eventPath))
    return JSON.parse(readFileSync(eventPath, 'utf8')).pull_request?.body ?? '';
  return '';
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const result = checkPrBody(readBody(process.argv.slice(2)));
  console.log(
    `${result.ok ? 'PASS' : 'FAIL'} design-present PR body: ${result.message}`
  );
  process.exit(result.ok ? 0 : 1);
}
