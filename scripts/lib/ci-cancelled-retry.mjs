const TERMINAL_CONCLUSIONS = new Set([
  'failure',
  'timed_out',
  'action_required',
  'startup_failure',
]);

const CORE_JOB_PATTERNS = [
  /^Path Changes$/,
  /^CI Risk Classifier$/,
  /^ci-fast$/,
  /^Unit Tests \(/,
];

const RETRYABLE_JOB_NAMES = new Set([
  'Build (public routes)',
  'Preview Deploy (PR)',
]);

export function cancelledDagRetryDecision(jobs = [], runAttempt = 1) {
  const coreFailure = jobs.find(
    job =>
      CORE_JOB_PATTERNS.some(pattern => pattern.test(job.name ?? '')) &&
      TERMINAL_CONCLUSIONS.has(job.conclusion ?? '')
  );
  if (coreFailure) {
    return {
      shouldRerun: false,
      reason: `terminal core failure: ${coreFailure.name}`,
    };
  }

  const prReadyFailed = jobs.some(
    job => job.name === 'PR Ready' && job.conclusion === 'failure'
  );
  const cancelledJobs = jobs
    .filter(
      job =>
        RETRYABLE_JOB_NAMES.has(job.name ?? '') &&
        job.conclusion === 'cancelled'
    )
    .map(job => job.name);

  if (!prReadyFailed || cancelledJobs.length === 0) {
    return { shouldRerun: false, reason: 'no cancelled aggregate false-red' };
  }
  if (runAttempt !== 1) {
    return { shouldRerun: false, reason: 'automatic retry already consumed' };
  }

  return {
    shouldRerun: true,
    reason: `retry cancelled jobs: ${cancelledJobs.join(', ')}`,
  };
}

if (process.argv[1]?.endsWith('ci-cancelled-retry.mjs')) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const jobs = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const decision = cancelledDagRetryDecision(
    jobs,
    Number.parseInt(process.env.RUN_ATTEMPT ?? '1', 10)
  );
  process.stdout.write(`${JSON.stringify(decision)}\n`);
}
