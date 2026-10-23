import { execFileSync, spawnSync } from 'node:child_process';
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

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const GATE = resolve(REPO_ROOT, '.github/scripts/release-lineage-gate.sh');
const EXPECTED_SHA = 'a'.repeat(40);
const NEWER_SHA = 'b'.repeat(40);
const LIVE_SHA = 'c'.repeat(40);

// Captured-shaped GitHub compare documents: a ROOT-level status next to
// nested files[].status values (added/modified/removed). The gate must
// resolve ancestry from the root status only.
const COMPARE_DOCUMENT_AHEAD = JSON.stringify({
  url: 'https://api.github.com/repos/JovieInc/Jovie/compare/main...queued',
  status: 'ahead',
  ahead_by: 2,
  behind_by: 0,
  total_commits: 2,
  files: [
    {
      filename: 'apps/web/app/page.tsx',
      status: 'modified',
      additions: 12,
      deletions: 3,
    },
    {
      filename: '.github/scripts/release-lineage-gate.sh',
      status: 'modified',
      additions: 36,
      deletions: 2,
    },
    {
      filename: 'docs/new-checklist.md',
      status: 'added',
      additions: 8,
      deletions: 0,
    },
    {
      filename: 'docs/retired-checklist.md',
      status: 'removed',
      additions: 0,
      deletions: 40,
    },
  ],
  commits: [
    {
      sha: NEWER_SHA,
      commit: { message: 'fix(ci): ship the queued generation' },
    },
  ],
});
const COMPARE_DOCUMENT_DIVERGED = JSON.stringify({
  url: 'https://api.github.com/repos/JovieInc/Jovie/compare/main...queued',
  status: 'diverged',
  ahead_by: 4,
  behind_by: 1,
  total_commits: 5,
  files: [{ filename: 'apps/web/app/page.tsx', status: 'modified' }],
  commits: [{ sha: NEWER_SHA, commit: { message: 'feat: after a rewind' } }],
});
const COMPARE_DOCUMENT_IDENTICAL = JSON.stringify({
  url: 'https://api.github.com/repos/JovieInc/Jovie/compare/main...queued',
  status: 'identical',
  ahead_by: 0,
  behind_by: 0,
  total_commits: 0,
  files: [{ filename: 'apps/web/app/page.tsx', status: 'modified' }],
  commits: [],
});
const tempRoots = [];

afterEach(() => {
  for (const root of tempRoots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function parseOutputs(path) {
  const values = {};
  for (const line of readFileSync(path, 'utf8').trim().split('\n')) {
    if (!line) continue;
    const separator = line.indexOf('=');
    values[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return values;
}

/**
 * Stub gh/curl so the gate sees: main at `main`, compare(expected...main) =
 * `lineageStatus`, `pendingSuccessors` newer controller runs, live production
 * at `liveSha`, and `unshipped` commits whose oldest landed `ageSeconds` ago.
 */
function runGate({
  main = EXPECTED_SHA,
  lineageStatus = 'ahead',
  lineageExit = 0,
  pendingSuccessors = 0,
  runsFail = false,
  runsResponse = /** @type {string | undefined} */ (undefined),
  liveSha = LIVE_SHA,
  unshipped = 3,
  ageSeconds = 600,
  compareFails = false,
  buildInfoFails = false,
  starvationSeconds = 5400,
  inFlight = false,
  lineageFailTimes = 0,
  lineageFailureText = 'API rate limit exceeded for installation ID 1. (HTTP 403)',
  // Full captured GitHub compare response body. The stub gh applies the
  // gate's own --jq filter to it, so the document flows through gh exactly
  // like a real response (root status, nested files[].status, or garbage).
  compareDocument = /** @type {string | undefined} */ (undefined),
  // HTTP-level compare failure: the stub gh emits gh's error shape
  // `gh: <message> (HTTP <status>)` and exits 1 on every attempt.
  compareHttpError = /** @type {{status: number, message: string} | undefined} */ (
    undefined
  ),
  // 'ahead' | 'diverged' | 'missing' | 'tip-moved'. Unset keeps git proof off.
  gitLineage = /** @type {string | undefined} */ (undefined),
  // Queued successors with staging evidence: { sha, staging: 'deployed' |
  // 'superseded' | 'not_applicable' | 'failure' | 'missing' | 'no-artifact' }.
  successors = /** @type {{sha: string, staging: string}[]} */ ([]),
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'lineage-gate-'));
  tempRoots.push(root);
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const output = join(root, 'github-output');
  writeFileSync(output, '');
  const oldest = new Date(Date.now() - ageSeconds * 1000)
    .toISOString()
    .replace(/\.\d+Z$/, 'Z');
  const runs =
    runsResponse ??
    JSON.stringify({
      workflow_runs: [
        { id: 100, status: 'in_progress' },
        ...Array.from({ length: pendingSuccessors }, (_, i) => ({
          id: 101 + i,
          status: 'pending',
        })),
        ...successors.map((successor, i) => ({
          id: 201 + i,
          status: 'pending',
          display_title: `Production Controller ${successor.sha} from CI ${301 + i} attempt 1`,
        })),
        { id: 50, status: 'pending' },
      ],
    });
  const extraRoutes = {};
  const stagingRuns = [];
  successors.forEach((successor, i) => {
    if (successor.staging === 'missing') return;
    const stagingId = 401 + i;
    stagingRuns.push({
      id: stagingId,
      run_attempt: 1,
      status: 'completed',
      conclusion: successor.staging === 'failure' ? 'failure' : 'success',
      display_title: `${successor.sha} from CI ${301 + i} attempt 1`,
    });
    const artifacts =
      successor.staging === 'no-artifact'
        ? []
        : [{ id: 501 + i, name: 'staging-completion-1', expired: false }];
    extraRoutes[
      `repos/JovieInc/Jovie/actions/runs/${stagingId}/artifacts?per_page=100`
    ] = JSON.stringify({ total_count: artifacts.length, artifacts });
    const dir = join(root, `zip-${501 + i}`);
    mkdirSync(dir);
    writeFileSync(
      join(dir, 'staging-completion.json'),
      JSON.stringify({ sha: successor.sha, outcome: successor.staging })
    );
    execFileSync(
      'zip',
      ['-q', join(root, `${501 + i}.zip`), 'staging-completion.json'],
      {
        cwd: dir,
      }
    );
  });
  extraRoutes[
    'repos/JovieInc/Jovie/actions/workflows/staging-controller.yml/runs?branch=main&event=workflow_run&per_page=50'
  ] = JSON.stringify({ workflow_runs: stagingRuns });
  writeFileSync(join(root, 'routes.json'), JSON.stringify(extraRoutes));
  if (compareHttpError) {
    writeFileSync(
      join(root, 'compare-http-status'),
      String(compareHttpError.status)
    );
    writeFileSync(join(root, 'compare-http-message'), compareHttpError.message);
  }
  if (compareDocument !== undefined) {
    writeFileSync(join(root, 'compare-document.json'), compareDocument);
  }
  const compare = compareFails
    ? ''
    : JSON.stringify({
        status: unshipped > 0 ? 'ahead' : 'identical',
        ahead_by: unshipped,
        commits:
          unshipped > 0 ? [{ commit: { committer: { date: oldest } } }] : [],
      });
  writeFileSync(
    join(bin, 'gh'),
    `#!/bin/sh
case "$*" in
  *compare/${EXPECTED_SHA}...*)
    n=0
    [ -f "${root}/compare-count" ] && n="$(cat "${root}/compare-count")"
    n=$((n + 1))
    printf '%s' "$n" > "${root}/compare-count"
    if [ "$n" -le ${lineageFailTimes} ]; then
      printf '%s\\n' '${lineageFailureText}' >&2
      exit 1
    fi
    if [ -f "${root}/compare-http-status" ]; then
      printf 'gh: %s (HTTP %s)\\n' "$(cat "${root}/compare-http-message")" "$(cat "${root}/compare-http-status")" >&2
      exit 1
    fi
    if [ -f "${root}/compare-document.json" ]; then
      jq_filter=
      prev=
      for a in "$@"; do
        [ "$prev" = "--jq" ] && jq_filter="$a"
        prev="$a"
      done
      if [ -n "$jq_filter" ]; then
        exec jq -r "$jq_filter" "${root}/compare-document.json"
      fi
      exec cat "${root}/compare-document.json"
    fi
    printf '%s\\n' "${lineageStatus}"; exit ${lineageExit} ;;
  *compare/${liveSha}...*) ${compareFails ? 'exit 1' : `cat <<'JSON'\n${compare}\nJSON\n`}
  ;;
  *production-controller.yml/runs*) ${runsFail ? 'exit 22' : ''}
cat <<'JSON'
${runs}
JSON
  ;;
  */zip) id="\${2%/zip}"; cat "${root}/\${id##*/}.zip" ;;
  *) exec node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))[process.argv[2]];if(r===undefined)process.exit(1);process.stdout.write(r)' "${root}/routes.json" "$2" ;;
esac
`
  );
  chmodSync(join(bin, 'gh'), 0o755);
  writeFileSync(
    join(bin, 'curl'),
    buildInfoFails
      ? '#!/bin/sh\nexit 22\n'
      : `#!/bin/sh\nprintf '{"commitSha":"${liveSha}"}\\n'\n`
  );
  chmodSync(join(bin, 'curl'), 0o755);
  if (gitLineage) {
    const objectPresent = gitLineage === 'missing' ? '0' : '1';
    const isAncestor = gitLineage === 'ahead' ? '0' : '1';
    const tip =
      gitLineage === 'tip-moved' ? 'd'.repeat(40) : '$CURRENT_MAIN_SHA';
    writeFileSync(
      join(bin, 'git'),
      `#!/bin/sh
case "$*" in
  *rev-parse*) printf '%s\\n' "${tip}" ;;
  *cat-file*) [ "${objectPresent}" = 1 ] || exit 1 ;;
  *merge-base*) [ "${isAncestor}" = 1 ] && exit 1 || exit 0 ;;
  *) exit 0 ;;
esac
`
    );
    chmodSync(join(bin, 'git'), 0o755);
  }
  const result = spawnSync('bash', [GATE], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20_000,
    env: {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH || ''}`,
      CURRENT_MAIN_SHA: main,
      EXPECTED_SHA,
      GITHUB_OUTPUT: output,
      GITHUB_RUN_ID: '100',
      IN_FLIGHT: inFlight ? 'true' : 'false',
      LINEAGE_COMPARE_BACKOFF_SECONDS: '0',
      LINEAGE_PROVE_WITH_GIT: gitLineage ? '1' : '0',
      PRODUCTION_STARVATION_SECONDS: String(starvationSeconds),
      REPOSITORY: 'JovieInc/Jovie',
    },
  });
  const countPath = join(root, 'compare-count');
  return {
    result,
    decision: result.stdout.trim(),
    outputs: parseOutputs(output),
    compareAttempts: existsSync(countPath)
      ? Number(readFileSync(countPath, 'utf8'))
      : 0,
  };
}

describe('release lineage gate', () => {
  it('proceeds when main still equals the generation', () => {
    const run = runGate({ main: EXPECTED_SHA });
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.decision).toBe('decision=proceed');
    expect(run.outputs).toMatchObject({
      lineage: 'exact',
      gate_decision: 'proceed',
    });
  });

  it('yields when the generation left main lineage', () => {
    for (const status of ['diverged', 'behind']) {
      const run = runGate({ main: NEWER_SHA, lineageStatus: status });
      expect(run.result.status, run.result.stderr).toBe(0);
      expect(run.decision).toBe('decision=yield');
      expect(run.outputs.lineage).toBe('diverged');
    }
  });

  it.each([
    { lineageStatus: '', lineageExit: 1 },
    { lineageStatus: 'ahead', lineageExit: 22 },
    { lineageStatus: '', lineageExit: 0 },
    { lineageStatus: 'not json', lineageExit: 0 },
    { lineageStatus: 'identical', lineageExit: 0 },
  ])('rejects unreadable ancestry instead of superseding: %j', overrides => {
    const run = runGate({ main: NEWER_SHA, ...overrides });
    expect(run.result.status).toBe(1);
    expect(run.decision).toBe('decision=error');
    expect(run.outputs).toMatchObject({
      lineage: 'unknown',
      lineage_lookup_exit: String(overrides.lineageExit),
      gate_decision: 'error',
      gate_reason: 'lineage_lookup_unavailable',
    });
    expect(run.result.stderr).toContain('Release ancestry is unknown');
    expect(run.result.stderr).not.toContain('left main');
    expect(run.result.stderr).not.toContain('installation ID');
  });

  it('retries a rate-limited compare and keeps the ancestor lease', () => {
    const run = runGate({
      main: NEWER_SHA,
      lineageFailTimes: 1,
      lineageStatus: 'ahead',
      lineageExit: 0,
      pendingSuccessors: 0,
    });
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.decision).toBe('decision=proceed');
    expect(run.compareAttempts).toBe(2);
    expect(run.outputs.lineage).toBe('ancestor');
    expect(run.result.stderr).toContain(
      'Release compare attempt 1/3 class=rate_limit http=403 exit=1.'
    );
    expect(run.result.stderr).not.toContain('installation ID');
  });

  it('proves an ancestor with git when the compare command keeps failing', () => {
    const run = runGate({
      main: NEWER_SHA,
      lineageExit: 1,
      lineageFailureText: 'HTTP 403: API rate limit exceeded for installation',
      gitLineage: 'ahead',
      pendingSuccessors: 0,
    });
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.decision).toBe('decision=proceed');
    expect(run.outputs.lineage).toBe('ancestor');
    expect(run.compareAttempts).toBe(3);
    expect(run.result.stderr).toContain('git proved lineage=ancestor');
    expect(run.result.stderr).not.toContain('installation ID');
  });

  it('accepts a git proof that the generation left main', () => {
    const run = runGate({
      main: NEWER_SHA,
      lineageExit: 1,
      gitLineage: 'diverged',
    });
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.decision).toBe('decision=yield');
    expect(run.outputs.lineage).toBe('diverged');
  });

  it('stays fail-closed when git cannot see the expected commit', () => {
    for (const gitLineage of ['missing', 'tip-moved']) {
      const run = runGate({
        main: NEWER_SHA,
        lineageExit: 1,
        gitLineage,
      });
      expect(run.result.status, run.result.stderr).toBe(1);
      expect(run.decision).toBe('decision=error');
      expect(run.outputs).toMatchObject({
        lineage: 'unknown',
        gate_reason: 'lineage_lookup_unavailable',
      });
      expect(run.result.stderr).toContain('Release ancestry is unknown');
    }
  });

  it.each([
    { runsFail: true },
    { runsResponse: '' },
    { runsResponse: '{}' },
    { runsResponse: 'not json' },
    { runsResponse: '{"workflow_runs":[{"id":101}]}' },
  ])(
    'keeps failed successor visibility unknown even under starvation: %j',
    overrides => {
      const run = runGate({
        main: NEWER_SHA,
        ageSeconds: 6000,
        inFlight: true,
        ...overrides,
      });
      expect(run.result.status).toBe(1);
      expect(run.decision).toBe('decision=error');
      expect(run.outputs).toMatchObject({
        successor_pending: 'unknown',
        starving: 'unknown',
        gate_decision: 'error',
      });
      expect(run.result.stderr).not.toContain('no newer generation');
    }
  );

  it('keeps the lease for an ancestor when no newer generation is queued', () => {
    const run = runGate({ main: NEWER_SHA, pendingSuccessors: 0 });
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.decision).toBe('decision=proceed');
    expect(run.outputs).toMatchObject({
      lineage: 'ancestor',
      successor_pending: 'false',
      starving: 'false',
      unshipped_commits: '3',
    });
  });

  it('yields to a queued successor while production is fresh', () => {
    const run = runGate({
      main: NEWER_SHA,
      pendingSuccessors: 2,
      ageSeconds: 600,
    });
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.decision).toBe('decision=yield');
    expect(run.outputs).toMatchObject({
      successor_pending: 'true',
      starving: 'false',
    });
  });

  it('drains a queued ancestor to the newest successor once production is starving', () => {
    const run = runGate({
      main: NEWER_SHA,
      pendingSuccessors: 2,
      ageSeconds: 6000,
    });
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.decision).toBe('decision=yield');
    expect(run.outputs).toMatchObject({
      successor_pending: 'true',
      starving: 'true',
    });
    expect(Number(run.outputs.unshipped_age_seconds)).toBeGreaterThanOrEqual(
      5400
    );
  });

  it('keeps the lease for an in-flight generation despite a queued successor once production is starving', () => {
    const run = runGate({
      main: NEWER_SHA,
      pendingSuccessors: 2,
      ageSeconds: 6000,
      inFlight: true,
    });
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.decision).toBe('decision=proceed');
    expect(run.outputs).toMatchObject({
      successor_pending: 'true',
      starving: 'true',
      in_flight: 'true',
    });
  });

  it.each([0, 1, 2, 3, 4])(
    'drains five queued generations under starvation: position %i',
    position => {
      // Five stale generations queued FIFO behind a starving production. Each
      // still-queued generation yields to its queued successors in seconds, so
      // only the newest (no successors behind it) proceeds to the pipeline.
      const queued = 5;

      const run = runGate({
        main: NEWER_SHA,
        pendingSuccessors: queued - 1 - position,
        ageSeconds: 6000,
      });
      expect(run.result.status, run.result.stderr).toBe(0);
      expect(run.outputs.starving).toBe('true');
      expect(run.decision).toBe(
        position === queued - 1 ? 'decision=proceed' : 'decision=yield'
      );
    }
  );

  it('treats unreadable production evidence as starving rather than yielding forever', () => {
    for (const overrides of [
      { buildInfoFails: true },
      { compareFails: true },
    ]) {
      // A still-queued generation still yields: its queued successor ships a
      // newer SHA, so the stale backlog drains instead of running the full
      // pipeline for every generation.
      const queued = runGate({
        main: NEWER_SHA,
        pendingSuccessors: 1,
        ...overrides,
      });
      expect(queued.result.status, queued.result.stderr).toBe(0);
      expect(queued.decision).toBe('decision=yield');
      expect(queued.outputs.starving).toBe('true');

      // An in-flight generation keeps the lease so unreadable evidence can
      // never starve production of a ship.
      const inFlight = runGate({
        main: NEWER_SHA,
        pendingSuccessors: 1,
        inFlight: true,
        ...overrides,
      });
      expect(inFlight.result.status, inFlight.result.stderr).toBe(0);
      expect(inFlight.decision).toBe('decision=proceed');
      expect(inFlight.outputs.starving).toBe('true');
    }
  });

  it('is not starving when production already has every main commit', () => {
    const run = runGate({
      main: NEWER_SHA,
      pendingSuccessors: 1,
      unshipped: 0,
    });
    expect(run.decision).toBe('decision=yield');
    expect(run.outputs).toMatchObject({
      starving: 'false',
      unshipped_commits: '0',
    });
  });

  it('does not yield to queued successors whose staging cannot ship (2026-10-20, run 39460322150)', () => {
    // 826b00a held a deployed staging generation, but four queued successors
    // were superseded in staging by a397d64, whose staging canary then failed.
    // Yielding to them left production on 060037d with no generation able to
    // promote.
    const run = runGate({
      main: NEWER_SHA,
      inFlight: true,
      successors: [
        { sha: 'd'.repeat(40), staging: 'superseded' },
        { sha: 'e'.repeat(40), staging: 'superseded' },
        { sha: 'f'.repeat(40), staging: 'superseded' },
        { sha: '1'.repeat(40), staging: 'failure' },
      ],
    });
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.decision).toBe('decision=proceed');
    expect(run.outputs).toMatchObject({
      successor_pending: 'false',
      skipped_successors: '4',
      gate_decision: 'proceed',
    });
    expect(run.outputs.gate_reason).toContain(
      '4 queued successor(s) cannot ship'
    );
    expect(run.result.stderr).toContain('staging 404 concluded failure');
    expect(run.result.stderr).toContain('staging 401 finished superseded');
  });

  it.each(['deployed', 'not_applicable', 'missing', 'no-artifact'])(
    'still yields to a newer successor whose staging is %s or unknown',
    staging => {
      const run = runGate({
        main: NEWER_SHA,
        successors: [
          { sha: 'd'.repeat(40), staging: 'superseded' },
          { sha: 'e'.repeat(40), staging },
        ],
      });
      expect(run.result.status, run.result.stderr).toBe(0);
      expect(run.decision).toBe('decision=yield');
      expect(run.outputs).toMatchObject({
        successor_pending: 'true',
        skipped_successors: '0',
      });
    }
  );

  it('fails closed on malformed inputs', () => {
    const run = runGate({ main: 'not-a-sha' });
    expect(run.result.status).not.toBe(0);
  });

  describe('captured GitHub compare documents', () => {
    it.each([
      {
        name: 'ahead',
        document: COMPARE_DOCUMENT_AHEAD,
        decision: 'proceed',
        lineage: 'ancestor',
      },
      {
        name: 'diverged',
        document: COMPARE_DOCUMENT_DIVERGED,
        decision: 'yield',
        lineage: 'diverged',
      },
    ])(
      'reads the root status, never a nested files[].status: $name',
      ({ document, decision, lineage }) => {
        const run = runGate({
          main: NEWER_SHA,
          compareDocument: document,
          pendingSuccessors: 0,
        });
        expect(run.result.status, run.result.stderr).toBe(0);
        expect(run.decision).toBe(`decision=${decision}`);
        expect(run.outputs.lineage).toBe(lineage);
      }
    );

    it('fails closed when the root status is identical even though nested file statuses exist', () => {
      const run = runGate({
        main: NEWER_SHA,
        compareDocument: COMPARE_DOCUMENT_IDENTICAL,
        pendingSuccessors: 0,
      });
      expect(run.result.status).toBe(1);
      expect(run.decision).toBe('decision=error');
      expect(run.outputs).toMatchObject({
        lineage: 'unknown',
        lineage_lookup_exit: '0',
        lineage_lookup_class: 'none',
        gate_decision: 'error',
        gate_reason: 'lineage_lookup_unavailable',
      });
      expect(run.result.stderr).toContain('Release ancestry is unknown');
      expect(run.result.stderr).toContain('http=none');
    });

    it.each([
      {
        http: 403,
        message: 'API rate limit exceeded for installation ID 987654.',
        klass: 'rate_limit',
      },
      {
        http: 403,
        message:
          'You have exceeded a secondary rate limit. Please wait a few minutes before you try again.',
        klass: 'rate_limit',
      },
      { http: 404, message: 'Not Found', klass: 'http_404' },
      { http: 500, message: 'Internal Server Error', klass: 'http_500' },
      { http: 502, message: 'Bad Gateway', klass: 'http_502' },
      { http: 503, message: 'Service Unavailable', klass: 'http_503' },
    ])(
      'fails closed on HTTP $http and annotates the status and sanitized message',
      ({ http, message, klass }) => {
        const run = runGate({
          main: NEWER_SHA,
          compareHttpError: { status: http, message },
          pendingSuccessors: 0,
        });
        expect(run.result.status).toBe(1);
        expect(run.decision).toBe('decision=error');
        expect(run.compareAttempts).toBe(3);
        expect(run.outputs).toMatchObject({
          lineage: 'unknown',
          lineage_lookup_exit: '1',
          lineage_lookup_class: klass,
          gate_decision: 'error',
          gate_reason: 'lineage_lookup_unavailable',
        });
        expect(run.result.stderr).toContain(
          `Release compare attempt 1/3 class=${klass} http=${http} exit=1.`
        );
        expect(run.result.stderr).toContain('Release ancestry is unknown');
        expect(run.result.stderr).toContain(`class=${klass}`);
        expect(run.result.stderr).toContain(`http=${http}`);
        expect(run.result.stderr).toContain('msg="');
      }
    );

    it('sanitizes the annotation message: single line, credential-free, length-capped', () => {
      const run = runGate({
        main: NEWER_SHA,
        compareHttpError: {
          status: 403,
          message:
            'API rate limit exceeded for installation ID 987654.\nSecond line: bearer sk-1234567890abcdef ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ' +
            'y'.repeat(300),
        },
        pendingSuccessors: 0,
      });
      expect(run.result.status).toBe(1);
      const annotation = run.result.stderr
        .split('\n')
        .find(line => line.includes('Release ancestry is unknown'));
      expect(annotation).toContain('http=403');
      const msg = annotation?.match(/msg="([^"]*)"/)?.[1] ?? '';
      expect(msg.length).toBeLessThanOrEqual(160);
      expect(msg).not.toContain('\n');
      expect(msg).not.toContain('987654');
      expect(msg).not.toContain('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
      expect(msg).not.toContain('sk-1234567890abcdef');
      expect(msg).toContain('[redacted]');
      expect(msg).toContain('API rate limit exceeded');
    });

    it.each([
      {
        name: 'non-JSON HTML body',
        body: '<html><body>Service maintenance page</body></html>',
        klass: 'transport',
      },
      {
        name: 'truncated JSON body',
        body: '{"status":"ahead","ahead_by":2,"files":[{"filename":"apps',
        klass: 'transport',
      },
      { name: 'empty body', body: '', klass: 'none' },
    ])('fails closed on a $name response', ({ body, klass }) => {
      const run = runGate({
        main: NEWER_SHA,
        compareDocument: body,
        pendingSuccessors: 0,
      });
      expect(run.result.status).toBe(1);
      expect(run.decision).toBe('decision=error');
      // A jq parse error surfaces as a non-zero transport exit; an empty body
      // is a completed read (exit 0). Both stay unknown.
      if (klass === 'transport') {
        expect(Number(run.outputs.lineage_lookup_exit)).toBeGreaterThan(0);
      } else {
        expect(run.outputs.lineage_lookup_exit).toBe('0');
      }
      expect(run.outputs).toMatchObject({
        lineage: 'unknown',
        lineage_lookup_class: klass,
        gate_decision: 'error',
        gate_reason: 'lineage_lookup_unavailable',
      });
      expect(run.result.stderr).toContain('Release ancestry is unknown');
    });
  });
});
