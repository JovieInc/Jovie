import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const script = resolve(
  import.meta.dirname,
  '../../../.github/scripts/staging-generation-lineage.sh'
);
const stagingSha = 'a'.repeat(40);
const expectedSha = 'b'.repeat(40);
const replacementSha = 'c'.repeat(40);
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function writeLineageZip(path, payload) {
  const built = spawnSync(
    'python3',
    [
      '-c',
      'import sys, zipfile; z = zipfile.ZipFile(sys.argv[1], "w"); z.writestr("staging-lineage.json", sys.argv[2]); z.close()',
      path,
      JSON.stringify(payload),
    ],
    { encoding: 'utf8' }
  );
  expect(built.status, built.stderr).toBe(0);
}

// The stub already answers as `gh api --jq` would: the filtered scalar.
function decide({
  hasLineageArtifact = false,
  lineage = undefined,
  replacementRelation = 'ahead',
  expectedRelation = 'behind',
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'staging-lineage-'));
  roots.push(root);
  const bin = join(root, 'bin');
  mkdirSync(bin);
  if (lineage !== undefined)
    writeLineageZip(join(root, 'lineage.zip'), lineage);
  const gh = join(bin, 'gh');
  writeFileSync(
    gh,
    `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const endpoint = args[1];
if (args[0] === 'api' && endpoint.includes('/actions/artifacts?'))
  console.log(process.env.LINEAGE_ARTIFACT_ID);
else if (args[0] === 'api' && endpoint.includes('/artifacts/') && endpoint.endsWith('/zip'))
  process.stdout.write(fs.readFileSync(process.env.LINEAGE_ZIP));
else if (args[0] === 'api' && endpoint.includes('/compare/')) {
  const range = endpoint.split('/compare/')[1];
  if (range === process.env.REPLACEMENT_SHA + '...' + process.env.EXPECTED_SHA)
    console.log(process.env.REPLACEMENT_RELATION);
  else if (range === process.env.EXPECTED_SHA + '...' + process.env.REPLACEMENT_SHA)
    console.log(process.env.EXPECTED_RELATION);
  else process.exit(2);
} else process.exit(2);
`
  );
  chmodSync(gh, 0o755);
  return spawnSync('bash', [script], {
    encoding: 'utf8',
    timeout: 10000,
    env: {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH}`,
      RUNNER_TEMP: root,
      REPOSITORY: 'JovieInc/Jovie',
      EXPECTED_SHA: expectedSha,
      STAGING_RECEIPT_SHA: stagingSha,
      REPLACEMENT_SHA: replacementSha,
      REPLACEMENT_RELATION: replacementRelation,
      EXPECTED_RELATION: expectedRelation,
      LINEAGE_ARTIFACT_ID: hasLineageArtifact ? '42' : '',
      LINEAGE_ZIP: join(root, 'lineage.zip'),
    },
  });
}

describe('staging-generation-lineage', () => {
  it('waits while no lineage receipt exists', () => {
    const result = decide();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe('action=wait');
  });

  it('waits while the generation is still proceeding', () => {
    const result = decide({
      hasLineageArtifact: true,
      lineage: {
        schema: 'jovie-staging-lineage/v1',
        sha: stagingSha,
        outcome: 'proceed',
        replacementSha: stagingSha,
      },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe('action=wait');
  });

  it('rebinds to a superseding replacement on the release lineage', () => {
    const result = decide({
      hasLineageArtifact: true,
      lineage: {
        schema: 'jovie-staging-lineage/v1',
        sha: stagingSha,
        outcome: 'superseded',
        replacementSha,
      },
      replacementRelation: 'ahead',
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim().split('\n').at(-1)).toBe(
      `action=rebind replacement=${replacementSha}`
    );
  });

  it('yields when the replacement is newer main beyond the expected head', () => {
    const result = decide({
      hasLineageArtifact: true,
      lineage: {
        schema: 'jovie-staging-lineage/v1',
        sha: stagingSha,
        outcome: 'superseded',
        replacementSha,
      },
      replacementRelation: 'behind',
      expectedRelation: 'ahead',
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim().split('\n').at(-1)).toBe('action=yield');
  });

  it('fails when the generation ended on a terminal non-deploy outcome', () => {
    const result = decide({
      hasLineageArtifact: true,
      lineage: {
        schema: 'jovie-staging-lineage/v1',
        sha: stagingSha,
        outcome: 'not_applicable',
        replacementSha: stagingSha,
      },
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('can never produce a deployment receipt');
  });

  it('fails on a malformed lineage receipt', () => {
    const result = decide({
      hasLineageArtifact: true,
      lineage: { schema: 'other', sha: stagingSha },
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('malformed');
  });

  it('fails when the replacement is off the release lineage', () => {
    const result = decide({
      hasLineageArtifact: true,
      lineage: {
        schema: 'jovie-staging-lineage/v1',
        sha: stagingSha,
        outcome: 'superseded',
        replacementSha,
      },
      replacementRelation: 'diverged',
      expectedRelation: 'diverged',
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('not on the release lineage');
  });
});
