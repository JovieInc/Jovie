import { describe, expect, it } from 'vitest';

import {
  centeredContentClassName,
  centeredContentStyles,
  descriptionStyles,
  footerStyles,
  headerStyles,
  overlayClassName,
  overlayStyles,
  titleStyles,
} from './overlay-styles';

describe('overlay-styles', () => {
  describe('overlayStyles', () => {
    it('base includes fixed positioning and backdrop', () => {
      expect(overlayStyles.base).toContain('fixed');
      expect(overlayStyles.base).toContain('inset-0');
      expect(overlayStyles.base).toContain('z-50');
      expect(overlayStyles.base).toContain('bg-black/80');
    });

    it('animation includes open/close fade transitions', () => {
      expect(overlayStyles.animation).toContain('data-[state=open]:animate-in');
      expect(overlayStyles.animation).toContain(
        'data-[state=closed]:animate-out'
      );
      expect(overlayStyles.animation).toContain('data-[state=open]:fade-in-0');
      expect(overlayStyles.animation).toContain(
        'data-[state=closed]:fade-out-0'
      );
    });
  });

  describe('overlayClassName', () => {
    it('combines base and animation', () => {
      expect(overlayClassName).toContain(overlayStyles.base);
      expect(overlayClassName).toContain(overlayStyles.animation);
    });
  });

  describe('centeredContentStyles', () => {
    it('position includes fixed centering with translate', () => {
      expect(centeredContentStyles.position).toContain('fixed');
      expect(centeredContentStyles.position).toContain('left-1/2');
      expect(centeredContentStyles.position).toContain('top-1/2');
      expect(centeredContentStyles.position).toContain('z-50');
    });

    it('layout includes grid and max-width', () => {
      expect(centeredContentStyles.layout).toContain('grid');
      expect(centeredContentStyles.layout).toContain('max-w-lg');
    });

    it('surface includes border and background', () => {
      expect(centeredContentStyles.surface).toContain('border');
      expect(centeredContentStyles.surface).toContain('bg-surface-2');
    });

    it('animation includes fade and zoom transitions', () => {
      expect(centeredContentStyles.animation).toContain('fade-in-0');
      expect(centeredContentStyles.animation).toContain('fade-out-0');
      expect(centeredContentStyles.animation).toContain('zoom-in-95');
      expect(centeredContentStyles.animation).toContain('zoom-out-95');
    });

    it('rounded uses responsive border radius', () => {
      expect(centeredContentStyles.rounded).toContain('rounded-xl');
      expect(centeredContentStyles.rounded).toContain('sm:rounded-2xl');
    });

    it('reducedMotion provides motion-reduce fallback', () => {
      expect(centeredContentStyles.reducedMotion).toContain('motion-reduce');
    });
  });

  describe('centeredContentClassName', () => {
    it('combines all centeredContentStyles parts', () => {
      expect(centeredContentClassName).toContain(
        centeredContentStyles.position
      );
      expect(centeredContentClassName).toContain(centeredContentStyles.layout);
      expect(centeredContentClassName).toContain(centeredContentStyles.surface);
      expect(centeredContentClassName).toContain(
        centeredContentStyles.animation
      );
      expect(centeredContentClassName).toContain(centeredContentStyles.rounded);
      expect(centeredContentClassName).toContain(
        centeredContentStyles.reducedMotion
      );
    });
  });

  describe('headerStyles', () => {
    it('base includes flex column layout', () => {
      expect(headerStyles.base).toContain('flex');
      expect(headerStyles.base).toContain('flex-col');
    });
  });

  describe('footerStyles', () => {
    it('base includes responsive flex layout', () => {
      expect(footerStyles.base).toContain('flex-col-reverse');
      expect(footerStyles.base).toContain('sm:flex-row');
    });
  });

  describe('titleStyles', () => {
    it('base includes font sizing', () => {
      expect(titleStyles.base).toContain('text-lg');
      expect(titleStyles.base).toContain('font-semibold');
    });
  });

  describe('descriptionStyles', () => {
    it('base includes muted text color', () => {
      expect(descriptionStyles.base).toContain('text-sm');
      expect(descriptionStyles.base).toContain('text-secondary-token');
    });
  });
});
