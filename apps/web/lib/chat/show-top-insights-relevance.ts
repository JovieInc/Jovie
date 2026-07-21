/**
 * Server-side gate for the showTopInsights chat tool.
 *
 * The model still decides when to call the tool, but this guard prevents the
 * "Top signals" card from rendering unless the turn is clearly about
 * performance / growth / audience signals.
 */

const PERFORMANCE_SIGNAL_PATTERN =
  /\b(audience|growth|signal|signals|subscriber|subscribers|fans?|metric|metrics|performance|analytics?|insight|insights|momentum|conversion|monetiz(?:e|ation|ing)?|tipping|tips?|engagement|stats?|numbers|trending|reach|listeners?|followers?|what(?:'s| is) working|what to focus|focus on(?: next)?|how am i doing|how(?:'s| is) my|show (?:me )?(?:my )?(?:top )?signals|top insights)\b/i;

/**
 * Returns true when the latest user turn is about performance signals.
 * Empty / whitespace-only turns are treated as not relevant.
 * Fail closed: only fire when the turn clearly asks about signals.
 */
export function isShowTopInsightsTurnRelevant(userText: string): boolean {
  const text = userText.trim();
  if (!text) {
    return false;
  }
  return PERFORMANCE_SIGNAL_PATTERN.test(text);
}
