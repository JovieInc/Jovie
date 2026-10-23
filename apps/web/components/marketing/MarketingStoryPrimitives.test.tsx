import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import {
  ArtistNotificationFloatingCardView,
  ArtistProfileReactivationVisual,
} from './MarketingStoryPrimitives';

describe('MarketingStoryPrimitives', () => {
  it.each(ARTIST_NOTIFICATIONS_COPY.hero.floatingCards)(
    'rounds the $kind card and preserves its copy',
    card => {
      const { container } = render(
        <ArtistNotificationFloatingCardView card={card} />
      );

      expect(container.firstElementChild).toHaveClass('rounded-xl');
      expect(screen.getByText(card.title)).toBeVisible();
      if ('detail' in card) expect(screen.getByText(card.detail)).toBeVisible();
    }
  );

  it('rounds notification, workflow, and outcome cards without dropping reactivation steps', () => {
    const { capture, reactivation } = ARTIST_PROFILE_COPY;
    const { container } = render(
      <ArtistProfileReactivationVisual
        notification={capture.notification}
        reactivation={reactivation}
      />
    );

    expect(container.firstElementChild?.firstElementChild).toHaveClass(
      'rounded-3xl'
    );
    expect(screen.getByText(capture.notification.title)).toBeVisible();
    expect(
      screen.getByText(capture.notification.title).closest('.rounded-2xl')
    ).not.toBeNull();
    expect(container.querySelectorAll('article')).toHaveLength(
      reactivation.workflow.rows.length + reactivation.outputs.length
    );
    for (const output of reactivation.outputs) {
      expect(screen.getByText(output.title).closest('article')).toHaveClass(
        'rounded-2xl'
      );
      expect(screen.getByText(output.destination)).toBeVisible();
    }
    for (const row of reactivation.workflow.rows) {
      expect(screen.getByText(row.trigger).closest('article')).toHaveClass(
        'rounded-3xl'
      );
    }
  });
});
