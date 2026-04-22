import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type {
  InterviewSummaryStructured,
  InterviewTranscriptEntry,
} from '@/lib/db/schema/user-interviews';
import { withTimeout } from '@/lib/resilience/primitives';

const ANTHROPIC_REQUEST_TIMEOUT_MS = 30_000;
const MODEL_ID = 'claude-haiku-4-5-20251001';

const SUMMARY_SCHEMA = z.object({
  one_line_summary: z.string().min(1).max(400),
  top_pain_points: z.array(z.string().min(1)).max(5),
  current_alternatives: z.array(z.string().min(1)).max(10),
  quotable_line: z.string().min(0).max(400),
});

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return text.trim();
}

function renderTranscript(transcript: InterviewTranscriptEntry[]): string {
  return transcript
    .map((entry, idx) => {
      const answer = entry.skipped
        ? '[skipped]'
        : (entry.answer?.trim() ?? '[empty]');
      return `Q${idx + 1} (${entry.questionId}): ${entry.prompt}\nA${idx + 1}: ${answer}`;
    })
    .join('\n\n');
}

function buildPrompt(transcript: InterviewTranscriptEntry[]): string {
  return `You are helping a founder review a short user interview with a musician who just signed up for Jovie (an artist profile and link-in-bio tool). This is a Mom Test interview — past-behavior only, no hypotheticals. Produce a concise, honest summary to inform product decisions.

Return ONLY a single JSON object (no prose, no code fences) with this exact shape:
{
  "one_line_summary": "...",
  "top_pain_points": ["...", "..."],
  "current_alternatives": ["...", "..."],
  "quotable_line": "..."
}

Rules:
- one_line_summary: 1 sentence describing the artist + their link-sharing situation.
- top_pain_points: up to 3 concrete pains the artist actually described. Skip generic complaints.
- current_alternatives: tools/methods they currently use (Linktree, DMs, Instagram bio, etc.). Empty array if unstated.
- quotable_line: the single most vivid phrase the artist used, verbatim. Empty string if nothing stood out.
- Do not invent details not in the transcript.

Transcript:
${renderTranscript(transcript)}`;
}

export interface SummarizeResult {
  readonly structured: InterviewSummaryStructured;
  readonly summaryText: string;
}

export async function summarizeInterview(
  transcript: InterviewTranscriptEntry[]
): Promise<SummarizeResult> {
  const anthropic = new Anthropic();
  const prompt = buildPrompt(transcript);

  const message = await withTimeout(
    anthropic.messages.create(
      {
        model: MODEL_ID,
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      },
      { timeout: ANTHROPIC_REQUEST_TIMEOUT_MS }
    ),
    {
      timeoutMs: ANTHROPIC_REQUEST_TIMEOUT_MS + 1_000,
      context: 'Anthropic summarizeInterview',
    }
  );

  const textBlock = message.content.find(block => block.type === 'text');
  const responseText = textBlock?.type === 'text' ? textBlock.text : null;
  if (!responseText) {
    throw new Error('No text response from Claude');
  }

  const parsed = JSON.parse(extractJson(responseText));
  const structured = SUMMARY_SCHEMA.parse(parsed);

  const summaryText = [
    structured.one_line_summary,
    structured.top_pain_points.length > 0
      ? `Pain points: ${structured.top_pain_points.join('; ')}`
      : null,
    structured.current_alternatives.length > 0
      ? `Alternatives: ${structured.current_alternatives.join(', ')}`
      : null,
    structured.quotable_line ? `Quote: "${structured.quotable_line}"` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return { structured, summaryText };
}
