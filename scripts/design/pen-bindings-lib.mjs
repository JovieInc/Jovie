/**
 * Pen binding manifest (jovie.pen-binding/v1): the one artifact that binds an
 * approved Pen frame to a route. Pure helpers shared by the validator, the
 * exporter and the diff gate. docs/design-system/pen-bindings.json is the file.
 *
 * A route with no `approved` receipt is UNBOUND: there is no approved design.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BINDING_SCHEMA = 'jovie.pen-binding/v1';
export const VIEWPORTS = ['1440', '390'];
export const SCOPES = ['marketing', 'golden-path'];
export const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..'
);
export const BINDINGS_PATH = 'docs/design-system/pen-bindings.json';

const SECTION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256 = /^[0-9a-f]{64}$/;

/** "/" -> "home", "/compare/[slug]" -> "compare-slug". Directory name for stills. */
export function routeSlug(route) {
  if (route === '/') return 'home';
  return route
    .replace(/[[\]()]/g, '')
    .split('/')
    .filter(Boolean)
    .join('-')
    .toLowerCase();
}

export function stillPathFor(route, viewport, section) {
  return `docs/pen-stills/${routeSlug(route)}/${viewport}/${section}.png`;
}

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * Glob to RegExp for `sources`. Supports `**` and `*` only. `[`, `]`, `(` and
 * `)` are literal because Next.js route folders use them ("[username]").
 */
export function globToRegExp(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') {
        out += '(?:.*/)?';
        i += 2;
      } else {
        out += '.*';
        i += 1;
      }
    } else if (c === '*') out += '[^/]*';
    else out += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

export function matchesAny(file, globs) {
  return globs.some(glob => globToRegExp(glob).test(file));
}

export function loadBindings(root = REPO_ROOT, path = BINDINGS_PATH) {
  return JSON.parse(readFileSync(join(root, path), 'utf8'));
}

/** Gate enforcement: only an explicit `enforce: true` fails PRs; absent means false. */
export function isEnforced(entry) {
  return entry?.enforce === true;
}

/** A route is BOUND only with an approved receipt and at least one still. Stills without a receipt are exported but still UNBOUND. */
export function routeState(entry) {
  if (!entry?.approved) return 'unbound';
  const stills = Object.values(entry.viewports ?? {}).flat();
  return stills.length > 0 ? 'bound' : 'unbound';
}

/**
 * Routes whose `sources` cover any of the changed files. The gate uses this
 * to decide which routes a PR touches (UNBOUND scope routes fail it).
 */
export function routesForFiles(bindings, files) {
  return Object.entries(bindings.routes)
    .filter(([, entry]) =>
      files.some(file => matchesAny(file, entry.sources ?? []))
    )
    .map(([route, entry]) => ({
      route,
      scope: entry.scope,
      enforce: isEnforced(entry),
      state: routeState(entry),
    }));
}

/**
 * Validate a parsed manifest. With `root`, also check the filesystem: every
 * source glob matches a file, every still exists and its sha256 matches.
 */
export function validateBindings(doc, { root = null } = {}) {
  const errors = [];
  if (!doc || typeof doc !== 'object') return ['manifest must be an object'];
  if (doc.schema !== BINDING_SCHEMA)
    errors.push(`schema must be ${BINDING_SCHEMA}`);
  if (
    !doc.routes ||
    typeof doc.routes !== 'object' ||
    Array.isArray(doc.routes)
  )
    return [...errors, 'routes must be an object'];
  if (Object.keys(doc.routes).length === 0) errors.push('routes is empty');

  const slugs = new Map();
  let files = null;
  const allFiles = () => {
    files ??= execFileSync('git', ['ls-files', '-z'], {
      cwd: root,
      maxBuffer: 256 * 1024 * 1024,
    })
      .toString()
      .split('\0')
      .filter(Boolean);
    return files;
  };

  for (const [route, entry] of Object.entries(doc.routes)) {
    const at = `routes["${route}"]`;
    if (!route.startsWith('/')) errors.push(`${at}: route must start with "/"`);
    const slug = routeSlug(route);
    if (slugs.has(slug))
      errors.push(`${at}: slug "${slug}" collides with ${slugs.get(slug)}`);
    slugs.set(slug, route);
    if (!entry || typeof entry !== 'object') {
      errors.push(`${at}: must be an object`);
      continue;
    }
    if (!SCOPES.includes(entry.scope))
      errors.push(`${at}.scope must be one of ${SCOPES.join(', ')}`);
    if (
      !Array.isArray(entry.sources) ||
      entry.sources.length === 0 ||
      !entry.sources.every(s => typeof s === 'string' && s.length > 0)
    )
      errors.push(`${at}.sources must be a non-empty array of globs`);
    else if (root)
      for (const glob of entry.sources) {
        const re = globToRegExp(glob);
        if (!allFiles().some(f => re.test(f)))
          errors.push(`${at}.sources: "${glob}" matches no file`);
      }

    if (entry.enforce !== undefined && typeof entry.enforce !== 'boolean')
      errors.push(`${at}.enforce must be a boolean`);
    if (entry.enforce === true && !entry.approved)
      errors.push(
        `${at}: enforce is true but the route has no approved receipt`
      );
    const approved = entry.approved;
    if (approved !== undefined) {
      if (
        !approved ||
        typeof approved !== 'object' ||
        !approved.by ||
        !approved.receipt ||
        Number.isNaN(Date.parse(approved.at))
      )
        errors.push(`${at}.approved needs by, at (ISO) and receipt`);
    }

    const viewports = entry.viewports ?? {};
    for (const vp of Object.keys(viewports))
      if (!VIEWPORTS.includes(vp))
        errors.push(`${at}.viewports: "${vp}" must be 1440 or 390`);
    const stillCount = Object.values(viewports).flat().length;
    if (approved && stillCount === 0)
      errors.push(`${at}: approved route has no stills`);
    if (approved) {
      for (const vp of VIEWPORTS)
        if (!viewports[vp]?.length)
          errors.push(
            `${at}.viewports.${vp}: approved route needs this viewport`
          );
    }

    for (const [vp, frames] of Object.entries(viewports)) {
      if (!Array.isArray(frames)) {
        errors.push(`${at}.viewports.${vp} must be an array`);
        continue;
      }
      const seen = new Set();
      for (const frame of frames) {
        const f = `${at}.viewports.${vp}[${frame?.section}]`;
        if (!SECTION_ID.test(String(frame?.section ?? '')))
          errors.push(`${f}: section must be kebab-case`);
        if (seen.has(frame?.section)) errors.push(`${f}: duplicate section`);
        seen.add(frame?.section);
        // A .pen file, or the HTML art-direction page Tim approved as live
        // HTML (homepage v3); nodeId then names that page's section.
        if (!/\.(pen|html)$/.test(String(frame?.penFile ?? '')))
          errors.push(
            `${f}: penFile must be a .pen or approved .html file name`
          );
        if (!frame?.nodeId) errors.push(`${f}: nodeId is required`);
        if (frame?.still !== stillPathFor(route, vp, frame?.section))
          errors.push(
            `${f}: still must be ${stillPathFor(route, vp, frame?.section)}`
          );
        if (!SHA256.test(String(frame?.sha256 ?? '')))
          errors.push(`${f}: sha256 must be 64 lowercase hex chars`);
        else if (root) {
          const abs = join(root, frame.still);
          if (!existsSync(abs)) errors.push(`${f}: still file is missing`);
          else if (sha256File(abs) !== frame.sha256)
            errors.push(`${f}: sha256 does not match the still file`);
        }
      }
    }
  }
  return errors;
}

/**
 * Adapter for the dormant pen-still-diff, which reads frames rather than
 * routes. Bound routes only; dark mode only (the manifest is dark-first).
 */
export function bindingsToStillFrames(bindings, onlyRoute = null) {
  const frames = [];
  for (const [route, entry] of Object.entries(bindings.routes)) {
    if (onlyRoute && route !== onlyRoute) continue;
    if (routeState(entry) !== 'bound') continue;
    for (const [vp, list] of Object.entries(entry.viewports))
      for (const f of list)
        frames.push({
          sectionId: f.section,
          penNodeId: f.nodeId,
          fileHash: f.sha256 ? `sha256:${f.sha256}` : null,
          stillPath: f.still,
          viewport: Number(vp),
          mode: 'dark',
          status: 'active',
          route,
          sectionSelector: `[data-pen-section='${f.section}']`,
        });
  }
  return frames;
}
