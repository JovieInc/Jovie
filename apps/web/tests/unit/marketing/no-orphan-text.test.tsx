import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NoOrphanText } from '@/components/marketing/NoOrphanText';

describe('NoOrphanText', () => {
  it('binds the final two words into one inline-block', () => {
    const { container } = render(
      <h2>
        <NoOrphanText>Built To Stay Out Of The Way.</NoOrphanText>
      </h2>
    );
    const tail = container.querySelector('span.inline-block');
    expect(tail?.textContent).toBe('The Way.');
    expect(container.textContent).toBe('Built To Stay Out Of The Way.');
  });

  it('does not match a repeated word inside the last word', () => {
    const { container } = render(<NoOrphanText>Pick the theme</NoOrphanText>);
    expect(container.querySelector('span')?.textContent).toBe('the theme');
    expect(container.textContent).toBe('Pick the theme');
  });

  it('leaves short strings and non-string children unchanged', () => {
    const { container } = render(
      <>
        <NoOrphanText>Questions</NoOrphanText>
        <NoOrphanText>Jovie Card</NoOrphanText>
        <NoOrphanText>
          <em>Already composed heading</em>
        </NoOrphanText>
      </>
    );
    expect(container.querySelector('span')).toBeNull();
    expect(container.textContent).toBe(
      'QuestionsJovie CardAlready composed heading'
    );
  });
});
