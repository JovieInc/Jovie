// Emitted route ownership for the existing initial-JS gate and diagnostics.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { isAuthedAppRoute } from './route-js-budget-policy.mjs';
import { isInterceptedManifestKey } from './route-js-ratchet.mjs';

const MANIFEST_NAME = 'page_client-reference-manifest.js';

/** @param {string} key */
export function routeFromManifestKey(key) {
  const route = key
    .replace(/\/page$/, '')
    .replace(/\/\([^/)]+\)/g, '')
    .replace(/\/@[^/]+/g, '');
  return route === '' ? '/' : route;
}

function findManifests(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) findManifests(path, out);
    else if (entry.name === MANIFEST_NAME) out.push(path);
  }
  return out;
}

function readClientManifest(path) {
  const sandbox = { globalThis: {} };
  sandbox.globalThis = sandbox;
  runInNewContext(readFileSync(path, 'utf8'), sandbox);
  const entries = Object.entries(sandbox.__RSC_MANIFEST ?? {});
  if (entries.length !== 1) {
    throw new Error(`Expected one client manifest entry in ${path}`);
  }
  return entries[0];
}

/**
 * Initial JS files per /app route: root main files plus the page's
 * client-reference entry chunks.
 * @param {string} nextDir
 * @returns {{ route: string, files: Set<string> }[]}
 */
export function collectRouteFiles(
  nextDir,
  root = join(nextDir, 'server', 'app', 'app'),
  { intercepted = false } = {}
) {
  const buildManifest = JSON.parse(
    readFileSync(join(nextDir, 'build-manifest.json'), 'utf8')
  );
  const rootFiles = [
    ...(buildManifest.rootMainFiles ?? []),
    ...(buildManifest.polyfillFiles ?? []),
  ];
  return findManifests(root).flatMap(path => {
    const [key, manifest] = readClientManifest(path);
    if (!intercepted && isInterceptedManifestKey(key)) return [];
    const files = new Set(rootFiles);
    for (const chunks of Object.values(manifest.entryJSFiles ?? {})) {
      for (const chunk of chunks) files.add(chunk);
    }
    return [{ route: routeFromManifestKey(key), files }];
  });
}

function rememberRoute(routes, route, files) {
  if (!route || route.startsWith('/_')) return;
  const set = routes.get(route) ?? new Set();
  routes.set(route, set);
  for (const file of files) {
    if (typeof file === 'string' && file.endsWith('.js')) set.add(file);
  }
}

export function collectFirstLoadFiles(nextDir) {
  const buildManifest = JSON.parse(
    readFileSync(join(nextDir, 'build-manifest.json'), 'utf8')
  );
  const shared = [
    ...(buildManifest.rootMainFiles ?? []),
    ...(buildManifest.polyfillFiles ?? []),
  ];
  /** @type {Map<string, Set<string>>} */
  const routes = new Map();
  const appManifestPath = join(nextDir, 'app-build-manifest.json');
  if (existsSync(appManifestPath)) {
    const pages = JSON.parse(readFileSync(appManifestPath, 'utf8')).pages;
    if (!pages || typeof pages !== 'object' || Array.isArray(pages)) {
      throw new Error(`${appManifestPath} is missing pages`);
    }
    for (const [key, files] of Object.entries(pages)) {
      if (!Array.isArray(files)) {
        throw new Error(`app-build-manifest pages[${key}] is not a file list`);
      }
      if (isInterceptedManifestKey(key)) continue;
      rememberRoute(routes, routeFromManifestKey(key), [...shared, ...files]);
    }
  } else {
    for (const { route, files } of collectRouteFiles(
      nextDir,
      join(nextDir, 'server', 'app')
    )) {
      if (!isAuthedAppRoute(route)) rememberRoute(routes, route, files);
    }
  }
  return [...routes.entries()].map(([route, files]) => ({ route, files }));
}
