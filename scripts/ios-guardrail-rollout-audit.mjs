#!/usr/bin/env node

/**
 * Audit iOS/SwiftUI repos for the portable Jovie iOS best-practices guardrail.
 *
 * This intentionally uses only Node built-ins so it can run before package
 * install in a freshly cloned company repo.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_RELATIVE_PATH = 'scripts/ios-best-practices-lint.sh';
const WORKFLOW_DIR = '.github/workflows';
const AGENT_RULE_FILES = [
  'AGENTS.md',
  'CLAUDE.md',
  'CODEX.md',
  '.claude/rules/ios.md',
];
const SKIPPED_DIRS = new Set([
  '.git',
  '.next',
  '.turbo',
  'DerivedData',
  'build',
  'dist',
  'node_modules',
]);

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function readTextIfExists(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }

  return readFileSync(filePath, 'utf8');
}

function walkRepo(repoRoot) {
  const files = [];
  const directories = [];

  function walk(currentDir) {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      if (SKIPPED_DIRS.has(entry.name)) {
        continue;
      }

      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = toPosixPath(path.relative(repoRoot, absolutePath));

      if (entry.isDirectory()) {
        directories.push(relativePath);
        if (!entry.name.endsWith('.xcodeproj')) {
          walk(absolutePath);
        }
        continue;
      }

      if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  }

  walk(repoRoot);
  return { files, directories };
}

function isTestSwiftPath(relativePath) {
  return (
    /(^|\/)[^/]*Tests?\//.test(relativePath) ||
    /(^|\/)[^/]*UITests?\//.test(relativePath) ||
    /Tests?\.swift$/.test(relativePath)
  );
}

function detectIosSurface(repoRoot, tree) {
  const swiftFiles = tree.files.filter(file => file.endsWith('.swift'));
  const productionSwiftFiles = swiftFiles.filter(
    file => !isTestSwiftPath(file)
  );
  const xcodeProjects = tree.directories.filter(file =>
    file.endsWith('.xcodeproj')
  );
  const swiftUiFiles = productionSwiftFiles.filter(file => {
    const text = readTextIfExists(path.join(repoRoot, file));
    return text ? /^\s*import\s+SwiftUI\b/m.test(text) : false;
  });

  return {
    isIosTouching:
      productionSwiftFiles.length > 0 ||
      xcodeProjects.length > 0 ||
      swiftUiFiles.length > 0,
    productionSwiftFiles,
    swiftUiFiles,
    xcodeProjects,
  };
}

function normalizeScript(text) {
  return text.replace(/\r\n/g, '\n').trimEnd();
}

function commandHasLintInvocation(command) {
  return /(?:^|[\s"'])(?:\.\/)?(?:scripts\/)?ios-best-practices-lint\.sh(?:$|[\s"'])/.test(
    command
  );
}

function commandHasLintTarget(command) {
  return /(?:^|[\s"'])(?:\.\/)?(?:scripts\/)?ios-best-practices-lint\.sh(?:['"])?[^\S\r\n]+(?![#;&|]+)(?:"[^"\r\n]+"|'[^'\r\n]+'|[^\s;&|]+)/.test(
    command
  );
}

function packageLintEntrypoints(repoRoot) {
  const packageJsonPath = path.join(repoRoot, 'package.json');
  const packageJson = readTextIfExists(packageJsonPath);
  if (!packageJson) {
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(packageJson);
  } catch {
    return [
      {
        source: 'package.json',
        name: '<invalid-json>',
        command: '',
        hasTarget: false,
      },
    ];
  }

  return Object.entries(parsed.scripts ?? {})
    .filter(([name, command]) => {
      return (
        /(ios.*lint|lint.*ios)/i.test(name) ||
        commandHasLintInvocation(String(command))
      );
    })
    .map(([name, command]) => ({
      source: 'package.json',
      name,
      command: String(command),
      hasTarget: commandHasLintTarget(String(command)),
    }));
}

function makefileLintEntrypoints(repoRoot) {
  const candidates = ['Makefile', 'makefile', 'justfile', 'Justfile'];
  return candidates.flatMap(fileName => {
    const text = readTextIfExists(path.join(repoRoot, fileName));
    if (!text || !commandHasLintInvocation(text)) {
      return [];
    }

    return [
      {
        source: fileName,
        name: 'ios-lint',
        command: text,
        hasTarget: commandHasLintTarget(text),
      },
    ];
  });
}

function findLintEntrypoints(repoRoot) {
  return [
    ...packageLintEntrypoints(repoRoot),
    ...makefileLintEntrypoints(repoRoot),
  ];
}

function workflowFiles(repoRoot) {
  const workflowRoot = path.join(repoRoot, WORKFLOW_DIR);
  if (!existsSync(workflowRoot)) {
    return [];
  }

  return readdirSync(workflowRoot, { withFileTypes: true })
    .filter(entry => entry.isFile() && /\.ya?ml$/.test(entry.name))
    .map(entry => path.join(WORKFLOW_DIR, entry.name));
}

function findWorkflowGuard(repoRoot) {
  const buildCommandPattern =
    /(xcodebuild|run-xcodebuild\.sh\s+(?:build|test)|fastlane\s+(?:build|test|beta|ios)|swift\s+build)/g;
  const lintPattern = /ios-best-practices-lint\.sh/g;
  let fallbackGuard = null;

  for (const workflowFile of workflowFiles(repoRoot)) {
    const text = readTextIfExists(path.join(repoRoot, workflowFile)) ?? '';
    const lintMatches = [...text.matchAll(lintPattern)];
    const buildMatches = [...text.matchAll(buildCommandPattern)];
    if (lintMatches.length === 0) {
      continue;
    }

    const firstBuildIndex = buildMatches[0]?.index ?? null;
    const firstTargetedLintIndex = lintMatches.find(match => {
      return commandHasLintTarget(text.slice(match.index ?? 0));
    })?.index;

    const guard = {
      file: workflowFile,
      hasTarget: firstTargetedLintIndex !== undefined,
      beforeBuild:
        firstBuildIndex === null ||
        (firstTargetedLintIndex !== undefined &&
          firstTargetedLintIndex < firstBuildIndex),
    };

    if (guard.hasTarget && guard.beforeBuild) {
      return guard;
    }

    fallbackGuard ??= guard;
  }

  return fallbackGuard;
}

function hasAgentCanon(repoRoot) {
  const combinedText = AGENT_RULE_FILES.map(
    file => readTextIfExists(path.join(repoRoot, file)) ?? ''
  )
    .join('\n')
    .toLowerCase();

  return (
    combinedText.includes('ios-best-practices-lint.sh') &&
    combinedText.includes('performance canon') &&
    combinedText.includes('layout shift prevention') &&
    (combinedText.includes('rock solid and blazing fast') ||
      combinedText.includes('0 jank'))
  );
}

function addFailure(failures, code, message) {
  failures.push({ code, message });
}

export function evaluateIosGuardrailRollout(
  repoRoot,
  {
    canonicalRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..'
    ),
  } = {}
) {
  const resolvedRepoRoot = path.resolve(repoRoot);
  const tree = walkRepo(resolvedRepoRoot);
  const iosSurface = detectIosSurface(resolvedRepoRoot, tree);
  const failures = [];

  if (!iosSurface.isIosTouching) {
    return {
      repoRoot: resolvedRepoRoot,
      passed: true,
      skipped: true,
      iosSurface,
      failures,
    };
  }

  const lintScriptPath = path.join(resolvedRepoRoot, SCRIPT_RELATIVE_PATH);
  const lintScript = readTextIfExists(lintScriptPath);
  const canonicalScript = readTextIfExists(
    path.join(path.resolve(canonicalRoot), SCRIPT_RELATIVE_PATH)
  );

  if (!lintScript) {
    addFailure(
      failures,
      'lint-script-missing',
      `Vendor ${SCRIPT_RELATIVE_PATH} into this iOS-touching repo.`
    );
  } else if (
    canonicalScript &&
    normalizeScript(lintScript) !== normalizeScript(canonicalScript)
  ) {
    addFailure(
      failures,
      'lint-script-drift',
      `${SCRIPT_RELATIVE_PATH} must match the canonical Jovie guardrail script.`
    );
  }

  const lintEntrypoints = findLintEntrypoints(resolvedRepoRoot);
  if (lintEntrypoints.length === 0) {
    addFailure(
      failures,
      'lint-entrypoint-missing',
      'Add an ios:lint package script or equivalent command that runs the guardrail lint.'
    );
  } else if (!lintEntrypoints.some(entrypoint => entrypoint.hasTarget)) {
    addFailure(
      failures,
      'lint-entrypoint-target-missing',
      'The ios lint entrypoint must pass the Swift source directory to scripts/ios-best-practices-lint.sh.'
    );
  }

  const workflowGuard = findWorkflowGuard(resolvedRepoRoot);
  if (!workflowGuard) {
    addFailure(
      failures,
      'ci-lint-step-missing',
      'Add a GitHub Actions step that runs scripts/ios-best-practices-lint.sh before the Swift build/test.'
    );
  } else if (!workflowGuard.hasTarget) {
    addFailure(
      failures,
      'ci-lint-target-missing',
      'The CI lint step must pass the Swift source directory to scripts/ios-best-practices-lint.sh.'
    );
  } else if (!workflowGuard.beforeBuild) {
    addFailure(
      failures,
      'ci-lint-after-build',
      `Move the iOS best-practices lint step before the Swift build/test in ${workflowGuard.file}.`
    );
  }

  if (!hasAgentCanon(resolvedRepoRoot)) {
    addFailure(
      failures,
      'agent-canon-missing',
      'Adopt the iOS performance canon and layout-shift rules in the repo agent rules.'
    );
  }

  return {
    repoRoot: resolvedRepoRoot,
    passed: failures.length === 0,
    skipped: false,
    iosSurface,
    failures,
  };
}

function parseArgs(argv) {
  const options = {
    canonicalRoot: path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..'
    ),
    json: false,
    repoRoots: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--canonical-root') {
      options.canonicalRoot = path.resolve(argv[index + 1] ?? '.');
      index += 1;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    options.repoRoots.push(arg);
  }

  if (options.repoRoots.length === 0) {
    options.repoRoots.push(process.cwd());
  }

  return options;
}

function printHumanResult(result) {
  const repoLabel = path.relative(process.cwd(), result.repoRoot) || '.';
  if (result.skipped) {
    console.log(
      `[ios-guardrail-rollout-audit] ${repoLabel}: skipped, no production Swift or Xcode project detected.`
    );
    return;
  }

  if (result.passed) {
    console.log(
      `[ios-guardrail-rollout-audit] ${repoLabel}: passed (${result.iosSurface.productionSwiftFiles.length} production Swift file(s)).`
    );
    return;
  }

  console.error(`[ios-guardrail-rollout-audit] ${repoLabel}: failed`);
  for (const failure of result.failures) {
    console.error(`- ${failure.code}: ${failure.message}`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const results = options.repoRoots.map(repoRoot =>
    evaluateIosGuardrailRollout(repoRoot, {
      canonicalRoot: options.canonicalRoot,
    })
  );

  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const result of results) {
      printHumanResult(result);
    }
  }

  if (results.some(result => !result.passed)) {
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
