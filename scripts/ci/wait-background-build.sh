#!/usr/bin/env bash
# Waits for the dashboard Lighthouse background fallback build (ci.yml
# "Start fallback build in background") to finish and fails closed on every
# abnormal end. Invoked as:
#   wait-background-build.sh <pid> <exit-file> <log-file>
# The builder is setsid'd into its own process group, so <pid> is both the
# wrapper pid and the process-group id; on timeout the whole group (pnpm,
# next, workers) is TERMed with a bounded window and then KILLed, with a
# single-pid fallback for non-group launches. The builder writes its exit
# status to <exit-file> atomically (tmp + mv). NEXT_BUILD_WAIT_TIMEOUT_SECONDS
# (default 720) bounds the total wait; the job's own timeout-minutes stays
# the hard ceiling. Executable-tested by
# apps/web/tests/unit/ci/lighthouse-background-build.test.ts.
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "::error::usage: wait-background-build.sh <pid> <exit-file> <log-file>" >&2
  exit 2
fi

pid="$1"
exit_file="$2"
log_file="$3"
timeout_seconds="${NEXT_BUILD_WAIT_TIMEOUT_SECONDS:-720}"
# Grace period after the pid disappears: the builder may be between its
# final mv and process exit, or the status file may be one poll behind.
grace_seconds="${NEXT_BUILD_WAIT_GRACE_SECONDS:-5}"
# Bounded window between TERM and KILL on timeout.
term_seconds="${NEXT_BUILD_WAIT_TERM_SECONDS:-3}"

if ! [[ "$pid" =~ ^[0-9]+$ ]]; then
  echo "::error::wait-background-build.sh: pid must be an integer, got '$pid'" >&2
  exit 2
fi

deadline=$((SECONDS + timeout_seconds))

while [[ ! -f "$exit_file" ]]; do
  if ! kill -0 "$pid" 2>/dev/null; then
    grace_deadline=$((SECONDS + grace_seconds))
    while [[ ! -f "$exit_file" ]] && [[ "$SECONDS" -lt "$grace_deadline" ]]; do
      sleep 1
    done
    if [[ ! -f "$exit_file" ]]; then
      echo "::error::Background build (pid $pid) exited without writing $exit_file." >&2
      tail -n 100 "$log_file" >&2 2>/dev/null || true
      exit 1
    fi
    break
  fi
  if [[ "$SECONDS" -ge "$deadline" ]]; then
    echo "::error::Background build did not finish within ${timeout_seconds}s; killing the build process group." >&2
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    term_deadline=$((SECONDS + term_seconds))
    while kill -0 -- "-$pid" 2>/dev/null && [[ "$SECONDS" -lt "$term_deadline" ]]; do
      sleep 1
    done
    kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
    tail -n 100 "$log_file" >&2 2>/dev/null || true
    exit 1
  fi
  sleep 2
done

status="$(cat "$exit_file")"
if ! [[ "$status" =~ ^[0-9]+$ ]]; then
  echo "::error::Background build wrote a non-integer status '$status'." >&2
  tail -n 120 "$log_file" >&2 2>/dev/null || true
  exit 1
fi

if [[ "$status" != "0" ]]; then
  echo "::error::Background build failed with exit code $status; last 120 log lines:" >&2
  tail -n 120 "$log_file" >&2 2>/dev/null || true
  exit 1
fi

echo "Background build finished; last log lines:"
tail -n 5 "$log_file" 2>/dev/null || true
