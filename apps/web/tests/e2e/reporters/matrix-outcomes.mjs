import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, sep } from 'node:path';

/**
 * The flakiness analyzer reads the Playwright JSON shape. Keep that shape
 * while leaving runtime diagnostics in guarded logs and failure context files.
 */
export default class MatrixOutcomesReporter {
  constructor({ outputFile }) {
    this.outputFile = outputFile;
  }

  onBegin(config, suite) {
    this.rootDir = config.rootDir;
    this.suite = suite;
  }

  onEnd() {
    const stats = { expected: 0, skipped: 0, unexpected: 0, flaky: 0 };
    const specsByFile = new Map();

    for (const test of this.suite.allTests()) {
      const file = relative(this.rootDir, test.location.file)
        .split(sep)
        .join('/');
      // Playwright title paths start with the root, project and file suites.
      const title = test.titlePath().slice(3).join(' › ');
      const status = test.outcome();
      const spec = {
        file,
        title,
        tests: [
          {
            projectName: test.parent.project().name,
            status,
            results: test.results.map(({ status, retry }) => ({
              status,
              retry,
            })),
          },
        ],
      };
      const specs = specsByFile.get(file) ?? [];
      specs.push(spec);
      specsByFile.set(file, specs);
      stats[status] += 1;
    }

    const suites = Array.from(specsByFile, ([file, specs]) => ({
      title: file,
      file,
      specs,
    }));
    mkdirSync(dirname(this.outputFile), { recursive: true });
    writeFileSync(this.outputFile, JSON.stringify({ suites, stats }));
  }
}
