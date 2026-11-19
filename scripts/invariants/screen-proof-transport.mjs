import { spawnSync } from 'node:child_process';
import { classifyGitHubFailure } from '../lib/github-rate-limit.mjs';

function runOnce(command, args, binary, maxBuffer) {
  const result = spawnSync(command, args, {
    encoding: binary ? undefined : 'utf8',
    maxBuffer,
  });
  if (result.status !== 0) {
    const message = String(result.stderr ?? '');
    const githubRead = command === 'gh' && args[0] === 'api';
    const retryable =
      githubRead &&
      !result.error &&
      !result.signal &&
      (classifyGitHubFailure({ message }).retryable ||
        /API rate limit exceeded/i.test(message) ||
        (!message.trim() && (result.status === 1 || result.status === null)));
    throw Object.assign(new Error('controlled transport unavailable'), {
      retryable,
    });
  }
  return result.stdout;
}
// Run 42650227305: a single transient GitHub CLI exit per screen (rate limit
// / blip) killed four screens' exact-head proofs with no retry while every
// producer artifact sat intact in the same run. Transport retries here
// only, bounded; trust findings are never retried or softened.
let transportRetryDelays = [0, 15_000, 30_000];
export function setTransportRetryDelaysForTests(delays) {
  transportRetryDelays = Array.isArray(delays)
    ? delays
        .filter(
          delay => Number.isSafeInteger(delay) && delay >= 0 && delay <= 30_000
        )
        .slice(0, 3)
    : [0, 15_000, 30_000];
  if (!transportRetryDelays.length) transportRetryDelays = [0];
}
export function runTransport(command, args, binary, maxBuffer) {
  let lastError;
  for (const delay of transportRetryDelays) {
    if (delay) pause(delay);
    try {
      return runOnce(command, args, binary, maxBuffer);
    } catch (error) {
      lastError = error;
      if (!error.retryable) throw error;
    }
  }
  throw lastError;
}
export function pause(ms) {
  if (!ms) return;
  const result = spawnSync('sleep', [String(ms / 1000)]);
  if (result.status !== 0) throw new Error('controlled transport unavailable');
}
