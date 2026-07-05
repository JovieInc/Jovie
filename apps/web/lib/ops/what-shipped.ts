import 'server-only';

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { WhatShippedResponse } from '@/types/what-shipped';

const whatShippedItemSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().min(1),
  merged_at: z.string().min(1),
  url: z.string().url(),
});

const whatShippedFileSchema = z.object({
  generated_at: z.string().optional(),
  items: z.array(whatShippedItemSchema).default([]),
});

export type {
  WhatShippedItem,
  WhatShippedResponse,
} from '@/types/what-shipped';

export function resolveWhatShippedFilePath(): string {
  const hermesHome = process.env.HERMES_HOME ?? join(homedir(), '.hermes');
  return join(hermesHome, 'state', 'what_shipped.json');
}

export async function readWhatShippedFeed(
  filePath: string = resolveWhatShippedFilePath()
): Promise<WhatShippedResponse> {
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = whatShippedFileSchema.safeParse(JSON.parse(raw));

    if (!parsed.success) {
      return { available: false, generatedAt: null, items: [] };
    }

    return {
      available: true,
      generatedAt: parsed.data.generated_at ?? null,
      items: parsed.data.items,
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'ENOENT') {
      return { available: false, generatedAt: null, items: [] };
    }
    throw error;
  }
}
