import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  lstatSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  readSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const digest = value => createHash('sha256').update(value).digest('hex');
const jsonDigest = value => digest(JSON.stringify(value));
const check = (value, message) => {
  if (!value) throw new Error(message);
};
const git = (root, ...args) =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
const inside = (root, path) => {
  const name = relative(root, path);
  check(
    name !== '..' && !name.startsWith('../') && !isAbsolute(name),
    'Path escapes checkout'
  );
  return name;
};

function fileDigest(path) {
  const hash = createHash('sha256');
  const buffer = Buffer.alloc(64 * 1024);
  const fd = openSync(path, 'r');
  try {
    let length;
    while ((length = readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, length));
    }
  } finally {
    closeSync(fd);
  }
  return hash.digest('hex');
}

function entry(root, name) {
  const path = resolve(root, name);
  inside(root, path);
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if (error.code === 'ENOENT') return { path: name, kind: 'missing' };
    throw error;
  }
  if (stat.isSymbolicLink()) {
    // Record the literal target, never read an arbitrary external source link.
    return { path: name, kind: 'symlink', target: readlinkSync(path) };
  }
  check(stat.isFile(), 'Unsupported source entry: ' + name);
  inside(root, realpathSync(path));
  return {
    path: name,
    kind: 'file',
    bytes: stat.size,
    executable: Boolean(stat.mode & 0o111),
    sha256: fileDigest(path),
  };
}

export function sourceSnapshot(root, expectedSha) {
  root = realpathSync(root);
  check(/^[0-9a-f]{40}$/.test(expectedSha), 'Invalid expected SHA');
  const head = git(root, 'rev-parse', 'HEAD').trim();
  check(head === expectedSha, 'Checkout SHA mismatch');
  const tracked = new Set(
    git(root, 'ls-files', '--cached', '-z').split('\0').filter(Boolean)
  );
  const others = git(root, 'ls-files', '--others', '--exclude-standard', '-z')
    .split('\0')
    .filter(Boolean);
  const status = git(
    root,
    '-c',
    'status.renames=false',
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all'
  );
  const changes = status
    .split('\0')
    .filter(Boolean)
    .map(row => ({
      index: row[0],
      worktree: row[1],
      path: row.slice(3),
      classification: row.startsWith('?? ') ? 'untracked' : 'tracked-delta',
    }));
  const files = [...new Set([...tracked, ...others])].sort().map(name => ({
    ...entry(root, name),
    tracked: tracked.has(name),
  }));
  return {
    head,
    gitDirty: changes.length > 0,
    changes,
    files,
    digest: jsonDigest(files),
  };
}

export function artifactSnapshot(root) {
  root = realpathSync(root);
  const output = resolve(root, '.vercel/output');
  check(
    lstatSync(resolve(output, 'config.json')).isFile(),
    'Missing Vercel output config'
  );
  const files = [];
  function walk(path, name, ancestors) {
    const actual = realpathSync(path);
    inside(root, actual);
    check(!ancestors.has(actual), 'Artifact symlink cycle');
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      files.push({
        path: name,
        kind: 'symlink',
        target: readlinkSync(path),
        resolvedPath: inside(root, actual),
      });
      // Bind linked bytes as well as the link; Vercel traces can use source files.
      walk(actual, name + '/@resolved', ancestors);
    } else if (stat.isDirectory()) {
      const next = new Set([...ancestors, actual]);
      for (const child of readdirSync(path).sort())
        walk(resolve(path, child), name + '/' + child, next);
    } else {
      check(stat.isFile(), 'Unsupported artifact entry');
      check(files.length < 500000, 'Artifact entry limit');
      files.push({
        path: name,
        kind: 'file',
        bytes: stat.size,
        executable: Boolean(stat.mode & 0o111),
        sha256: fileDigest(path),
      });
    }
  }
  walk(output, '.vercel/output', new Set());
  return { files, digest: jsonDigest(files) };
}

export function compareSources(before, after) {
  const previous = new Map(before.files.map(file => [file.path, file]));
  const current = new Map(after.files.map(file => [file.path, file]));
  return [...new Set([...previous.keys(), ...current.keys()])]
    .sort()
    .flatMap(path => {
      const left = previous.get(path),
        right = current.get(path);
      if (JSON.stringify(left) === JSON.stringify(right)) return [];
      return [
        {
          path,
          classification: !left
            ? 'added-during-build'
            : !right
              ? 'removed-during-build'
              : 'changed-during-build',
          before: left ?? null,
          after: right ?? null,
        },
      ];
    });
}

function readReceipt(path) {
  const receipt = JSON.parse(readFileSync(path, 'utf8'));
  const { digest: expected, ...payload } = receipt;
  check(expected === jsonDigest(payload), 'Receipt digest mismatch');
  return receipt;
}

function writeReceipt(path, payload) {
  const value = { ...payload, digest: jsonDigest(payload) };
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
  return value;
}

export function captureInputs(root, expectedSha, output) {
  const source = sourceSnapshot(root, expectedSha);
  return writeReceipt(output, {
    schema: 'jovie.production-inputs/v1',
    phase: 'before-build',
    source,
  });
}

export function captureArtifact(root, expectedSha, beforePath, output) {
  const before = readReceipt(beforePath);
  check(
    before.phase === 'before-build' && before.source.head === expectedSha,
    'Input receipt source mismatch'
  );
  const source = sourceSnapshot(root, expectedSha);
  const artifact = artifactSnapshot(root);
  return writeReceipt(output, {
    schema: 'jovie.production-inputs/v1',
    phase: 'before-deploy',
    source,
    artifact,
    inputReceiptDigest: before.digest,
    changesDuringBuild: compareSources(before.source, source),
    sourceClaim:
      'Observed inputs and deltas; generated changes are not automatically approved.',
  });
}

export function bindDeployment(
  root,
  expectedSha,
  artifactPath,
  deployment,
  output
) {
  const receipt = readReceipt(artifactPath);
  check(
    receipt.phase === 'before-deploy' && receipt.source.head === expectedSha,
    'Artifact receipt source mismatch'
  );
  check(
    sourceSnapshot(root, expectedSha).digest === receipt.source.digest,
    'Source changed after artifact capture'
  );
  check(
    artifactSnapshot(root).digest === receipt.artifact.digest,
    'Artifact changed after capture'
  );
  check(/^dpl_[A-Za-z0-9]+$/.test(deployment.id), 'Invalid deployment ID');
  const url = String(deployment.url ?? '')
    .replace(/^https:\/\//, '')
    .replace(/\/$/, '');
  check(/^[a-zA-Z0-9-]+\.vercel\.app$/.test(url), 'Invalid deployment URL');
  const readyState = String(
    deployment.readyState ?? deployment.state ?? deployment.status ?? ''
  ).toUpperCase();
  const target = String(deployment.target ?? '').toLowerCase();
  check(
    readyState === 'READY' && target === 'production',
    'Deployment is not READY production'
  );
  check(
    deployment.meta?.githubCommitSha === expectedSha &&
      deployment.meta?.jovieInputReceipt === receipt.digest &&
      deployment.meta?.jovieArtifactDigest === receipt.artifact.digest,
    'Deployment provenance mismatch'
  );
  return writeReceipt(output, {
    schema: 'jovie.production-inputs/v1',
    phase: 'deployment-bound',
    sourceSha: expectedSha,
    inputReceiptDigest: receipt.inputReceiptDigest,
    artifactReceiptDigest: receipt.digest,
    artifactDigest: receipt.artifact.digest,
    deployment: {
      id: deployment.id,
      url: 'https://' + url,
      target,
      readyState,
      gitDirty: deployment.meta.gitDirty ?? null,
    },
    qualification:
      'Inputs recorded and metadata-bound; inspect deltas before claiming canonical source.',
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [phase, output, prior] = process.argv.slice(2);
  const root = process.cwd(),
    sha = process.env.EXPECTED_SHA;
  if (phase === 'inputs') captureInputs(root, sha, output);
  else if (phase === 'artifact') {
    const receipt = captureArtifact(root, sha, prior, output);
    process.stdout.write(receipt.digest + ' ' + receipt.artifact.digest + '\n');
  } else if (phase === 'bind')
    bindDeployment(
      root,
      sha,
      prior,
      JSON.parse(readFileSync(0, 'utf8')),
      output
    );
  else throw new Error('Expected inputs, artifact or bind phase');
}
