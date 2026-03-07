import 'server-only';

interface PriorityScoreParams {
  releaseCount: number;
  spotifyPopularity: number;
  latestReleaseDate: Date | null;
}

export function computePriorityScore(params: PriorityScoreParams): number {
  const { releaseCount, spotifyPopularity, latestReleaseDate } = params;
  let score = releaseCount * (1 - spotifyPopularity / 100);

  if (latestReleaseDate) {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
    if (latestReleaseDate >= twelveMonthsAgo) {
      score *= 1.25;
    }
  }

  return Math.round(score * 100) / 100;
}
