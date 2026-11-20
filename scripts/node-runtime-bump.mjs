#!/usr/bin/env node
// Moves the production Node pin to a newer release in the same major, across
// every place that names it, so a patch never waits on a hand-edited PR.
//
//   node scripts/node-runtime-bump.mjs --latest     # newest release in the pinned major
//   node scripts/node-runtime-bump.mjs --to 24.23.0
//
// A new major also needs the self-hosted runner image rebuilt on its host, so
// it stays on the promotion path in docs/engineering/NODE_RUNTIME_LIFECYCLE.md.
// Writes from/to/changed to GITHUB_OUTPUT when that file is set.
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
// Every live consumer of the exact production pin (the set PR 24398 edited by
// hand). Evidence logs and history that merely quote a version stay as written.
// A new consumer belongs here; the pin contract tests fail until it is added.
export const PIN_FILES = [
  '.nvmrc',
  '.node-version',
  'package.json',
  'apps/console/package.json',
  'apps/docs/package.json',
  'apps/macos/package.json',
  'apps/ovie/package.json',
  'apps/should-i-make/package.json',
  'apps/web/package.json',
  'packages/jovie-cli/package.json',
  'packages/ui/package.json',
  '.github/runner-image/Dockerfile',
  '.github/runner-image/README.md',
  '.github/runner-image/prerequisites.json',
  '.github/workflows/ci.yml',
  '.github/workflows/controller-quota-replay.yml',
  '.github/workflows/npm-publish.yml',
  '.github/workflows/pr-conflict-handler.yml',
  '.github/workflows/production-controller.yml',
  '.github/workflows/staging-controller.yml',
  '.github/scripts/staging-lane-carryover.test.mjs',
  'apps/web/tests/unit/ci/node-runtime-contract.test.ts',
  'apps/web/tests/unit/ci/runner-setup-action.test.ts',
  'apps/web/tests/unit/marketing/cli-landing.test.tsx',
  'apps/web/lib/music-resolver/parity/runtime.test.ts',
  'apps/web/components/marketing/CliLandingPage.tsx',
  'packages/jovie-cli/scripts/npm-publish-workflow.test.ts',
  'packages/jovie-cli/scripts/publication-metadata.test.ts',
  'scripts/copy-inventory/ids.gen.json',
  'docs/doc-freshness-registry.json',
  '.claude/rules/environment.md',
  '.claude/skills/linear-demo-parity.md',
  'CODEX.md',
  'README.md',
  'apps/ovie/README.md',
  'skills/jovie/README.md',
];
// Records that quote a pin file's SHA-256 (whole file, or a scoped rule's body),
// in the order they must be refreshed: a later record may fingerprint an
// earlier one.
const FINGERPRINT_FILES = [
  'scripts/agent-context/rule-scopes.json',
  'docs/doc-freshness-registry.json',
  'docs/REPOSITORY_SOURCES.md',
];
const RULE_BODY = /^---\npaths: .+\n---\n\n([\s\S]*)$/;

// Scoped-rule bodies are fingerprinted only by rule-scopes.json; a doc-review
// hash elsewhere is a human review stamp and is never refreshed here.
const RULE_BODY_RECORD = 'scripts/agent-context/rule-scopes.json';

function recordHashes(hashes, before, after) {
  hashes.file.set(sha256(before), sha256(after));
  const [ruleBefore, ruleAfter] = [before, after].map(t => RULE_BODY.exec(t));
  if (ruleBefore && ruleAfter)
    hashes.ruleBody.set(sha256(ruleBefore[1]), sha256(ruleAfter[1]));
}
const DOCKER_IMAGE = /node:(\d+\.\d+\.\d+)-bookworm@sha256:[0-9a-f]{64}/g;

const sha256 = text => createHash('sha256').update(text).digest('hex');
const parse = version => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) throw new Error(`not a Node version: ${version}`);
  return match.slice(1).map(Number);
};
const newer = (a, b) => {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Replace one exact version everywhere: plain (24.22.2) and regex-escaped (24\.22\.2). */
export function replaceVersion(text, from, to) {
  const plain = new RegExp(`(?<![\\d.])${escape(from)}(?![\\d])`, 'g');
  const escapedFrom = from.replaceAll('.', '\\.');
  const escapedTo = to.replaceAll('.', '\\.');
  const regexForm = new RegExp(
    `(?<![\\d.])${escape(escapedFrom)}(?![\\d])`,
    'g'
  );
  return text.replace(regexForm, escapedTo).replace(plain, to);
}

export function latestInMajor(index, major) {
  return index
    .map(release => release.version.replace(/^v/, ''))
    .filter(version => /^\d+\.\d+\.\d+$/.test(version))
    .filter(version => parse(version)[0] === major)
    .sort((a, b) => (newer(a, b) ? -1 : newer(b, a) ? 1 : 0))[0];
}

async function fetchText(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
}

async function nodeTarballSha(version) {
  const sums = await (
    await fetchText(`https://nodejs.org/dist/v${version}/SHASUMS256.txt`)
  ).text();
  const line = sums
    .split('\n')
    .find(row => row.endsWith(` node-v${version}-linux-x64.tar.xz`));
  if (!line) throw new Error(`no linux-x64 tarball listed for ${version}`);
  return line.split(/\s+/)[0];
}

async function dockerAmd64Digest(version) {
  const { token } = /** @type {{ token: string }} */ (
    await (
      await fetchText(
        'https://auth.docker.io/token?service=registry.docker.io&scope=repository:library/node:pull'
      )
    ).json()
  );
  /** @type {{ manifests?: { digest: string, platform?: { os?: string, architecture?: string } }[] }} */
  const index = await (
    await fetchText(
      `https://registry-1.docker.io/v2/library/node/manifests/${version}-bookworm`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept:
            'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json',
        },
      }
    )
  ).json();
  const amd64 = index.manifests?.find(
    entry =>
      entry.platform?.os === 'linux' && entry.platform?.architecture === 'amd64'
  );
  if (!amd64)
    throw new Error(`node:${version}-bookworm has no linux/amd64 image`);
  return amd64.digest;
}

/**
 * @typedef {{ version: string }} Release
 * @typedef {{
 *   index?: () => Promise<Release[]>,
 *   tarballSha?: (version: string) => Promise<string>,
 *   dockerDigest?: (version: string) => Promise<string>,
 * }} Lookups
 * @param {{ root?: string, to?: string, latest?: boolean, lookups?: Lookups }} options
 */
export async function bump({ root = defaultRoot, to, latest, lookups = {} }) {
  const from = readFileSync(resolve(root, '.nvmrc'), 'utf8').trim();
  const [major] = parse(from);
  let target = to;
  if (latest) {
    const index = lookups.index
      ? await lookups.index()
      : /** @type {Release[]} */ (
          await (await fetchText('https://nodejs.org/dist/index.json')).json()
        );
    target = latestInMajor(index, major);
  }
  if (!target) throw new Error('pass --to <version> or --latest');
  target = target.replace(/^v/, '');
  if (parse(target)[0] !== major)
    throw new Error(
      `${target} is a new major; promote majors through docs/engineering/NODE_RUNTIME_LIFECYCLE.md`
    );
  if (!newer(target, from)) return { from, to: from, changed: [] };

  const tarballSha = await (lookups.tarballSha ?? nodeTarballSha)(target);
  const dockerDigest = await (lookups.dockerDigest ?? dockerAmd64Digest)(
    target
  );
  const files = PIN_FILES.filter(file => existsSync(resolve(root, file)));
  const oldTarballSha = /^ARG NODE_LINUX_X64_SHA256=([0-9a-f]{64})$/m.exec(
    readFileSync(resolve(root, '.github/runner-image/Dockerfile'), 'utf8')
  )?.[1];
  const hashes = { file: new Map(), ruleBody: new Map() };
  const changed = [];
  for (const file of files) {
    const path = resolve(root, file);
    const before = readFileSync(path, 'utf8');
    let after = replaceVersion(before, from, target);
    if (oldTarballSha) after = after.replaceAll(oldTarballSha, tarballSha);
    after = after.replace(DOCKER_IMAGE, (match, version) =>
      version === target ? `node:${target}-bookworm@${dockerDigest}` : match
    );
    if (after === before) continue;
    writeFileSync(path, after);
    recordHashes(hashes, before, after);
    changed.push(file);
  }
  // Fingerprint records (docs/REPOSITORY_SOURCES.md and the like) quote the
  // whole-file SHA-256 of a pin file; carry those forward with the edit.
  for (const file of FINGERPRINT_FILES.filter(f =>
    existsSync(resolve(root, f))
  )) {
    const path = resolve(root, file);
    const before = readFileSync(path, 'utf8');
    let after = before;
    const map = file === RULE_BODY_RECORD ? hashes.ruleBody : hashes.file;
    for (const [old, next] of map) after = after.replaceAll(old, next);
    if (after !== before) {
      writeFileSync(path, after);
      recordHashes(hashes, before, after);
      if (!changed.includes(file)) changed.push(file);
    }
  }
  return { from, to: target, changed };
}

async function main() {
  const args = process.argv.slice(2);
  const toIndex = args.indexOf('--to');
  const result = await bump({
    to: toIndex >= 0 ? args[toIndex + 1] : undefined,
    latest: args.includes('--latest'),
  });
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `from=${result.from}\nto=${result.to}\nchanged=${result.changed.length > 0}\n`
    );
  process.stdout.write(
    result.changed.length
      ? `Node ${result.from} -> ${result.to} in ${result.changed.length} files:\n${result.changed.join('\n')}\n`
      : `Node ${result.from} is already the newest release in its major\n`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
}
