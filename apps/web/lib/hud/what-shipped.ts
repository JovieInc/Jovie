import 'server-only';

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

const whatShippedItemSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().min(1),
  merged_at: z.string().min(1),
  url: z.string().url(),
});

const whatShippedFileSchema = z.object({
  generated_at: z.string().optional(),
  items: z.array(whatShippedItemSchema),
});

export type WhatShippedItem = z.infer<typeof whatShippedItemSchema>;

export interface WhatShippedResponse {
  readonly generatedAt: string | null;
  readonly items: readonly WhatShippedItem[];
  readonly available: boolean;
}

export const WHAT_SHIPPED_STATE_PATH = join(
  homedir(),
  '.hermes',
  'state',
  'what_shipped.json'
);

export const EMPTY_WHAT_SHIPPED_RESPONSE: WhatShippedResponse = {
  generatedAt: null,
  items: [],
  available: false,
};

export async function readWhatShippedFromDisk(
  filePath: string = WHAT_SHIPPED_STATE_PATH
): Promise<WhatShippedResponse> {
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = whatShippedFileSchema.safeParse(JSON.parse(raw));

    if (!parsed.success) {
      return EMPTY_WHAT_SHIPPED_RESPONSE;
    }

    return {
      generatedAt: parsed.data.generated_at ?? null,
      items: parsed.data.items,
      available: true,
    };
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? error.code
        : undefined;

    if (code === 'ENOENT') {
      return EMPTY_WHAT_SHIPPED_RESPONSE;
    }

    throw error;
  }
}
