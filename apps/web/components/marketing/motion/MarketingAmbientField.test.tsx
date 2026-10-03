import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MarketingAmbientField,
  shouldRunAmbientField,
} from './MarketingAmbientField';

interface FakeWindowOptions {
  readonly reducedMotion?: boolean;
  readonly saveData?: boolean;
  readonly deviceMemory?: number;
  readonly hardwareConcurrency?: number;
  readonly webgl2?: boolean;
}

function fakeWindow({
  reducedMotion = false,
  saveData = false,
  deviceMemory = 8,
  hardwareConcurrency = 8,
  webgl2 = true,
}: FakeWindowOptions = {}): Window {
  return {
    matchMedia: (query: string) => ({
      matches: query.includes('reduce') && reducedMotion,
    }),
    navigator: {
      connection: { saveData },
      deviceMemory,
      hardwareConcurrency,
    },
    WebGL2RenderingContext: webgl2 ? function WebGL2() {} : undefined,
  } as unknown as Window;
}

describe('shouldRunAmbientField', () => {
  it('runs on a capable device with motion allowed', () => {
    expect(shouldRunAmbientField(fakeWindow())).toBe(true);
  });

  it.each([
    ['reduced motion', { reducedMotion: true }],
    ['data saver', { saveData: true }],
    ['low memory', { deviceMemory: 2 }],
    ['few cores', { hardwareConcurrency: 2 }],
    ['no WebGL2', { webgl2: false }],
  ] as const)('keeps the static poster under %s', (_label, options) => {
    expect(shouldRunAmbientField(fakeWindow(options))).toBe(false);
  });
});

describe('MarketingAmbientField', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('server-renders a decorative poster in the section accent', () => {
    render(<MarketingAmbientField accent='purple' />);
    const field = screen.getByTestId('marketing-ambient-field');

    expect(field).toHaveAttribute('aria-hidden', 'true');
    expect(field).toHaveAttribute('data-accent', 'purple');
    expect(field).toHaveAttribute('data-live', 'false');
  });

  it('never loads the GL layer when reduced motion is requested', () => {
    const idle = vi.fn();
    vi.stubGlobal('requestIdleCallback', idle);
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    render(<MarketingAmbientField accent='blue' />);

    expect(idle).not.toHaveBeenCalled();
    expect(screen.getByTestId('marketing-ambient-field')).toHaveAttribute(
      'data-live',
      'false'
    );
  });
});
