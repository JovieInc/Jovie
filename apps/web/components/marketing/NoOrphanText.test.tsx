import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { NoOrphanText } from './NoOrphanText';
import { LongContentHeadline, RtlArabic } from './NoOrphanText.states.stories';
import { FinalTwoWordsBound } from './NoOrphanText.stories';

function renderHeading(children: React.ReactNode) {
  return render(
    <h2>
      <NoOrphanText>{children}</NoOrphanText>
    </h2>
  );
}

describe('NoOrphanText', () => {
  it('binds the final two words while keeping the full heading name', async () => {
    const text = FinalTwoWordsBound.args?.children as string;
    const { container } = renderHeading(text);
    expect(screen.getByRole('heading', { level: 2, name: text })).toBeVisible();
    const bound = container.querySelector('span.inline-block');
    expect(bound).toHaveTextContent('The Way.');
    await expectNoA11yViolations(container);
  });

  it('leaves strings under three words unchanged', () => {
    const { container } = renderHeading('Two words');
    expect(container.querySelector('span')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Two words' })).toBeVisible();
  });

  it('passes non-string children through untouched', () => {
    const { container } = renderHeading(<em>Already marked up copy</em>);
    expect(container.querySelector('span')).toBeNull();
    expect(container.querySelector('em')).toHaveTextContent(
      'Already marked up copy'
    );
  });

  it('keeps a long headline whole with only the final pair bound', async () => {
    const text = LongContentHeadline.args?.children as string;
    const { container } = renderHeading(text);
    expect(screen.getByRole('heading', { name: text })).toBeVisible();
    expect(container.querySelectorAll('span.inline-block')).toHaveLength(1);
    expect(container.querySelector('span.inline-block')).toHaveTextContent(
      'Artist Collections'
    );
    await expectNoA11yViolations(container);
  });

  it('binds the final Arabic pair in a right-to-left document', async () => {
    const text = RtlArabic.args?.children as string;
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <h2>
          <NoOrphanText>{text}</NoOrphanText>
        </h2>
      </div>
    );
    expect(container.querySelector('span.inline-block')).toHaveTextContent(
      'طريقك تمامًا'
    );
    expect(screen.getByRole('heading', { name: text })).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
