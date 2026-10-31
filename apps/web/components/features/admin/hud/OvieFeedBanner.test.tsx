import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fullscreenFeedStatus } from '@/lib/ovie/home/fullscreen-mode';
import { OvieFeedBanner } from './OvieFeedBanner';

const NOW = 1_800_000_000_000;
describe('OvieFeedBanner', () => {
  for (const [updatedAtMs, message] of [
    [NOW, null],
    [NOW - 120_000, 'Data stale: revenue 2m'],
    [null, 'Data down: revenue never loaded'],
  ] as const) {
    it(`reports feed state ${message ?? 'live'}`, () => {
      const status = fullscreenFeedStatus(
        [{ id: 'revenue', updatedAtMs, pollMs: 30_000 }],
        NOW
      );
      render(<OvieFeedBanner status={status} />);
      if (message) expect(screen.getByRole('alert')).toHaveTextContent(message);
      else expect(screen.queryByRole('alert')).toBeNull();
    });
  }
});
