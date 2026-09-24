import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const EXTRA = [
  'scripts/invariants/registry.mjs',
  'scripts/invariants/optimization-contract.mjs',
  'scripts/invariants/pr-lifecycle-contract.mjs',
  'scripts/lib/rolling-ci-handoff.mjs',
  'canon/invariants.jsonl',
  'scripts/symphony/config/model-registry.json',
  'scripts/symphony/summer-shipping-lead-contract.mjs',
];
const ENTRY = 'scripts/backlog-orchestrator/backlog-orchestrator.mjs';
const LIMIT = 32 * 1024 * 1024;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function trusted(path, directory = false) {
  const info = lstatSync(path);
  if (
    info.isSymbolicLink() ||
    (directory ? !info.isDirectory() : !info.isFile()) ||
    (info.mode & 0o022) !== 0 ||
    (typeof process.getuid === 'function' && info.uid !== process.getuid())
  ) {
    throw new Error('shipping-lead-source-path-untrusted');
  }
}

/** Read only the existing operator mirror and installer receipt, never a task-supplied path. */
export async function loadCanonicalShippingAdmission({
  workspace,
  mirror = '/srv/git/mirrors/Jovie.git',
}) {
  if (!isAbsolute(workspace) || !isAbsolute(mirror))
    throw new Error('shipping-lead-source-path-invalid');
  trusted(workspace, true);
  const stateRoot = join(workspace, 'state');
  const privateRoot = join(stateRoot, 'summer-symphony-consumer');
  for (const path of [stateRoot, privateRoot]) trusted(path, true);
  if (
    realpathSync(privateRoot) !==
      join(realpathSync(workspace), 'state/summer-symphony-consumer') ||
    (lstatSync(privateRoot).mode & 0o777) !== 0o700
  ) {
    throw new Error('shipping-lead-source-directory-invalid');
  }
  const receiptPath = join(stateRoot, 'gem-pr-rehabilitation-attestation.json');
  trusted(receiptPath);
  if (lstatSync(receiptPath).size > 128 * 1024)
    throw new Error('shipping-lead-source-receipt-too-large');
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  const revision = receipt.sourceRevision;
  if (
    receipt.schema !== 'gem-pr-rehabilitation-attestation/v1' ||
    !/^[a-f0-9]{40}$/u.test(revision ?? '')
  ) {
    throw new Error('shipping-lead-source-receipt-invalid');
  }
  const git = args =>
    execFileSync('git', ['-C', mirror, ...args], {
      maxBuffer: LIMIT,
      timeout: 20_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  if (
    git(['rev-parse', `${revision}^{commit}`])
      .toString()
      .trim() !== revision
  ) {
    throw new Error('shipping-lead-source-revision-invalid');
  }
  // The normal installer already binds these bytes. Refuse a partial or stale
  // host installation before importing any canonical code from its revision.
  for (const [key, filename] of [
    ['summerSymphonyConsumer', 'summer-symphony-outbox-consumer.mjs'],
    ['summerShippingLeadContract', 'summer-shipping-lead-contract.mjs'],
    ['summerShippingLeadAdmitter', 'summer-shipping-lead-admitter.mjs'],
    ['summerShippingLeadSource', 'summer-shipping-lead-source.mjs'],
    ['summerBottleneckProducer', 'summer_bottleneck_producer.py'],
    ['summerAdmissions', 'summer_admissions.py'],
    ['summerExistingRepair', 'summer_existing_repair.py'],
    ['summerCiAudit', 'summer_ci_audit.py'],
  ]) {
    const installed = join(workspace, 'scripts', filename);
    trusted(installed);
    const expected = sha256(
      git(['show', `${revision}:scripts/symphony/${filename}`])
    );
    const record = receipt.artifacts?.[key];
    if (
      !record?.matches ||
      record.sourceSha256 !== expected ||
      record.installedSha256 !== expected ||
      sha256(readFileSync(installed)) !== expected
    )
      throw new Error('shipping-lead-installed-source-mismatch');
  }
  const rows = git([
    'ls-tree',
    '-rz',
    revision,
    '--',
    'scripts/backlog-orchestrator',
    ...EXTRA,
  ])
    .toString()
    .split('\0')
    .filter(Boolean)
    .map(row => {
      const [metadata, path] = row.split('\t');
      const [mode, type, oid] = metadata.split(' ');
      return { mode, type, oid, path };
    })
    .filter(
      row =>
        EXTRA.includes(row.path) ||
        /^scripts\/backlog-orchestrator\/[a-z0-9-]+\.(?:mjs|json)$/u.test(
          row.path
        )
    );
  if (
    rows.length > 150 ||
    ![
      ENTRY,
      ...EXTRA,
      'scripts/backlog-orchestrator/config.json',
      'scripts/backlog-orchestrator/ownership-inventory.json',
    ].every(path => rows.some(row => row.path === path)) ||
    rows.some(
      row =>
        !['100644', '100755'].includes(row.mode) ||
        row.type !== 'blob' ||
        !/^[a-f0-9]{40}$/u.test(row.oid)
    )
  ) {
    throw new Error('shipping-lead-source-closure-invalid');
  }
  const root = realpathSync(
    mkdtempSync(join(privateRoot, 'canonical-source-'))
  );
  const cleanup = () => rmSync(root, { recursive: true, force: true });
  try {
    const archive = git([
      'archive',
      '--format=tar',
      revision,
      '--',
      ...rows.map(row => row.path),
    ]);
    execFileSync(
      '/bin/sh',
      ['-c', 'umask 077; exec tar -xf - -C "$1"', 'shipping-source', root],
      {
        input: archive,
        maxBuffer: LIMIT,
        timeout: 20_000,
      }
    );
    for (const row of rows) {
      const path = join(root, row.path);
      trusted(path);
      if (realpathSync(path) !== path)
        throw new Error('shipping-lead-source-closure-invalid');
      const bytes = readFileSync(path);
      const blob = createHash('sha1')
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest('hex');
      if (blob !== row.oid)
        throw new Error('shipping-lead-source-content-mismatch');
    }
    const module = await import(pathToFileURL(join(root, ENTRY)).href);
    if (
      typeof module.admitShippingLeadRequest !== 'function' ||
      typeof module.observeShippingLeadIssue !== 'function'
    )
      throw new Error('shipping-lead-canonical-entry-unavailable');
    return {
      admit: module.admitShippingLeadRequest,
      observeIssue: module.observeShippingLeadIssue,
      sourceRevision: revision,
      observeRuntime: () =>
        JSON.parse(
          execFileSync(
            'python3',
            [
              join(workspace, 'scripts/summer_bottleneck_producer.py'),
              '--observe-shipping-runtime',
            ],
            {
              maxBuffer: 128 * 1024,
              timeout: 95_000,
              stdio: ['ignore', 'pipe', 'pipe'],
            }
          ).toString()
        ),
      cleanup,
    };
  } catch (error) {
    cleanup();
    throw error;
  }
}
