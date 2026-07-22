import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function findPackageJsonFromEntry(entryPath, packageName) {
  let currentDir = path.dirname(entryPath);
  const rootDir = path.parse(currentDir).root;

  while (currentDir !== rootDir) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      if (packageJson.name === packageName) {
        return packageJsonPath;
      }
    }

    currentDir = path.dirname(currentDir);
  }

  throw new Error(
    `Unable to find package.json for ${packageName} from ${entryPath}`
  );
}

export function resolvePackageJson(requireFromScript, packageName, paths) {
  try {
    return requireFromScript.resolve(`${packageName}/package.json`, { paths });
  } catch (error) {
    if (error?.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') {
      throw error;
    }

    try {
      return requireFromScript.resolve(`${packageName}/package`, { paths });
    } catch (exportError) {
      if (
        exportError?.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED' &&
        exportError?.code !== 'MODULE_NOT_FOUND'
      ) {
        throw exportError;
      }
    }

    for (const basePath of paths) {
      for (const candidate of [
        path.join(basePath, ...packageName.split('/'), 'package.json'),
        path.join(
          path.dirname(basePath),
          ...packageName.split('/'),
          'package.json'
        ),
        path.join(
          path.dirname(path.dirname(basePath)),
          ...packageName.split('/'),
          'package.json'
        ),
        path.join(
          basePath,
          'node_modules',
          ...packageName.split('/'),
          'package.json'
        ),
      ]) {
        if (existsSync(candidate)) return candidate;
      }
    }

    return findPackageJsonFromEntry(
      requireFromScript.resolve(packageName, { paths }),
      packageName
    );
  }
}
