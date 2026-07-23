import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CinematicAppBoot } from './CinematicAppBoot';

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: vi.fn(() => false),
}));

vi.mock('@/components/organisms/AppShellSkeleton', () => ({
  AppShellSkeleton: ({
    main,
    audioPlayer,
    brandVariant,
  }: {
    main?: React.ReactNode;
    audioPlayer?: React.ReactNode;
    brandVariant?: string;
  }) => (
    <div data-testid='app-shell-skeleton' data-brand-variant={brandVariant}>
      {main}
      {audioPlayer}
    </div>
  ),
}));

vi.mock('@/components/atoms/JovieMarkElectric', () => ({
  JovieMarkElectric: () => <div data-testid='jovie-mark-electric' />,
}));

const { useReducedMotion } = await import('@/lib/hooks/useReducedMotion');

const STORAGE_KEY = 'jovie:cinematic-boot-played';

describe('CinematicAppBoot', () => {
  beforeEach(() => {
    vi.mocked(useReducedMotion).mockReturnValue(false);
    globalThis.sessionStorage.clear();
  });

  it('renders the AppShellSkeleton when prefers-reduced-motion is on', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    const { queryByTestId } = render(
      <CinematicAppBoot main={<div data-testid='route-main' />} />
    );
    expect(queryByTestId('app-shell-skeleton')).not.toBeNull();
    expect(queryByTestId('cinematic-app-boot')).toBeNull();
    expect(queryByTestId('route-main')).not.toBeNull();
  });

  it('renders the cinematic on the FIRST mount per session', () => {
    expect(globalThis.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    const { queryByTestId } = render(<CinematicAppBoot main={undefined} />);
    expect(queryByTestId('cinematic-app-boot')).not.toBeNull();
    expect(globalThis.sessionStorage.getItem(STORAGE_KEY)).toBe('1');
  });

  it('skips the cinematic and renders the skeleton on subsequent mounts', () => {
    globalThis.sessionStorage.setItem(STORAGE_KEY, '1');
    const { queryByTestId } = render(
      <CinematicAppBoot main={<div data-testid='route-main' />} />
    );
    expect(queryByTestId('cinematic-app-boot')).toBeNull();
    expect(queryByTestId('app-shell-skeleton')).not.toBeNull();
    expect(queryByTestId('route-main')).not.toBeNull();
  });

  it('renders the AppShellSkeleton on SSR (before useEffect mount)', () => {
    // Vitest jsdom always runs useEffect synchronously after render, so this
    // mostly exercises the same path as the prefers-reduced-motion case. The
    // mounted-guard pattern is still validated via test 3 (subsequent mount).
    globalThis.sessionStorage.setItem(STORAGE_KEY, '1');
    const { queryByTestId } = render(<CinematicAppBoot main={undefined} />);
    expect(queryByTestId('app-shell-skeleton')).not.toBeNull();
  });

  it('passes the audio player through to the direct skeleton fallback', () => {
    globalThis.sessionStorage.setItem(STORAGE_KEY, '1');
    const { getByTestId } = render(
      <CinematicAppBoot audioPlayer={<div data-testid='audio-player' />} />
    );

    expect(getByTestId('app-shell-skeleton')).toContainElement(
      getByTestId('audio-player')
    );
  });

  it('renders the OV-branded skeleton immediately instead of flashing the Jovie cinematic', () => {
    const { getByTestId, queryByTestId } = render(
      <CinematicAppBoot brandVariant='ov' main={undefined} />
    );

    expect(queryByTestId('cinematic-app-boot')).toBeNull();
    expect(getByTestId('app-shell-skeleton')).toHaveAttribute(
      'data-brand-variant',
      'ov'
    );
  });

  it('does not consume the Jovie cinematic when OV mounts first', () => {
    const ovRender = render(
      <CinematicAppBoot brandVariant='ov' main={undefined} />
    );

    expect(globalThis.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    ovRender.unmount();

    const { queryByTestId } = render(<CinematicAppBoot main={undefined} />);

    expect(queryByTestId('cinematic-app-boot')).not.toBeNull();
    expect(globalThis.sessionStorage.getItem(STORAGE_KEY)).toBe('1');
  });
});
