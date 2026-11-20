import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import { CENSUS_PATH, checkCensus } from '../../design-surface-census.mjs';
import {
  readRetainedFixture,
  retainedCapture,
  retainedCli,
  retainedFetchTrap,
  retainedFixture,
  retainedImage,
  retainedLegacyReadme,
  retainedPixelSentinel,
  retainedSource,
} from './retained-surface-evidence.fixture.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));

test('retained pricing evidence reads deleted blobs and returns verified metadata without pixels', () => {
  const f = retainedFixture();
  assert.equal(existsSync(join(f.directory, retainedImage)), false);
  const result = readRetainedFixture(f);
  assert.equal(result.classification, 'historical-source-local');
  assert.equal(result.currentQualification, false);
  assert.equal(result.distribution, 'unclassified');
  assert.equal(result.archiveRevision, f.archiveRevision);
  assert.deepEqual(result.files, f.files);
  assert.equal(
    result.totalBytes,
    f.files.reduce((sum, file) => sum + file.bytes, 0)
  );
  assert.equal(result.captureManifests.length, 1);
  assert.equal(result.captureManifests[0].path, retainedCapture);
  assert.equal(result.captureManifests[0].sourceSha, f.sourceSha);
  assert.equal(result.captureManifests[0].sourceDigest, f.sourceDigest);
  assert.equal(
    result.captureManifests[0].sourceBinding,
    'recorded-source-manifest'
  );
  assert.equal(result.captureManifests[0].sourceRequalified, false);
  assert.equal(result.captureManifests[0].shots[0].file, 'pricing-390.png');
  assert.deepEqual(result.legacyRecords, [retainedLegacyReadme]);
  assert.equal(JSON.stringify(result).includes(retainedPixelSentinel), false);

  const cli = retainedCli(f);
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).archiveRevision, f.archiveRevision);
  assert.equal(
    `${cli.stdout}${cli.stderr}`.includes(retainedPixelSentinel),
    false
  );
});

for (const { label, change, error } of [
  {
    label: 'missing path',
    change: files => {
      files[0].path = 'docs/screenshots/pricing-fixture/missing.md';
    },
    error: /path|missing|file|blob/i,
  },
  {
    label: 'wrong blob',
    change: files => {
      files[0].blobSha = 'f'.repeat(40);
    },
    error: /blob|object|identity/i,
  },
  {
    label: 'wrong digest',
    change: files => {
      files[0].sha256 = '0'.repeat(64);
    },
    error: /hash|digest|sha256/i,
  },
  {
    label: 'wrong byte count',
    change: files => {
      files[0].bytes += 1;
    },
    error: /bytes|size/i,
  },
  {
    label: 'duplicate path',
    change: files => {
      files.push({ ...files[0] });
    },
    error: /sort|unique|duplicate|files/i,
  },
  {
    label: 'unsafe path',
    change: files => {
      files[0].path = '../outside.png';
    },
    error: /path|unsafe|relative/i,
  },
]) {
  test(`retained pricing evidence rejects ${label} without exposing image content`, () => {
    const f = retainedFixture();
    change(f.descriptor.files);
    f.descriptor.files.sort((a, b) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : 0
    );
    f.saveDescriptor();
    assert.throws(() => readRetainedFixture(f), error);
    const cli = retainedCli(f);
    assert.notEqual(cli.status, 0);
    assert.equal(
      `${cli.stdout}${cli.stderr}`.includes(retainedPixelSentinel),
      false
    );
  });
}

test('retained pricing evidence rejects a symlink even when its blob, size and hash match', () => {
  const f = retainedFixture({ symlink: true });
  assert.throws(() => readRetainedFixture(f), /regular|symlink|mode/i);
});

test('retained pricing preserves recorded source binding without requalifying an unavailable squashed source', () => {
  const f = retainedFixture({
    recordedDigest: '0'.repeat(64),
    changeCapture: capture => {
      capture.sourceSha = 'f'.repeat(40);
    },
  });
  const result = readRetainedFixture(f);
  assert.equal(result.captureManifests[0].sourceSha, 'f'.repeat(40));
  assert.equal(result.captureManifests[0].sourceDigest, '0'.repeat(64));
  assert.equal(
    result.captureManifests[0].sourceBinding,
    'recorded-source-manifest'
  );
  assert.equal(result.captureManifests[0].sourceRequalified, false);
  assert.equal(result.currentQualification, false);
});

test('retained pricing capture rejects a wrong shot digest and an undeclared shot', () => {
  const wrongDigest = retainedFixture({
    changeCapture: capture => {
      capture.shots[0].sha256 = '0'.repeat(64);
    },
  });
  assert.throws(
    () => readRetainedFixture(wrongDigest),
    /shot|hash|digest|sha256/i
  );
  const undeclared = retainedFixture({
    changeCapture: capture => {
      capture.shots[0].file = 'undeclared.png';
    },
  });
  assert.throws(
    () => readRetainedFixture(undeclared),
    /shot|declared|file|path/i
  );
});

test('retained pricing evidence fails closed for an unavailable archive without fetching', () => {
  const f = retainedFixture();
  const shallow = join(f.directory, 'shallow');
  f.git('clone', '-q', '--depth=1', `file://${f.directory}`, shallow);
  writeFileSync(join(shallow, CENSUS_PATH), JSON.stringify(f.census));
  const trap = retainedFetchTrap(f);
  const cli = retainedCli(f, trap.env, shallow);
  assert.notEqual(cli.status, 0);
  assert.match(cli.stderr, /archive|revision|missing|unavailable|object/i);
  assert.equal(existsSync(trap.marker), false);
  assert.equal(
    `${cli.stdout}${cli.stderr}`.includes(retainedPixelSentinel),
    false
  );
});

test('historical pricing evidence remains readable while stale current source still fails qualification', () => {
  const f = retainedFixture();
  f.write(
    retainedSource,
    'export default function Pricing() { return "Changed"; }\n'
  );
  assert.throws(
    () => checkCensus(f.directory, 'HEAD'),
    /source changed|stale|renew certification/i
  );
  assert.equal(readRetainedFixture(f).currentQualification, false);
  const cli = retainedCli(f);
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).currentQualification, false);
});

test('retained pricing rejects qualification, public distribution and undeclared payload fields in every output path', () => {
  for (const change of [
    descriptor => {
      descriptor.currentQualification = true;
    },
    descriptor => {
      descriptor.distribution = 'public';
    },
    descriptor => {
      descriptor.pixelPayload = retainedPixelSentinel;
    },
    descriptor => {
      descriptor.removedBy.pixelPayload = retainedPixelSentinel;
    },
    descriptor => {
      descriptor.files[0].pixelPayload = retainedPixelSentinel;
    },
  ]) {
    const f = retainedFixture();
    change(f.descriptor);
    f.saveDescriptor();
    assert.throws(
      () => readRetainedFixture(f),
      /qualification|distribution|field|key|retained/i
    );
    const rows = spawnSync(
      process.execPath,
      [join(root, 'scripts/design-surface-census.mjs'), '--rows', 'HEAD'],
      { cwd: f.directory, env: f.env, encoding: 'utf8' }
    );
    for (const cli of [retainedCli(f), rows]) {
      assert.notEqual(cli.status, 0);
      assert.equal(
        `${cli.stdout}${cli.stderr}`.includes(retainedPixelSentinel),
        false
      );
    }
  }
});

test('retained pricing rejects a noninteger capture width without printing its payload', () => {
  const f = retainedFixture({
    changeCapture: capture => {
      capture.shots[0].width = { pixels: retainedPixelSentinel };
    },
  });
  assert.throws(() => readRetainedFixture(f), /width|shot|metadata|capture/i);
  const cli = retainedCli(f);
  assert.notEqual(cli.status, 0);
  assert.equal(
    `${cli.stdout}${cli.stderr}`.includes(retainedPixelSentinel),
    false
  );
});

test('retained pricing reports a missing local archive blob without fetching', () => {
  const f = retainedFixture();
  const image = f.files.find(file => file.path === retainedImage);
  // This object belongs only to the disposable Git repository created above.
  const localBlob = join(
    f.directory,
    '.git',
    'objects',
    image.blobSha.slice(0, 2),
    image.blobSha.slice(2)
  );
  assert.equal(existsSync(localBlob), true);
  rmSync(localBlob);
  const trap = retainedFetchTrap(f);
  const cli = retainedCli(f, trap.env);
  assert.notEqual(cli.status, 0);
  assert.match(cli.stderr, /archive|unavailable|missing|object|blob/i);
  assert.equal(existsSync(trap.marker), false);
  assert.equal(
    `${cli.stdout}${cli.stderr}`.includes(retainedPixelSentinel),
    false
  );
});

test('retained pricing cannot omit a known capture manifest and downgrade its files to legacy evidence', () => {
  const f = retainedFixture();
  f.descriptor.captureRecords = [];
  f.saveDescriptor();
  assert.throws(() => readRetainedFixture(f), /capture records/i);
  const cli = retainedCli(f);
  assert.notEqual(cli.status, 0);
  assert.equal(
    `${cli.stdout}${cli.stderr}`.includes(retainedPixelSentinel),
    false
  );
});

test('retained pricing requires ordered archive and current removal ancestry', () => {
  const earlier = retainedFixture();
  earlier.descriptor.removedBy.merge = earlier.sourceSha;
  earlier.saveDescriptor();
  assert.throws(() => readRetainedFixture(earlier), /archive unavailable/i);

  const sibling = retainedFixture();
  const tree = sibling.git('rev-parse', `${sibling.removalRevision}^{tree}`);
  const unmergedRemoval = sibling.git(
    'commit-tree',
    tree,
    '-p',
    sibling.archiveRevision,
    '-m',
    'Unmerged removal fixture'
  );
  sibling.descriptor.removedBy.merge = unmergedRemoval;
  sibling.saveDescriptor();
  assert.throws(() => readRetainedFixture(sibling), /archive unavailable/i);
});

test('retained pricing rejects a purported removal commit that still contains the files', () => {
  const f = retainedFixture();
  f.descriptor.removedBy.merge = f.archiveRevision;
  f.saveDescriptor();
  assert.throws(() => readRetainedFixture(f), /not removed/i);
});

test('retained pricing enforces individual and aggregate byte bounds before reading blobs', () => {
  const oversized = retainedFixture();
  oversized.descriptor.files[0].bytes = 1_048_577;
  oversized.saveDescriptor();
  assert.throws(() => readRetainedFixture(oversized), /bounded bytes/i);

  const aggregate = retainedFixture();
  aggregate.descriptor.files = Array.from({ length: 17 }, (_, index) => ({
    ...aggregate.files[0],
    path: `docs/screenshots/pricing-fixture/bound-${String(index).padStart(2, '0')}.png`,
    bytes: 1_048_576,
  }));
  aggregate.descriptor.captureRecords = [];
  aggregate.saveDescriptor();
  assert.throws(
    () => readRetainedFixture(aggregate),
    /archive bytes exceed reader bound/i
  );
});
