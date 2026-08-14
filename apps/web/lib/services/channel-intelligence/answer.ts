/**
 * Answer conversational channel-intelligence questions from a report.
 *
 * Handles: best videos / worst videos / what's working / what's declining.
 * Every answer carries MetricSource citations from Reporting-API data.
 */

import type {
  AnswerChannelIntelligenceQueryInput,
  ChannelIntelligenceAnswer,
  ChannelIntelligenceIntent,
  ChannelIntelligenceReport,
  MetricSource,
} from './types';

const DEFAULT_ANSWER_LIMIT = 5;

const BEST_PATTERN =
  /\b(best|top|highest|winning|strongest)\b.*\b(video|upload|content)?s?\b|\bwhat('?s| is) (my )?(best|top)\b/i;
const WORST_PATTERN =
  /\b(worst|bottom|lowest|weakest|underperform)\b|\bwhat('?s| is) (my )?(worst|bottom)\b/i;
const WORKING_PATTERN =
  /\bwhat('?s| is) working\b|\bwhat works\b|\bcorrelat|\bface vs\b|\bpackaging\b|\bwhat (drives|wins)\b/i;
const DECLINING_PATTERN =
  /\bdeclin|\bdropping|\bfalling|\blosing (reach|views|impressions)\b|\bwhat('?s| is) (getting )?worse\b/i;

/**
 * Classify a free-text question into a channel-intelligence intent.
 */
export function classifyChannelIntelligenceIntent(
  question: string
): ChannelIntelligenceIntent {
  const q = question.trim();
  if (!q) return 'unknown';

  // More specific patterns first
  if (DECLINING_PATTERN.test(q)) return 'whats_declining';
  if (WORKING_PATTERN.test(q)) return 'whats_working';
  if (WORST_PATTERN.test(q)) return 'worst_videos';
  if (BEST_PATTERN.test(q)) return 'best_videos';

  // Loose aliases Tim / creators actually say
  if (/\bbest videos?\b/i.test(q)) return 'best_videos';
  if (/\bworst videos?\b/i.test(q)) return 'worst_videos';
  if (/\bworking\b/i.test(q)) return 'whats_working';

  return 'unknown';
}

function pickSources(
  report: ChannelIntelligenceReport,
  videoIds: readonly string[]
): MetricSource[] {
  if (videoIds.length === 0) {
    return report.sources.slice(0, 2);
  }
  return report.sources.map(source => ({
    ...source,
    videoIds:
      source.videoIds && source.videoIds.length > 0
        ? source.videoIds.filter(id => videoIds.includes(id))
        : videoIds,
  }));
}

function formatWmpi(value: number): string {
  return value.toFixed(3);
}

function summarizeBest(
  report: ChannelIntelligenceReport,
  limit: number
): ChannelIntelligenceAnswer {
  const ranked = report.bestVideos.slice(0, limit);
  if (ranked.length === 0) {
    return {
      intent: 'best_videos',
      summary:
        'No rankable videos yet. Connect YouTube analytics and wait for Reporting API rows with ≥100 impressions.',
      rankedVideos: [],
      winSignals: [],
      sources: report.sources,
    };
  }

  const lines = ranked.map(
    (v, i) =>
      `${i + 1}. “${v.title}” — ${formatWmpi(v.watchMinutesPerImpression)} watch-min/impression (CTR ${(v.ctr * 100).toFixed(1)}%, AVD ${Math.round(v.avgViewDurationSeconds)}s)`
  );

  return {
    intent: 'best_videos',
    summary: `Your best videos by watch-minutes-per-impression (not CTR alone):\n${lines.join('\n')}`,
    rankedVideos: ranked,
    winSignals: [],
    sources: pickSources(
      report,
      ranked.map(v => v.videoId)
    ),
  };
}

function summarizeWorst(
  report: ChannelIntelligenceReport,
  limit: number
): ChannelIntelligenceAnswer {
  const ranked = report.worstVideos.slice(0, limit);
  if (ranked.length === 0) {
    return {
      intent: 'worst_videos',
      summary:
        'No rankable videos yet. Need Reporting API metrics with enough impressions to score underperformers.',
      rankedVideos: [],
      winSignals: [],
      sources: report.sources,
    };
  }

  const lines = ranked.map(
    (v, i) =>
      `${i + 1}. “${v.title}” — ${formatWmpi(v.watchMinutesPerImpression)} watch-min/impression (CTR ${(v.ctr * 100).toFixed(1)}%, AVD ${Math.round(v.avgViewDurationSeconds)}s)`
  );

  return {
    intent: 'worst_videos',
    summary: `Your weakest videos by watch-minutes-per-impression:\n${lines.join('\n')}`,
    rankedVideos: ranked,
    winSignals: [],
    sources: pickSources(
      report,
      ranked.map(v => v.videoId)
    ),
  };
}

function summarizeWorking(
  report: ChannelIntelligenceReport
): ChannelIntelligenceAnswer {
  if (report.winSignals.length === 0) {
    return {
      intent: 'whats_working',
      summary:
        'Not enough packaging variety yet to correlate wins on this channel. Tag face/text/topic/length attributes or run packaging experiments so the learning layer can override niche priors.',
      rankedVideos: report.bestVideos.slice(0, 3),
      winSignals: [],
      sources: report.sources,
    };
  }

  const planLines = report.changePlan.map(
    item =>
      `${item.priority}. ${item.action} — ${item.observation} [${item.evidenceTier}]`
  );
  const lines = report.winSignals.map(
    (s, i) =>
      `${i + 1}. ${s.summary} (confidence: ${s.confidence}, n=${s.sampleSize})`
  );

  return {
    intent: 'whats_working',
    summary: `Prioritized change plan (not a score):\n${planLines.join('\n')}\n\nWhat correlates with wins on this channel:\n${lines.join('\n')}`,
    rankedVideos: report.bestVideos.slice(0, 3),
    winSignals: report.winSignals,
    sources: [
      ...report.sources.filter(
        s =>
          s.kind === 'youtube_reporting_api' ||
          s.kind === 'learning_layer' ||
          s.kind === 'derived'
      ),
      ...report.winSignals.map(s => s.source),
    ],
  };
}

function summarizeDeclining(
  report: ChannelIntelligenceReport,
  limit: number
): ChannelIntelligenceAnswer {
  const ranked = report.decliningVideos.slice(0, limit);
  if (ranked.length === 0) {
    return {
      intent: 'whats_declining',
      summary:
        'No videos are currently declining in reach by the channel threshold. Reach trend is flat or growing on rankable uploads.',
      rankedVideos: [],
      winSignals: [],
      sources: report.sources,
    };
  }

  const lines = ranked.map(
    (v, i) =>
      `${i + 1}. “${v.title}” — reach ${(v.reachTrend * 100).toFixed(0)}%, WMPI ${formatWmpi(v.watchMinutesPerImpression)}`
  );

  return {
    intent: 'whats_declining',
    summary: `Videos losing reach:\n${lines.join('\n')}`,
    rankedVideos: ranked,
    winSignals: [],
    sources: pickSources(
      report,
      ranked.map(v => v.videoId)
    ),
  };
}

/**
 * Answer a natural-language channel question from a pre-built report.
 * Always returns sources grounded in Reporting-API / derived metrics.
 */
export function answerChannelIntelligenceQuery(
  input: AnswerChannelIntelligenceQueryInput
): ChannelIntelligenceAnswer {
  const limit = input.listLimit ?? DEFAULT_ANSWER_LIMIT;
  const intent = classifyChannelIntelligenceIntent(input.question);

  switch (intent) {
    case 'best_videos':
      return summarizeBest(input.report, limit);
    case 'worst_videos':
      return summarizeWorst(input.report, limit);
    case 'whats_working':
      return summarizeWorking(input.report);
    case 'whats_declining':
      return summarizeDeclining(input.report, limit);
    default:
      return {
        intent: 'unknown',
        summary: input.report.changePlan.length
          ? `Prioritized change plan (not a score):\n${input.report.changePlan
              .map(
                item =>
                  `${item.priority}. ${item.action} — ${item.observation} [${item.evidenceTier}]`
              )
              .join('\n')}`
          : 'Ask about your best or worst videos, what is working on this channel, or what is declining. Answers use watch-minutes-per-impression from YouTube Reporting API data.',
        rankedVideos: input.report.bestVideos.slice(0, 3),
        winSignals: input.report.winSignals.slice(0, 2),
        sources: input.report.sources,
      };
  }
}
