// Ask Jovie intent classifier (JOV-6569).
// Routes lightweight contextual-chat messages into a structured demand signal:
// support problems, feature requests, education questions, task intent, and
// general feedback are captured distinctly so unmet needs are measurable.

export const ASK_JOVIE_INTENTS = [
  'education',
  'support',
  'task',
  'feature-request',
  'feedback',
] as const;

export type AskJovieIntent = (typeof ASK_JOVIE_INTENTS)[number];

export interface AskJovieSuggestion {
  readonly id: string;
  readonly label: string;
  readonly intent: AskJovieIntent;
}

/** Suggested prompts shown when the Ask Jovie surface opens. */
export const ASK_JOVIE_SUGGESTIONS: readonly AskJovieSuggestion[] = [
  { id: 'walkthrough', label: 'Show me how to use Jovie', intent: 'education' },
  { id: 'help', label: 'Get help', intent: 'support' },
  { id: 'feedback', label: 'Send feedback', intent: 'feedback' },
  {
    id: 'feature-request',
    label: 'Request a feature',
    intent: 'feature-request',
  },
];

const FEATURE_REQUEST_PATTERN =
  /\b(feature request|request a feature|wish|would be nice|can jovie do|does jovie support|is there a way to|add support|missing)\b/i;
const SUPPORT_PATTERN =
  /\b(broken|bug|error|crash|not working|doesn'?t work|won'?t|can'?t|fail|stuck|issue|problem|help|troubleshoot|wrong)\b/i;
const EDUCATION_PATTERN =
  /\b(how (do|to|can|does)|what is|what does|explain|show me|walkthrough|walk me|guide|learn|tutorial|where (do|is|can))\b/i;
const FEEDBACK_PATTERN =
  /\b(feedback|love|hate|confusing|suggestion|opinion|thoughts?)\b/i;
const TASK_PATTERN =
  /\b(create|make|add|set up|setup|schedule|send|publish|generate|upload|update|change|edit|remove|delete|connect|import|export|draft|write)\b/i;

/**
 * Classify a free-text Ask Jovie message. Order matters: capability questions
 * ("can Jovie do X") are demand for features before they read as support.
 */
export function classifyAskJovieIntent(text: string): AskJovieIntent {
  const normalized = text.trim();
  if (FEATURE_REQUEST_PATTERN.test(normalized)) return 'feature-request';
  if (SUPPORT_PATTERN.test(normalized)) return 'support';
  if (EDUCATION_PATTERN.test(normalized)) return 'education';
  if (FEEDBACK_PATTERN.test(normalized)) return 'feedback';
  if (TASK_PATTERN.test(normalized)) return 'task';
  return 'feedback';
}
