import robotsParser from 'robots-parser';
import {
  discover,
  extractArticle,
  hash,
  IngestError,
  record,
  type Source,
  sourcesFromSecret,
} from './source.ts';
import {
  type BrainConfig,
  createBrain,
  type Runtime,
  requestText,
  runtime,
} from './transport.ts';

export interface Env extends BrainConfig {
  KNOWLEDGE_SOURCES_JSON: string;
}

const USER_AGENT = 'JovieKnowledgeBot/1.0';
const MAX_URLS = 5000;

export interface Receipt {
  source: string;
  status: 'ok' | 'blocked' | 'failed' | 'limited';
  reason?: string;
  fetched: number;
  written: number;
  duplicate: number;
  requests: number;
}

async function ingest(
  source: Source,
  brain: ReturnType<typeof createBrain>,
  rt: Runtime
): Promise<Receipt> {
  const receipt: Receipt = {
    source: source.code,
    status: 'ok',
    fetched: 0,
    written: 0,
    duplicate: 0,
    requests: 0,
  };
  if (!source.approved || !source.termsApproved) {
    return { ...receipt, status: 'blocked', reason: 'approval_required' };
  }
  let interval = source.intervalMs;
  let lastRequest: number | null = null;
  const beforeAttempt = async () => {
    if (lastRequest !== null)
      await rt.sleep(Math.max(0, interval - (rt.now() - lastRequest)));
    lastRequest = rt.now();
    receipt.requests++;
  };
  try {
    const robotsUrl = `${source.origin}/robots.txt`;
    const robots = robotsParser(
      robotsUrl,
      await requestText(
        rt,
        robotsUrl,
        {
          headers: { 'User-Agent': USER_AGENT },
        },
        beforeAttempt,
        256_000,
        true
      )
    );
    const crawlDelay = robots.getCrawlDelay(USER_AGENT);
    if (crawlDelay !== undefined) {
      if (!Number.isFinite(crawlDelay) || crawlDelay > 60)
        throw new IngestError('crawl_delay_exceeds_budget');
      interval = Math.max(interval, crawlDelay * 1000);
    }
    const allowed = (url: string) => {
      if (robots.isAllowed(url, USER_AGENT) !== true)
        throw new IngestError('robots_disallowed');
    };
    const get = (url: string) => {
      allowed(url);
      return requestText(
        rt,
        url,
        { headers: { 'User-Agent': USER_AGENT } },
        beforeAttempt
      );
    };
    const queue = [source.discoveryUrl];
    const visited = new Set<string>();
    const pages = new Set<string>();
    while (queue.length) {
      const url = queue.shift() as string;
      if (visited.has(url)) continue;
      if (visited.size >= source.maxDiscoveryRequests)
        throw new IngestError('discovery_limit');
      visited.add(url);
      for (const link of discover(await get(url), source.discoveryKind)) {
        const target = new URL(link.url, url);
        target.hash = '';
        if (
          target.origin !== source.origin ||
          target.username ||
          target.password
        )
          continue;
        if (link.sitemap) queue.push(target.href);
        else if (
          target.pathname === source.pathPrefix ||
          target.pathname.startsWith(
            source.pathPrefix.endsWith('/')
              ? source.pathPrefix
              : `${source.pathPrefix}/`
          )
        )
          pages.add(target.href);
        if (pages.size > MAX_URLS || queue.length > MAX_URLS)
          throw new IngestError('discovery_limit');
      }
    }
    if (!pages.size) throw new IngestError('discovery_empty');
    const base = `raw/industry/${source.code.toLowerCase()}`;
    const indexSlug = `${base}/index`;
    const existingIndex = await brain.get(indexSlug, source.code);
    const previous = existingIndex ? record(existingIndex.attempted) : {};
    const candidates = await Promise.all(
      [...pages].map(async url => ({ url, key: await hash(url) }))
    );
    // New URLs first, then oldest attempt. A bounded initial backfill cannot
    // repeatedly refetch the first sitemap page and starve later discoveries.
    candidates.sort(
      (a, b) => Number(previous[a.key] ?? 0) - Number(previous[b.key] ?? 0)
    );
    const attempted: Record<string, number> = {};
    for (const { key } of candidates) {
      if (typeof previous[key] === 'number') attempted[key] = previous[key];
    }
    for (const { url, key } of candidates.slice(0, source.maxPages)) {
      try {
        const article = extractArticle(await get(url), source);
        receipt.fetched++;
        const contentHash = await hash(`${article.title}\n${article.text}`);
        const slug = `${base}/${contentHash}`;
        const existing = await brain.get(slug, source.code);
        if (existing?.contentHash === contentHash && existing.canon === false) {
          receipt.duplicate++;
        } else {
          await brain.put(
            slug,
            source.code,
            {
              ...article,
              source: source.code,
              contentHash,
              canon: false,
              trust: 'untrusted',
              visibility: 'private-internal',
              fetchedAt: new Date(rt.now()).toISOString(),
            },
            existing !== null
          );
          receipt.written++;
        }
      } catch (error) {
        // Stop on persistence, policy or upstream backoff failures. A bad
        // article can be retried after its siblings without starving them.
        if (
          !(error instanceof IngestError) ||
          error.message !== 'content_missing'
        )
          throw error;
        receipt.status = 'failed';
        receipt.reason = 'content_missing';
      }
      attempted[key] = rt.now();
    }
    await brain.put(
      indexSlug,
      source.code,
      { source: source.code, canon: false, attempted },
      existingIndex !== null
    );
    if (
      candidates
        .slice(source.maxPages)
        .some(c => previous[c.key] === undefined) &&
      receipt.status === 'ok'
    ) {
      receipt.status = 'limited';
      receipt.reason = 'page_limit';
    }
  } catch (error) {
    const reason =
      error instanceof IngestError ? error.message : 'source_failed';
    receipt.status = [
      'robots_disallowed',
      'crawl_delay_exceeds_budget',
    ].includes(reason)
      ? 'blocked'
      : 'failed';
    receipt.reason = reason;
  }
  return receipt;
}

export async function run(env: Env, rt: Runtime = runtime): Promise<Receipt[]> {
  const sources = sourcesFromSecret(env.KNOWLEDGE_SOURCES_JSON);
  const deadline = rt.now() + 600_000;
  const bounded: Runtime = {
    ...rt,
    async sleep(ms) {
      if (rt.now() + ms >= deadline)
        throw new IngestError('run_budget_exceeded');
      await rt.sleep(ms);
    },
    async fetch(...args) {
      if (rt.now() >= deadline) throw new IngestError('run_budget_exceeded');
      return rt.fetch(...args);
    },
  };
  const brain = createBrain(env, bounded);
  const receipts: Receipt[] = [];
  // Serialize sources: no burst of requests or competing index writers.
  for (const source of sources)
    receipts.push(await ingest(source, brain, bounded));
  return receipts;
}

export default {
  fetch() {
    return new Response(null, { status: 404 });
  },
  scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      run(env).then(receipts => {
        // Workers-native telemetry; only the fixed receipt schema reaches logs.
        for (const receipt of receipts) console.info(JSON.stringify(receipt));
        if (receipts.some(receipt => receipt.status !== 'ok'))
          throw new IngestError('knowledge_ingest_incomplete');
      })
    );
  },
};
