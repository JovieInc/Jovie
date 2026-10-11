import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { CaptureActionPill } from './captureShared';

describe('CaptureActionPill demonstration states', () => {
  it('shows typed example input and submission without a real form control', () => {
    const { container, rerender } = render(
      <CaptureActionPill capture={ARTIST_PROFILE_COPY.capture} phase='typing' />
    );
    expect(screen.getByText('ava@icloud.com')).toBeVisible();
    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
    rerender(
      <CaptureActionPill
        capture={ARTIST_PROFILE_COPY.capture}
        phase='submitting'
      />
    );
    expect(container.querySelector('[data-phase="submitting"]')).not.toBeNull();
    expect(
      screen.queryByText(ARTIST_PROFILE_COPY.capture.action.confirmedLabel)
    ).toBeNull();
  });
  it('keeps the illustration confirmation readable without a decorative status check', () => {
    const { container } = render(
      <CaptureActionPill capture={ARTIST_PROFILE_COPY.capture} phase='done' />
    );
    expect(
      screen.getByText(ARTIST_PROFILE_COPY.capture.action.confirmedLabel)
    ).toBeVisible();
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
});
