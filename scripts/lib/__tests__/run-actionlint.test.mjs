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

function installFixture(mode = 'success') {
  const dir = mkdtempSync(join(tmpdir(), 'actionlint-build-'));
  temporary.push(dir);
  const executable = (name, text) =>
    writeFileSync(join(dir, name), `#!/bin/bash\nset -eu\n${text}\n`, {
      mode: 0o755,
    });
  executable('uname', 'case "$1" in -s) echo Darwin;; -m) echo arm64;; esac');
  executable(
    'curl',
    `while [ "$#" -gt 0 ]; do
    if [ "$1" = --output ]; then printf fixture > "$2"; shift 2; else shift; fi
  done`
  );
  executable(
    'shasum',
    `input=$(cat)
    printf '%s\\n' "$input" >> "$TEST_CHECKSUMS"
    if [ "$TEST_MODE" = queue-checksum-failure ] && [[ "$input" == *queue-*.patch ]]; then exit 1; fi`
  );
  executable(
    'patch',
    '[ "$TEST_MODE" != patch-failure ] || exit 9; cat >/dev/null'
  );
  executable(
    'tar',
    `case "$*" in
    *actionlint-source.tar.gz*)
      target=$(find "$RUNNER_TEMP" -name actionlint-source -type d)
      printf '%s\\n' 'cmd.Stdin = strings.NewReader(e.stdin)' > "$target/process.go" ;;
    *shellcheck.tar.xz*)
      target=$(find "$RUNNER_TEMP" -name actionlint-source -type d)
      printf '#!/bin/bash\\necho "version: 0.11.0"\\n' > "$(dirname "$target")/shellcheck" ;;
  esac`
  );
  executable(
    'go',
    `printf '%s\\n' "$@" >> "$TEST_GO_ARGS"
  [ "$GOTOOLCHAIN" = local ] && [ "$GOWORK" = off ] && [ -z "$GOFLAGS" ]
  [ "$CGO_ENABLED" = 0 ] && [ "$GOOS" = darwin ] && [ "$GOARCH" = arm64 ]
  if [ "$1" = test ]; then
    [ "$TEST_MODE" != regression-failure ] || exit 7
    case "$*" in *concurrency_queue*)
      [ "$TEST_MODE" != queue-regression-failure ] || exit 7
      if [ "$TEST_MODE" != queue-no-tests ]; then
        case "$*" in
          *TestLinterLintOK*) echo '--- PASS: TestLinterLintOK/concurrency_queue.yaml (0.00s)' ;;
          *TestLinterLintError*) echo '--- PASS: TestLinterLintError/err/concurrency_queue (0.00s)' ;;
        esac
      fi ;;
    esac
    for arg in "$@"; do case "$arg" in
      -coverprofile=*) printf 'mode: set\\ngithub.com/rhysd/actionlint/process.go:1.1,2.1 1 %s\\n' \\
        "$([ "$TEST_MODE" = uncovered ] && echo 0 || echo 5)" > "$(printf '%s' "$arg" | cut -d= -f2-)" ;;
    esac; done
    [ "$TEST_MODE" != regression-failure-covered ] || exit 7
    exit 0
  fi
  [ "$TEST_MODE" != build-failure ] || exit 8
  out=''
  while [ "$#" -gt 0 ]; do
    if [ "$1" = -o ]; then out="$2"; shift 2; else shift; fi
  done
  cat > "$out" <<'BIN'
#!/bin/bash
if [ "$1" = -version ]; then
  if [ "$TEST_MODE" = wrong-version ]; then echo wrong; else echo 1.7.12+fd33e9f582a0.queue644076a59742; fi
else
  printf '%s\\n' "$@" > "$TEST_LINT_ARGS"
  echo 'lint ran'
  [ "$TEST_MODE" != lint-failure ] || exit 2
fi
BIN`
  );
  executable('python3', 'echo 3.4.0');
  const goArgs = join(dir, 'go-args');
  const lintArgs = join(dir, 'lint-args');
  const checksums = join(dir, 'checksums');
  const result = spawnSync(
    '/bin/bash',
    [wrapper, '-oneline', 'workflow with spaces.yml'],
    {
      encoding: 'utf8',
      timeout: 15_000,
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        RUNNER_TEMP: dir,
        TEST_MODE: mode,
        TEST_GO_ARGS: goArgs,
        TEST_LINT_ARGS: lintArgs,
        TEST_CHECKSUMS: checksums,
      },
    }
  );
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    goArgs: existsSync(goArgs) ? readFileSync(goArgs, 'utf8') : '',
    lintArgs: existsSync(lintArgs) ? readFileSync(lintArgs, 'utf8') : '',
    checksums: existsSync(checksums) ? readFileSync(checksums, 'utf8') : '',
  };
}

describe('checksum-pinned actionlint platform execution', () => {
  it.each([
    ['Linux', 'x86_64'],
    ['Darwin', 'arm64'],
    ['Darwin', 'x86_64'],
  ])('verifies the upstream fix on %s/%s', (os, architecture) => {
    const result = run(os, architecture);
    expect(result.status).toBe(1);
    expect(result.urls).toEqual([
      'https://codeload.github.com/rhysd/actionlint/tar.gz/fd33e9f582a01a02885c93ae3775e1190cf63653',
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

  it('runs the upstream pipe regression and builds only verified source with fixed flags', () => {
    const result = installFixture();
    expect(result.status, result.output).toBe(0);
    expect(result.goArgs).toContain(
      '^TestProcessConcurrentStdinDoesNotDeadlock$'
    );
    expect(result.goArgs).toContain('-timeout=20s');
    expect(result.goArgs).toContain('-mod=readonly');
    expect(result.goArgs).toContain('-trimpath');
    expect(result.checksums).toContain(
      '475da14da4ed169c493d4f988f2cd6e4f15434752635ad809e5613cc3cde6fcc'
    );
    expect(result.checksums).toContain(
      '0378db3d77631edba189ecb92159417b0f5ed607d4ca41d370b4bfe1d4eee68f'
    );
    expect(result.goArgs).toContain(
      '^TestLinterLintOK$/^concurrency_queue[.]yaml$'
    );
    expect(result.goArgs).toContain(
      '^TestLinterLintError$/^err$/^concurrency_queue$'
    );
    expect(result.lintArgs).toMatch(/-shellcheck=.*\/shellcheck/);
    expect(result.lintArgs).toMatch(/-pyflakes=.*\/pyflakes/);
    expect(result.lintArgs).toContain('-oneline\nworkflow with spaces.yml');
  });

  it.each([
    'regression-failure',
    'regression-failure-covered',
    'uncovered',
    'build-failure',
    'wrong-version',
    'patch-failure',
    'queue-regression-failure',
    'queue-no-tests',
    'queue-checksum-failure',
  ])('fails closed before linting on %s', mode => {
    const result = installFixture(mode);
    expect(result.status).toBe(1);
    expect(result.lintArgs).toBe('');
  });

  it('propagates actual lint failure rather than accepting a successful build', () => {
    const result = installFixture('lint-failure');
    expect(result.status, result.output).toBe(2);
    expect(result.output).toContain('lint ran');
  });
});
