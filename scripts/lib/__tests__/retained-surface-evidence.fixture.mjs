import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { onTestFinished } from 'vitest';
import * as censusReader from '../../design-surface-census.mjs';
import { CENSUS_PATH } from '../../design-surface-census.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const start = '2026-10-15T04:36:00Z';

function fixture() {
  return {
    schema: 'jovie.design-surface-census/v1',
    startedAt: start,
    groups: [
      {
        id: 'pricing',
        area: 'marketing',
        owner: '@itstimwhite',
        issue: 'JOV-8097',
        importance: { acquisition: 3, revenue: 3, usage: 3 },
        status: 'holdout',
        expectedOwners: ['apps/web/components/site/PublicPageShell.tsx'],
        remainingScope: 'Certify pricing',
        divergence: 'Minimal footer',
        evidence: { kind: 'source-audit', at: start, ref: 'before' },
        sources: ['apps/web/app/(marketing)/pricing/page.tsx'],
      },
    ],
    excluded: { reason: 'Internal fixtures', sources: [] },
    transitions: [],
  };
}
function complete(census, at = '2026-10-21T04:36:00Z') {
  for (const group of census.groups) {
    group.status = 'canonical';
    group.evidence = { kind: 'certification', at, ref: 'exact-build-render' };
    for (const source of group.sources)
      census.transitions.push({
        source,
        from: 'holdout',
        to: 'canonical',
        at,
        evidence: 'exact-build-render',
      });
  }
  return census;
}

const retainedPixelSentinel = 'RETAINED_PIXEL_SENTINEL_DO_NOT_EMIT';
const retainedDirectory = 'docs/screenshots/pricing-fixture';
const retainedLegacyReadme = 'docs/screenshots/pricing-legacy/README.md';
const retainedImage = `${retainedDirectory}/pricing-390.png`;
const retainedCapture = `${retainedDirectory}/capture.json`;
const retainedSource = 'apps/web/app/(marketing)/pricing/page.tsx';
const retainedOwner = 'apps/web/components/site/PublicPageShell.tsx';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function retainedFixture(options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'census-retained-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Retention fixture',
    GIT_AUTHOR_EMAIL: 'retention@example.invalid',
    GIT_COMMITTER_NAME: 'Retention fixture',
    GIT_COMMITTER_EMAIL: 'retention@example.invalid',
    GIT_AUTHOR_DATE: '2026-10-21T04:36:00Z',
    GIT_COMMITTER_DATE: '2026-10-21T04:36:00Z',
    GIT_NO_LAZY_FETCH: '1',
    GIT_TERMINAL_PROMPT: '0',
  };
  const git = (...args) =>
    execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], {
      cwd: directory,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const write = (path, bytes) => {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), bytes);
  };
  const writeJson = (path, data) => write(path, `${JSON.stringify(data)}\n`);
  const commit = message => {
    git('add', '.');
    git('commit', '-qm', message);
    return git('rev-parse', 'HEAD');
  };
  git('init', '-q');
  const sources = new Map([
    [
      retainedSource,
      'export default function Pricing() { return "Pricing"; }\n',
    ],
    [retainedOwner, 'export function PublicPageShell() { return null; }\n'],
  ]);
  const digest = createHash('sha256');
  for (const [path, bytes] of [...sources].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    write(path, bytes);
    digest.update(path).update('\0').update(bytes);
    writeJson(
      `apps/web/data/designSystem/surfaceCensus.evidence/pricing/${path.replaceAll('/', '__')}.json`,
      { file: path, sha256: sha256(bytes), at: start, ref: 'fixture-source' }
    );
  }
  const sourceDigest = digest.digest('hex');
  const census = complete(fixture());
  census.groups[0].evidence.sourceDigest =
    options.recordedDigest ?? sourceDigest;
  writeJson(CENSUS_PATH, census);
  const sourceSha = commit('source certification fixture');
  const pixels = Buffer.concat([
    Buffer.from(`${retainedPixelSentinel}\0`),
    Buffer.from([255, 254, 0, 128]),
  ]);
  write(
    `${retainedDirectory}/README.md`,
    'Historical source-local pricing capture.\n'
  );
  write(
    retainedLegacyReadme,
    'Legacy local evidence without a capture manifest.\n'
  );
  write(retainedImage, pixels);
  const capture = {
    id: 'pricing',
    route: '/pricing',
    sourceSha,
    sourceDigest: options.recordedDigest ?? sourceDigest,
    shots: [
      {
        file: 'pricing-390.png',
        width: 390,
        bytes: pixels.length,
        sha256: sha256(pixels),
      },
    ],
  };
  options.changeCapture?.(capture);
  writeJson(retainedCapture, capture);
  const paths = [
    `${retainedDirectory}/README.md`,
    retainedCapture,
    retainedImage,
    retainedLegacyReadme,
  ];
  if (options.symlink) {
    const path = `${retainedDirectory}/linked.png`;
    symlinkSync('pricing-390.png', join(directory, path));
    paths.push(path);
  }
  const archiveRevision = commit('historical capture fixture');
  const files = paths.sort().map(path => {
    const blobSha = git('rev-parse', `${archiveRevision}:${path}`);
    const bytes = execFileSync('git', ['cat-file', 'blob', blobSha], {
      cwd: directory,
      env,
    });
    return { path, blobSha, sha256: sha256(bytes), bytes: bytes.length };
  });
  rmSync(join(directory, retainedDirectory), { recursive: true });
  rmSync(join(directory, 'docs/screenshots/pricing-legacy'), {
    recursive: true,
  });
  const removalRevision = commit('retain captures in history');
  const descriptor = {
    schema: 'jovie.retained-surface-evidence/v1',
    classification: 'historical-source-local',
    currentQualification: false,
    distribution: 'unclassified',
    revision: archiveRevision,
    removedBy: { pullRequest: 25871, merge: removalRevision },
    files,
    captureRecords: [retainedCapture],
  };
  const saveDescriptor = () => {
    census.groups[0].retainedEvidence = descriptor;
    writeJson(CENSUS_PATH, census);
  };
  saveDescriptor();
  return {
    directory,
    env,
    git,
    write,
    census,
    descriptor,
    files,
    archiveRevision,
    removalRevision,
    sourceSha,
    sourceDigest,
    pixels,
    saveDescriptor,
  };
}

function readRetainedFixture(fixture) {
  assert.equal(typeof censusReader.readRetainedEvidence, 'function');
  return censusReader.readRetainedEvidence(fixture.directory, 'pricing');
}

function retainedCli(fixture, env = fixture.env, cwd = fixture.directory) {
  return spawnSync(
    process.execPath,
    [join(root, 'scripts/design-surface-census.mjs'), '--retained', 'pricing'],
    { cwd, env, encoding: 'utf8' }
  );
}

function retainedFetchTrap(fixture) {
  const bin = join(fixture.directory, 'fetch-trap');
  mkdirSync(bin);
  const marker = join(fixture.directory, 'unexpected-fetch');
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  const quote = text => `'${text.replaceAll("'", "'\\''")}'`;
  writeFileSync(
    join(bin, 'git'),
    `#!/bin/sh\nfor argument in "$@"; do\n  if [ "$argument" = fetch ]; then\n    : > ${quote(marker)}\n    exit 99\n  fi\ndone\nexec ${quote(realGit)} "$@"\n`
  );
  chmodSync(join(bin, 'git'), 0o755);
  return {
    env: { ...fixture.env, PATH: `${bin}:${process.env.PATH}` },
    marker,
  };
}

export {
  readRetainedFixture,
  retainedCapture,
  retainedCli,
  retainedDirectory,
  retainedFetchTrap,
  retainedFixture,
  retainedImage,
  retainedLegacyReadme,
  retainedPixelSentinel,
  retainedSource,
};
