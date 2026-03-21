/**
 * Knowledge Canon — Distill Script
 *
 * Reads QA-passed raw content from .cache/, groups by topic,
 * curates the top articles per topic, and synthesizes them into
 * authoritative reference guides via Claude Sonnet.
 *
 * Usage: doppler run -- pnpm tsx scripts/knowledge/distill.ts
 *
 * Requires: .cache/ populated by fetch.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CACHE_DIR = join(__dirname, '.cache');
const TOPICS_DIR = join(__dirname, 'topics');
const MANIFEST_PATH = join(CACHE_DIR, 'manifest.json');
const MAX_ARTICLES_PER_TOPIC = 25;

// ---------------------------------------------------------------------------
// Topic taxonomy with keyword matching
// ---------------------------------------------------------------------------

interface TopicDef {
  id: string;
  title: string;
  filename: string;
  keywords: string[];
  description: string;
}

const TOPICS: TopicDef[] = [
  {
    id: 'release-strategy',
    title: 'Release Strategy',
    filename: 'release-strategy.md',
    keywords: [
      'release',
      'pre-save',
      'countdown',
      'launch',
      'drop',
      'schedule',
      'timeline',
      'lead time',
      'release date',
      'friday',
      'new music',
      'release radar',
      'pre-release',
      'album release',
      'single release',
      'release plan',
      'music release',
      'dropping',
      'announce',
    ],
    description:
      'Timing, pre-save campaigns, release scheduling, countdown pages, lead times',
  },
  {
    id: 'playlist-strategy',
    title: 'Playlist Strategy',
    filename: 'playlist-strategy.md',
    keywords: [
      'playlist',
      'editorial',
      'algorithmic',
      'pitch',
      'pitching',
      'discover weekly',
      'release radar',
      'curated',
      'submission',
      'playlist placement',
      'playlist pitch',
      'editorial playlist',
      'user-generated playlist',
      'featured playlist',
    ],
    description:
      'Editorial vs. algorithmic playlists, pitching best practices, timing',
  },
  {
    id: 'streaming-metrics',
    title: 'Streaming Metrics',
    filename: 'streaming-metrics.md',
    keywords: [
      'stream',
      'streams',
      'listener',
      'listeners',
      'follower',
      'followers',
      'popularity',
      'analytics',
      'metrics',
      'monthly listeners',
      'stream count',
      'play count',
      '30 seconds',
      'algorithm',
      'engagement',
      'saves',
      'skip rate',
      'completion rate',
    ],
    description:
      'How streams are counted, popularity signals, listener analytics, algorithmic signals',
  },
  {
    id: 'profile-optimization',
    title: 'Profile Optimization',
    filename: 'profile-optimization.md',
    keywords: [
      'profile',
      'canvas',
      'marquee',
      'artist pick',
      'gallery',
      'bio',
      'header image',
      'clips',
      'short-form video',
      'avatar',
      'branding',
      'visual',
      'artwork',
      'banner',
      'about',
      'featured',
      'showcase',
      'spotlight',
    ],
    description:
      'Visual assets, short-form video, featured content, bio, profile presentation',
  },
  {
    id: 'marketing-promotion',
    title: 'Marketing & Promotion',
    filename: 'marketing-promotion.md',
    keywords: [
      'marketing',
      'promotion',
      'social media',
      'content',
      'fan',
      'engagement',
      'instagram',
      'tiktok',
      'twitter',
      'facebook',
      'advertising',
      'ad',
      'campaign',
      'discovery mode',
      'press',
      'pr',
      'blog',
      'influencer',
      'viral',
      'growth',
      'audience',
      'email',
      'newsletter',
      'community',
    ],
    description:
      'Social strategy, content creation, fan engagement, paid promotion, Discovery Mode',
  },
  {
    id: 'distribution-basics',
    title: 'Distribution Basics',
    filename: 'distribution-basics.md',
    keywords: [
      'distribution',
      'distributor',
      'aggregator',
      'metadata',
      'isrc',
      'upc',
      'ean',
      'upload',
      'deliver',
      'delivery',
      'digital distribution',
      'store',
      'platform',
      'encoding',
      'format',
      'wav',
      'flac',
      'mp3',
      'audio quality',
      'specs',
      'submission',
      'catalog',
      'label',
      'independent',
    ],
    description:
      'How distribution works, aggregators, metadata standards, ISRC/UPC, delivery specs',
  },
  {
    id: 'monetization',
    title: 'Monetization',
    filename: 'monetization.md',
    keywords: [
      'royalty',
      'royalties',
      'revenue',
      'income',
      'payment',
      'payout',
      'per stream',
      'sync',
      'licensing',
      'merch',
      'merchandise',
      'touring',
      'live',
      'concert',
      'brand deal',
      'sponsorship',
      'fan support',
      'tipping',
      'subscription',
      'earn',
      'money',
    ],
    description:
      'Streaming economics, sync licensing, merch, fan support, revenue math',
  },
  {
    id: 'music-rights',
    title: 'Music Rights',
    filename: 'music-rights.md',
    keywords: [
      'copyright',
      'publishing',
      'master',
      'composition',
      'split',
      'splits',
      'songwriter',
      'producer',
      'rights',
      'license',
      'mechanical',
      'performance',
      'pro',
      'ascap',
      'bmi',
      'sesac',
      'ownership',
      'clearance',
      'sample',
      'cover',
      'interpolation',
    ],
    description:
      'Copyright, publishing, master vs. composition, splits, mechanical rights',
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ManifestEntry {
  id: string;
  url: string;
  source: string;
  fetchedAt: string;
  qaStatus?: 'passed' | 'dropped';
  qaReason?: string;
}

interface ScoredArticle {
  id: string;
  content: string;
  score: number;
  wordCount: number;
}

// ---------------------------------------------------------------------------
// Topic Classification & Curation
// ---------------------------------------------------------------------------

function scoreArticleForTopic(content: string, topic: TopicDef): number {
  const lower = content.toLowerCase();
  let score = 0;

  for (const keyword of topic.keywords) {
    const regex = new RegExp(
      `\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
      'gi'
    );
    const matches = lower.match(regex);
    if (matches) {
      score += matches.length;
    }
  }

  // Bonus for longer, more substantive articles
  const wordCount = content.split(/\s+/).length;
  if (wordCount > 500) score += 2;
  if (wordCount > 1000) score += 3;
  if (wordCount > 2000) score += 5;

  return score;
}

function classifyAndCurate(
  articles: Map<string, string>
): Map<string, ScoredArticle[]> {
  const topicArticles = new Map<string, ScoredArticle[]>();

  for (const topic of TOPICS) {
    const scored: ScoredArticle[] = [];

    for (const [id, content] of articles) {
      const score = scoreArticleForTopic(content, topic);
      if (score > 0) {
        scored.push({
          id,
          content,
          score,
          wordCount: content.split(/\s+/).length,
        });
      }
    }

    // Sort by score descending, take top N
    scored.sort((a, b) => b.score - a.score);
    const curated = scored.slice(0, MAX_ARTICLES_PER_TOPIC);

    topicArticles.set(topic.id, curated);

    console.log(
      `  ${topic.id}: ${scored.length} relevant articles, selected top ${curated.length} (best score: ${curated[0]?.score ?? 0})`
    );
  }

  return topicArticles;
}

// ---------------------------------------------------------------------------
// Distillation via AI Gateway
// ---------------------------------------------------------------------------

function buildDistillationPrompt(
  topic: TopicDef,
  articles: ScoredArticle[]
): string {
  const articleTexts = articles
    .map(
      (a, i) => `--- Article ${i + 1} (${a.wordCount} words) ---\n${a.content}`
    )
    .join('\n\n');

  return `You are synthesizing music industry knowledge into an authoritative reference guide for an AI assistant that advises independent artists.

## Your Task

Distill the following ${articles.length} articles about "${topic.title}" into a single comprehensive reference document.

## Critical Rules

1. **Strip all provenance.** No source URLs, no "according to...", no "per the help center", no dashboard UI instructions ("click here", "navigate to Settings"), no marketing fluff, no cross-links. The output must read as an original reference guide with no trace of where the information came from.

2. **Preserve meaning, depth, and specificity.** Rewrite in your own voice — same facts, same detail level, different phrasing. Never pad, never thin out, never generalize specific numbers into vague advice. Every threshold, timeline, mechanic, and rule must survive intact.

3. **Keep platform names when they ARE the content.** "Spotify counts a stream after 30 seconds" — the platform name is a fact, not a source citation. Keep it. But remove platform-specific dashboard tool names that only exist on one platform's interface.

4. **When sources disagree or overlap**, keep the most precise and complete version. Do not average or hedge — pick the richer explanation.

5. **Do NOT compress for the sake of compression.** If a passage is already information-dense, rewrite it in your own voice but keep the same depth. Only cut genuinely useless content: marketing fluff, SEO filler, repetitive CTAs, "click here to learn more" instructions.

## Output Format

\`\`\`markdown
# ${topic.title}

[1-2 sentence overview of why this matters for independent artists]

## [Subsection Title]
[Content organized by what artists need to know and do]

## [Subsection Title]
...

## Key Takeaways
- [Actionable bullet points — specific, not generic]
\`\`\`

No frontmatter, no metadata, no timestamps, no source attribution. Voice: direct, professional, actionable.

## Source Material

${articleTexts}`;
}

async function distillTopic(
  topic: TopicDef,
  articles: ScoredArticle[]
): Promise<string> {
  if (articles.length === 0) {
    console.warn(`  [skip] No articles for ${topic.id}`);
    return '';
  }

  const prompt = buildDistillationPrompt(topic, articles);

  // Calculate approximate token count (rough: 4 chars per token)
  const approxTokens = Math.round(prompt.length / 4);
  console.log(
    `  Distilling ${topic.id}: ${articles.length} articles, ~${approxTokens.toLocaleString()} tokens input`
  );

  const apiKey =
    process.env.ANTHROPIC_API_KEY ?? process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Missing API credentials. Set ANTHROPIC_API_KEY or AI_GATEWAY_API_KEY via Doppler.'
    );
  }

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16384,
    temperature: 0.3,
    messages: [{ role: 'user', content: prompt }],
  });

  const block = response.content.find(b => b.type === 'text');
  return block && 'text' in block ? block.text : '';
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

const PROVENANCE_PATTERNS = [
  /https?:\/\//gi,
  /\.com\//gi,
  /\.org\//gi,
  /help center/gi,
  /support page/gi,
  /click here/gi,
  /learn more at/gi,
  /according to/gi,
  /as stated by/gi,
  /navigate to/gi,
  /in your dashboard/gi,
  /per the/gi,
];

function checkForProvenanceLeaks(content: string, topicId: string): string[] {
  const leaks: string[] = [];

  for (const pattern of PROVENANCE_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      for (const match of matches) {
        leaks.push(`[${topicId}] Found provenance term: "${match}"`);
      }
    }
  }

  return leaks;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== Knowledge Canon — Distill ===\n');

  // Check prerequisites
  if (!existsSync(MANIFEST_PATH)) {
    console.error('No manifest found. Run fetch.ts first.');
    process.exit(1);
  }

  const manifest: ManifestEntry[] = JSON.parse(
    readFileSync(MANIFEST_PATH, 'utf-8')
  );
  const passedEntries = manifest.filter(e => e.qaStatus === 'passed');

  if (passedEntries.length === 0) {
    console.error('No QA-passed content found. Check fetch.ts output.');
    process.exit(1);
  }

  console.log(`Loading ${passedEntries.length} QA-passed articles...\n`);

  // Load all passed articles
  const articles = new Map<string, string>();
  for (const entry of passedEntries) {
    const filePath = join(CACHE_DIR, `${entry.id}.txt`);
    if (existsSync(filePath)) {
      articles.set(entry.id, readFileSync(filePath, 'utf-8'));
    }
  }

  console.log(`Loaded ${articles.size} articles\n`);

  // Classify and curate
  console.log('Classifying articles by topic...');
  const topicArticles = classifyAndCurate(articles);

  // Ensure topics directory exists
  mkdirSync(TOPICS_DIR, { recursive: true });

  // Distill each topic
  console.log('\nDistilling topics...\n');

  const allLeaks: string[] = [];
  let successCount = 0;
  let skipCount = 0;

  for (const topic of TOPICS) {
    const outPath = join(TOPICS_DIR, topic.filename);

    // Skip already-distilled topics (resume support)
    if (existsSync(outPath)) {
      const existingContent = readFileSync(outPath, 'utf-8');
      if (existingContent.length > 100) {
        console.log(
          `  [skip] ${topic.id}: already distilled (${existingContent.split(/\s+/).length} words)`
        );
        successCount++;
        continue;
      }
    }

    const curated = topicArticles.get(topic.id) ?? [];

    if (curated.length === 0) {
      console.log(`  [skip] ${topic.id}: no relevant articles found`);
      skipCount++;
      continue;
    }

    try {
      const output = await distillTopic(topic, curated);

      if (!output || output.length < 100) {
        console.warn(
          `  [warn] ${topic.id}: distillation produced empty/short output`
        );
        skipCount++;
        continue;
      }

      // Strip markdown code fences if the model wrapped the output
      let cleanOutput = output;
      if (cleanOutput.startsWith('```markdown')) {
        cleanOutput = cleanOutput.slice('```markdown'.length);
      }
      if (cleanOutput.startsWith('```')) {
        cleanOutput = cleanOutput.slice(3);
      }
      if (cleanOutput.endsWith('```')) {
        cleanOutput = cleanOutput.slice(0, -3);
      }
      cleanOutput = cleanOutput.trim();

      // Check for provenance leaks
      const leaks = checkForProvenanceLeaks(cleanOutput, topic.id);
      allLeaks.push(...leaks);

      // Write output
      writeFileSync(outPath, `${cleanOutput}\n`);
      console.log(
        `  [done] ${topic.id} -> ${topic.filename} (${cleanOutput.split(/\s+/).length} words)`
      );
      successCount++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`  [error] ${topic.id}: ${errMsg}`);
      if (err instanceof Error && err.stack) {
        console.error(
          `    ${err.stack.split('\n').slice(0, 3).join('\n    ')}`
        );
      }
    }

    // Brief pause between API calls
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Report
  console.log('\n=== Distillation Summary ===');
  console.log(`  Topics distilled: ${successCount}`);
  console.log(`  Topics skipped:   ${skipCount}`);
  console.log(`  Output directory:  ${TOPICS_DIR}`);

  if (allLeaks.length > 0) {
    console.warn(`\n[WARNING] ${allLeaks.length} provenance leaks detected:`);
    for (const leak of allLeaks) {
      console.warn(`  ${leak}`);
    }
    console.warn(
      '\nReview the output files and manually clean provenance terms.'
    );
  } else {
    console.log('\n[OK] No provenance leaks detected');
  }

  // Clean up cache only on full success
  if (successCount === TOPICS.length) {
    console.log('\nCleaning up .cache/ directory...');
    try {
      await rm(CACHE_DIR, { recursive: true, force: true });
      console.log('[OK] Cache cleaned');
    } catch (err) {
      console.warn(`[warn] Failed to clean cache: ${(err as Error).message}`);
    }
  } else {
    console.log(
      `\n[info] Cache preserved at ${CACHE_DIR} (not all topics succeeded — re-run to retry)`
    );
  }

  console.log('\n=== Done ===');
  console.log(
    'Review the topic files in scripts/knowledge/topics/ for accuracy.'
  );
  console.log(
    'Run: grep -riE "(help center|support page|click here|learn more at|according to|per the|as stated by|navigate to|in your dashboard|https?://|\\.com/|\\.org/)" scripts/knowledge/topics/'
  );
}

main().catch(err => {
  console.error('Fatal error:', err);
  console.log(`Cache preserved at ${CACHE_DIR} for debugging.`);
  process.exit(1);
});
