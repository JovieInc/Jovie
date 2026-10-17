import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GET } from '@/app/api/v1/openapi.json/route';
import { ARTIST_OPENAPI_DOCUMENT, type JsonSchema } from '@/lib/api/v1/openapi';
import { publicOpenApiValidator } from '@/tests/utils/public-openapi';
import { runCli } from '../../../../../../packages/jovie-cli/src/cli';
import { COMMANDS } from '../../../../../../packages/jovie-cli/src/commands';
import { handleMcpMessage } from '../../../../../../packages/jovie-cli/src/mcp';

const publicCommands = COMMANDS.filter(command => !command.internal);
const schemas = ARTIST_OPENAPI_DOCUMENT.components.schemas;

function operationFor(pathname: string, method: string) {
  const segments = pathname.split('/');
  const entry = Object.entries(ARTIST_OPENAPI_DOCUMENT.paths).find(
    ([template]) => {
      const expected = template.split('/');
      return (
        expected.length === segments.length &&
        expected.every((segment, index) =>
          /^\{[^}]+\}$/.test(segment)
            ? Boolean(segments[index])
            : segment === segments[index]
        )
      );
    }
  );
  return entry?.[1][method.toLowerCase() as 'get' | 'post'];
}

function resolve(schema: JsonSchema): JsonSchema {
  if (!schema.$ref) return schema;
  const name = schema.$ref.split('/').at(-1) ?? '';
  expect(schemas, `unresolved schema: ${schema.$ref}`).toHaveProperty(name);
  return resolve(schemas[name]);
}

function apiCodes(path: string) {
  const operation = Object.values(ARTIST_OPENAPI_DOCUMENT.paths[path])[0];
  return Object.values(operation.responses).flatMap(
    response =>
      response.content['application/json']?.schema.properties?.error?.properties
        ?.code?.enum ?? []
  );
}

describe('published public CLI/MCP contract', () => {
  it.each(publicCommands)(
    '$tool calls only published paths and methods',
    async command => {
      const calls: { url: URL; method: string }[] = [];
      await command.run(
        {
          arg:
            command.tool === 'create_profile'
              ? 'https://open.spotify.com/artist/123abc'
              : command.tool === 'lookup_creator'
                ? 'https://www.youtube.com/@creator'
                : 'public-handle',
          flags: { title: 'Example report', details: 'Example details' },
        },
        {
          fetchImpl: async (input, init) => {
            const url = new URL(input);
            const method = init?.method ?? 'GET';
            calls.push({ url, method });
            const operation = operationFor(url.pathname, method);
            expect(
              operation,
              `${command.tool}: ${method} ${url.pathname}`
            ).toBeDefined();
            for (const parameter of operation?.parameters ?? []) {
              if (parameter.in === 'query' && parameter.required) {
                expect(url.searchParams.has(parameter.name)).toBe(true);
              }
            }
            if (method === 'POST') {
              expect(operation?.requestBody?.required).toBe(true);
              const schema =
                operation?.requestBody?.content['application/json'].schema;
              expect(schema).toBeDefined();
              const payload = JSON.parse(String(init?.body));
              expect(
                publicOpenApiValidator(schema!).safeParse(payload)
              ).toMatchObject({ success: true });
              for (const key of resolve(schema!).required ?? []) {
                expect(payload).toHaveProperty(key);
              }
            }
            if (url.pathname === '/api/music/mcp') {
              return Response.json({
                jsonrpc: '2.0',
                id: 'jovie-music-resolve',
                result: { structuredContent: {} },
              });
            }
            return Response.json({});
          },
        }
      );
      expect(calls).toHaveLength(1);
    }
  );

  it('covers the full guide variant and excludes authenticated internal paths', async () => {
    const docs = publicCommands.find(command => command.tool === 'get_docs')!;
    await docs.run(
      { full: true },
      {
        fetchImpl: async input => {
          const url = new URL(input);
          expect(url.pathname).toBe('/llms-full.txt');
          expect(operationFor(url.pathname, 'GET')).toBeDefined();
          return new Response('guide');
        },
      }
    );
    expect(
      Object.keys(ARTIST_OPENAPI_DOCUMENT.paths).some(path =>
        path.includes('/internal/')
      )
    ).toBe(false);
  });

  it('returns the published contract through jovie api openapi --json and MCP get_openapi', async () => {
    const fetched: string[] = [];
    const fetchImpl = async (input: string | URL) => {
      fetched.push(new URL(input).pathname);
      return GET();
    };
    let stdout = '';
    const exitCode = await runCli(['api', 'openapi', '--json'], {
      fetchImpl,
      stdout: {
        write: chunk => {
          stdout += chunk;
        },
      },
      stderr: {
        write: chunk => {
          throw new Error(chunk);
        },
      },
    });
    expect(exitCode).toBe(0);
    const cliDocument = JSON.parse(stdout);
    expect(cliDocument).toEqual(ARTIST_OPENAPI_DOCUMENT);
    for (const path of [
      '/api/agents/creator-lookup',
      '/api/agents/feedback',
      '/api/agents/profiles',
    ]) {
      expect(cliDocument.paths[path]).toBeDefined();
    }
    const response = await handleMcpMessage(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'get_openapi', arguments: {} },
      },
      { version: '1.0.0', baseUrl: 'https://jov.ie', fetchImpl }
    );
    expect(response?.result).toMatchObject({
      content: [{ type: 'text', text: expect.any(String) }],
    });
    const result = response?.result as { content: { text: string }[] };
    expect(JSON.parse(result.content[0].text)).toEqual(cliDocument);
    expect(fetched).toEqual(['/api/v1/openapi.json', '/api/v1/openapi.json']);
  });

  it.each(['creator-lookup', 'feedback', 'profiles'])(
    'documents every stable %s server apiCode',
    route => {
      const source = readFileSync(
        resolvePath(`app/api/agents/${route}/route.ts`),
        'utf8'
      );
      const codes = [
        ...source.matchAll(/(?:fail\(\s*\d+,\s*|\?\s*)'([A-Z][A-Z_]+)'/g),
      ].map(match => match[1]);
      expect(codes.length).toBeGreaterThan(0);
      expect(apiCodes(`/api/agents/${route}`)).toEqual(
        expect.arrayContaining(codes)
      );
    }
  );

  it('provides distinct schemas for existing and extracted creators', () => {
    const success =
      ARTIST_OPENAPI_DOCUMENT.paths['/api/agents/creator-lookup'].get!
        .responses['200'].content['application/json'].schema;
    expect(
      success.oneOf?.map(schema => resolve(schema).properties?.exists?.enum)
    ).toEqual([[true], [false]]);
    expect(schemas.ExistingCreatorProfile.required).toContain('profileUrl');
    expect(schemas.ExtractedCreator.required).toContain('links');
    expect(schemas.AgentProfileResponse.properties?.claimUrl.type).toEqual([
      'string',
      'null',
    ]);
  });

  it('bounds report fields and rejects undeclared execution context', () => {
    const context = schemas.AgentFeedbackContext;
    const validator = publicOpenApiValidator(context);
    expect(
      validator.safeParse({
        channel: 'mcp',
        status: 503,
        apiCode: 'FEATURE_DISABLED',
      }).success
    ).toBe(true);
    for (const value of [
      { secret: 'token' },
      { exitCode: 256 },
      { status: 99 },
      { command: 'x'.repeat(121) },
      { channel: 'web' },
    ]) {
      expect(validator.safeParse(value).success).toBe(false);
    }
    expect(schemas.AgentFeedbackRequest.required).toEqual([
      'kind',
      'title',
      'details',
    ]);
    expect(schemas.AgentFeedbackRequest.properties?.title.maxLength).toBe(200);
    expect(schemas.AgentFeedbackRequest.properties?.details.maxLength).toBe(
      4000
    );
  });
});
