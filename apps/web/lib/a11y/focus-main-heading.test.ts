import { afterEach, describe, expect, it } from 'vitest';
import { focusMainHeading } from './focus-main-heading';

describe('focusMainHeading', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('focuses the main heading of the landing feature and makes it focusable', () => {
    document.body.innerHTML = '<main><h1>Artist Visibility</h1></main>';

    const focused = focusMainHeading();
    const heading = document.querySelector('h1') as HTMLElement;

    expect(focused).toBe(true);
    expect(heading.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(heading);
  });

  it('never moves focus to body when no heading exists', () => {
    document.body.innerHTML = '<main><p>No heading here</p></main>';

    expect(focusMainHeading()).toBe(true);
    expect(document.activeElement).toBe(document.querySelector('main'));
  });

  it('reports failure when there is nothing to focus', () => {
    document.body.innerHTML = '';

    expect(focusMainHeading()).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });

  it('does not steal an explicit tabindex=0 heading', () => {
    document.body.innerHTML = '<main><h1 tabindex="0">Visible</h1></main>';

    focusMainHeading();

    expect(document.querySelector('h1')?.getAttribute('tabindex')).toBe('0');
  });

  it('scopes to a supplied root', () => {
    document.body.innerHTML =
      '<div id="other"><h1>Elsewhere</h1></div><main><h1>Here</h1></main>';
    const root = document.querySelector('main') as HTMLElement;

    expect(focusMainHeading(root)).toBe(true);
    expect(document.activeElement).toBe(root.querySelector('h1'));
  });
});
