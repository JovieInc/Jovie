import 'server-only';
import { z } from 'zod';
import { gateway, generateText } from '@/lib/ai/sdk';
import { CHAT_MODEL_LIGHT } from '@/lib/constants/ai-models';
import type {
  InterviewSummaryStructured,
  InterviewTranscriptEntry,
} from '@/lib/db/schema/user-interviews';
import { withTimeout } from '@/lib/resilience/primitives';

const REQUEST_TIMEOUT_MS = 30_000;
const MODEL_ID = CHAT_MODEL_LIGHT;

const SUMMARY_SCHEMA = z.object({
  one_line_summary: z.string().min(1).max(400),
  top_pain_points: z.array(z.string().min(1)).max(5),
  current_alternatives: z.array(z.string().min(1)).max(10),
  quotable_line: z.string().min(0).max(400),
});

function extractJson(text: string): string {
  const fenceStart = text.indexOf('```');
  if (fenceStart >= 0) {
    const contentStart = text.indexOf('\n', fenceStart + 3);
    const fenceEnd =
      contentStart >= 0 ? text.indexOf('```', contentStart + 1) : -1;
    if (contentStart >= 0 && fenceEnd > contentStart) {
      return text.slice(contentStart + 1, fenceEnd).trim();
    }
  }

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
  const prompt = buildPrompt(transcript);

  const result = await withTimeout(
    generateText({
      model: gateway(MODEL_ID),
      maxOutputTokens: 800,
      prompt,
    }),
    {
      timeoutMs: REQUEST_TIMEOUT_MS + 1_000,
      context: 'summarizeInterview',
    }
  );

  const responseText = result.text;
  if (!responseText) {
    throw new Error('No text response from model');
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
