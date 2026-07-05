export type WhatShippedItem = {
  readonly number: number;
  readonly title: string;
  readonly merged_at: string;
  readonly url: string;
};

export type WhatShippedResponse = {
  readonly available: boolean;
  readonly generatedAt: string | null;
  readonly items: readonly WhatShippedItem[];
};
