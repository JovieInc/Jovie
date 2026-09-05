const PASS_WITH_NO_TESTS = '--passWithNoTests';

export function buildWebVitestFastArgs(rawArgs) {
  const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
  const normalized = [];
  let passWithNoTests;

  for (const arg of args) {
    if (
      arg === PASS_WITH_NO_TESTS ||
      arg.startsWith(`${PASS_WITH_NO_TESTS}=`)
    ) {
      passWithNoTests ??= arg;
      continue;
    }
    normalized.push(arg);
  }

  return [
    'run',
    '--config=vitest.config.mts',
    passWithNoTests ?? PASS_WITH_NO_TESTS,
    ...normalized,
  ];
}
