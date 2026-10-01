import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  matchAiCrawlerFromUserAgent,
  TRACKED_AI_CRAWLER_BOTS,
} from '@/lib/cloudflare/ai-crawler-bots';
import {
  AI_LEGACY_TOKENS,
  AI_SEARCH_CRAWLERS,
  AI_TRAINING_TOKENS,
  AI_USER_FETCHERS,
} from '@/lib/seo/guardrail-check';

const webRoot = process.cwd();

function readWebSource(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), 'utf8');
}

describe('tracked AI crawler coverage mirrors the robots.txt policy (JOV-6265)', () => {
  it('tracks every crawler token the robots policy grants', () => {
    // The dashboard analytics tracker must observe the same agents the
    // robots.txt allowlist welcomes (guardrail-check token classes,
    // JOV-7259). An allowed-but-untracked crawler is invisible analytics.
    const granted = [
      ...AI_SEARCH_CRAWLERS,
      ...AI_TRAINING_TOKENS,
      ...AI_USER_FETCHERS,
      ...AI_LEGACY_TOKENS,
    ];
    const trackedPatterns = TRACKED_AI_CRAWLER_BOTS.map(
      bot => bot.userAgentPattern
    );

    for (const token of granted) {
      expect(
        trackedPatterns,
        `robots.txt grants ${token} but the dashboard tracker does not observe it`
      ).toContain(token);
    }
  });

  it('does not track crawler tokens the robots policy does not grant', () => {
    // Deliberate-red fixture: an ungranted or invented crawler token in the
    // tracker (a capability claim the site's robots policy does not make)
    // fails here — the tracked set is the granted set, no more.
    const robotsSource = readWebSource('app/robots.ts');
    for (const bot of TRACKED_AI_CRAWLER_BOTS) {
      expect(
        robotsSource,
        `tracker observes ${bot.userAgentPattern} but robots.ts does not grant it`
      ).toContain(bot.userAgentPattern);
    }
  });

  it('attributes current search/fetch user agents to a tracked bot', () => {
    // Before the fix the official search crawlers (OAI-SearchBot,
    // Claude-SearchBot) fell through to untracked — the exact regression
    // class this change repairs. User agents are the documented official
    // example strings.
    expect(
      matchAiCrawlerFromUserAgent(
        'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot'
      )?.id
    ).toBe('oai-searchbot');
    expect(
      matchAiCrawlerFromUserAgent(
        'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; Claude-SearchBot/1.0'
      )?.id
    ).toBe('claude-searchbot');
    expect(
      matchAiCrawlerFromUserAgent(
        'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot'
      )?.id
    ).toBe('chatgpt-user');
    expect(matchAiCrawlerFromUserAgent('some-unknown-agent/1.0')).toBeNull();
    expect(matchAiCrawlerFromUserAgent(null)).toBeNull();
  });

  it('keeps tracking legacy grants under their existing analytics identity', () => {
    // JOV-7259 preserves Claude-Web and Anthropic-AI as legacy grants; the
    // tracker must keep observing them rather than dropping them.
    expect(matchAiCrawlerFromUserAgent('Claude-Web/1.0')?.id).toBe(
      'claude-web'
    );
    expect(matchAiCrawlerFromUserAgent('Anthropic-AI/1.0')?.id).toBe(
      'anthropic-ai'
    );
  });

  it('observes the Apple training-control grant the robots policy makes', () => {
    // Applebot-Extended is granted by robots.ts (training-control class) but
    // was missing from the tracker before this change.
    expect(
      matchAiCrawlerFromUserAgent('Mozilla/5.0 Applebot-Extended/1.0')?.id
    ).toBe('applebot-extended');
  });
});
