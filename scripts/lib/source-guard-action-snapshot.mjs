import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SNAPSHOT_RELATIVE = 'tmp/source-guard-actions';
const LOCAL_PREFIX = './.github/actions/';
const SNAPSHOT_PREFIX = `./${SNAPSHOT_RELATIVE}/`;
const ROOT_ACTIONS = ['setup-node-pnpm', 'setup-playwright'];

/** Keep the complete action package, including a subaction's ../dist payload. */
function packageRoot(action) {
  const parts = action.split('/');
  if (parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) {
    throw new Error(`Unsupported local action path: ${action}`);
  }
  if (parts[0] === 'vendor' && parts.length < 2) {
    throw new Error('A vendored action must name its package');
  }
  return parts.slice(0, parts[0] === 'vendor' ? 2 : 1).join('/');
}

/** Only local uses references move; remote pins and executable bodies stay intact. */
function localUses(source, visit) {
  return source.replace(
    /^(\s*(?:-\s+)?uses:\s*)(['"]?)(\.\/[^\s'"#]+)\2(.*)$/gm,
    (_line, lead, quote, reference, tail) => {
      if (!reference.startsWith(LOCAL_PREFIX)) {
        throw new Error(`Unsupported source action dependency: ${reference}`);
      }
      const action = reference.slice(LOCAL_PREFIX.length);
      packageRoot(action);
      visit(action);
      return `${lead}${quote}${SNAPSHOT_PREFIX}${action}${quote}${tail}`;
    }
  );
}

function files(directory, relative = '') {
  if (realpathSync(directory) !== directory) {
    throw new Error(
      `Source action package must not traverse a link: ${directory}`
    );
  }
  const paths = [];
  for (const name of readdirSync(join(directory, relative)).sort()) {
    const path = join(relative, name);
    const stat = lstatSync(join(directory, path));
    if (stat.isSymbolicLink()) {
      throw new Error(`Source action contains a symbolic link: ${path}`);
    }
    if (stat.isDirectory()) paths.push(...files(directory, path));
    else if (stat.isFile()) paths.push(path);
    else throw new Error(`Unsupported source action file: ${path}`);
  }
  return paths;
}

/**
 * The runner reloads local action metadata and post scripts at job cleanup.
 * A Git reset must not replace or delete that registered generation. This
 * job-owned cache uses the existing ignored /tmp directory and intentionally
 * outlives source restoration and every registered post hook. Hosted job
 * cleanup (or the next checkout's normal clean) disposes of it.
 */
export function snapshotSourceGuardActions(repoRoot = process.cwd()) {
  repoRoot = realpathSync(repoRoot);
  const source = join(repoRoot, '.github/actions');
  const pending = [...ROOT_ACTIONS];
  const packages = new Map();
  while (pending.length) {
    const action = pending.shift();
    const root = packageRoot(action);
    const metadata = ['action.yml', 'action.yaml'].find(name =>
      existsSync(join(source, action, name))
    );
    if (!metadata) throw new Error(`Missing source action metadata: ${action}`);
    if (packages.has(root)) continue;
    const paths = files(join(source, root));
    packages.set(root, paths);
    for (const path of paths) {
      if (!/(?:^|\/)action\.ya?ml$/.test(path)) continue;
      localUses(readFileSync(join(source, root, path), 'utf8'), dependency => {
        pending.push(dependency);
      });
    }
  }

  const parent = join(repoRoot, 'tmp');
  if (existsSync(parent) && !lstatSync(parent).isDirectory()) {
    throw new Error('Source action cache parent must be an ordinary directory');
  }
  mkdirSync(parent, { recursive: true });
  const target = join(repoRoot, SNAPSHOT_RELATIVE);
  // Exclusive creation preserves any pre-existing local work, including links.
  mkdirSync(target);
  try {
    for (const [root, paths] of packages) {
      cpSync(join(source, root), join(target, root), { recursive: true });
      for (const path of paths) {
        if (!/(?:^|\/)action\.ya?ml$/.test(path)) continue;
        const destination = join(target, root, path);
        writeFileSync(
          destination,
          localUses(readFileSync(destination, 'utf8'), () => {})
        );
      }
    }
    return { path: SNAPSHOT_RELATIVE, packages: [...packages.keys()].sort() };
  } catch (error) {
    rmSync(target, { recursive: true, force: true });
    throw error;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  console.log(JSON.stringify(snapshotSourceGuardActions()));
}
