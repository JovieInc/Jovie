import { spawn } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const TRANSIENT_PROTOCOL_PATTERNS = [
  /\bPROTOCOL_TIMEOUT\b/i,
  /Waiting for DevTools protocol response has exceeded the allotted time/i,
];

const DETERMINISTIC_ASSERTION_PATTERNS = [
  /\bassertion failure for\b/i,
  /\bassertion failed\b/i,
  /expected (?:audit )?score[^\n]*(?:but got|found|received|actual)/i,
  /expected[^\n]*(?:>=|<=)[^\n]*(?:found|received|actual)/i,
];

const MAX_CAPTURE_BYTES = 256 * 1024;

export function classifyLighthouseFailure(output) {
  const normalized = String(output).replace(/\u001b\[[0-9;]*m/g, '');

  if (
    DETERMINISTIC_ASSERTION_PATTERNS.some(pattern => pattern.test(normalized))
  ) {
    return 'deterministic_assertion';
  }

  if (TRANSIENT_PROTOCOL_PATTERNS.some(pattern => pattern.test(normalized))) {
    return 'transient_protocol';
  }

  return 'unknown';
}

function appendBounded(current, chunk) {
  const next = current + String(chunk);
  return next.length > MAX_CAPTURE_BYTES
    ? next.slice(next.length - MAX_CAPTURE_BYTES)
    : next;
}

export function runStreamingAttempt(command, args, options = {}) {
  const spawnCommand = options.spawnCommand ?? spawn;
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;

  return new Promise(resolve => {
    let output = '';
    const child = spawnCommand(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', chunk => {
      stdout.write(chunk);
      output = appendBounded(output, chunk);
    });
    child.stderr?.on('data', chunk => {
      stderr.write(chunk);
      output = appendBounded(output, chunk);
    });
    child.on('error', error => {
      const message = `Failed to launch Lighthouse: ${error.message}\n`;
      stderr.write(message);
      output = appendBounded(output, message);
      resolve({ code: 1, output });
    });
    child.on('exit', code => {
      resolve({ code: code ?? 1, output });
    });
  });
}

export async function runWithClassifiedRetries({
  executeAttempt,
  maxAttempts = 3,
  cooldownMs = 10_000,
  sleep = milliseconds =>
    new Promise(resolve => setTimeout(resolve, milliseconds)),
  report = message => process.stderr.write(`${message}\n`),
}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await executeAttempt(attempt);
    if (result.code === 0) {
      return { ...result, attempts: attempt, failureClass: null };
    }

    const failureClass = classifyLighthouseFailure(result.output);
    report(
      `LIGHTHOUSE_FAILURE_CLASS=${failureClass} LIGHTHOUSE_ATTEMPT=${attempt}/${maxAttempts}`
    );

    if (failureClass !== 'transient_protocol' || attempt === maxAttempts) {
      return { ...result, attempts: attempt, failureClass };
    }

    report(
      `Transient Chrome DevTools protocol failure; cooling down for ${cooldownMs}ms before bounded retry.`
    );
    await sleep(cooldownMs);
  }

  throw new Error('Lighthouse retry loop exhausted without a result');
}

function parsePositiveInteger(value, fallback, name) {
  if (!value?.trim()) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer; got "${value}"`);
  }
  return parsed;
}

function parseNonNegativeInteger(value, fallback, name) {
  if (!value?.trim()) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer; got "${value}"`);
  }
  return parsed;
}

export async function main(argv = process.argv.slice(2)) {
  const separator = argv.indexOf('--');
  const commandArgs = separator >= 0 ? argv.slice(separator + 1) : [];
  const [command, ...args] = commandArgs;
  if (!command) {
    throw new Error(
      'Usage: node scripts/lighthouse-retry.mjs -- <lighthouse command> [args...]'
    );
  }

  const maxAttempts = parsePositiveInteger(
    process.env.LIGHTHOUSE_MAX_ATTEMPTS,
    3,
    'LIGHTHOUSE_MAX_ATTEMPTS'
  );
  const cooldownMs = parseNonNegativeInteger(
    process.env.LIGHTHOUSE_RETRY_COOLDOWN_MS,
    10_000,
    'LIGHTHOUSE_RETRY_COOLDOWN_MS'
  );
  const result = await runWithClassifiedRetries({
    executeAttempt: () => runStreamingAttempt(command, args),
    maxAttempts,
    cooldownMs,
  });
  process.exitCode = result.code;
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  void main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
