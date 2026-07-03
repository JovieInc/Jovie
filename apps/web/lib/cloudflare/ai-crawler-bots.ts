/** Canonical AI crawlers surfaced in the artist dashboard (matches robots.ts allowlist). */
export interface AiCrawlerBotDefinition {
  readonly id: string;
  readonly name: string;
  readonly userAgentPattern: string;
}

export const TRACKED_AI_CRAWLER_BOTS: readonly AiCrawlerBotDefinition[] = [
  { id: 'gptbot', name: 'GPTBot', userAgentPattern: 'GPTBot' },
  { id: 'chatgpt-user', name: 'ChatGPT-User', userAgentPattern: 'ChatGPT-User' },
  {
    id: 'claude-web',
    name: 'Claude-Web',
    userAgentPattern: 'Claude-Web',
  },
  {
    id: 'claudebot',
    name: 'ClaudeBot',
    userAgentPattern: 'ClaudeBot',
  },
  {
    id: 'perplexitybot',
    name: 'PerplexityBot',
    userAgentPattern: 'PerplexityBot',
  },
  {
    id: 'google-extended',
    name: 'Google-Extended',
    userAgentPattern: 'Google-Extended',
  },
] as const;

export function matchAiCrawlerFromUserAgent(
  userAgent: string | null | undefined
): AiCrawlerBotDefinition | null {
  if (!userAgent) {
    return null;
  }

  for (const bot of TRACKED_AI_CRAWLER_BOTS) {
    if (userAgent.includes(bot.userAgentPattern)) {
      return bot;
    }
  }

  return null;
}