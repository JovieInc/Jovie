/**
 * AI Email Classifier — categorizes inbound emails using Claude Haiku.
 *
 * Uses the AI-suggest hybrid pattern: AI proposes a category and territory,
 * but the artist confirms before routing happens. This prevents misroutes
 * and builds training data for future automation.
 */

import { gateway } from '@ai-sdk/gateway';
import { generateObject } from 'ai';
import { z } from 'zod';
import { CHAT_MODEL_LIGHT } from '@/lib/constants/ai-models';
import { logger } from '@/lib/utils/logger';

/** Zod schema for AI classification output. */
const classificationSchema = z.object({
  category: z.enum([
    'booking',
    'music_collaboration',
    'brand_partnership',
    'management',
    'fan_mail',
    'personal',
    'press',
    'business',
    'spam',
    'other',
  ]),
  territory: z.string().nullable(),
  priority: z.enum(['high', 'medium', 'low']),
  summary: z.string(),
  extractedData: z.object({
    senderOrganization: z.string().optional(),
    senderRole: z.string().optional(),
    proposedDates: z.array(z.string()).optional(),
    budgetMentioned: z.string().optional(),
    venueOrLocation: z.string().optional(),
    requestType: z.string().optional(),
  }),
  confidence: z.number().min(0).max(1),
});

export type EmailClassification = z.infer<typeof classificationSchema>;

interface ClassificationInput {
  fromEmail: string;
  fromName: string | null;
  subject: string | null;
  bodyText: string | null;
  artistName: string;
  artistGenres: string[] | null;
  artistLocation?: string | null;
}

/**
 * Classify an inbound email using Claude Haiku.
 * Returns null if classification fails (timeout, bad response, etc.).
 * The caller should handle null by showing the thread as "uncategorized".
 */
export async function classifyEmail(
  input: ClassificationInput
): Promise<EmailClassification | null> {
  try {
    const result = await generateObject({
      model: gateway(CHAT_MODEL_LIGHT),
      schema: classificationSchema,
      prompt: buildClassificationPrompt(input),
      maxOutputTokens: 500,
    });

    return result.object;
  } catch (error) {
    logger.error('Email classification failed', {
      error: error instanceof Error ? error.message : String(error),
      fromEmail: input.fromEmail,
      subject: input.subject,
    });
    return null;
  }
}

function buildClassificationPrompt(input: ClassificationInput): string {
  const senderInfo = input.fromName
    ? `${input.fromName} <${input.fromEmail}>`
    : input.fromEmail;

  const artistContext = [
    `Artist: ${input.artistName}`,
    input.artistGenres?.length
      ? `Genres: ${input.artistGenres.join(', ')}`
      : null,
    input.artistLocation ? `Location: ${input.artistLocation}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return `You are classifying an inbound email sent to a music artist's professional email address.

${artistContext}

EMAIL:
From: ${senderInfo}
Subject: ${input.subject ?? '(no subject)'}

Body:
${(input.bodyText ?? '').slice(0, 3000)}

Classify this email into one of these categories:
- booking: Someone wants to book the artist for a live performance, DJ set, festival, etc.
- music_collaboration: Another artist, songwriter, or producer wants to collaborate on music (features, remixes, production, co-writing)
- brand_partnership: A brand or company wants a sponsorship, endorsement, or promotional deal
- management: Management-related business (contracts, legal, accounting, general business inquiries)
- fan_mail: A fan reaching out to express appreciation, ask a question, or request something
- personal: A personal message from someone the artist likely knows (friend, family, colleague)
- press: Media, journalists, bloggers, podcasters requesting an interview or press coverage
- business: General business inquiry that doesn't fit other categories
- spam: Unsolicited marketing, scams, or irrelevant messages
- other: Doesn't fit any category

Also extract:
- territory: The geographic region relevant to the inquiry (e.g., "USA", "North America", "Europe", "UK"). Null if not determinable.
- priority: high (time-sensitive, high-value), medium (standard inquiry), low (informational, can wait)
- summary: 1-2 sentence summary of the email
- extractedData: Any structured information you can pull from the email (sender organization, proposed dates, budget, venue/location, request type, sender's role/title)
- confidence: Your confidence in the classification (0-1)

Be concise. Extract the sender's organization and role from their email signature or body text if present.`;
}
