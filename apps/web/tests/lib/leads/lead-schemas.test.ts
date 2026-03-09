import { describe, expect, it } from 'vitest';
import { leadListQuerySchema } from '@/lib/validation/lead-schemas';

describe('leadListQuerySchema', () => {
  it('accepts priorityScore as a valid sortBy option', () => {
    const parsed = leadListQuerySchema.parse({ sortBy: 'priorityScore' });
    expect(parsed.sortBy).toBe('priorityScore');
  });
});
