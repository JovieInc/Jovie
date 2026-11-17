/**
 * Admit missing dynamic routes the render-mode check already named.
 * Refuses anything else: no build, no HTML sizes, no overwrite, no route
 * outside the dynamic prefixes. `--write` stays the only build tightener.
 */
import {
  formatEntry,
  isDynamicAllowed,
  parseEntry,
  SNAPSHOT_SCHEMA,
} from './route-render-modes-policy.mjs';

const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;
const LOG_PREFIX =
  /^[^\t]+\t[^\t]+\t(?=\d{4}-\d\d-\d\dT|##\[error\]|::error::)/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+/;
const MARKED_ERROR = /^(?:##\[error\]|::error::)\s?([\s\S]*)$/;
const PROCESS_EXIT = /^Process completed with exit code \d+\.?$/;
const DYNAMIC_MISS =
  /^(\/\S+) \(dynamic\) has no entry in apps\/web\/scripts\/route-render-modes\.json \(new routes fail closed\)\. Add "(\/\S+)": "dynamic"/;

/** @param {string} raw */
function markedErrorBody(raw) {
  const clean = String(raw)
    .replace(ANSI, '')
    .replace(LOG_PREFIX, '')
    .replace(TIMESTAMP, '');
  const match = MARKED_ERROR.exec(clean);
  return match ? match[1] : null;
}

/**
 * @param {string} text
 * @returns {{
 *   ok: boolean,
 *   admissions: { route: string, entry: 'dynamic' }[],
 *   reason: string
 * }}
 */
export function planDynamicAdmissions(text) {
  /** @type {{ route: string, entry: 'dynamic' }[]} */
  const admissions = [];
  const seen = new Set();
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const body = markedErrorBody(raw);
    if (body === null || PROCESS_EXIT.test(body)) continue;
    const match = DYNAMIC_MISS.exec(body);
    if (!match || match[1] !== match[2]) {
      return {
        ok: false,
        admissions: [],
        reason: 'log has an error that is not a dynamic render-mode admission',
      };
    }
    if (seen.has(match[1])) continue;
    seen.add(match[1]);
    admissions.push({ route: match[1], entry: 'dynamic' });
  }
  if (admissions.length === 0) {
    return { ok: false, admissions: [], reason: 'no dynamic route admitted' };
  }
  return { ok: true, admissions, reason: '' };
}

/**
 * Insert missing `dynamic` entries on the allowed prefixes only.
 * A refusal returns the original snapshot.
 *
 * @param {{ routes?: Record<string, string>, overrides?: object, schema?: string }} snapshot
 * @param {{ route: string, entry: string }[]} admissions
 */
export function admitDynamicRoutes(snapshot, admissions) {
  const list = Array.isArray(admissions) ? admissions : [];
  const existing = { ...(snapshot?.routes ?? {}) };
  /** @type {string[]} */
  const refused = [];
  if (list.length === 0) {
    return {
      snapshot,
      changes: [],
      refused,
      reason: 'no dynamic route admitted',
    };
  }
  for (const item of list) {
    const route = item?.route;
    const parsed = parseEntry(item?.entry);
    if (
      typeof route !== 'string' ||
      !/^\/\S+$/.test(route) ||
      parsed === null ||
      formatEntry(parsed) !== 'dynamic' ||
      !isDynamicAllowed(route) ||
      Object.hasOwn(existing, route)
    ) {
      refused.push(typeof route === 'string' ? route : '(invalid)');
    }
  }
  if (refused.length > 0) {
    return {
      snapshot,
      changes: [],
      refused,
      reason: `refused ${refused.join(', ')}`,
    };
  }
  /** @type {Record<string, string>} */
  const routes = { ...existing };
  /** @type {{ kind: string, route: string, from: null, to: string }[]} */
  const changes = [];
  for (const item of list) {
    if (Object.hasOwn(routes, item.route)) continue;
    routes[item.route] = 'dynamic';
    changes.push({
      kind: 'added',
      route: item.route,
      from: null,
      to: 'dynamic',
    });
  }
  return {
    snapshot: {
      ...snapshot,
      schema: SNAPSHOT_SCHEMA,
      overrides: snapshot.overrides ?? {},
      routes: Object.fromEntries(
        Object.keys(routes)
          .sort()
          .map(route => [route, routes[route]])
      ),
    },
    changes,
    refused,
    reason: '',
  };
}
