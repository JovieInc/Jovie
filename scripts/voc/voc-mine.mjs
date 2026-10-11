#!/usr/bin/env node
// Voice-of-customer miner (JOV-7701): public complaints and payment objections
// about the tools Jovie replaces. Collect -> classify (deterministic) -> dated
// receipts. Real product names live only in the private targets file (gbrain
// ops/voc/targets, Doppler/Actions VOC_TARGETS_JSON); repo-bound output carries
// anonymized target ids. No model API calls: synthesis is done by the
// subscription agent that runs this. Runbook: scripts/voc/README.md.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const VOC_SCHEMA = 'jovie.voc-item/v1';
export const CATEGORIES = [
  'link-in-bio',
  'smart-link',
  'epk',
  'fan-crm',
  'storefront',
  'music-marketing',
  'contact-card',
  'launch-kit',
  'founder-site',
];

// Pain themes: what is broken. First match by order wins as primary.
/** @type {Array<[string, RegExp]>} */
export const PAIN_THEMES = [
  [
    'account-ban',
    /\b(banned|suspended|deactivated|shut (?:down )?my (?:account|page)|locked out)\b/i,
  ],
  [
    'scam-ineffective',
    /\b(scam|fake (?:streams|plays|followers)|bots?|zero results|no results|waste of money|didn'?t get (?:a single|any))\b/i,
  ],
  [
    'fees-cut',
    /\b(transaction fees?|takes? a cut|commission|\d+(?:\.\d+)?% fee|payouts?|processing fee|get(?:ting)? paid)\b/i,
  ],
  [
    'paywalled-basics',
    /\b(paywall|behind (?:a|the) pay|locked behind|only (?:on|in) (?:the )?(?:pro|premium|paid)|upsell|have to pay (?:for|to))\b/i,
  ],
  [
    'price-hike',
    /\b(price (?:hike|increase)|raised (?:the |their )?price|doubled|more expensive|went up)\b/i,
  ],
  [
    'lock-in-data',
    /\b(export|lock[- ]?in|own (?:my|your) (?:data|audience|list)|can'?t (?:take|move|migrate)|shut down|acquired)\b/i,
  ],
  [
    'support',
    /\b(customer (?:service|support)|support (?:team|is)|no (?:response|reply)|never (?:heard|replied|responded)|refund)\b/i,
  ],
  [
    'privacy-ai-terms',
    /\b(terms of (?:service|use)|tos\b|my data|your data|privacy|generative ai|train(?:ing)? (?:their )?ai|scrape)\b/i,
  ],
  ['accessibility', /\b(screen reader|voiceover|visually impaired|accessib)/i],
  [
    'bugs-reliability',
    /\b(bug(?:gy|s)?|glitch(?:y)?|crash(?:es|ing)?|broken|doesn'?t work|not working|error|down again|frozen|freez(?:e|es|ing)|(?:blank|white|grey|gray) screen|links? (?:often )?(?:don'?t|doesn'?t) work)\b/i,
  ],
  ['slow', /\b(slow|lag(?:gy)?|loading|takes forever|taking forever)\b/i],
  [
    'generic-ugly',
    /\b(ugly|generic|cookie[- ]cutter|looks (?:the same|cheap|basic)|branding|their logo|customi[sz]ation)\b/i,
  ],
  [
    'missing-feature',
    /\b(wish (?:it|they)|missing|no way to|can'?t (?:add|change|edit|customi[sz]e)|lacks?|doesn'?t (?:support|let|allow))\b/i,
  ],
  [
    'complexity',
    /\b(confusing|complicated|clunky|learning curve|hard to (?:use|set up|navigate))\b/i,
  ],
  [
    'deliverability',
    /\b(spam folder|deliverability|open rates?|unsubscribe)\b/i,
  ],
];

// Payment objections: why people refuse or stop paying.
/** @type {Array<[string, RegExp]>} */
export const OBJECTION_TYPES = [
  [
    'free-alternative',
    /\b(free (?:alternative|version|plan|option)|for free|(?:just|instead) use|switched to|open[- ]source|self[- ]host)\b/i,
  ],
  [
    'not-worth-price',
    /\b(not worth|overpriced|too expensive|rip[- ]?off|for what (?:it|you) get|\$\d+(?:\/| a | per )(?:mo|month|year)|pricey)\b/i,
  ],
  [
    'cant-justify-roi',
    /\b(can'?t justify|no (?:roi|return)|didn'?t (?:help|move the needle|convert)|no (?:new )?(?:fans|sales|streams))\b/i,
  ],
  [
    'subscription-fatigue',
    /\b(another subscription|too many subscriptions|monthly fee|recurring|subscription model|one[- ]time (?:fee|payment|purchase))\b/i,
  ],
  [
    'only-need-basic',
    /\b(just need|only need|all i need|overkill|simple (?:page|link)|basic)\b/i,
  ],
  [
    'churn',
    /\b(cancel(?:l?ed|l?ing)?|unsubscribed from|stopped paying|left (?:for|them)|moving (?:away|off))\b/i,
  ],
  [
    'pricing-opacity',
    /\b(hidden (?:fees?|charges?)|charged? (?:me |my card )?(?:again|twice|without)|charges? (?:my (?:credit )?card )?(?:for nothing|without)|auto[- ]?renew|renew without|never refund|trial (?:charged|ended))\b/i,
  ],
];

const NEGATIVE =
  /\b(hate|terrible|awful|worst|annoying|frustrat|disappoint|useless|garbage|scam|ripoff|rip off|regret|avoid|don'?t (?:bother|recommend)|not worth|overpriced|cancel|refund|broken|doesn'?t work|bad)\b/i;
const POSITIVE =
  /\b(great|love|amazing|excellent|awesome|helpful|thank|perfect|recommend(?! against)|best|fantastic|quick(?:ly)?|super)\b/gi;
const NEGATIVE_ALL = new RegExp(NEGATIVE.source, 'gi');
const SEVERE =
  /\b(scam|banned|suspended|lost (?:all|my)|stole|fraud|refund|charged without|never again|lawsuit)\b/i;

export function classify(text, rating = null) {
  const pains = PAIN_THEMES.filter(([, re]) => re.test(text)).map(([k]) => k);
  const objections = OBJECTION_TYPES.filter(([, re]) => re.test(text)).map(
    ([k]) => k
  );
  const negHits = text.match(NEGATIVE_ALL)?.length ?? 0;
  const posHits = text.match(POSITIVE)?.length ?? 0;
  const negative =
    rating !== null ? rating <= 3 : negHits > 0 && negHits >= posHits;
  if (!negative || (pains.length === 0 && objections.length === 0)) return null;
  const severity =
    SEVERE.test(text) || rating === 1
      ? 3
      : rating === 2 || pains.length + objections.length >= 3
        ? 2
        : 1;
  return { pains, objections, severity };
}

// Keep a short quote: the sentence(s) carrying the strongest signal, <= 280 chars.
export function shortQuote(text, max = 280) {
  const clean = text.replace(/\s+/g, ' ').trim();
  const sentences = clean.split(/(?<=[.!?])\s+/);
  const scored = sentences
    .map(s => ({
      s,
      score:
        [...PAIN_THEMES, ...OBJECTION_TYPES].filter(([, re]) => re.test(s))
          .length + (NEGATIVE.test(s) ? 1 : 0),
    }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const best = scored[0]?.s ?? clean;
  return best.length > max ? `${best.slice(0, max - 1).trimEnd()}…` : best;
}

function itemId(url, quote) {
  return `voc:${createHash('sha256').update(`${url}\n${quote}`).digest('hex').slice(0, 20)}`;
}

export function toItem({
  target,
  url,
  sourceType,
  text,
  rating = null,
  publishedAt = null,
  observedAt,
}) {
  const verdict = classify(text, rating);
  if (!verdict) return null;
  const quote = shortQuote(text);
  return {
    schema: VOC_SCHEMA,
    id: itemId(url, quote),
    targetId: target.id,
    category: target.category,
    sourceType,
    url,
    quote,
    rating,
    publishedAt,
    observedAt,
    painThemes: verdict.pains,
    objectionTypes: verdict.objections,
    severity: verdict.severity,
  };
}

// Scrub real names before anything leaves the private boundary.
export function anonymize(text, targets) {
  let out = text;
  for (const t of targets) {
    for (const alias of [t.name, ...(t.aliases ?? [])]) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), `[${t.id}]`);
    }
  }
  return out;
}

const UA = 'jovie-voc/1 (+https://jov.ie)';

async function getJson(url, init) {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { 'user-agent': UA, ...(init?.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return await res.json();
  } catch {
    // undici connects time out on some macOS hosts where curl succeeds
    // (seen against Apple's and Exa's edges); retry once through curl.
    const args = ['-sfL', '--max-time', '30', '-A', UA];
    for (const [k, v] of Object.entries(init?.headers ?? {}))
      args.push('-H', `${k}: ${v}`);
    if (init?.body)
      args.push('-X', init.method ?? 'POST', '--data-binary', init.body);
    return JSON.parse(
      execFileSync('curl', [...args, url], {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
      })
    );
  }
}

// Apple's public customer-review RSS feed (official, no auth).
async function appStoreReviews(target, observedAt) {
  if (!target.appStoreId) return [];
  const items = [];
  for (const page of [1, 2]) {
    const url = `https://itunes.apple.com/us/rss/customerreviews/page=${page}/id=${target.appStoreId}/sortby=mostrecent/json`;
    const data = await getJson(url).catch(() => null);
    for (const e of data?.feed?.entry ?? []) {
      const rating = Number(e['im:rating']?.label);
      if (!(rating <= 3)) continue;
      const text = `${e.title?.label ?? ''}. ${e.content?.label ?? ''}`;
      const item = toItem({
        target,
        url: `https://apps.apple.com/us/app/id${target.appStoreId}?see-all=reviews#${e.id?.label ?? ''}`,
        sourceType: 'app-store',
        text,
        rating,
        publishedAt: e.updated?.label ?? null,
        observedAt,
      });
      if (item) items.push(item);
    }
  }
  return items;
}

// Hacker News via the official Algolia API.
async function hnComments(target, observedAt, sinceEpoch) {
  const items = [];
  for (const alias of target.aliases.slice(0, 1)) {
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(alias)}&tags=comment&hitsPerPage=40&numericFilters=created_at_i>${sinceEpoch}`;
    const data = await getJson(url).catch(() => null);
    for (const h of data?.hits ?? []) {
      const text = (h.comment_text ?? '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&#x27;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&');
      if (
        !new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(
          text
        )
      )
        continue;
      const item = toItem({
        target,
        url: `https://news.ycombinator.com/item?id=${h.objectID}`,
        sourceType: 'hackernews',
        text,
        publishedAt: h.created_at,
        observedAt,
      });
      if (item) items.push(item);
    }
  }
  return items;
}

// Exa search (licensed index; respects robots). Low per-call cost; key from env.
async function exaSearch(target, observedAt, since, cost) {
  const key = process.env.EXA_API_KEY;
  if (!key) return [];
  const queries = target.queries ?? [
    `${target.name} complaints review problems`,
    `is ${target.name} worth paying for? cancelled subscription free alternative`,
  ];
  const aliases = [target.name, ...(target.aliases ?? [])].map(a =>
    a.toLowerCase()
  );
  const items = [];
  for (const query of queries) {
    const data = await getJson('https://api.exa.ai/search', {
      method: 'POST',
      headers: { 'x-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        query,
        numResults: 8,
        startPublishedDate: since,
        contents: {
          highlights: {
            numSentences: 3,
            highlightsPerUrl: 3,
            query: 'complaint, frustration, or reason not worth paying',
          },
        },
      }),
    }).catch(() => null);
    cost.exa += data?.costDollars?.total ?? 0;
    for (const r of data?.results ?? []) {
      for (const h of r.highlights ?? []) {
        if (!target.queries && !aliases.some(a => h.toLowerCase().includes(a)))
          continue;
        const item = toItem({
          target,
          url: r.url,
          sourceType: sourceTypeFor(r.url),
          text: h,
          publishedAt: r.publishedDate ?? null,
          observedAt,
        });
        if (item) items.push(item);
      }
    }
  }
  return items;
}

// Public review pages fetched through Exa's contents endpoint (cached crawl).
async function trustpilotReviews(target, observedAt, cost) {
  const key = process.env.EXA_API_KEY;
  if (!key || !target.trustpilot) return [];
  const url = `https://www.trustpilot.com/review/${target.trustpilot}`;
  const data = await getJson('https://api.exa.ai/contents', {
    method: 'POST',
    headers: { 'x-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ urls: [url], text: { maxCharacters: 40000 } }),
  }).catch(() => null);
  cost.exa += data?.costDollars?.total ?? 0;
  const text = data?.results?.[0]?.text ?? '';
  return text
    .split(/\n\s*\n/)
    .filter(
      p =>
        p.length > 60 &&
        !/^(#|Based on reviews|We use technology|To protect platform)/.test(p)
    )
    .map(p =>
      toItem({
        target,
        url,
        sourceType: 'trustpilot',
        text: p.replace(/\.\.\. See more$/, '…'),
        observedAt,
      })
    )
    .filter(Boolean);
}

function sourceTypeFor(url) {
  const host = new URL(url).hostname.replace(/^www\./, '');
  if (/reddit\.com$/.test(host)) return 'reddit';
  if (/trustpilot\.com$/.test(host)) return 'trustpilot';
  if (/(g2|capterra|getapp|softwareadvice)\.com$/.test(host))
    return 'review-site';
  if (/youtube\.com|youtu\.be/.test(host)) return 'youtube';
  if (/x\.com|twitter\.com/.test(host)) return 'x';
  return 'web';
}

export function dedupe(items) {
  const seen = new Map();
  for (const it of items) if (!seen.has(it.id)) seen.set(it.id, it);
  return [...seen.values()];
}

// Theme counts per category: the shape the report, persona judge, offer and
// proof consumers read.
export function summarize(items) {
  const out = {};
  for (const it of items) {
    const cat = (out[it.category] ??= { items: 0, pains: {}, objections: {} });
    cat.items += 1;
    for (const p of it.painThemes) cat.pains[p] = (cat.pains[p] ?? 0) + 1;
    for (const o of it.objectionTypes)
      cat.objections[o] = (cat.objections[o] ?? 0) + 1;
  }
  return out;
}

// Brain pages (private store, real names allowed): one dated run page plus an
// index whose trend block accumulates per-run counts so frequency is a series.
export function renderRunPage({ date, items, targets, cost }) {
  const names = Object.fromEntries(targets.map(t => [t.id, t.name]));
  const summary = summarize(items);
  const rows = items
    .slice()
    .sort(
      (a, b) => a.category.localeCompare(b.category) || b.severity - a.severity
    )
    .map(
      it =>
        `| ${it.category} | ${names[it.targetId] ?? it.targetId} | ${it.sourceType} | ${it.severity} | ${[...it.painThemes, ...it.objectionTypes].join(', ')} | ${it.quote.replace(/\|/g, '/')} | ${it.url} |`
    );
  return `---\ntype: receipt\ntitle: VOC run ${date}\ntags: [voc]\n---\n\n# VOC run ${date}\n\nItems: ${items.length}. Exa spend: $${cost.toFixed(3)}. Index: [[ops/voc/index]].\n\n## Summary\n\n\`\`\`json\n${JSON.stringify(summary, null, 1)}\n\`\`\`\n\n## Items\n\n| category | product | source | sev | themes | quote | url |\n|---|---|---|---|---|---|---|\n${rows.join('\n')}\n`;
}

export function renderIndexPage({ date, trend, curated = '' }) {
  const latest = trend.at(-1)?.summary ?? {};
  const lines = Object.entries(latest).map(([cat, v]) => {
    const top = o =>
      Object.entries(o)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k, n]) => `${k} ${n}`)
        .join(', ');
    return `- **${cat}** (${v.items}): pains ${top(v.pains)}; objections ${top(v.objections)}`;
  });
  return `---\ntype: ops\ntitle: Voice of customer index\ntags: [voc]\n---\n\n# Voice of customer index\n\nOwner: voc pipeline (scripts/voc). Complaints and payment objections about the tools Jovie replaces. Private: real product names live here and in [[ops/voc/targets]], never in the repo.\n\nRuns: ${trend.map(t => `[[ops/voc/runs/${t.date}]]`).join(', ')}. Latest: ${date}.\n\n## Curated reports\n\n${curated || '- none yet'}\n\n## Latest top themes\n\n${lines.join('\n')}\n\n## Trend\n\n\`\`\`json voc-trend\n${JSON.stringify(trend, null, 1)}\n\`\`\`\n`;
}

function gbrain(args, input) {
  return execFileSync('gbrain', args, {
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function publishToBrain({ date, items, targets, cost, dir }) {
  const runFile = `${dir}/voc-run-${date}.md`;
  writeFileSync(runFile, renderRunPage({ date, items, targets, cost }));
  gbrain([
    'capture',
    '--file',
    runFile,
    '--slug',
    `ops/voc/runs/${date}`,
    '--type',
    'receipt',
    '--quiet',
  ]);
  let trend = [];
  let curated = '';
  try {
    const prior = gbrain(['get', 'ops/voc/index']);
    trend = JSON.parse(
      prior.match(/```json voc-trend\n([\s\S]*?)\n```/)?.[1] ?? '[]'
    );
    curated = prior.match(/## Curated reports\n\n([\s\S]*?)\n\n## /)?.[1] ?? '';
  } catch {
    // First run: no index yet.
  }
  trend = [
    ...trend.filter(t => t.date !== date),
    { date, summary: summarize(items) },
  ];
  const indexFile = `${dir}/voc-index.md`;
  writeFileSync(indexFile, renderIndexPage({ date, trend, curated }));
  gbrain([
    'capture',
    '--file',
    indexFile,
    '--slug',
    'ops/voc/index',
    '--type',
    'ops',
    '--quiet',
  ]);
}

async function main(argv) {
  const arg = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? fallback : argv[i + 1];
  };
  const targetsPath = arg('targets', null);
  const targetsSrc =
    process.env.VOC_TARGETS_JSON ||
    (targetsPath
      ? readFileSync(targetsPath, 'utf8')
      : gbrain(['get', 'ops/voc/targets']).match(
          /```json voc-targets\n([\s\S]*?)\n```/
        )?.[1]);
  if (!targetsSrc)
    throw new Error(
      'no targets: pass --targets, set VOC_TARGETS_JSON, or write gbrain ops/voc/targets'
    );
  const { targets } = JSON.parse(targetsSrc);
  const days = Number(arg('days', '365'));
  const only = arg('category', null);
  const sources = new Set(
    arg('sources', 'appstore,hn,exa,trustpilot').split(',')
  );
  const observedAt = new Date().toISOString();
  const since = new Date(Date.now() - days * 864e5);
  const cost = { exa: 0 };
  const all = [];
  for (const target of targets.filter(t => !only || t.category === only)) {
    const batches = await Promise.all([
      sources.has('appstore') ? appStoreReviews(target, observedAt) : [],
      sources.has('hn')
        ? hnComments(target, observedAt, Math.floor(since.getTime() / 1000))
        : [],
      sources.has('exa')
        ? exaSearch(target, observedAt, since.toISOString(), cost)
        : [],
      sources.has('trustpilot')
        ? trustpilotReviews(target, observedAt, cost)
        : [],
    ]);
    const found = batches.flat();
    process.stderr.write(`${target.id}: ${found.length}\n`);
    all.push(...found);
  }
  const raw = dedupe(all);
  const privateOut = arg('private-out', null);
  if (privateOut)
    writeFileSync(
      privateOut,
      `${raw.map(it => JSON.stringify(it)).join('\n')}\n`
    );
  const items = raw.map(it => ({ ...it, quote: anonymize(it.quote, targets) }));
  const out = arg('out', null);
  const payload = items.map(it => JSON.stringify(it)).join('\n');
  if (out) writeFileSync(out, `${payload}\n`);
  else process.stdout.write(`${payload}\n`);
  if (argv.includes('--gbrain')) {
    publishToBrain({
      date: observedAt.slice(0, 10),
      items: raw,
      targets,
      cost: cost.exa,
      dir: arg('work-dir', '.'),
    });
  }
  process.stderr.write(
    `${JSON.stringify({ items: items.length, exaDollars: Number(cost.exa.toFixed(3)), summary: summarize(items) })}\n`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(err => {
    process.stderr.write(`${err.stack ?? err}\n`);
    process.exit(1);
  });
}
