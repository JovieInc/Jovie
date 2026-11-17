import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  AudiencePill,
  AudienceRail,
  CaptureActionPill,
  DEMO_SUBSCRIBE_EMAIL,
  getAudienceRailAccentIndex,
} from './captureShared';

const CAPTURE = ARTIST_NOTIFICATIONS_COPY.capture;
const PILLS = CAPTURE.audienceRails[0];

describe('captureShared certificate', () => {
  it.each(['idle', 'typing', 'submitting', 'done'] as const)(
    'renders the %s action pill axe-clean',
    async phase => {
      const { container } = render(
        <CaptureActionPill capture={CAPTURE} phase={phase} />
      );

      expect(container.querySelector('.ap-capture-action')).toHaveAttribute(
        'data-phase',
        phase
      );
      if (phase === 'done')
        expect(
          screen.getByText(CAPTURE.action.confirmedLabel)
        ).toBeInTheDocument();
      else if (phase === 'idle')
        expect(screen.getByText(CAPTURE.action.detail)).toBeInTheDocument();
      else expect(screen.getByText(DEMO_SUBSCRIBE_EMAIL)).toBeInTheDocument();
      await expectNoA11yViolations(container);
    }
  );

  it('renders a pill as a list item with its rotating accent', async () => {
    const { container } = render(
      <ul>
        <AudiencePill accentIndex={9} pill={PILLS[0]} />
      </ul>
    );

    expect(screen.getByRole('listitem')).toHaveAttribute('data-accent', '1');
    expect(screen.getByText(PILLS[0].sentence)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('doubles a rail for its loop and hides it from assistive tech', async () => {
    const { container } = render(
      <AudienceRail direction='right' railIndex={1} pills={PILLS} />
    );

    const mask = container.querySelector('.artist-profile-audience-mask');
    expect(mask).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('li')).toHaveLength(PILLS.length * 2);
    expect(
      container.querySelector('.artist-profile-audience-rail-reverse')
    ).not.toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders an empty rail with no pills', async () => {
    const { container } = render(
      <AudienceRail direction='left' railIndex={0} pills={[]} />
    );

    expect(container.querySelectorAll('li')).toHaveLength(0);
    await expectNoA11yViolations(container);
  });

  it('wraps accent sequences by rail and pill index', () => {
    expect(getAudienceRailAccentIndex(0, 0)).toBe(0);
    expect(getAudienceRailAccentIndex(1, 1)).toBe(6);
    expect(getAudienceRailAccentIndex(3, 8)).toBe(0);
  });

  it('renders Arabic pill copy right to left', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <CaptureActionPill
          capture={{
            ...CAPTURE,
            action: { ...CAPTURE.action, ctaLabel: 'اشترك' },
          }}
          phase='idle'
        />
      </div>
    );

    expect(screen.getByText('اشترك')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
