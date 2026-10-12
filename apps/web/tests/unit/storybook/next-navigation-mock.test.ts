import { describe, expect, it } from 'vitest';
import {
  useParams,
  useRouter,
  useSearchParams,
} from '@/.storybook/next-navigation-mock';

describe('storybook next/navigation mock', () => {
  it('returns referentially stable instances like Next does', () => {
    // Effects that depend on these looped forever when each call minted a
    // new object (ReleaseCountdown, PreSaveActions, ScheduledReleasePage).
    expect(useRouter()).toBe(useRouter());
    expect(useSearchParams()).toBe(useSearchParams());
    expect(useParams()).toBe(useParams());
  });
});
