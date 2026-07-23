import { describe, expect, it } from 'vitest';
import {
  NAVIGATION_STYLE_PROBE_SELECTOR,
  normalizeNavigationContract,
  type RawNavigationContract,
} from '../../e2e/utils/ov-navigation-contract';

const baseContract: RawNavigationContract = {
  nodes: [
    {
      rootIndex: 0,
      nodeIndex: 0,
      tag: 'a',
      role: null,
      text: ' Library ',
      href: '/app/library',
      type: null,
      classes: ['text-primary-token', 'min-h-11'],
      aria: { 'aria-current': 'page', 'aria-label': 'Library' },
    },
  ],
  styleInvariants: [
    {
      rootIndex: 0,
      nodeIndex: 0,
      styles: {
        'backdrop-filter': 'blur(  16px )',
        display: ' flex ',
      },
    },
  ],
  accessibility: [
    {
      role: 'a',
      name: '  Library  ',
      href: '/app/library',
      current: 'page',
    },
  ],
};

describe('normalizeNavigationContract', () => {
  it('keeps probe membership stable when transient inline styles change', () => {
    document.body.innerHTML = `
      <nav>
        <div data-transient></div>
        <a href="/app">Inbox</a>
        <button type="button">More</button>
      </nav>
    `;
    const navigation = document.querySelector('nav');
    const transient = document.querySelector<HTMLElement>('[data-transient]');
    expect(navigation).not.toBeNull();
    expect(transient).not.toBeNull();

    const probeTags = () =>
      Array.from(
        navigation?.querySelectorAll(NAVIGATION_STYLE_PROBE_SELECTOR) ?? []
      ).map(element => element.tagName.toLowerCase());

    expect(probeTags()).toEqual(['a', 'button']);
    transient?.setAttribute('style', 'transform: translateX(2px)');
    expect(probeTags()).toEqual(['a', 'button']);
    transient?.removeAttribute('style');
    expect(probeTags()).toEqual(['a', 'button']);
  });

  it('ignores ordering and serialization whitespace without dropping invariants', () => {
    const equivalent: RawNavigationContract = {
      nodes: [
        {
          ...baseContract.nodes[0],
          text: 'Library',
          classes: ['min-h-11', 'text-primary-token', 'min-h-11'],
          aria: { 'aria-label': 'Library', 'aria-current': 'page' },
        },
      ],
      styleInvariants: [
        {
          ...baseContract.styleInvariants[0],
          styles: {
            display: 'flex',
            'backdrop-filter': 'blur( 16px )',
          },
        },
      ],
      accessibility: [
        {
          ...baseContract.accessibility[0],
          name: 'Library',
        },
      ],
    };

    expect(normalizeNavigationContract(equivalent)).toEqual(
      normalizeNavigationContract(baseContract)
    );
  });

  it('preserves semantic, ARIA, class, destination, and computed-style changes', () => {
    const changed: RawNavigationContract = {
      ...baseContract,
      nodes: [
        {
          ...baseContract.nodes[0],
          text: 'Chat',
          href: '/app/chat',
          classes: ['text-tertiary-token', 'min-h-11'],
          aria: { 'aria-label': 'Chat' },
        },
      ],
      styleInvariants: [
        {
          ...baseContract.styleInvariants[0],
          styles: {
            'backdrop-filter': 'none',
            display: 'none',
          },
        },
      ],
    };

    expect(normalizeNavigationContract(changed)).not.toEqual(
      normalizeNavigationContract(baseContract)
    );
  });
});
