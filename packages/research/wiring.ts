/** Production wiring: real sources, judges, gbrain and the host state dir. */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  type CredentialEnv,
  createProviderClients,
  type ProviderClients,
} from './credentials.ts';
import { createGbrainClient, type GbrainClient } from './gbrain.ts';
import { clefJudge, jevJudge } from './judge.ts';
import { loadResearch, researchSlug, saveResearch } from './persist.ts';
import { createRouter, type SourceImpl } from './router.ts';
import { priorDecisions, searchGbrain, searchRepo } from './sources-local.ts';
import {
  cloudflareFetch,
  exaSearch,
  firecrawlSearch,
  hyperagentDeep,
  last30days,
  last30daysScript,
  perplexityAnswer,
} from './sources-web.ts';
import { ResearchState } from './state.ts';
import { type Judge, SOURCES } from './types.ts';

export function repoRoot(cwd = process.cwd()): string {
  if (process.env.JOVIE_REPO) return process.env.JOVIE_REPO;
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    // Outside a checkout, search the main Jovie checkout read-only.
    const main = join(homedir(), 'Jovie');
    return existsSync(join(main, 'CLAUDE.md')) ? main : cwd;
  }
}

export interface Wiring {
  readonly gbrain: GbrainClient;
  readonly state: ResearchState;
  readonly router: ReturnType<typeof createRouter>;
  readonly judges: Judge[];
  readonly clients: ProviderClients;
  /** A judge by name (clef-flash, jev), for benches that need one fixed judge. */
  judge(name: string): Judge | undefined;
}

export function createDefaultWiring(
  options: { ctx?: CredentialEnv; state?: ResearchState } = {}
): Wiring {
  // Writes (pages, takes, decisions) chunk and embed server-side: 10-30s.
  const gbrain = createGbrainClient({ timeoutMs: 90_000 });
  // Tier 0 must stay fast: a busy shared daemon (seen at 15s) is skipped, not awaited.
  const gbrainFast = createGbrainClient({ timeoutMs: 8_000 });
  const state = options.state ?? new ResearchState();
  const clients = createProviderClients({ ctx: options.ctx });
  const root = repoRoot();

  const lazyJudge = (
    name: string,
    build: () => Promise<Judge | null>
  ): Judge => ({
    name,
    async judge(query, hits) {
      const judge = await build();
      if (!judge) throw new Error(`${name}: no credential`);
      return judge.judge(query, hits);
    },
  });
  const byName: Record<string, Judge> = {
    'clef-flash': lazyJudge('clef-flash', async () => {
      const cf = await clients.cloudflare();
      return cf ? clefJudge(cf) : null;
    }),
    jev: lazyJudge('jev', async () => {
      const gw = clients.gateway();
      return gw ? jevJudge(gw) : null;
    }),
  };
  const order = process.env.JOVIE_RESEARCH_JUDGE?.split(',') ?? [
    ...SOURCES.judge.order,
  ];
  const judges = order
    .map(n => byName[n])
    .filter((j): j is Judge => Boolean(j));

  const sources: Record<string, SourceImpl> = {
    gbrain: {
      available: () => true,
      run: async c => ({ hits: await searchGbrain(gbrainFast, c.query) }),
    },
    repo: {
      available: () => true,
      run: async c => ({ hits: await searchRepo(root, c.query) }),
    },
    'cloudflare-fetch': {
      available: async () => (await clients.cloudflare()) !== null,
      async run(c) {
        if (c.urls.length === 0) return null;
        const cf = await clients.cloudflare();
        if (!cf) return null;
        const outs = await Promise.all(
          c.urls.slice(0, 3).map(u => cloudflareFetch(cf, u))
        );
        return { hits: outs.flatMap(o => o.hits) };
      },
    },
    firecrawl: {
      available: () => clients.firecrawl() !== null,
      run: c =>
        firecrawlSearch(
          clients.firecrawl()!,
          c.query,
          c.freshness,
          c.mode === 'quick' ? 5 : 8
        ),
    },
    last30days: {
      available: () => last30daysScript() !== null,
      run: c => last30days(c.query, c.freshness),
    },
    hyperagent: {
      available: () => clients.hyperagent() !== null,
      run: c =>
        hyperagentDeep(
          clients.hyperagent()!,
          SOURCES.sources.hyperagent.agentId!,
          c.query,
          c.freshness
        ),
    },
    exa: {
      available: () => clients.exa() !== null,
      run: c =>
        exaSearch(
          clients.exa()!,
          c.query,
          c.freshness,
          c.mode === 'quick' ? 5 : 8
        ),
    },
    perplexity: {
      available: () => clients.perplexity() !== null,
      run: c => perplexityAnswer(clients.perplexity()!, c.query),
    },
  };

  const router = createRouter({
    state,
    sources,
    judges,
    prior: q => priorDecisions(gbrainFast, q),
    loadPersisted: key => loadResearch(gbrain, key),
    persist: (result, caller) => saveResearch(gbrain, result, caller),
    slugFor: researchSlug,
  });
  return {
    gbrain,
    state,
    router,
    judges,
    clients,
    judge: name => byName[name],
  };
}
