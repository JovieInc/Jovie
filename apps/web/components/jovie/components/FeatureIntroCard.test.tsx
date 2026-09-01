import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  FEATURE_INTRO_STORAGE,
  type FeatureIntroCatalog,
  type FeatureIntroKind,
} from '../feature-intro-contract';
import { FeatureIntroCard, FeatureIntroHost } from './FeatureIntroCard';

const highlightPresentation: FeatureIntroKind = {
  kind: 'highlight',
  highlight: {
    id: 'catalog-in-chat',
    title: 'Your Catalog Is Already In Chat',
    oneLine: 'Ask about a release, a show, or the next move.',
    ctaTitle: 'Ask Something',
  },
};

const whatsNewPresentation: FeatureIntroKind = {
  kind: 'whatsNew',
  id: 'changelog:26.8.1',
  rows: [
    {
      kind: 'bullet',
      bullet: {
        id: 'one',
        text: 'Ask Jovie to plan the next release.',
        accent: 'accent',
      },
    },
    {
      kind: 'bullet',
      bullet: {
        id: 'two',
        text: 'Library stays nearby.',
        accent: 'blue',
      },
    },
    { kind: 'andMore' },
  ],
};

const hostCatalog: FeatureIntroCatalog = {
  highlight: {
    id: 'catalog-in-chat',
    title: 'Your Catalog Is Already In Chat',
    oneLine: 'Ask about a release, a show, or the next move.',
    ctaTitle: 'Ask Something',
  },
  whatsNewID: 'changelog:26.8.1',
  whatsNewItems: [
    {
      id: 'one',
      text: 'Ask Jovie to plan the next release.',
      accent: 'accent',
    },
  ],
};

describe('FeatureIntroCard', () => {
  it(
    'renders highlight mode with a dismiss control and one primary CTA',
    () => {
      const onDismiss = vi.fn();
      const onPrimaryCTA = vi.fn();

      render(
        <FeatureIntroCard
          changelogHref={APP_ROUTES.CHANGELOG}
          onDismiss={onDismiss}
          onPrimaryCTA={onPrimaryCTA}
          presentation={highlightPresentation}
        />
      );

      expect(screen.getByTestId('feature-intro-card')).toHaveAttribute(
        'data-mode',
        'highlight'
      );
      expect(screen.getByTestId('feature-intro-card')).toHaveAttribute(
        'data-source-id',
        'catalog-in-chat'
      );
      expect(
        screen.getByText('Your Catalog Is Already In Chat')
      ).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('feature-intro-cta'));
      expect(onPrimaryCTA).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByTestId('feature-intro-dismiss'));
      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('feature-intro-and-more')).toBeNull();
    }
  );

  it('renders what’s new bullets and links And more to the changelog', () => {
    render(
      <FeatureIntroCard
        changelogHref={APP_ROUTES.CHANGELOG}
        onDismiss={vi.fn()}
        onPrimaryCTA={vi.fn()}
        presentation={whatsNewPresentation}
      />
    );

    expect(screen.getByTestId('feature-intro-card')).toHaveAttribute(
      'data-mode',
      'whatsNew'
    );
    expect(screen.getByTestId('feature-intro-card')).toHaveAttribute(
      'data-source-id',
      'changelog:26.8.1'
    );
    expect(screen.getByText('What’s New')).toBeInTheDocument();
    expect(
      screen.getByText('Ask Jovie to plan the next release.')
    ).toBeInTheDocument();
    const andMore = screen.getByTestId('feature-intro-and-more');
    expect(andMore).toHaveAttribute('href', APP_ROUTES.CHANGELOG);
    expect(screen.queryByTestId('feature-intro-cta')).toBeNull();
  });
});

describe('FeatureIntroHost', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it(
    'persists highlight dismiss and then shows what’s new without nagging the same id',
    () => {
      const onHighlightCTA = vi.fn();
      const { unmount } = render(
        <FeatureIntroHost
          catalog={hostCatalog}
          onHighlightCTA={onHighlightCTA}
        />
      );

      expect(screen.getByTestId('feature-intro-card')).toHaveAttribute(
        'data-mode',
        'highlight'
      );
      fireEvent.click(screen.getByTestId('feature-intro-dismiss'));
      expect(
        window.localStorage.getItem(
          FEATURE_INTRO_STORAGE.dismissedHighlightIDKey
        )
      ).toBe('catalog-in-chat');
      expect(screen.getByTestId('feature-intro-card')).toHaveAttribute(
        'data-mode',
        'whatsNew'
      );

      unmount();
      render(
        <FeatureIntroHost
          catalog={hostCatalog}
          onHighlightCTA={onHighlightCTA}
        />
      );
      expect(screen.getByTestId('feature-intro-card')).toHaveAttribute(
        'data-mode',
        'whatsNew'
      );
      expect(screen.queryByTestId('feature-intro-cta')).toBeNull();
    }
  );

  it(
    'stays gone after both the highlight and what’s new wave are dismissed',
    () => {
      const { unmount } = render(
        <FeatureIntroHost catalog={hostCatalog} onHighlightCTA={vi.fn()} />
      );

      fireEvent.click(screen.getByTestId('feature-intro-dismiss'));
      fireEvent.click(screen.getByTestId('feature-intro-dismiss'));

      expect(screen.queryByTestId('feature-intro-card')).toBeNull();
      expect(
        window.localStorage.getItem(
          FEATURE_INTRO_STORAGE.dismissedWhatsNewIDKey
        )
      ).toBe('changelog:26.8.1');

      unmount();
      render(
        <FeatureIntroHost catalog={hostCatalog} onHighlightCTA={vi.fn()} />
      );
      expect(screen.queryByTestId('feature-intro-card')).toBeNull();
    }
  );
});
