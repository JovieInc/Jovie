#!/usr/bin/env node
// Vitest emits package-relative SF paths; Sonar scans from the repository root.
import {
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, relative, resolve, sep, win32 } from 'node:path';

export const COVERAGE_PACKAGES = ['apps/web', 'packages/ui'];

// Sonar's directory visitor marks descendants of dot directories as hidden;
// language analyzers do not opt into those files. Partition only the ancestors
// of .well-known, keeping every sibling and existing exclusion unchanged.
export function prepareSonarSources(repoRoot) {
  const discovery = 'apps/web/app/.well-known';
  if (readdirSync(resolve(repoRoot, discovery)).length === 0) {
    throw new Error('Missing discovery sources');
  }
  const expand = path => {
    if (path !== discovery && !discovery.startsWith(`${path}/`)) return [path];
    return readdirSync(resolve(repoRoot, path))
      .sort()
      .flatMap(name => expand(`${path}/${name}`));
  };
  const roots = COVERAGE_PACKAGES.flatMap(expand);
  for (const root of roots) {
    if (/[,\r\n\\]/.test(root) || root.trim() !== root) {
      throw new Error(`Unsupported Sonar source root: ${JSON.stringify(root)}`);
    }
  }
  const path = resolve(repoRoot, 'sonar-project.properties');
  let text = readFileSync(path, 'utf8');
  // Accept the repository's canonical key=value syntax, not a partial Java
  // properties parser: escaped or alternative keys could override our roots.
  let continued = false;
  for (const line of text.split('\n')) {
    if (!continued && /^[ \t]*(?:[#!].*)?$/.test(line)) continue;
    if (!continued && !/^[A-Za-z][A-Za-z0-9_.-]*=/.test(line)) {
      throw new Error(
        'Unexpected property syntax; expected canonical key=value'
      );
    }
    const trailing = /\\+$/.exec(line);
    continued = trailing !== null && trailing[0].length % 2 === 1;
  }
  if (continued) throw new Error('Unterminated property continuation');
  for (const key of ['sonar.sources', 'sonar.tests']) {
    const pattern = new RegExp(
      `^[ \t]*${key.replace('.', '\\.')}(?:[ \t]*[=:][ \t]*|[ \t]+|$)(.*)$`,
      'gm'
    );
    const matches = [...text.matchAll(pattern)];
    if (
      matches.length !== 1 ||
      ![COVERAGE_PACKAGES.join(','), roots.join(',')].includes(matches[0][1])
    ) {
      throw new Error(
        `Unexpected ${key}; refusing to replace changed analysis scope`
      );
    }
    text = text.replace(pattern, () => `${key}=${roots.join(',')}`);
  }
  return { path, text };
}

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
    const sources = prepareSonarSources(process.cwd());
    const records = normalizeCoverageReports(process.cwd());
    writeFileSync(sources.path, sources.text);
    console.log(
      `Normalized Sonar LCOV source records: web=${records[0]}, ui=${records[1]}`
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
