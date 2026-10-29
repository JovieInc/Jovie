import { randomUUID } from 'node:crypto';
import {
  findKey,
  isRateLimited,
  latencyByTool,
  parseMcpBody,
} from './cert-helpers';
import { hashTools } from './hash';

export type CertStatus = 'PASS' | 'FAIL' | 'RATE_LIMITED' | 'SKIP';
export interface CertCheck {
  check: string;
  status: CertStatus;
  ms: number | null;
  detail?: unknown;
}
export interface CertOptions {
  readonly base: string;
  readonly query: string;
  readonly releaseUrl: string;
  readonly fetchImpl?: typeof fetch;
  readonly run?: string;
  readonly now?: () => Date;
}

export function normalizeBase(base: string): string {
  const trimmed = base.replace(/\/+$/, '');
  return trimmed.endsWith('/api/mcp') ? trimmed : `${trimmed}/api/mcp`;
}

/** Runs the live agent-path checks. Exit code: 1 on any FAIL, 75 when only rate limiting stopped it, else 0. */
export async function runCert(opts: CertOptions) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const BASE = normalizeBase(opts.base);
  const QUERY = opts.query;
  const RELEASE_URL = opts.releaseUrl;
  const RUN = opts.run ?? `cert-${randomUUID().slice(0, 10)}`;
  const ACQ = {
    agent_source: 'jovie-cert-harness',
    client: 'harness/0.2',
    installation_id: 'cert-harness',
    session_or_run_id: RUN,
    intent: 'certify agent path',
    first_touch: {},
  };
  const EXPECTED_TOOLS = [
    'artist.search_or_import',
    'workspace.create_draft',
    'release.prepare_launch',
  ];

  const checks: CertCheck[] = [];
  const calls: { tool: string; status: number; ms: number }[] = [];
  let rateLimited = false;
  let nextId = 0;

  async function rpc(method: string, params: Record<string, unknown> = {}) {
    nextId += 1;
    const started = performance.now();
    const response = await fetchImpl(BASE, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId, method, params }),
      signal: AbortSignal.timeout(60_000),
    });
    const doc = parseMcpBody(await response.text());
    const ms = Math.round(performance.now() - started);
    const name = typeof params.name === 'string' ? params.name : method;
    calls.push({ tool: name, status: response.status, ms });
    if (isRateLimited(response.status, doc)) rateLimited = true;
    return { status: response.status, doc, ms };
  }

  async function call(name: string, args: Record<string, unknown>) {
    const { status, doc, ms } = await rpc('tools/call', {
      name,
      arguments: args,
    });
    const result = (doc.result ?? {}) as {
      isError?: boolean;
      structuredContent?: unknown;
      content?: { type: string; text?: string }[];
    };
    let data: unknown = result.structuredContent;
    if (data === undefined) {
      const text = result.content?.find(c => c.type === 'text')?.text;
      try {
        data = text ? JSON.parse(text) : undefined;
      } catch {
        data = { _text: text?.slice(0, 500) };
      }
    }
    const rejected = Boolean(
      result.isError ||
        doc.error ||
        status >= 400 ||
        (data as { status?: string } | undefined)?.status === 'error'
    );
    return { status, doc, data, ms, rejected };
  }

  function record(
    check: string,
    ok: boolean,
    detail?: unknown,
    ms: number | null = null
  ) {
    const status: CertStatus =
      rateLimited && !ok ? 'RATE_LIMITED' : ok ? 'PASS' : 'FAIL';
    checks.push({ check, status, ms, detail });
  }
  function skip(check: string, why: string) {
    checks.push({ check, status: 'SKIP', ms: null, detail: why });
  }
  const str = (value: unknown) =>
    typeof value === 'string' ? value : undefined;

  async function main() {
    const init = await rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'jovie-cert-harness', version: '0.2' },
    });
    record(
      'initialize',
      init.status === 200 && 'result' in init.doc,
      undefined,
      init.ms
    );

    const listed = await rpc('tools/list');
    const tools = ((listed.doc.result as { tools?: Record<string, unknown>[] })
      ?.tools ?? []) as {
      name: string;
      title?: string;
      annotations?: Record<string, unknown>;
      description?: string;
    }[];
    const toolsListHash = hashTools(tools);
    record(
      'tools/list contract',
      EXPECTED_TOOLS.every(n => tools.some(t => t.name === n)),
      tools.map(t => t.name),
      listed.ms
    );
    record(
      'tools have titles',
      tools.length > 0 && tools.every(t => t.title?.trim()),
      tools.filter(t => !t.title?.trim()).map(t => t.name)
    );
    record(
      'tools have explicit read/destructive/open-world hints',
      tools.length > 0 &&
        tools.every(t =>
          ['readOnlyHint', 'destructiveHint', 'openWorldHint'].every(
            k => typeof t.annotations?.[k] === 'boolean'
          )
        )
    );
    record(
      'no "fan" language in tool descriptions',
      !tools.some(t => /\bfans?\b/i.test(t.description ?? ''))
    );

    const abortIfLimited = () => rateLimited;
    const named = await call('artist.search_or_import', {
      input: QUERY,
      acquisition: ACQ,
    });
    record(
      'search by name returns candidates or a match',
      named.status === 200 && !named.rejected,
      named.rejected ? named.data : undefined,
      named.ms
    );
    let artistId = str(findKey(named.data, ['artist_id']));
    let token = str(findKey(named.data, ['draft_token']));
    const candidates = findKey(named.data, ['candidates']);
    if (
      !token &&
      Array.isArray(candidates) &&
      candidates.length &&
      !abortIfLimited()
    ) {
      const pick = str(
        findKey(candidates[0], [
          'source_url',
          'input',
          'url',
          'spotify_url',
          'provider_url',
          'provider_id',
          'id',
        ])
      );
      const exact = await call('artist.search_or_import', {
        input: pick,
        acquisition: ACQ,
      });
      record(
        'exact import of picked candidate returns draft_token',
        Boolean(str(findKey(exact.data, ['draft_token']))),
        exact.rejected ? exact.data : { picked: pick },
        exact.ms
      );
      artistId = str(findKey(exact.data, ['artist_id']));
      token = str(findKey(exact.data, ['draft_token']));
    } else
      record(
        'exact import of picked candidate returns draft_token',
        Boolean(token),
        token ? 'resolved directly by name' : 'no candidates'
      );

    let draftId: string | undefined;
    let claimUrl: string | undefined;
    if (artistId && token && !abortIfLimited()) {
      const created = await call('workspace.create_draft', {
        artist_id: artistId,
        draft_token: token,
      });
      draftId = str(findKey(created.data, ['draft_id']));
      claimUrl = str(findKey(created.data, ['claim_url']));
      record(
        'create_draft returns draft_id',
        Boolean(draftId) && !created.rejected,
        created.rejected ? created.data : { draft_id: draftId },
        created.ms
      );
      const retry = await call('workspace.create_draft', {
        artist_id: artistId,
        draft_token: token,
      });
      record(
        'create_draft is idempotent',
        str(findKey(retry.data, ['draft_id'])) === draftId && Boolean(draftId),
        undefined,
        retry.ms
      );
      const cross = await call('workspace.create_draft', {
        artist_id: `spotify:${randomUUID().replaceAll('-', '').slice(0, 22)}`,
        draft_token: token,
      });
      record(
        'token for another artist is rejected',
        cross.rejected || !findKey(cross.data, ['draft_id']),
        cross.data,
        cross.ms
      );
    } else
      skip(
        'create_draft / idempotency / cross-artist',
        'no artist_id and draft_token'
      );

    if (draftId && token && !abortIfLimited()) {
      const prep = await call('release.prepare_launch', {
        draft_id: draftId,
        draft_token: token,
        release_url: RELEASE_URL,
        goal: 'Set up a release page and smart link for my latest single',
      });
      const prepStatus = str(findKey(prep.data, ['status']));
      record(
        'prepare_launch with release_url succeeds',
        !prep.rejected &&
          ['launch_draft_ready', 'draft_needs_input'].includes(
            prepStatus ?? ''
          ),
        { status: prepStatus },
        prep.ms
      );
      claimUrl = claimUrl ?? str(findKey(prep.data, ['claim_url']));
      const missing = await call('release.prepare_launch', {
        draft_id: draftId,
        draft_token: token,
        goal: 'smart link',
      });
      record(
        'missing release input gives a useful error',
        missing.rejected ||
          /release|question|needs/i.test(JSON.stringify(missing.data)),
        missing.data,
        missing.ms
      );
    } else skip('prepare_launch', 'no draft');

    // Expected to FAIL until JOV-9760 returns a claim_url.
    if (claimUrl) {
      try {
        const res = await fetchImpl(claimUrl, {
          headers: { 'user-agent': 'jovie-cert-harness' },
          signal: AbortSignal.timeout(30_000),
        });
        record('claim_url resolves', res.status === 200, {
          url: claimUrl.split('?')[0],
          status: res.status,
        });
      } catch (error) {
        record('claim_url resolves', false, {
          url: claimUrl.split('?')[0],
          error: String(error),
        });
      }
    } else
      record(
        'claim_url present and resolves',
        false,
        'no claim_url in create_draft or prepare_launch (JOV-9760)'
      );

    if (!abortIfLimited()) {
      const empty = await call('artist.search_or_import', {
        input: '',
        acquisition: ACQ,
      });
      record('empty input rejected', empty.rejected, empty.data, empty.ms);
      const bogus = await call('workspace.create_draft', {
        artist_id: 'x',
        draft_token: 'bogus',
      });
      record('bogus token rejected', bogus.rejected, bogus.data, bogus.ms);
      const unknown = await rpc('tools/call', {
        name: 'nope.nothing',
        arguments: {},
      });
      record(
        'unknown tool rejected',
        Boolean(unknown.doc.error),
        undefined,
        unknown.ms
      );
    } else skip('negatives', 'rate limited');

    return toolsListHash;
  }

  const toolsListHash = await main();
  const failed = checks.some(c => c.status === 'FAIL');
  const exitCode = failed ? 1 : rateLimited ? 75 : 0;
  const receipt = {
    run: RUN,
    base: BASE,
    at: (opts.now?.() ?? new Date()).toISOString(),
    ok: exitCode === 0,
    toolsListHash,
    passed: checks.filter(c => c.status === 'PASS').length,
    total: checks.length,
    rateLimited,
    checks,
    latency: latencyByTool(calls),
  };
  return { receipt, exitCode };
}
