/**
 * Canonical AI crawlers surfaced in the artist dashboard (mirrors the exact
 * robots.ts allowlist and the guardrail-check token classes, JOV-7259).
 *
 * Search crawlers (OAI-SearchBot, Claude-SearchBot, PerplexityBot) are the
 * citability class the site explicitly welcomes; training/control tokens
 * (GPTBot, ClaudeBot, Google-Extended, Applebot-Extended) and the
 * user-triggered fetcher (ChatGPT-User) are tracked for observability;
 * legacy grants (Claude-Web, Anthropic-AI) keep their existing analytics
 * identity. The tracked set is exactly the granted set — no ungranted token
 * is observed and no granted token goes unobserved.
 */
export interface AiCrawlerBotDefinition {
  readonly id: string;
  readonly name: string;
  readonly userAgentPattern: string;
}

export const TRACKED_AI_CRAWLER_BOTS: readonly AiCrawlerBotDefinition[] = [
  // Search crawlers — answer-engine citation traffic.
  {
    id: 'oai-searchbot',
    name: 'OAI-SearchBot',
    userAgentPattern: 'OAI-SearchBot',
  },
  {
    id: 'claude-searchbot',
    name: 'Claude-SearchBot',
    userAgentPattern: 'Claude-SearchBot',
  },
  {
    id: 'perplexitybot',
    name: 'PerplexityBot',
    userAgentPattern: 'PerplexityBot',
  },
  // Training/control tokens — explicitly allowed, tracked for observability.
  { id: 'gptbot', name: 'GPTBot', userAgentPattern: 'GPTBot' },
  { id: 'claudebot', name: 'ClaudeBot', userAgentPattern: 'ClaudeBot' },
  {
    id: 'google-extended',
    name: 'Google-Extended',
    userAgentPattern: 'Google-Extended',
  },
  {
    id: 'applebot-extended',
    name: 'Applebot-Extended',
    userAgentPattern: 'Applebot-Extended',
  },
  // User-triggered fetchers.
  {
    id: 'chatgpt-user',
    name: 'ChatGPT-User',
    userAgentPattern: 'ChatGPT-User',
  },
  // Legacy grants (JOV-7259 AI_LEGACY_TOKENS) — preserved, not newly granted.
  {
    id: 'claude-web',
    name: 'Claude-Web',
    userAgentPattern: 'Claude-Web',
  },
  {
    id: 'anthropic-ai',
    name: 'Anthropic-AI',
    userAgentPattern: 'Anthropic-AI',
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
