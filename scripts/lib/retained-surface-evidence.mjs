import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { posix } from 'node:path';

const requireValue = (condition, message) => {
  if (!condition) throw new Error(message);
};
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const sortedUnique = values =>
  Array.isArray(values) &&
  values.every(
    (value, i) => nonempty(value) && (i === 0 || values[i - 1] < value)
  );

const RETAINED_FILE_LIMIT = 1_048_576;
const RETAINED_TOTAL_LIMIT = 16 * RETAINED_FILE_LIMIT;
const gitSha = value => /^[0-9a-f]{40}$/.test(value ?? '');
const sha256 = value => /^[0-9a-f]{64}$/.test(value ?? '');
const retainedPath = value =>
  nonempty(value) &&
  value.length <= 512 &&
  value.startsWith('docs/screenshots/') &&
  posix.normalize(value) === value &&
  !/[\\:\s*?[\]{}]/u.test(value);
const retainedCheck = (condition, reason) =>
  requireValue(condition, 'retained evidence: ' + reason);
const retainedKeys = (value, keys) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key));

/** Retention is historical availability, never another current certificate. */
export function validateRetainedEvidence(archive) {
  if (archive === undefined) return;
  retainedCheck(
    retainedKeys(archive, [
      'schema',
      'classification',
      'currentQualification',
      'distribution',
      'revision',
      'removedBy',
      'files',
      'captureRecords',
    ]),
    'unexpected archive metadata fields'
  );
  retainedCheck(
    archive?.schema === 'jovie.retained-surface-evidence/v1' &&
      archive.classification === 'historical-source-local' &&
      archive.currentQualification === false &&
      archive.distribution === 'unclassified',
    'invalid historical classification'
  );
  retainedCheck(
    retainedKeys(archive.removedBy, ['pullRequest', 'merge']) &&
      gitSha(archive.revision) &&
      gitSha(archive.removedBy?.merge) &&
      Number.isSafeInteger(archive.removedBy?.pullRequest) &&
      archive.removedBy.pullRequest > 0,
    'immutable archive and removal provenance required'
  );
  retainedCheck(
    Array.isArray(archive.files) &&
      archive.files.length > 0 &&
      archive.files.length <= 32 &&
      sortedUnique(archive.files.map(file => file?.path)),
    'files must be sorted, unique and bounded'
  );
  for (const file of archive.files) {
    retainedCheck(
      retainedKeys(file, ['path', 'blobSha', 'sha256', 'bytes']),
      'unexpected file metadata fields'
    );
    retainedCheck(retainedPath(file.path), 'unsafe relative file path');
    retainedCheck(
      gitSha(file.blobSha) &&
        sha256(file.sha256) &&
        Number.isSafeInteger(file.bytes) &&
        file.bytes > 0 &&
        file.bytes <= RETAINED_FILE_LIMIT,
      'file blob, digest and bounded bytes required'
    );
  }
  retainedCheck(
    archive.files.reduce((sum, file) => sum + file.bytes, 0) <=
      RETAINED_TOTAL_LIMIT,
    'archive bytes exceed reader bound'
  );
  retainedCheck(
    Array.isArray(archive.captureRecords) &&
      (archive.captureRecords.length === 0 ||
        sortedUnique(archive.captureRecords)) &&
      archive.captureRecords.every(
        file =>
          retainedPath(file) &&
          file.endsWith('/capture.json') &&
          archive.files.some(entry => entry.path === file)
      ) &&
      JSON.stringify(archive.captureRecords) ===
        JSON.stringify(
          archive.files
            .filter(file => file.path.endsWith('/capture.json'))
            .map(file => file.path)
        ),
    'capture records must name retained metadata files'
  );
}

// Follow the existing immutable Git reader pattern, with binary-safe reads.
// Missing local objects fail closed; this path never negotiates network access.
function retainedGit(root, args, maxBuffer = RETAINED_FILE_LIMIT) {
  try {
    return execFileSync('git', ['-C', root, ...args], {
      timeout: 5000,
      maxBuffer,
      env: {
        ...process.env,
        GIT_NO_LAZY_FETCH: '1',
        GIT_TERMINAL_PROMPT: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    // Child errors may contain stdout bytes. Never surface those as diagnostics.
    throw new Error('retained evidence: archive unavailable in local Git');
  }
}

function retainedBlob(root, revision, file) {
  const row = retainedGit(root, [
    'ls-tree',
    '-z',
    revision,
    '--',
    file.path,
  ]).toString('utf8');
  const [header, archivedPath] = row.replace(/\0$/, '').split('\t');
  const match = /^(100644|100755) blob ([0-9a-f]{40})$/.exec(header ?? '');
  if (!match || archivedPath !== file.path) {
    throw new Error(
      'retained evidence: path must resolve to one regular blob: ' + file.path
    );
  }
  retainedCheck(
    match[2] === file.blobSha,
    'blob identity mismatch: ' + file.path
  );
  const size = Number(
    retainedGit(root, ['cat-file', '-s', match[2]]).toString('utf8').trim()
  );
  retainedCheck(
    size === file.bytes && size <= RETAINED_FILE_LIMIT,
    'bytes mismatch: ' + file.path
  );
  const bytes = retainedGit(root, ['show', revision + ':' + file.path]);
  retainedCheck(
    bytes.length === size &&
      createHash('sha256').update(bytes).digest('hex') === file.sha256,
    'SHA-256 digest mismatch: ' + file.path
  );
  return bytes;
}

/** Read retained records through this census, independently of current hashes. */
export function readRetainedSurfaceEvidence(root, groupId, census) {
  const group = census.groups.find(group => group.id === groupId);
  retainedCheck(group?.retainedEvidence, 'unknown retained group');
  const archive = group.retainedEvidence;
  validateRetainedEvidence(archive);
  retainedGit(root, [
    'merge-base',
    '--is-ancestor',
    archive.revision,
    archive.removedBy.merge,
  ]);
  retainedGit(root, [
    'merge-base',
    '--is-ancestor',
    archive.removedBy.merge,
    'HEAD',
  ]);
  const bytesByPath = new Map();
  for (const file of archive.files) {
    retainedCheck(
      retainedGit(root, ['ls-tree', archive.removedBy.merge, '--', file.path])
        .length === 0,
      'path was not removed by the recorded merge: ' + file.path
    );
    bytesByPath.set(file.path, retainedBlob(root, archive.revision, file));
  }
  const captureManifests = archive.captureRecords.map(path => {
    let capture;
    try {
      capture = JSON.parse(bytesByPath.get(path).toString('utf8'));
    } catch {
      throw new Error('retained evidence: malformed capture metadata: ' + path);
    }
    retainedCheck(
      capture?.id === groupId &&
        gitSha(capture.sourceSha) &&
        sha256(capture.sourceDigest) &&
        Array.isArray(capture.shots) &&
        capture.shots.length > 0,
      'invalid recorded capture source binding: ' + path
    );
    const shotPaths = capture.shots.map(shot => {
      retainedCheck(
        nonempty(shot?.file) &&
          posix.basename(shot.file) === shot.file &&
          Number.isSafeInteger(shot.width) &&
          shot.width > 0,
        'unsafe capture shot file: ' + path
      );
      const shotPath = posix.join(posix.dirname(path), shot.file);
      const file = archive.files.find(file => file.path === shotPath);
      retainedCheck(
        file && file.bytes === shot.bytes && file.sha256 === shot.sha256,
        'capture shot digest/bytes mismatch or undeclared file: ' + shotPath
      );
      return shotPath;
    });
    retainedCheck(
      new Set(shotPaths).size === shotPaths.length,
      'duplicate capture shot files'
    );
    return {
      path,
      sourceSha: capture.sourceSha,
      sourceDigest: capture.sourceDigest,
      sourceBinding: 'recorded-source-manifest',
      sourceRequalified: false,
      shots: capture.shots.map(shot => ({
        file: shot.file,
        width: shot.width,
        bytes: shot.bytes,
        sha256: shot.sha256,
      })),
    };
  });
  return {
    classification: archive.classification,
    currentQualification: false,
    distribution: archive.distribution,
    publicationAuthorized: false,
    archiveRevision: archive.revision,
    removedBy: archive.removedBy,
    files: archive.files,
    totalBytes: archive.files.reduce((sum, file) => sum + file.bytes, 0),
    captureManifests,
    legacyRecords: archive.files
      .filter(
        file =>
          file.path.endsWith('/README.md') &&
          !archive.captureRecords.some(
            record => posix.dirname(record) === posix.dirname(file.path)
          )
      )
      .map(file => file.path),
  };
}
