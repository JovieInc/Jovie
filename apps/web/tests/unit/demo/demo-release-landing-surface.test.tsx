import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface CapturedCreditEntry {
  readonly name: string;
  readonly handle: string | null;
}

interface CapturedCreditGroup {
  readonly entries: readonly CapturedCreditEntry[];
}

interface CapturedReleaseLandingProps {
  readonly artist: {
    readonly name: string;
    readonly handle: string;
    readonly avatarUrl: string | null;
  };
  readonly credits?: readonly CapturedCreditGroup[];
  readonly release: {
    readonly title: string;
  };
  readonly soundsUrl?: string;
}

let capturedProps: CapturedReleaseLandingProps | null = null;

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/features/demo/DemoClientProviders', () => ({
  DemoClientProviders: ({
    children,
  }: {
    readonly children: React.ReactNode;
  }) => <>{children}</>,
}));

vi.mock('@/app/r/[slug]/ReleaseLandingPage', () => ({
  ReleaseLandingPage: (props: CapturedReleaseLandingProps) => {
    capturedProps = props;
    return (
      <div data-testid='release-landing-page'>
        {props.artist.name} - {props.release.title}
      </div>
    );
  },
}));

const { DemoReleaseLandingSurface } = await import(
  '@/features/demo/DemoReleaseLandingSurface'
);

describe('DemoReleaseLandingSurface', () => {
  beforeEach(() => {
    capturedProps = null;
  });

  it('uses the Calvin demo persona without founder or Clementine credits', () => {
    render(<DemoReleaseLandingSurface />);

    expect(screen.getByTestId('release-landing-page')).toHaveTextContent(
      "Calvin Harris - I'm Not Alone Remixes"
    );
    expect(capturedProps?.artist).toMatchObject({
      name: 'Calvin Harris',
      handle: 'calvin-demo',
    });
    expect(capturedProps?.soundsUrl).toBe(
      '/calvin-demo/im-not-alone-remixes/sounds'
    );

    const renderedPayload = JSON.stringify(capturedProps);
    expect(renderedPayload).not.toContain('Tim White');
    expect(renderedPayload).not.toContain('Blessings');
    expect(renderedPayload).not.toContain('Clementine Douglas');
  });
});
