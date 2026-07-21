/**
 * Server-side gate for the showTopInsights chat tool.
 *
 * The model still decides when to call the tool, but this guard prevents the
 * "Top signals" card from rendering on turns that are clearly not about
 * performance / growth / audience signals (e.g. AWAL, legal, bio edits).
 */

const PERFORMANCE_SIGNAL_PATTERN =
  /\b(audience|growth|signal|signals|subscriber|subscribers|fans?|metric|metrics|performance|analytics?|insight|insights|momentum|conversion|monetiz(?:e|ation|ing)?|tipping|tips?|engagement|stats?|numbers|trending|reach|listeners?|followers?|what(?:'s| is) working|what to focus|focus on(?: next)?|how am i doing|how(?:'s| is) my|show (?:me )?(?:my )?(?:top )?signals|top insights)\b/i;

/**
 * Topics that commonly trigger opportunistic tool calls but are not signal
 * surfaces. Only blocks when no performance keyword is also present.
 */
const UNRELATED_TOPIC_PATTERN =
  /\b(awal|distribution deal|distro|label deal|publishing deal|contract|legal|lawyer|avatar|profile photo|retouch|album art|canvas|teleprompter|merch(?:andise)? design|write (?:a |my )?bio|import (?:my )?bio|instagram link|add my (?:link|instagram|spotify|tiktok)|billing|cancel(?:lation)?|refund|password|sign ?in|oauth)\b/i;

/**
 * Returns true when the latest user turn is about performance signals.
 * Empty / whitespace-only turns are treated as not relevant.
 */
export function isShowTopInsightsTurnRelevant(userText: string): boolean {
  const text = userText.trim();
  if (!text) {
    return false;
  }

  const mentionsPerformance = PERFORMANCE_SIGNAL_PATTERN.test(text);
  if (mentionsPerformance) {
    return true;
  }

  // Explicitly unrelated career/ops questions must not surface the card.
  if (UNRELATED_TOPIC_PATTERN.test(text)) {
    return false;
  }

  // Default closed: only fire when the turn clearly asks about signals.
  return false;
}
