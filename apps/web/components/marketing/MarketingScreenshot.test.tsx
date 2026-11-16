import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MarketingScreenshot } from './MarketingScreenshot';
import meta, {
  LongContentWindowTitle,
  PartialRegistryDefaults,
  RtlArabic,
} from './MarketingScreenshot.states.stories';
import defaultMeta, { WindowChrome } from './MarketingScreenshot.stories';

describe('MarketingScreenshot', () => {
  it('renders the window chrome with its title and alt override', async () => {
    const { container } = render(
      <MarketingScreenshot {...defaultMeta.args} {...WindowChrome.args} />
    );
    expect(
      screen.getByRole('img', { name: defaultMeta.args.altOverride })
    ).toBeInTheDocument();
    expect(screen.getByText('Audience')).toBeInTheDocument();
    expect(
      screen.getByTestId('marketing-screenshot-dashboard-audience-desktop')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('falls back to the registry alt text and default test id', async () => {
    const capture = getMarketingExportImage(meta.args.scenarioId);
    const { container } = render(
      <MarketingScreenshot {...meta.args} {...PartialRegistryDefaults.args} />
    );
    const image = screen.getByRole('img', { name: capture.alt });
    expect(image).toHaveAttribute(
      'sizes',
      '(min-width: 1024px) 1200px, (min-width: 640px) 90vw, 100vw'
    );
    expect(screen.queryByText('Audience')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps a long title and alt text whole', async () => {
    const { container } = render(
      <MarketingScreenshot
        {...meta.args}
        {...LongContentWindowTitle.args}
        testId='long-screenshot'
      />
    );
    expect(screen.getByTestId('long-screenshot')).toHaveTextContent(
      'Audience, sources, segments and every follow-up for the current release'
    );
    expect(
      screen.getByRole('img', {
        name: LongContentWindowTitle.args?.altOverride,
      })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders an Arabic title in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <MarketingScreenshot {...meta.args} {...RtlArabic.args} />
      </div>
    );
    expect(screen.getByText('الجمهور')).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: 'جدول المعجبين مع مصادر التتبع والشرائح',
      })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
