import { describe, expect, it, vi } from 'vitest';
import { runCli } from './cli.js';
import { JovieRequestError } from './client.js';
import { invokeFleetAction } from './fleet-client.js';
import { handleMcpMessage } from './mcp.js';

const profile = '11111111-1111-4111-a111-111111111111';
const workerToken = `jwf.${profile}.aeon.${'a'.repeat(43)}`;
const input = {
  profile,
  key: 'stable-fleet-key',
  value: '{}',
  channel: 'cli',
  version: 'test',
} as const;
const result = {
  status: 'completed',
  receipt: { actionId: 'fleet.status' },
  data: { worker: { workerId: 'aeon' } },
};

describe('scoped fleet adapters', () => {
  it.each([
    ['fleet', 'directory', 'fleet_directory', 'fleet.directory', {}],
    [
      'work',
      'request',
      'work_request',
      'work.request',
      {
        requestId: '33333333-3333-4333-a333-333333333333',
        kind: 'research',
        proposal: {
          issueId: 'JOV-7393',
          title: 'Verify the public contract',
          acceptanceCriteria: ['Return a public contract receipt'],
          existingWorkRefs: ['urn:public:contract'],
          command: 'api.openapi',
          requiredTools: [],
          requiredConnectors: [],
          maxDurationSeconds: 60,
          notAfter: '2026-10-01T19:00:00Z',
        },
      },
    ],
  ] as const)(
    'routes %s %s through CLI and MCP with the exact bounded proposal',
    async (group, command, tool, action, proposal) => {
      const payload = { ...result, receipt: { actionId: action } };
      const fetchImpl = vi.fn(async () => Response.json(payload));
      let output = '';
      expect(
        await runCli(
          [
            group,
            command,
            '--profile',
            profile,
            '--idempotency-key',
            input.key,
            '--input',
            JSON.stringify(proposal),
            '--json',
          ],
          {
            workerToken,
            fetchImpl,
            stdout: {
              write: value => {
                output += value;
              },
            },
          }
        )
      ).toBe(0);
      expect(JSON.parse(output)).toEqual(payload);
      const response = await handleMcpMessage(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: tool,
            arguments: {
              profile,
              'idempotency-key': input.key,
              input: JSON.stringify(proposal),
            },
          },
        },
        { workerToken, fetchImpl, version: 'test', baseUrl: 'https://jov.ie' }
      );
      expect(response?.result).toMatchObject({ structuredContent: payload });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      for (const [url, init] of fetchImpl.mock.calls as unknown as [
        string,
        RequestInit,
      ][]) {
        expect(url).toBe(`https://jov.ie/api/v1/actions/${action}/invoke`);
        expect(JSON.parse(String(init.body))).toMatchObject({
          idempotencyKey: input.key,
          context: { profileId: profile },
          input: proposal,
        });
      }
      expect(output).not.toContain(workerToken);
    }
  );

  it('sends one bounded POST with a stable invocation key and scoped bearer', async () => {
    const fetchImpl = vi.fn(async () => Response.json(result));
    expect(
      await invokeFleetAction('fleet.status', input, {
        workerToken,
        fetchImpl,
      })
    ).toEqual(result);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://jov.ie/api/v1/actions/fleet.status/invoke');
    expect(init).toMatchObject({
      method: 'POST',
      redirect: 'error',
      headers: { Authorization: `Bearer ${workerToken}` },
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init.body))).toMatchObject({
      schemaVersion: 1,
      idempotencyKey: input.key,
      context: { profileId: profile, channel: 'cli', clientVersion: 'test' },
      input: {},
    });
  });

  it('rejects absent credentials, cross-profile credentials and cleartext remote hosts before fetch', async () => {
    const fetchImpl = vi.fn();
    for (const [value, options] of [
      [input, { fetchImpl }],
      [
        { ...input, profile: '22222222-2222-4222-a222-222222222222' },
        { fetchImpl, workerToken },
      ],
      [input, { fetchImpl, workerToken, baseUrl: 'http://example.test' }],
    ] as const)
      await expect(
        invokeFleetAction('fleet.status', value, options)
      ).rejects.toHaveProperty('code', 'INVALID_INPUT');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never blindly retries an ambiguous mutation or reveals its credential', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error(workerToken);
    });
    await expect(
      invokeFleetAction('work.report', input, { workerToken, fetchImpl })
    ).rejects.toMatchObject({ apiCode: 'TEMPORARILY_UNAVAILABLE' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(
      invokeFleetAction('work.report', input, { workerToken, fetchImpl })
    ).rejects.not.toThrow(workerToken);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([
    { key: 'short' },
    { key: 'x'.repeat(129) },
    { value: '{' },
    { value: '[]' },
    { value: 'null' },
  ])(
    'rejects malformed invocation input before sending credentials: %#',
    async invalid => {
      const fetchImpl = vi.fn();
      await expect(
        invokeFleetAction(
          'fleet.status',
          { ...input, ...invalid },
          { workerToken, fetchImpl }
        )
      ).rejects.toHaveProperty('code', 'INVALID_INPUT');
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  );

  it('preserves canonical denials rather than manufacturing success from HTTP status', async () => {
    const denied = {
      status: 'unavailable',
      receipt: {},
      error: { code: 'FORBIDDEN', retryable: false },
    };
    const fetchImpl = vi.fn(async () => Response.json(denied, { status: 403 }));
    expect(
      await invokeFleetAction('fleet.status', input, {
        workerToken,
        fetchImpl,
      })
    ).toEqual(denied);
  });

  it.each([
    { status: 429, code: 'RATE_LIMITED', retryable: true, delay: 45 },
    { status: 400, code: 'VALIDATION_FAILED', retryable: false },
  ])(
    'preserves HTTP $status error guidance through CLI and MCP',
    async test => {
      const fetchImpl = vi.fn(async () =>
        Response.json(
          {
            error: {
              code: test.code,
              retryable: test.retryable,
              message: workerToken,
            },
          },
          {
            status: test.status,
            headers: test.delay ? { 'Retry-After': String(test.delay) } : {},
          }
        )
      );
      const expected = {
        code: 'REQUEST_FAILED',
        apiCode: test.code,
        status: test.status,
        retryable: test.retryable,
        ...(test.delay ? { retryAfterSeconds: test.delay } : {}),
      };
      let output = '';
      expect(
        await runCli(
          [
            'fleet',
            'status',
            '--profile',
            profile,
            '--idempotency-key',
            input.key,
            '--input',
            '{}',
            '--json',
          ],
          {
            workerToken,
            fetchImpl,
            stdout: {
              write: value => {
                output += value;
              },
            },
          }
        )
      ).toBe(3);
      const cliError = JSON.parse(output).error;
      expect(cliError).toMatchObject(expected);
      expect(cliError).not.toHaveProperty('responseBody');
      expect(output).not.toContain(workerToken);
      const response = await handleMcpMessage(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'fleet_status',
            arguments: { profile, 'idempotency-key': input.key, input: '{}' },
          },
        },
        { workerToken, fetchImpl, version: 'test', baseUrl: 'https://jov.ie' }
      );
      const result = response?.result as {
        isError: boolean;
        content: { text: string }[];
      };
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content[0]!.text).error).toMatchObject(expected);
      expect(JSON.stringify(response)).not.toContain(workerToken);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    }
  );

  it.each([
    { code: workerToken, retryable: false },
    { code: { token: workerToken }, retryable: false },
    { code: 'RATE_LIMITED', retryable: workerToken },
  ])('does not forward untrusted HTTP error fields: %#', async error => {
    const failure = await invokeFleetAction('fleet.status', input, {
      workerToken,
      fetchImpl: async () =>
        Response.json(
          { error },
          { status: 429, headers: { 'Retry-After': workerToken } }
        ),
    }).catch(value => value);
    if (!(failure instanceof JovieRequestError))
      throw new Error('Expected a request failure.');
    expect(failure).toMatchObject({
      code: 'REQUEST_FAILED',
      apiCode:
        error.code === 'RATE_LIMITED'
          ? 'RATE_LIMITED'
          : 'TEMPORARILY_UNAVAILABLE',
      retryAfterSeconds: undefined,
      responseBody: undefined,
    });
    expect(failure.retryable).toBeUndefined();
    expect(JSON.stringify(failure)).not.toContain(workerToken);
    expect(failure.message).not.toContain(workerToken);
  });

  it('rejects an aborted bodyless response using the final public response guard', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async () => {
      controller.abort();
      return new Response(null, { status: 204 });
    });
    await expect(
      invokeFleetAction('work.report', input, {
        workerToken,
        fetchImpl,
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ code: 'REQUEST_FAILED', status: 204 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('preserves canonical receipt content through CLI and MCP without printing credentials', async () => {
    const fetchImpl = vi.fn(async () => Response.json(result));
    let output = '';
    expect(
      await runCli(
        [
          'fleet',
          'status',
          '--profile',
          profile,
          '--idempotency-key',
          input.key,
          '--input',
          '{}',
          '--json',
        ],
        {
          workerToken,
          fetchImpl,
          stdout: {
            write: value => {
              output += value;
            },
          },
        }
      )
    ).toBe(0);
    expect(JSON.parse(output)).toEqual(result);
    expect(output).not.toContain(workerToken);
    const response = await handleMcpMessage(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'fleet_status',
          arguments: { profile, 'idempotency-key': input.key, input: '{}' },
        },
      },
      { workerToken, fetchImpl, version: 'test', baseUrl: 'https://jov.ie' }
    );
    expect(response?.result).toMatchObject({ structuredContent: result });
  });

  it('keeps operator tools out of public discovery and rejects direct anonymous calls', async () => {
    const fetchImpl = vi.fn();
    const context = { fetchImpl, version: 'test', baseUrl: 'https://jov.ie' };
    const listed = await handleMcpMessage(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      context
    );
    expect(listed?.result).toHaveProperty('tools');
    const tools =
      (listed?.result as { tools?: { name: string }[] } | undefined)?.tools ??
      [];
    expect(tools.some(tool => /^(fleet|work|defect)_/.test(tool.name))).toBe(
      false
    );
    const response = await handleMcpMessage(
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'fleet_status', arguments: {} },
      },
      context
    );
    expect(response?.result).toMatchObject({ isError: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it.each([
    ['completed', 0],
    ['handoff', 0],
    ['failed', 1],
    ['requires_input', 1],
    ['unavailable', 2],
    ['in_progress', 3],
  ] as const)('maps canonical %s to exit %s', async (status, code) => {
    let output = '';
    const payload = { status, receipt: {} };
    expect(
      await runCli(
        [
          'fleet',
          'status',
          '--profile',
          profile,
          '--idempotency-key',
          input.key,
          '--input',
          '{}',
          '--json',
        ],
        {
          workerToken,
          fetchImpl: async () => Response.json(payload),
          stdout: {
            write: value => {
              output += value;
            },
          },
        }
      )
    ).toBe(code);
    expect(JSON.parse(output)).toEqual(payload);
  });

  it('uses exit 3 for internal transport and usage errors without changing public error behavior', async () => {
    const stdout = { write: (_value: string) => {} };
    const args = [
      'fleet',
      'status',
      '--profile',
      profile,
      '--idempotency-key',
      input.key,
      '--input',
      '{}',
      '--json',
    ];
    expect(await runCli(args, { stdout })).toBe(3);
    expect(await runCli(['--json', ...args], { stdout })).toBe(3);
    expect(
      await runCli(['fleet', 'status', '--bogus', '--json'], { stdout })
    ).toBe(3);
    expect(
      await runCli(['--json', 'fleet', 'status', '--bogus'], { stdout })
    ).toBe(3);
    expect(
      await runCli(
        ['--base-url', 'fleet', '--json', 'artist', 'get', '--bogus'],
        { stdout }
      )
    ).toBe(2);
    expect(
      await runCli(args, {
        stdout,
        workerToken,
        fetchImpl: async () => {
          throw new Error('unavailable');
        },
      })
    ).toBe(3);
  });
});
