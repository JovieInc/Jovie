import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const wrapper = join(root, '.github/scripts/run-actionlint.sh');
const temporary = [];

afterEach(() => {
  for (const path of temporary.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

function run(os, architecture, mode = 'capture', verifier = 'default') {
  const dir = mkdtempSync(join(tmpdir(), 'actionlint-platform-'));
  temporary.push(dir);
  const executable = (name, content) => {
    writeFileSync(join(dir, name), `#!/bin/bash\n${content}\n`, {
      mode: 0o755,
    });
  };
  executable(
    'uname',
    'case "$1" in -s) echo "$TEST_ACTIONLINT_OS" ;; -m) echo "$TEST_ACTIONLINT_ARCH" ;; *) exit 2 ;; esac'
  );
  // No test contacts the network. Record the actual wrapper's selected URL;
  // the corruption case uses the real checksum utility on invalid bytes.
  executable(
    'curl',
    `out=''
url=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output) out="$2"; shift 2 ;;
    https://*) url="$1"; shift ;;
    *) shift ;;
  esac
done
printf '%s\\n' "$url" >> "$TEST_ACTIONLINT_URLS"
if [ "$TEST_ACTIONLINT_MODE" = corrupt ]; then
  printf 'corrupted release archive' > "$out"
else
  exit 9
fi`
  );
  executable('tar', 'touch "$TEST_ACTIONLINT_EXTRACTED"; exit 1');
  if (verifier === 'shasum') {
    for (const command of ['mktemp', 'rm', 'shasum']) {
      const found = spawnSync('/usr/bin/which', [command], {
        encoding: 'utf8',
      });
      if (found.status !== 0) throw new Error(`${command} is required`);
      symlinkSync(found.stdout.trim(), join(dir, command));
    }
  }
  const urls = join(dir, 'urls');
  const extracted = join(dir, 'extracted');
  const result = spawnSync('/bin/bash', [wrapper], {
    cwd: root,
    encoding: 'utf8',
    timeout: 15_000,
    env: {
      ...process.env,
      PATH: verifier === 'shasum' ? dir : `${dir}:${process.env.PATH}`,
      RUNNER_TEMP: dir,
      TEST_ACTIONLINT_OS: os,
      TEST_ACTIONLINT_ARCH: architecture,
      TEST_ACTIONLINT_MODE: mode,
      TEST_ACTIONLINT_URLS: urls,
      TEST_ACTIONLINT_EXTRACTED: extracted,
    },
  });
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    urls: existsSync(urls) ? readFileSync(urls, 'utf8').trim().split('\n') : [],
    extracted: existsSync(extracted),
  };
}

describe('checksum-pinned actionlint platform execution', () => {
  it.each([
    ['Linux', 'x86_64', 'linux_amd64'],
    ['Darwin', 'arm64', 'darwin_arm64'],
    ['Darwin', 'x86_64', 'darwin_amd64'],
  ])('selects the official artifact on %s/%s', (os, architecture, platform) => {
    const result = run(os, architecture);
    expect(result.status).toBe(1);
    expect(result.urls).toEqual([
      `https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_${platform}.tar.gz`,
    ]);
    expect(result.output).toContain('download failed:');
    expect(result.extracted).toBe(false);
  });

  it('rejects an unsupported host before downloading or extracting', () => {
    const result = run('Darwin', 'riscv64');
    expect(result.status).toBe(1);
    expect(result.output).toContain('Darwin riscv64');
    expect(result.urls).toEqual([]);
    expect(result.extracted).toBe(false);
  });

  it('rejects corrupt native downloads before archive extraction', () => {
    const result = run('Darwin', 'arm64', 'corrupt');
    expect(result.status).toBe(1);
    expect(result.output).toContain('sha256 mismatch:');
    expect(result.urls).toHaveLength(1);
    expect(result.extracted).toBe(false);
  });

  it('keeps checksum rejection when only the macOS shasum verifier is available', () => {
    const result = run('Darwin', 'arm64', 'corrupt', 'shasum');
    expect(result.status).toBe(1);
    expect(result.output).toContain('sha256 mismatch:');
    expect(result.urls).toHaveLength(1);
    expect(result.extracted).toBe(false);
  });
});
