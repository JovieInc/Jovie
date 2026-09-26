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

const EXCLUDE = '--exclude';

/**
 * CLI `--exclude` patterns from a Vitest argv. Vitest applies `--exclude`
 * (its `cliExclude`) to the root config only and does not forward it to
 * `test.projects`, so once the fast config split into node/jsdom projects the
 * quarantine ledger's `--exclude=<path>` flags were silently dropped and
 * quarantined files ran (blocking) in the sharded unit run. The fast config
 * folds these back into its root `test.exclude`, which projects inherit.
 */
export function readCliExcludePatterns(argv) {
  const patterns = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith(`${EXCLUDE}=`)) {
      patterns.push(arg.slice(EXCLUDE.length + 1));
    } else if (arg === EXCLUDE) {
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith('-')) {
        patterns.push(next);
        index += 1;
      }
    }
  }
  return patterns.filter(Boolean);
}
