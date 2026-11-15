import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type {
  FeatureIntroCatalog,
  FeatureIntroKind,
} from '../feature-intro-contract';
import { FeatureIntroCard, FeatureIntroHost } from './FeatureIntroCard';

const highlight: FeatureIntroKind = {
  kind: 'highlight',
  highlight: {
    id: 'catalog-in-chat',
    title: 'Your Catalog Is Already In Chat',
    oneLine: 'Ask about a release.',
    ctaTitle: 'Ask Something',
  },
};

const whatsNew: FeatureIntroKind = {
  kind: 'whatsNew',
  id: 'changelog:1',
  rows: [
    {
      kind: 'bullet',
      bullet: { id: 'one', text: 'Library stays nearby.', accent: 'blue' },
    },
    { kind: 'andMore' },
  ],
};

describe('FeatureIntroCard certificate', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('runs the highlight call to action and dismiss', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const onPrimaryCTA = vi.fn();
    const { container } = render(
      <FeatureIntroCard
        presentation={highlight}
        changelogHref={APP_ROUTES.CHANGELOG}
        onDismiss={onDismiss}
        onPrimaryCTA={onPrimaryCTA}
      />
    );

    expect(
      screen.getByRole('region', {
        name: 'Your Catalog Is Already In Chat. Ask about a release.',
      })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ask Something' }));
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(onPrimaryCTA).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('lists what is new and links And more to the changelog', async () => {
    const { container } = render(
      <FeatureIntroCard
        presentation={whatsNew}
        changelogHref='/changelog'
        onDismiss={vi.fn()}
        onPrimaryCTA={vi.fn()}
      />
    );

    expect(screen.getByRole('region', { name: 'What’s New' })).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'And more' })).toHaveAttribute(
      'href',
      '/changelog'
    );
    await expectNoA11yViolations(container);
  });

  it('host walks highlight, then what is new, then nothing as each is dismissed', async () => {
    const user = userEvent.setup();
    const onHighlightCTA = vi.fn();
    const catalog: FeatureIntroCatalog = {
      highlight: highlight.highlight,
      whatsNewID: 'changelog:1',
      whatsNewItems: [
        { id: 'one', text: 'Library stays nearby.', accent: 'blue' },
      ],
    };
    const { container } = render(
      <FeatureIntroHost catalog={catalog} onHighlightCTA={onHighlightCTA} />
    );

    await user.click(
      await screen.findByRole('button', { name: 'Ask Something' })
    );
    expect(onHighlightCTA).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(
      await screen.findByRole('region', { name: 'What’s New' })
    ).toBeVisible();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() =>
      expect(screen.queryByTestId('feature-intro-card')).toBeNull()
    );
  });

  it('host renders nothing for an empty catalog', async () => {
    const { container } = render(
      <FeatureIntroHost
        catalog={{ highlight: null, whatsNewID: 'x', whatsNewItems: [] }}
        onHighlightCTA={vi.fn()}
      />
    );
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    await expectNoA11yViolations(container);
  });
});
