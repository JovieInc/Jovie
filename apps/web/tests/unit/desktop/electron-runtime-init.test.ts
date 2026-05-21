import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const runtimeInitSource = readFileSync(
  join(process.cwd(), 'public/electron-runtime-init.js'),
  'utf8'
);

function runRuntimeInit() {
  new Function(runtimeInitSource)();
}

function setUserAgent(userAgent: string) {
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: userAgent,
  });
}

function resetRuntimeMarker() {
  document.documentElement.removeAttribute('data-desktop-runtime');
  document.documentElement.removeAttribute('data-dev-chrome-disabled');
  document.documentElement.style.removeProperty('--dev-toolbar-height');
}

describe('electron-runtime-init', () => {
  beforeEach(() => {
    resetRuntimeMarker();
    setUserAgent('Mozilla/5.0');
    window.history.replaceState({}, '', '/app');
  });

  afterEach(() => {
    resetRuntimeMarker();
    setUserAgent('Mozilla/5.0');
    window.history.replaceState({}, '', '/');
  });

  it('marks Electron runtime from the launch query before React hydrates', () => {
    window.history.replaceState({}, '', '/app?runtime=electron');

    runRuntimeInit();

    expect(document.documentElement).toHaveAttribute(
      'data-desktop-runtime',
      'electron'
    );
    expect(document.documentElement).toHaveAttribute(
      'data-dev-chrome-disabled',
      '1'
    );
    expect(
      document.documentElement.style.getPropertyValue('--dev-toolbar-height')
    ).toBe('0px');
  });

  it('marks Electron runtime from the desktop user agent', () => {
    setUserAgent('Mozilla/5.0 JovieDesktop/26.5.12');

    runRuntimeInit();

    expect(document.documentElement).toHaveAttribute(
      'data-desktop-runtime',
      'electron'
    );
  });

  it('does not mark normal browser sessions', () => {
    runRuntimeInit();

    expect(document.documentElement).not.toHaveAttribute(
      'data-desktop-runtime'
    );
    expect(document.documentElement).not.toHaveAttribute(
      'data-dev-chrome-disabled'
    );
  });
});
