#!/usr/bin/env node
// Vitest emits package-relative SF paths; Sonar scans from the repository root.
import { readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep, win32 } from 'node:path';

export const COVERAGE_PACKAGES = ['apps/web', 'packages/ui'];

export function normalizeLcov(text, repoRoot, packagePath) {
  const root = realpathSync(repoRoot);
  const packageRoot = resolve(root, packagePath);
  let records = 0;
  const normalized = text.replace(/^SF:([^\r\n]*)/gm, (_line, source) => {
    if (
      !source ||
      source.includes('\0') ||
      (win32.isAbsolute(source) && !isAbsolute(source))
    ) {
      throw new Error(`Invalid LCOV source path: ${JSON.stringify(source)}`);
    }
    const candidate = isAbsolute(source)
      ? source
      : source.startsWith(`${packagePath}/`)
        ? resolve(root, source)
        : resolve(packageRoot, source);
    const path = realpathSync(candidate);
    const withinPackage = relative(packageRoot, path);
    if (
      !withinPackage ||
      withinPackage === '..' ||
      withinPackage.startsWith(`..${sep}`) ||
      isAbsolute(withinPackage)
    ) {
      throw new Error(`LCOV source escapes ${packagePath}: ${source}`);
    }
    if (!statSync(path).isFile())
      throw new Error(`LCOV source is not a file: ${source}`);
    records++;
    return `SF:${relative(root, path).split(sep).join('/')}`;
  });
  if (records === 0)
    throw new Error(`No LCOV source records for ${packagePath}`);
  return { text: normalized, records };
}

export function normalizeCoverageReports(repoRoot) {
  // Validate both reports before changing either; missing evidence must fail.
  const reports = COVERAGE_PACKAGES.map(packagePath => {
    const path = resolve(repoRoot, packagePath, 'coverage/lcov.info');
    return {
      path,
      ...normalizeLcov(readFileSync(path, 'utf8'), repoRoot, packagePath),
    };
  });
  for (const report of reports) writeFileSync(report.path, report.text);
  return reports.map(({ records }) => records);
}

if (import.meta.main) {
  try {
    const records = normalizeCoverageReports(process.cwd());
    console.log(
      `Normalized Sonar LCOV source records: web=${records[0]}, ui=${records[1]}`
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
