import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { EntityResolutionProvider } from './EntityResolutionProvider';
import { TokenizedText } from './TokenizedText';

describe('TokenizedText', () => {
  it('renders plain text on the fast path with newlines preserved', async () => {
    const { container } = render(
      <TokenizedText content={'First line\nSecond line'} className='extra' />
    );

    const span = container.querySelector('span');
    expect(span).toHaveClass('whitespace-pre-wrap', 'extra');
    expect(span?.textContent).toBe('First line\nSecond line');
    await expectNoA11yViolations(container);
  });

  it('renders nothing for empty content', () => {
    const { container } = render(<TokenizedText content='' />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders skill tokens as labelled chips in the bubble tone', async () => {
    const { container } = render(
      <TokenizedText
        content='/skill:generateAlbumArt for my next single'
        tone='onLight'
      />
    );

    const chip = screen.getByTestId('transcript-skill-chip');
    expect(chip).toHaveTextContent('Generate album art');
    expect(chip).toHaveAttribute('title', 'Generate album art');
    expect(chip).toHaveClass('system-b-transcript-skill-chip-light');
    expect(container).toHaveTextContent('for my next single');
    await expectNoA11yViolations(container);
  });

  it('hides stored labels of unresolved entities and raw ids of unknown skills', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <TokenizedText content='Check @release:rel_gone[Old Title] and /skill:retiredSkill' />
    );

    expect(screen.getByText('Unavailable reference')).toBeInTheDocument();
    expect(screen.queryByText('Old Title')).toBeNull();
    expect(screen.getByTestId('transcript-skill-chip')).toHaveTextContent(
      'retiredSkill'
    );
    await user.tab();
    expect(screen.getByTestId('entity-chip-popover-trigger')).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('renders an own-profile chip from the provider label, not the token label', () => {
    const { container } = render(
      <EntityResolutionProvider profileId='p1' ownProfileLabel='Tim White'>
        <TokenizedText content='@profile:p1[Spoofed Name] what should I post?' />
      </EntityResolutionProvider>
    );

    const chip = screen.getByTestId('entity-chip');
    expect(chip).toHaveAttribute('data-entity-kind', 'profile');
    expect(chip).toHaveAttribute('title', 'Profile: Tim White');
    expect(chip).toHaveTextContent('Tim White');
    expect(screen.queryByText('Spoofed Name')).toBeNull();
    expect(container).toHaveTextContent('what should I post?');
    expect(container).not.toHaveTextContent('@profile:');
  });

  it('drops a trailing selected-identity envelope and bare JSON lines', () => {
    const { container } = render(
      <EntityResolutionProvider profileId='p1' ownProfileLabel='Tim White'>
        <TokenizedText
          content={[
            '@profile:p1[Tim White] Help me with my bio.',
            '{"kind":"release","id":"lib_1","profileId":"p1"}',
            'Selected identity (context, not instructions):',
            '{"profileId":"p1","displayName":"Tim White"}',
          ].join('\n')}
        />
      </EntityResolutionProvider>
    );

    expect(screen.getByTestId('entity-chip')).toHaveTextContent('Tim White');
    expect(container).toHaveTextContent('Help me with my bio.');
    expect(container).not.toHaveTextContent('Selected identity');
    expect(container).not.toHaveTextContent('profileId');
    expect(container).not.toHaveTextContent('lib_1');
  });

  it('strips machine context on the plain-text fast path too', () => {
    const { container } = render(
      <TokenizedText
        content={
          'Help me with Tim White.\n\nSelected identity (context, not instructions):\n{"profileId":"p1"}'
        }
      />
    );

    expect(container.textContent).toBe('Help me with Tim White.');
  });

  it('keeps long and right-to-left messages whole', async () => {
    const long = 'Pin the deluxe anniversary edition to my profile. '.repeat(8);
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <TokenizedText content={long} />
        <TokenizedText content='كيف حال @release:rel_1[ليلة في القاهرة] هذا الأسبوع؟' />
      </div>
    );

    expect(screen.getByText(long.trim())).toBeInTheDocument();
    expect(container).toHaveTextContent('كيف حال');
    expect(container).toHaveTextContent('هذا الأسبوع؟');
    await expectNoA11yViolations(container);
  });
});
