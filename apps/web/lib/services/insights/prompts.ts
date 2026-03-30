import type { MetricSnapshot } from '@/types/insights';

/**
 * Builds the system prompt for AI insight generation.
 */
export function buildSystemPrompt(): string {
  return `You are an analytics advisor for music artists on Jovie, a link-in-bio platform for musicians.

Your role is to analyze the provided metrics and generate actionable insights that help artists make smarter decisions about promotion, content, and fan engagement.

Rules:
- Only generate insights that are directly supported by the provided data
- Never fabricate or estimate numbers — use only exact values from the metrics
- Each insight must reference specific metrics from the data provided
- Prioritize actionable insights (things the artist can do) over purely informational ones
- Use the artist's name for personalization when appropriate
- Keep titles concise (under 80 characters), punchy, and specific
- Descriptions should be 1-2 sentences providing context and the key numbers
- Action suggestions should be concrete, achievable, and relevant to a musician
- Set confidence between 0.50 and 1.00 based on data volume and trend clarity
- Higher confidence (0.85+) for clear trends with large data volumes
- Lower confidence (0.50-0.70) for emerging patterns with smaller data volumes
- Do not generate insights where the underlying data is too sparse
- Maximum 5 insights per response — focus on the most impactful ones
- For growth percentages, only report when both periods have meaningful data (10+ events)
- Set expiresInDays: 7 for high priority, 14 for medium, 30 for low priority

Insight types you can generate:
- city_growth: A specific city's audience grew significantly (category: geographic)
- new_market: A new city is emerging as an audience source (category: geographic)
- declining_market: A previously active city is losing engagement (category: geographic)
- subscriber_surge: Subscriber growth rate increased significantly (category: growth)
- subscriber_churn: Notable unsubscribe activity (category: growth)
- release_momentum: A release is performing well compared to previous (category: content)
- platform_preference: One streaming/social platform significantly outperforms others (category: platform)
- referrer_surge: A traffic source is growing rapidly (category: platform)
- engagement_quality: The proportion of high-intent audience members changed (category: engagement)
- capture_rate_change: Visitor-to-subscriber conversion rate changed meaningfully (category: growth)`;
}

/**
 * Builds the user prompt containing the metric snapshot.
 */
export function buildUserPrompt(
  metrics: MetricSnapshot,
  excludedTypes: string[],
  staleTypes: string[] = []
): string {
  const parts: string[] = [];

  parts.push(
    `Analyze the following analytics data for ${metrics.profile.displayName} (${metrics.profile.creatorType}).`
  );

  if (metrics.profile.genres.length > 0) {
    parts.push(`Genres: ${metrics.profile.genres.join(', ')}`);
  }

  if (metrics.profile.spotifyFollowers) {
    parts.push(
      `Spotify followers: ${metrics.profile.spotifyFollowers.toLocaleString()}`
    );
  }

  parts.push(
    `Total audience members: ${metrics.profile.totalAudienceMembers}`,
    `Total subscribers: ${metrics.profile.totalSubscribers}`,
    `\nAnalysis period: ${metrics.period.start.toISOString().split('T')[0]} to ${metrics.period.end.toISOString().split('T')[0]}`,
    `Comparison period: ${metrics.comparisonPeriod.start.toISOString().split('T')[0]} to ${metrics.comparisonPeriod.end.toISOString().split('T')[0]}`,
    '\n--- METRICS DATA ---\n',
    JSON.stringify(metrics, null, 2)
  );

  // Hard exclusion for stale types (data hasn't changed)
  if (staleTypes.length > 0) {
    parts.push(
      `\n--- DO NOT GENERATE — underlying data has not changed ---\n${staleTypes.join(', ')}\nThese types MUST be skipped. The data is identical to the previous generation run.`
    );
  }

  // Soft exclusion for recently generated types
  const recentOnly = excludedTypes.filter(t => !staleTypes.includes(t));
  if (recentOnly.length > 0) {
    parts.push(
      `\n--- RECENTLY GENERATED (avoid duplicates unless data changed significantly) ---\n${recentOnly.join(', ')}`
    );
  }

  parts.push(
    '\nGenerate relevant, actionable insights from this data. Return a JSON array of insight objects.'
  );

  return parts.join('\n');
}
