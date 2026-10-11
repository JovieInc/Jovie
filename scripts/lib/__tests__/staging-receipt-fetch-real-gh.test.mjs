import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  realGhVersion,
  resolveRealGh,
  runWithRealGh,
  storedZip,
} from '../real-gh-harness.mjs';

// JOV-7698: the staging receipt fetch is a protected release transition, so
// its gh boundary is proven with the real CLI, not a handwritten stub.
const workflow = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../.github/workflows/staging-controller.yml'
  ),
  'utf8'
);
const dedent = block =>
  block
    .split('\n')
    .map(line => line.replace(/^ {10}/, ''))
    .join('\n');
const currentFetch = dedent(
  workflow.split('        run: |\n')[1].split('\n      - ')[0]
);
// The #20164 form that reached main and broke staging (fixed by #20347).
const brokenFetch = currentFetch.replace(
  /artifact_id="\$\(gh api \\\n[^\n]*\n[^\n]*\)"/,
  `artifact_id="$(gh api "repos/$REPOSITORY/actions/runs/$SOURCE_CI_RUN_ID/artifacts?per_page=100" \\
  --jq --arg name "$receipt_name" \\
  '[.artifacts[] | select(.expired == false and .name == $name)] | sort_by(.id) | last | .id // empty')"`
);

const gh = resolveRealGh();
if (!gh && process.env.CI) {
  throw new Error('JOV-7698: CI must provide the real gh binary.');
}
const sha = 'a'.repeat(40);
const receiptName = `product-lane-release-${sha}-1`;
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'staging-receipt-real-gh-'));
  roots.push(root);
  return root;
}

function route(path) {
  if (
    path ===
    `repos/JovieInc/Jovie/actions/artifacts?name=${receiptName}&per_page=100`
  ) {
    return {
      body: {
        artifacts: [
          { id: 5, name: receiptName, expired: false },
          { id: 9, name: receiptName, expired: true },
          { id: 8, name: receiptName, expired: false },
        ],
      },
    };
  }
  if (path === 'repos/JovieInc/Jovie/actions/runs/100/artifacts?per_page=100') {
    return {
      body: { artifacts: [{ id: 8, name: receiptName, expired: false }] },
    };
  }
  if (path === 'repos/JovieInc/Jovie/actions/artifacts/8/zip') {
    return { body: storedZip({ 'release.json': '{"receipt":8}' }) };
  }
  return null;
}

function env(root, extra = {}) {
  return {
    RUNNER_TEMP: root,
    REPOSITORY: 'JovieInc/Jovie',
    EXPECTED_SHA: sha,
    SOURCE_CI_RUN_ID: '100',
    SOURCE_CI_RUN_ATTEMPT: '1',
    ...extra,
  };
}

describe.skipIf(!gh)('staging receipt fetch under the real gh CLI', () => {
  it('records the exercised boundary version', () => {
    expect(realGhVersion(gh)).toMatch(/^gh version \d+\.\d+\.\d+/);
  });

  it('extracts the #20164 regression from the shipped fetch', () => {
    expect(brokenFetch).not.toBe(currentFetch);
    expect(brokenFetch).toContain('--jq --arg name');
  });

  it('passes the #20347 form: newest unexpired receipt is downloaded', async () => {
    const root = workspace();
    const run = await runWithRealGh({
      script: currentFetch,
      env: env(root),
      route,
      gh,
    });
    expect(run.stderr).toBe('');
    expect(run.code).toBe(0);
    expect(run.requests).toEqual([
      `GET repos/JovieInc/Jovie/actions/artifacts?name=${receiptName}&per_page=100`,
      'GET repos/JovieInc/Jovie/actions/artifacts/8/zip',
    ]);
    expect(
      readFileSync(join(root, 'product-lane-release', 'release.json'), 'utf8')
    ).toBe('{"receipt":8}');
  });

  it('rejects the #20164 form the way production did', async () => {
    const root = workspace();
    const run = await runWithRealGh({
      script: brokenFetch,
      env: env(root),
      route,
      gh,
    });
    expect(run.code).not.toBe(0);
    expect(run.stderr).toContain('accepts 1 arg(s), received 4');
    expect(run.requests).toEqual([]);
    expect(existsSync(join(root, 'product-lane-release', 'release.json'))).toBe(
      false
    );
  });

  it('pins the resolved real gh ahead of caller PATH by default', async () => {
    const root = workspace();
    const bin = join(root, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'gh'), '#!/usr/bin/env bash\nexit 88\n');
    chmodSync(join(bin, 'gh'), 0o755);

    const run = await runWithRealGh({
      script: currentFetch,
      env: env(root, { PATH: `${bin}${delimiter}${process.env.PATH}` }),
      route,
      gh,
    });

    expect(run.code, run.stderr).toBe(0);
    expect(run.requests).toEqual([
      `GET repos/JovieInc/Jovie/actions/artifacts?name=${receiptName}&per_page=100`,
      'GET repos/JovieInc/Jovie/actions/artifacts/8/zip',
    ]);
  });

  it('proves a permissive fake would have falsely passed #20164', async () => {
    const root = workspace();
    const bin = join(root, 'bin');
    mkdirSync(bin);
    // The kind of stub that let #20164 merge: any argv, canned answers.
    writeFileSync(
      join(bin, 'gh'),
      `#!/usr/bin/env bash
case "$*" in
  *"/zip"*) cat "$FAKE_ZIP" ;;
  *) echo 8 ;;
esac
`
    );
    chmodSync(join(bin, 'gh'), 0o755);
    const zip = join(root, 'receipt.zip');
    writeFileSync(zip, storedZip({ 'release.json': '{"receipt":8}' }));
    const run = await runWithRealGh({
      script: brokenFetch,
      env: env(root, {
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        FAKE_ZIP: zip,
      }),
      route,
      gh,
      allowCallerGhOverride: true,
    });
    expect(run.code).toBe(0);
    expect(run.requests).toEqual([]);
    expect(existsSync(join(root, 'product-lane-release', 'release.json'))).toBe(
      true
    );
  });
});
