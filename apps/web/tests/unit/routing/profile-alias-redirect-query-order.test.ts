import { readFileSync } from 'node:fs';
import { IncomingMessage, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { Socket } from 'node:net';
import { format as formatUrl } from 'node:url';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

type Query = Record<string, string | string[]>;

interface ParsedDestination {
  hash: string;
  pathname: string;
  query?: Query;
  search: string;
}

function loadCanonicalizer(): (pathname: string, query: Query) => Query {
  const sourcePath = require.resolve(
    'next/dist/server/lib/router-utils/resolve-routes.js'
  );
  const source = readFileSync(sourcePath, 'utf8');
  const start = source.indexOf('const PROFILE_ALIAS_REDIRECT_MODES');
  const end = source.indexOf(
    "const debug = (0, _debug.default)('next:router-server:resolve-routes');"
  );
  expect(
    start,
    'Next redirect canonicalizer must be patched in'
  ).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  expect(source).toContain(
    'canonicalizeProfileAliasRedirectQuery(parsedDestination.pathname, query)'
  );

  return new Function(
    `${source.slice(start, end)}\nreturn canonicalizeProfileAliasRedirectQuery;`
  )() as (pathname: string, query: Query) => Query;
}

function locationForAlias(alias: string, mode: string): string {
  const { prepareDestination } =
    require('next/dist/shared/lib/router/utils/prepare-destination') as {
      prepareDestination: (args: {
        appendParamsToQuery: boolean;
        destination: string;
        params: Record<string, string>;
        query: Query;
      }) => { parsedDestination: ParsedDestination };
    };
  const { stringifyQuery } = require('next/dist/server/server-route-utils') as {
    stringifyQuery: (req: object, query: Query) => string;
  };
  const { parsedDestination } = prepareDestination({
    appendParamsToQuery: false,
    destination: `/:username?mode=${mode}&source=:profileSource#alias=${alias}`,
    params: { profileSource: 'qr', username: 'dualipa' },
    query: { source: 'qr' },
  });
  const query = loadCanonicalizer()(
    parsedDestination.pathname,
    parsedDestination.query ?? {}
  );
  delete parsedDestination.query;
  parsedDestination.search = stringifyQuery({}, query);
  return formatUrl(parsedDestination);
}

describe('profile alias redirect query order', () => {
  it('resolves every deep link through the installed Next router', async () => {
    const { getResolveRoutes } =
      require('next/dist/server/lib/router-utils/resolve-routes') as {
        getResolveRoutes: (
          checker: object,
          config: object,
          getAssetPrefix: () => string,
          options: object
        ) => (request: {
          req: IncomingMessage;
          res: ServerResponse;
          isUpgradeReq: boolean;
          invokedOutputs: Set<string>;
        }) => Promise<{ statusCode: number; parsedUrl: ParsedDestination }>;
      };
    const { buildCustomRoute } =
      require('next/dist/server/lib/router-utils/filesystem') as {
        buildCustomRoute: (type: string, route: object) => object;
      };
    const { defaultConfig } = require('next/dist/server/config-shared') as {
      defaultConfig: object;
    };
    const { legacyProfileAliasRedirects } =
      require('../../../lib/routing/legacy-profile-alias-redirects') as {
        legacyProfileAliasRedirects: () => object[];
      };
    const resolve = getResolveRoutes(
      {
        headers: [],
        redirects: legacyProfileAliasRedirects().map(route =>
          buildCustomRoute('redirect', route)
        ),
        rewrites: { beforeFiles: [], afterFiles: [], fallback: [] },
        buildId: 'test',
        getMiddlewareMatchers: () => undefined,
      },
      defaultConfig,
      () => '',
      { dir: process.cwd(), dev: false, hostname: '127.0.0.1', port: 3100 }
    );
    const aliases = {
      contact: 'contact',
      listen: 'listen',
      music: 'listen',
      releases: 'releases',
      subscribe: 'subscribe',
      tip: 'pay',
      tour: 'tour',
      shows: 'tour',
      events: 'tour',
    };
    for (const [alias, mode] of Object.entries(aliases)) {
      for (const source of ['qr', 'link']) {
        const req = new IncomingMessage(new Socket());
        req.url = `/dualipa/${alias}?source=${source}`;
        req.headers = { host: '127.0.0.1:3100' };
        const result = await resolve({
          req,
          res: new ServerResponse(req),
          isUpgradeReq: false,
          invokedOutputs: new Set(),
        });
        expect(result.statusCode).toBe(307);
        expect(formatUrl(result.parsedUrl)).toBe(
          `/dualipa?mode=${mode}&source=${source}#alias=${alias}`
        );
      }
    }
  });

  it('emits mode before source for every legacy deep link', () => {
    const cases = [
      ['listen', 'listen'],
      ['music', 'listen'],
      ['releases', 'releases'],
      ['subscribe', 'subscribe'],
      ['tip', 'pay'],
      ['tour', 'tour'],
      ['shows', 'tour'],
      ['events', 'tour'],
      ['contact', 'contact'],
    ] as const;

    for (const [alias, mode] of cases) {
      const location = locationForAlias(alias, mode);
      const url = new URL(location, 'https://jov.ie');
      expect(url.pathname + url.search).toBe(`/dualipa?mode=${mode}&source=qr`);
      expect(url.hash).toBe(`#alias=${alias}`);
    }
  });

  it('keeps extra request params after the canonical pair', () => {
    const canonicalize = loadCanonicalizer();
    const query = canonicalize('/dualipa', {
      source: 'qr',
      utm_campaign: 'poster',
      mode: 'listen',
    });
    expect(Object.keys(query)).toEqual(['mode', 'source', 'utm_campaign']);
    expect(query).toEqual({
      mode: 'listen',
      source: 'qr',
      utm_campaign: 'poster',
    });
  });

  it('leaves non-alias redirects and unsupported sources alone', () => {
    const canonicalize = loadCanonicalizer();
    const pricing = { source: 'qr', plan: 'pro' };
    expect(canonicalize('/pricing', pricing)).toBe(pricing);
    expect(
      canonicalize('/dualipa', { mode: 'listen', source: 'email' })
    ).toEqual({ mode: 'listen', source: 'email' });
    expect(
      canonicalize('/dualipa/listen', { mode: 'listen', source: 'qr' })
    ).toEqual({ mode: 'listen', source: 'qr' });
  });
});
