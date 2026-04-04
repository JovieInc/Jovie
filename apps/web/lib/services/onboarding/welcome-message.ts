/**
 * Welcome Message Builder
 *
 * Constructs the first assistant message for new artists after onboarding.
 * Extracted from the welcome-chat API route for testability.
 */

function formatCount(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

export interface WelcomeMessageParams {
  displayName: string;
  releaseCount: number;
  trackCount: number;
  dspCount: number;
  socialCount: number;
  careerHighlights: string | null;
}

export function buildWelcomeMessage({
  displayName,
  releaseCount,
  trackCount,
  dspCount,
  socialCount,
  careerHighlights,
}: WelcomeMessageParams) {
  const resolvedName = displayName.trim() || 'there';
  const musicSummary =
    trackCount > 0
      ? formatCount(trackCount, 'track')
      : formatCount(releaseCount, 'release');

  const lines = [
    `Welcome to Jovie, ${resolvedName}.`,
    `I can already see ${musicSummary}, ${formatCount(dspCount, 'connected DSP')}, and ${formatCount(socialCount, 'active social link')}.`,
  ];

  if (!careerHighlights?.trim()) {
    lines.push(
      'If you share your career highlights — streaming milestones, press coverage, playlist placements — I can write sharper pitches for you.'
    );
  }

  lines.push('What would you like to work on first?');
  return lines.join(' ');
}
