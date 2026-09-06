import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const ROUTE = '/renders/profile-admission';
const PAGE = '/(marketing)/renders/profile-admission/page';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// Never persist raw URLs/query strings, bodies, headers, env values or errors.
export function classifyResponse(url, status, body) {
  const parsed = new URL(url);
  const classify = (key, values) => {
    const value = parsed.searchParams.get(key);
    return values.includes(value) ? value : value === null ? 'absent' : 'other';
  };
  return {
    route: ROUTE,
    status:
      Number.isInteger(status) && status >= 100 && status <= 599
        ? status
        : null,
    layout: classify('layout', ['public']),
    state: classify('state', ['unclaimed']),
    violation: classify('violation', ['desktop-compact-shell']),
    bodyClass:
      body === null
        ? 'unavailable'
        : body.includes('NEXT_HTTP_ERROR_FALLBACK;404')
          ? 'next-not-found-boundary'
          : body.includes('This page could not be found')
            ? 'next-not-found-document'
            : body.includes('profile-desktop-surface')
              ? 'profile-fixture-marker'
              : 'other',
  };
}

export function readBuildIdentity(root = process.cwd()) {
  // Fixed, bounded files only; neither a recursive build dump nor raw manifest data.
  const read = (name, max = 2 * 1024 * 1024) => {
    try {
      const base = realpathSync(root),
        file = resolve(base, name);
      const child = relative(base, file);
      if (
        isAbsolute(child) ||
        child === '..' ||
        child.startsWith('..' + sep) ||
        realpathSync(file) !== file ||
        !statSync(file).isFile() ||
        statSync(file).size > max
      )
        return null;
      return readFileSync(file);
    } catch {
      return null;
    }
  };
  const source = read('app/(marketing)/renders/profile-admission/guard.ts');
  const build = read('.next/BUILD_ID');
  const manifests = [
    '.next/dev/server/app-paths-manifest.json',
    '.next/server/app-paths-manifest.json',
  ].map(name => {
    const raw = read(name);
    let present = false,
      compiled = null;
    if (raw) {
      try {
        const entry = JSON.parse(raw.toString())[PAGE];
        present = typeof entry === 'string';
        if (
          present &&
          !isAbsolute(entry) &&
          !entry.split(/[\\/]/).includes('..')
        ) {
          compiled = read(
            name.slice(0, name.lastIndexOf('/') + 1) + entry,
            16 * 1024 * 1024
          );
        }
      } catch {
        /* Malformed manifests are classified, never printed. */
      }
    }
    return {
      kind: name.includes('/dev/') ? 'development' : 'build',
      manifestSha256: raw ? hash(raw) : null,
      routeEntryPresent: present,
      compiledPageSha256: compiled ? hash(compiled) : null,
    };
  });
  return {
    guardSourceSha256: source ? hash(source) : null,
    buildIdSha256: build ? hash(build) : null,
    manifests,
    serverOperands: 'see-server-profile-admission-guard-log; not-runner-env',
  };
}

/** @param {import('@playwright/test').Page} page */
export function observeProfileAdmissionFailure(
  page,
  {
    env = process.env,
    emit = message => console.info(message),
    identity = () => readBuildIdentity(),
    timeoutMs = 500,
  } = {}
) {
  if (env.CI !== 'true' || env.PROFILE_ADMISSION_DIAGNOSTICS !== '1')
    return async () => {};
  let record = null;
  let pending = Promise.resolve(),
    captured = false,
    closed = false;
  const listener = response => {
    try {
      const request = response.request(),
        url = new URL(response.url());
      if (
        captured ||
        !request.isNavigationRequest() ||
        request.frame() !== page.mainFrame() ||
        !['http:', 'https:'].includes(url.protocol) ||
        !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
        url.username ||
        url.password ||
        url.pathname !== ROUTE ||
        response.status() === 200
      )
        return;
      captured = true;
      record = classifyResponse(response.url(), response.status(), null);
      pending = (async () => {
        let body = null;
        try {
          body = (await response.body()).subarray(0, 64 * 1024).toString();
        } catch {
          /* Fixed unavailable enum only. */
        }
        if (!closed)
          record = classifyResponse(response.url(), response.status(), body);
      })().catch(() => {
        /* Diagnostics cannot replace the original assertion outcome. */
      });
    } catch {
      /* Ignore malformed/unavailable responses without printing raw errors. */
    }
  };
  page.on('response', listener);
  return async () => {
    page.off('response', listener);
    let timer;
    await Promise.race([
      pending,
      new Promise(resolve => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
    clearTimeout(timer);
    closed = true;
    if (record) {
      try {
        let buildIdentity = null;
        try {
          buildIdentity = identity();
        } catch {
          /* No raw error output. */
        }
        emit(
          '[profile-admission-response] ' +
            JSON.stringify({
              schemaVersion: 1,
              ...record,
              identity: buildIdentity,
            })
        );
      } catch {
        /* Diagnostics cannot replace the original assertion outcome. */
      }
      record = null;
    }
  };
}
