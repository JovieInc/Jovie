/**
 * Conversational Q&A over channel-intelligence reports (JOV-3193).
 *
 * Answers "what are my best videos / what's working / what's declining"
 * from structured Reporting-API metrics with explicit sources.
 */

import type {
  ChannelIntelligenceAnswer,
  ChannelIntelligenceReport,
  ChannelQuestionIntent,
  MetricSource,
} from './types';

const INTENT_PATTERNS: readonly {
  readonly intent: ChannelQuestionIntent;
  readonly patterns: readonly RegExp[];
}[] = [
  {
    intent: 'best_videos',
    patterns: [
      /\bbest\s+videos?\b/i,
      /\btop\s+videos?\b/i,
      /\bhighest\s+(?:performing|watch)\b/i,
      /\bwhich\s+videos?\s+(?:work|perform|win)\b/i,
      /\bmy\s+best\b/i,
    ],
  },
  {
    intent: 'worst_videos',
    patterns: [
      /\bworst\s+videos?\b/i,
      /\bbottom\s+videos?\b/i,
      /\blowest\s+(?:performing|watch)\b/i,
      /\bunderperform/i,
    ],
  },
  {
    intent: 'whats_working',
    patterns: [
      /\bwhat(?:'s|s|\s+is)\s+working\b/i,
      /\bwhat\s+works\b/i,
      /\bwhat\s+correlates\b/i,
      /\bface\s+vs\b/i,
      /\bpackaging\s+(?:wins|rules|insights)\b/i,
      /\bthumbnail\s+(?:patterns?|insights?)\b/i,
    ],
  },
  {
    intent: 'whats_declining',
    patterns: [
      /\bwhat(?:'s|s|\s+is)\s+declin/i,
      /\bdeclining\b/i,
      /\blosing\s+(?:reach|views|steam)\b/i,
      /\breach\s+(?:down|drop|falling)\b/i,
    ],
  },
  {
    intent: 'channel_overview',
    patterns: [
      /\bchannel\s+(?:report|intelligence|performance|overview)\b/i,
      /\bhow\s+(?:is|are)\s+(?:my\s+)?channel\b/i,
      /\bchannel\s+health\b/i,
    ],
  },
];

/**
 * Detects channel-intelligence intent from free-text chat.
 * Returns null when the turn is not about channel video performance.
 */
export function detectChannelQuestionIntent(
  text: string
): ChannelQuestionIntent | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  for (const entry of INTENT_PATTERNS) {
    if (entry.patterns.some(re => re.test(trimmed))) {
      return entry.intent;
    }
  }
  return null;
}

function formatWmpi(value: number): string {
  if (value >= 1) return value.toFixed(2);
  if (value >= 0.01) return value.toFixed(3);
  return value.toFixed(4);
}

function formatLift(lift: number): string {
  const pct = lift * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(0)}%`;
}

function videoListSummary(
  videos: ChannelIntelligenceReport['rankedVideos'],
  limit: number
): string {
  if (videos.length === 0) return 'No ranked videos yet.';
  return videos
    .slice(0, limit)
    .map(
      (v, i) =>
        `${i + 1}. "${v.title}" (WMPI ${formatWmpi(v.watchMinutesPerImpression)}, CTR ${(v.ctr * 100).toFixed(1)}%)`
    )
    .join(' ');
}

function findingsSummary(
  findings: ChannelIntelligenceReport['correlations'],
  limit: number
): string {
  if (findings.length === 0) {
    return 'Not enough per-segment data yet to name packaging winners on this channel.';
  }
  return findings
    .slice(0, limit)
    .map(
      f =>
        `${f.segment}: ${formatLift(f.liftVsChannel)} vs channel mean (n=${f.sampleSize}, ${f.confidence} confidence)`
    )
    .join('; ');
}

function collectSources(
  report: ChannelIntelligenceReport,
  extra: readonly MetricSource[] = []
): MetricSource[] {
  const seen = new Set<string>();
  const out: MetricSource[] = [];
  for (const s of [...report.sources, ...extra]) {
    const key = `${s.kind}:${s.label}:${s.detail ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

const EMPTY_SOURCES: MetricSource[] = [
  {
    kind: 'youtube_reporting_api',
    label: 'YouTube Reporting API',
    detail: 'No channel metrics available — connect YouTube OAuth',
  },
];

/**
 * Answers a channel-intelligence question from a built report.
 * Always attaches sources; never invents metrics.
 */
export function answerChannelQuestion(
  report: ChannelIntelligenceReport | null,
  intent: ChannelQuestionIntent
): ChannelIntelligenceAnswer {
  if (!report || report.videoCount === 0) {
    return {
      intent,
      summary:
        'Connect your YouTube channel to answer this from real Reporting API metrics. Ranking uses watch minutes per impression — not CTR alone.',
      rankedVideos: [],
      findings: [],
      sources: EMPTY_SOURCES,
      hasData: false,
    };
  }

  switch (intent) {
    case 'best_videos': {
      const top = report.rankedVideos.slice(0, 5);
      return {
        intent,
        summary: `Top videos by watch minutes per impression (not CTR alone). Channel mean WMPI ${formatWmpi(report.channelMeanWmpi)}. ${videoListSummary(top, 5)}`,
        rankedVideos: top,
        findings: [],
        sources: collectSources(report),
        hasData: true,
      };
    }
    case 'worst_videos': {
      const bottom = [...report.rankedVideos].reverse().slice(0, 5);
      return {
        intent,
        summary: `Lowest videos by watch minutes per impression. ${videoListSummary(bottom, 5)}`,
        rankedVideos: bottom,
        findings: [],
        sources: collectSources(report),
        hasData: true,
      };
    }
    case 'whats_working': {
      const works = report.whatWorks;
      return {
        intent,
        summary: `What correlates with wins on this channel: ${findingsSummary(works, 5)}`,
        rankedVideos: report.rankedVideos.slice(0, 3),
        findings: works,
        sources: collectSources(
          report,
          works.flatMap(f => f.sources)
        ),
        hasData: true,
      };
    }
    case 'whats_declining': {
      const declining = report.declining.slice(0, 5);
      return {
        intent,
        summary:
          declining.length === 0
            ? 'No videos currently show a meaningful reach decline (trend below −10%).'
            : `Videos with declining reach: ${videoListSummary(declining, 5)}`,
        rankedVideos: declining,
        findings: [],
        sources: collectSources(report),
        hasData: true,
      };
    }
    case 'channel_overview': {
      return {
        intent,
        summary: `Channel intelligence: ${report.videoCount} videos ranked by watch minutes per impression (mean ${formatWmpi(report.channelMeanWmpi)}). What works: ${findingsSummary(report.whatWorks, 3)}. Declining: ${report.declining.length} video${report.declining.length === 1 ? '' : 's'}.`,
        rankedVideos: report.rankedVideos.slice(0, 5),
        findings: report.whatWorks,
        sources: collectSources(report),
        hasData: true,
      };
    }
  }
}

/**
 * Convenience: detect intent from free text and answer.
 * Returns null when the text is not a channel-intelligence question.
 */
export function answerChannelQuestionFromText(
  report: ChannelIntelligenceReport | null,
  text: string
): ChannelIntelligenceAnswer | null {
  const intent = detectChannelQuestionIntent(text);
  if (!intent) return null;
  return answerChannelQuestion(report, intent);
}
