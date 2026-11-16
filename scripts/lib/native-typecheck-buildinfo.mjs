import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

export const check = (value, message) => {
  if (!value) throw new Error(message);
};
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const sorted = values => [...new Set(values)].sort();
const inside = (file, directory) => file.startsWith(`${directory}${sep}`);
export const info = value =>
  typeof value === 'string'
    ? { version: value }
    : {
        ...value,
        impliedFormat: value.impliedFormat ?? value.impliedNodeFormat,
      };

export function readGraph(cache, root, tools, libraries = null) {
  const bytes = readFileSync(cache);
  const raw = JSON.parse(bytes.toString());
  check(
    ['6.0.3', '7.1.0-beta'].includes(raw.version),
    'Unknown buildinfo schema version'
  );
  check(
    Array.isArray(raw.fileNames) &&
      Array.isArray(raw.fileInfos) &&
      Array.isArray(raw.root) &&
      raw.fileInfos.length > 0 &&
      raw.fileInfos.length <= raw.fileNames.length,
    'Invalid buildinfo fileInfo graph'
  );
  for (const value of raw.fileInfos) {
    const item = info(value);
    check(
      item &&
        typeof item.version === 'string' &&
        [undefined, 1, 99].includes(item.impliedFormat) &&
        [undefined, true, false].includes(item.affectsGlobalScope),
      'Unknown fileInfo format/global metadata'
    );
    check(
      typeof value === 'string' ||
        value.impliedFormat === undefined ||
        value.impliedNodeFormat === undefined ||
        value.impliedFormat === value.impliedNodeFormat,
      'Contradictory fileInfo module formats'
    );
  }
  const paths = raw.fileNames.map(name => {
    check(typeof name === 'string', 'Invalid graph filename');
    if (!/^lib(?:\.[a-z0-9]+)*\.d\.ts$/iu.test(name))
      return resolve(dirname(cache), name);
    check(
      libraries && inside(resolve(libraries), resolve(tools)),
      'Bare standard library lacks a pinned compiler location'
    );
    const path = resolve(libraries, name);
    check(existsSync(path), `Pinned standard library missing: ${name}`);
    return path;
  });
  const roots = raw.root.flatMap(item => {
    if (!Array.isArray(item)) return [item];
    check(
      item.length === 2 &&
        item[1] >= item[0] &&
        item[1] - item[0] < paths.length,
      'Invalid root range'
    );
    return Array.from({ length: item[1] - item[0] + 1 }, (_, i) => item[0] + i);
  });
  const validId = id => Number.isInteger(id) && id > 0 && id <= paths.length;
  check(
    roots.length &&
      roots.every(id => validId(id) && id <= raw.fileInfos.length),
    'Empty or invalid root graph'
  );
  const lists = raw.fileIdsList ?? [],
    references = raw.referencedMap ?? [];
  check(
    Array.isArray(lists) && Array.isArray(references),
    'Unknown reference graph schema'
  );
  for (const list of lists)
    check(
      Array.isArray(list) && list.every(validId),
      'Invalid reference target ID'
    );
  for (const pair of references)
    check(
      Array.isArray(pair) &&
        pair.length === 2 &&
        validId(pair[0]) &&
        pair[0] <= raw.fileInfos.length &&
        Number.isInteger(pair[1]) &&
        pair[1] > 0 &&
        pair[1] <= lists.length,
      'Invalid reference source/list ID'
    );
  const auxiliary = paths.slice(raw.fileInfos.length).map((path, offset) => {
    const id = raw.fileInfos.length + offset + 1;
    const incomingSourceIds = references
      .filter(([, list]) => lists[list - 1].includes(id))
      .map(([source]) => source);
    check(incomingSourceIds.length, 'Unreferenced auxiliary filename ID');
    return { id, path, incomingSourceIds };
  });
  const semantic = paths.slice(0, raw.fileInfos.length);
  const repositoryFiles = sorted(
    semantic
      .filter(
        path => inside(path, root) && !path.includes(`${sep}node_modules${sep}`)
      )
      .map(path => relative(root, path))
  );
  const rootFiles = sorted(roots.map(id => relative(root, paths[id - 1])));
  check(
    repositoryFiles.length &&
      rootFiles.every(path => repositoryFiles.includes(path)),
    'Empty or external root program'
  );
  return {
    repositoryFiles,
    rootFiles,
    dependencyFiles: sorted(
      semantic.filter(
        path =>
          !inside(path, tools) &&
          (!inside(path, root) || path.includes(`${sep}node_modules${sep}`))
      )
    ),
    metadata: {
      schema: 'jovie-buildinfo-graph/v1',
      rawBuildInfoPath: cache,
      rawBuildInfoSha256: sha(bytes),
      toolsDirectory: tools,
      libraryDirectory: libraries ? resolve(libraries) : null,
      rootDirectory: root,
      version: raw.version,
      fileInfoCount: raw.fileInfos.length,
      filenameCount: paths.length,
      auxiliary,
    },
  };
}
